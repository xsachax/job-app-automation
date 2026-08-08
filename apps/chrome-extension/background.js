importScripts(
  "lib/profile-schema.js",
  "lib/session-scope.js",
  "lib/workday-adapter.js",
  "lib/ats-adapter.js"
);

const profileSchema = globalThis.JobAutofillProfile;
const sessionScope = globalThis.JobAutofillSessionScope;
const ats = globalThis.JobAutofillAts;
const STORAGE_DEFAULTS = {
  enabled: true,
  profile: {},
  applicationSessions: {}
};
const SESSION_PROFILES_KEY = "applicationSessionProfiles";
const MAX_RESUME_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3) + 4;

const PANEL_FILES = [
  "lib/session-scope.js",
  "lib/profile-schema.js",
  "lib/field-matcher.js",
  "lib/workday-adapter.js",
  "lib/ats-adapter.js",
  "content/application-panel.js"
];

let sessionMutationQueue = Promise.resolve();
let sessionProfileMutationQueue = Promise.resolve();
let enablementMutationQueue = Promise.resolve();
let enablementVersion = 0;
let requestedEnabled;
const embeddedFrameRegistry = new Map();
const embeddedFrameSetupPromises = new Map();
let initializationPromise = null;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function sanitizeProfile(rawProfile) {
  return profileSchema.sanitizeStoredProfile(rawProfile);
}

function profileAvailabilityFor(profile, resumeFile, context) {
  return {
    ...profileSchema.profileAvailability(profile, context),
    resumeFile: Boolean(resumeFile)
  };
}

async function replaceProfile(rawProfile) {
  const profile = sanitizeProfile(rawProfile);
  await chrome.storage.local.set({ profile });
  return profile;
}

function transientStorage() {
  return chrome.storage.session || chrome.storage.local;
}

function mutateSessionProfiles(mutator) {
  const operation = sessionProfileMutationQueue.then(async () => {
    const storage = transientStorage();
    const stored = await storage.get({ [SESSION_PROFILES_KEY]: {} });
    const profiles = stored[SESSION_PROFILES_KEY] || {};
    const result = await mutator(profiles);
    await storage.set({ [SESSION_PROFILES_KEY]: profiles });
    return result;
  });
  sessionProfileMutationQueue = operation.catch(() => undefined);
  return operation;
}

async function saveSessionProfile(sessionId, rawProfile) {
  const profile = sanitizeProfile(rawProfile);
  await mutateSessionProfiles((profiles) => {
    profiles[sessionId] = profile;
  });
  return profile;
}

async function profileForSession(sessionId) {
  const stored = await transientStorage().get({
    [SESSION_PROFILES_KEY]: {}
  });
  const profiles = stored[SESSION_PROFILES_KEY] || {};
  if (Object.prototype.hasOwnProperty.call(profiles, sessionId)) {
    return profiles[sessionId];
  }
  const { profile = {} } = await chrome.storage.local.get({ profile: {} });
  return saveSessionProfile(sessionId, profile);
}

async function pruneSessionProfiles(sessionIds) {
  await mutateSessionProfiles((profiles) => {
    for (const sessionId of Object.keys(profiles)) {
      if (!sessionIds.has(sessionId)) {
        delete profiles[sessionId];
      }
    }
  });
}

function sanitizeResumeFile(rawFile) {
  if (rawFile == null) {
    return null;
  }
  if (
    typeof rawFile !== "object" ||
    Array.isArray(rawFile) ||
    rawFile.mimeType !== "application/pdf" ||
    typeof rawFile.base64 !== "string" ||
    !rawFile.base64 ||
    rawFile.base64.length > MAX_RESUME_BASE64_LENGTH ||
    !rawFile.base64.startsWith("JVBERi0") ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(rawFile.base64)
  ) {
    throw new Error("The saved resume PDF is invalid or larger than 5 MB.");
  }
  const fileName =
    typeof rawFile.fileName === "string"
      ? rawFile.fileName.trim().replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 200)
      : "";
  const padding = rawFile.base64.endsWith("==")
    ? 2
    : rawFile.base64.endsWith("=")
      ? 1
      : 0;
  if (Math.floor((rawFile.base64.length * 3) / 4) - padding > 5 * 1024 * 1024) {
    throw new Error("The saved resume PDF is larger than 5 MB.");
  }
  return {
    fileName: fileName.toLowerCase().endsWith(".pdf") ? fileName : "resume.pdf",
    mimeType: "application/pdf",
    base64: rawFile.base64
  };
}

async function replaceResumeFile(rawFile) {
  const resumeFile = sanitizeResumeFile(rawFile);
  await transientStorage().set({ resumeFile });
  return resumeFile;
}

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(Object.keys(STORAGE_DEFAULTS));
  const updates = {};

  for (const [key, value] of Object.entries(STORAGE_DEFAULTS)) {
    if (stored[key] === undefined) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }

  await setGlobalBadge(stored.enabled ?? STORAGE_DEFAULTS.enabled);
  await reconcileApplicationSessions();
}

function initializeBackground() {
  if (!initializationPromise) {
    const operation = ensureDefaults();
    const guarded = operation.catch((error) => {
      if (initializationPromise === guarded) {
        initializationPromise = null;
      }
      throw error;
    });
    initializationPromise = guarded;
  }
  return initializationPromise;
}

async function setGlobalBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#16794f" : "#667085"
  });
}

async function setTabProgressBadge(tabId, progress) {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  if (!enabled) {
    return;
  }

  const count = Number(progress?.needsAttention || 0);
  const text = count > 99 ? "99+" : count ? String(count) : "OK";
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: count ? "#b42318" : "#16794f"
  });
}

function mutateSessions(mutator) {
  const operation = sessionMutationQueue.then(async () => {
    const { applicationSessions = {} } = await chrome.storage.local.get(
      "applicationSessions"
    );
    const result = await mutator(applicationSessions);

    const entries = Object.values(applicationSessions).sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
    for (const session of entries.slice(50)) {
      delete applicationSessions[session.id];
    }

    await chrome.storage.local.set({ applicationSessions });
    await pruneSessionProfiles(new Set(Object.keys(applicationSessions)));
    return result;
  });

  sessionMutationQueue = operation.catch(() => undefined);
  return operation;
}

function cleanJobContext(payload = {}) {
  const cleanText = (value, maxLength) =>
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";

  return {
    jobId: cleanText(payload.jobId, 200),
    jobTitle: cleanText(payload.jobTitle, 200),
    company: cleanText(payload.company, 200),
    url: cleanText(payload.url, 4000),
    country: cleanText(payload.country, 20)
  };
}

function createSession(context, tabId) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ...context,
    applicationOrigins: sessionScope.approvedOriginsFor(context.url),
    tabId,
    status: "opening",
    panelDismissed: false,
    startedAt: now,
    updatedAt: now,
    progress: {
      total: 0,
      answered: 0,
      filledByExtension: 0,
      readyToFill: 0,
      needsAttention: 0,
      unknownFields: []
    }
  };
}

async function reconcileApplicationSessions() {
  await mutateSessions(async (sessions) => {
    for (const session of Object.values(sessions)) {
      if (!Number.isInteger(session.tabId) || session.status === "closed") {
        continue;
      }

      try {
        const tab = await chrome.tabs.get(session.tabId);
        if (!isHttpUrl(tab.url) || !sessionScope.isAllowedUrl(session, tab.url)) {
          sessions[session.id] = {
            ...session,
            tabId: null,
            status: "left-application",
            error: "The application tab navigated to a different site.",
            updatedAt: new Date().toISOString()
          };
        }
      } catch (error) {
        sessions[session.id] = {
          ...session,
          tabId: null,
          status: "closed",
          error: `The saved application tab is unavailable: ${errorMessage(error)}`,
          closedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    }
  });
}

async function saveNewSession(session) {
  await mutateSessions((sessions) => {
    sessions[session.id] = session;
  });
}

async function updateSession(sessionId, updates) {
  return mutateSessions((sessions) => {
    const current = sessions[sessionId];
    if (!current) {
      return null;
    }

    sessions[sessionId] = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    return sessions[sessionId];
  });
}

async function updateSessionError(sessionId, error) {
  return mutateSessions((sessions) => {
    const current = sessions[sessionId];
    if (
      !current ||
      requestedEnabled === false ||
      current.panelDismissed ||
      ["paused", "dismissed", "closed", "left-application"].includes(
        current.status
      )
    ) {
      return current || null;
    }

    sessions[sessionId] = {
      ...current,
      status: "error",
      error,
      updatedAt: new Date().toISOString()
    };
    return sessions[sessionId];
  });
}

async function dismissSession(sessionId, tabId, senderUrl) {
  return mutateSessions((sessions) => {
    const current = sessions[sessionId];
    if (
      !current ||
      current.tabId !== tabId ||
      current.panelDismissed ||
      ["paused", "dismissed", "closed", "left-application"].includes(
        current.status
      ) ||
      !sessionScope.isAllowedUrl(current, senderUrl)
    ) {
      return false;
    }

    sessions[sessionId] = {
      ...current,
      panelDismissed: true,
      status: "dismissed",
      updatedAt: new Date().toISOString()
    };
    return true;
  });
}

async function updateSessionProgress(sessionId, tabId, senderUrl, progress) {
  return mutateSessions(async (sessions) => {
    const { enabled } = await chrome.storage.local.get({ enabled: true });
    const current = sessions[sessionId];
    if (
      !enabled ||
      !current ||
      current.tabId !== tabId ||
      current.panelDismissed ||
      ["paused", "dismissed", "closed", "left-application"].includes(
        current.status
      ) ||
      !sessionScope.isAllowedUrl(current, senderUrl)
    ) {
      return null;
    }

    sessions[sessionId] = {
      ...current,
      progress,
      status: "active",
      updatedAt: new Date().toISOString()
    };
    return sessions[sessionId];
  });
}

async function findSessionByTab(tabId) {
  const { applicationSessions = {} } = await chrome.storage.local.get(
    "applicationSessions"
  );

  return (
    Object.values(applicationSessions)
      .filter((session) => session.tabId === tabId && session.status !== "closed")
      .sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )[0] || null
  );
}

async function transitionSessionForNavigation(sessionId, tabId, url) {
  return mutateSessions(async (sessions) => {
    const current = sessions[sessionId];
    if (
      !current ||
      current.tabId !== tabId ||
      current.panelDismissed ||
      ["paused", "dismissed", "closed", "left-application"].includes(
        current.status
      )
    ) {
      return null;
    }

    if (!isHttpUrl(url) || !sessionScope.isAllowedUrl(current, url)) {
      sessions[sessionId] = {
        ...current,
        tabId: null,
        url: url || current.url,
        status: "left-application",
        error: "The application tab navigated to a different site.",
        updatedAt: new Date().toISOString()
      };
      return { allowed: false, session: sessions[sessionId] };
    }

    const { enabled } = await chrome.storage.local.get({ enabled: true });
    if (!enabled || requestedEnabled === false) {
      return null;
    }

    sessions[sessionId] = {
      ...current,
      url,
      status: "loading",
      error: null,
      updatedAt: new Date().toISOString()
    };
    return { allowed: true, session: sessions[sessionId] };
  });
}

async function activateSessionForInjection(sessionId, tabId, expectedEnablementVersion) {
  return mutateSessions(async (sessions) => {
    const currentSession = sessions[sessionId];
    const { enabled } = await chrome.storage.local.get({ enabled: true });

    if (
      !enabled ||
      requestedEnabled === false ||
      enablementVersion !== expectedEnablementVersion
    ) {
      return { ok: false, error: "The extension state changed. Try again." };
    }
    if (
      !currentSession ||
      currentSession.tabId !== tabId ||
      currentSession.panelDismissed
    ) {
      return { ok: false, error: "The application session is no longer active." };
    }

    const currentTab = await chrome.tabs.get(tabId);
    if (
      !isHttpUrl(currentTab.url) ||
      !sessionScope.isAllowedUrl(currentSession, currentTab.url)
    ) {
      sessions[sessionId] = {
        ...currentSession,
        tabId: null,
        url: currentTab.url || currentSession.url,
        status: "left-application",
        error: "The application tab navigated to a different site.",
        updatedAt: new Date().toISOString()
      };
      return {
        ok: false,
        error: "The application tab left its approved site."
      };
    }

    sessions[sessionId] = {
      ...currentSession,
      url: currentTab.url,
      status: "active",
      error: null,
      updatedAt: new Date().toISOString()
    };
    return { ok: true, session: sessions[sessionId] };
  });
}

function isAuthorizedSessionDocument(session, senderUrl, frameId) {
  if (sessionScope.isAllowedUrl(session, senderUrl)) {
    return true;
  }
  return Number.isInteger(frameId) && frameId > 0 && ats.isKnownAtsUrl(senderUrl);
}

async function discoverApplicationFrames(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => ({
      url: location.href,
      top: window === window.top
    })
  });
  return results
    .map((entry) => ({
      frameId: entry.frameId,
      documentId: entry.documentId || "",
      url: entry.result?.url || "",
      top: Boolean(entry.result?.top)
    }))
    .filter(
      (entry) =>
        !entry.top &&
        Number.isInteger(entry.frameId) &&
        isHttpUrl(entry.url) &&
        ats.isKnownAtsUrl(entry.url)
    );
}

async function configureEmbeddedFrameAgents(
  session,
  { force = false, profileAvailability: suppliedAvailability } = {}
) {
  const previous = embeddedFrameRegistry.get(session.id);
  if (
    !force &&
    previous &&
    previous.tabId === session.tabId &&
    Date.now() - previous.checkedAt < 2_000
  ) {
    return previous.frames;
  }

  const discovered = (await discoverApplicationFrames(session.tabId)).filter(
    (frame) => !sessionScope.isAllowedUrl(session, frame.url)
  );
  const previousFrames =
    previous?.tabId === session.tabId ? previous.frames : new Map();
  const frames = new Map();
  let frameAvailability = suppliedAvailability;

  for (const frame of discovered) {
    const existing = previousFrames.get(frame.frameId);
    if (
      existing?.url === frame.url &&
      existing?.documentId === frame.documentId
    ) {
      frames.set(frame.frameId, existing);
      continue;
    }
    try {
      if (frameAvailability === undefined) {
        const profile = await profileForSession(session.id);
        const { resumeFile = null } = await transientStorage().get({
          resumeFile: null
        });
        frameAvailability = profileAvailabilityFor(
          profile,
          resumeFile,
          session
        );
      }
      await chrome.scripting.executeScript({
        target: { tabId: session.tabId, frameIds: [frame.frameId] },
        files: PANEL_FILES
      });
      const frameSession = {
        ...session,
        applicationOrigins: [
          ...sessionScope.applicationOrigins(session),
          sessionScope.originOf(frame.url)
        ]
      };
      const response = await chrome.tabs.sendMessage(
        session.tabId,
        {
          type: "JOB_AUTOFILL_START_SESSION",
          session: frameSession,
          profile: {},
          resumeFile: null,
          profileAvailability: frameAvailability,
          frameMode: true
        },
        { frameId: frame.frameId }
      );
      if (response?.ok && Number(response.progress?.recognized || 0) >= 2) {
        frames.set(frame.frameId, frame);
      } else {
        await chrome.tabs.sendMessage(
          session.tabId,
          { type: "JOB_AUTOFILL_EXTENSION_DISABLED" },
          { frameId: frame.frameId }
        );
      }
    } catch {
      // Sandboxed or inaccessible frames remain manual rather than weakening scope.
    }
  }

  embeddedFrameRegistry.set(session.id, {
    tabId: session.tabId,
    checkedAt: Date.now(),
    frames
  });
  return frames;
}

async function ensureEmbeddedFrameAgents(session, options = {}) {
  const pending = embeddedFrameSetupPromises.get(session.id);
  if (pending) {
    return pending;
  }
  const operation = configureEmbeddedFrameAgents(session, options);
  embeddedFrameSetupPromises.set(session.id, operation);
  try {
    return await operation;
  } finally {
    if (embeddedFrameSetupPromises.get(session.id) === operation) {
      embeddedFrameSetupPromises.delete(session.id);
    }
  }
}

async function runEmbeddedFrameAction(session, messageType, { force = false } = {}) {
  let frames;
  try {
    frames = await ensureEmbeddedFrameAgents(session, { force });
  } catch {
    return [];
  }
  const responses = await Promise.all(
    Array.from(frames.values()).map(async (frame) => {
      try {
        const response = await chrome.tabs.sendMessage(
          session.tabId,
          { type: messageType },
          { frameId: frame.frameId }
        );
        return response?.ok ? { ...response, frame } : null;
      } catch {
        return null;
      }
    })
  );
  return responses.filter(Boolean);
}

async function injectPanel(session, { autofill = false } = {}) {
  const expectedEnablementVersion = enablementVersion;
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  const profile = await profileForSession(session.id);
  const { resumeFile = null } = await transientStorage().get({
    resumeFile: null
  });
  const profileAvailability = profileAvailabilityFor(
    profile,
    resumeFile,
    session
  );

  if (!enabled || requestedEnabled === false) {
    return { ok: false, error: "Extension is off." };
  }
  if (enablementVersion !== expectedEnablementVersion) {
    return { ok: false, error: "The extension state changed. Try again." };
  }
  if (!session?.tabId || session.panelDismissed) {
    return { ok: false, error: "The application session is no longer active." };
  }

  try {
    const currentTab = await chrome.tabs.get(session.tabId);
    if (
      !isHttpUrl(currentTab.url) ||
      !sessionScope.isAllowedUrl(session, currentTab.url)
    ) {
      await updateSession(session.id, {
        tabId: null,
        url: currentTab.url || session.url,
        status: "left-application",
        error: "The application tab navigated to a different site."
      });
      return {
        ok: false,
        error: "The application tab left its approved site."
      };
    }

    await chrome.scripting.executeScript({
      target: { tabId: session.tabId },
      files: PANEL_FILES
    });

    const startResponse = await chrome.tabs.sendMessage(
      session.tabId,
      {
        type: "JOB_AUTOFILL_START_SESSION",
        session,
        profile: {},
        resumeFile: null,
        profileAvailability
      },
      { frameId: 0 }
    );
    if (!startResponse?.ok) {
      throw new Error(
        startResponse?.error || "The application page rejected the extension session."
      );
    }
    try {
      await ensureEmbeddedFrameAgents(session, {
        force: true,
        profileAvailability
      });
    } catch {
      embeddedFrameRegistry.delete(session.id);
    }

    const activation = await activateSessionForInjection(
      session.id,
      session.tabId,
      expectedEnablementVersion
    );
    if (!activation.ok) {
      return activation;
    }

    if (autofill) {
      if (
        requestedEnabled === false ||
        enablementVersion !== expectedEnablementVersion
      ) {
        return { ok: false, error: "The extension state changed. Try again." };
      }
      const topResult = await chrome.tabs.sendMessage(
        session.tabId,
        { type: "JOB_AUTOFILL_FILL" },
        { frameId: 0 }
      );
      const embeddedResults = await runEmbeddedFrameAction(
        session,
        "JOB_AUTOFILL_FILL",
        { force: true }
      );
      return {
        ...topResult,
        filled:
          Number(topResult?.filled || 0) +
          embeddedResults.reduce(
            (total, result) => total + Number(result.filled || 0),
            0
          )
      };
    }

    return { ok: true };
  } catch (error) {
    await updateSessionError(session.id, errorMessage(error));
    return { ok: false, error: errorMessage(error) };
  }
}

async function launchApplication(payload) {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  if (!enabled || requestedEnabled === false) {
    throw new Error("The extension is turned off.");
  }

  const context = cleanJobContext(payload);
  if (!isHttpUrl(context.url)) {
    throw new Error("The application URL must use HTTP or HTTPS.");
  }
  let profile;
  if (Object.prototype.hasOwnProperty.call(payload, "profile")) {
    profile = sanitizeProfile(payload.profile);
  } else {
    ({ profile = {} } = await chrome.storage.local.get({ profile: {} }));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "resumeFile")) {
    await replaceResumeFile(payload.resumeFile);
  }

  const tab = await chrome.tabs.create({ url: context.url, active: true });
  if (!tab.id) {
    throw new Error("Chrome did not return an application tab.");
  }

  const session = createSession(context, tab.id);
  await saveNewSession(session);
  await saveSessionProfile(session.id, profile);

  const currentTab = await chrome.tabs.get(tab.id);
  if (currentTab.status === "complete") {
    await injectPanel(session);
  }

  return { ok: true, sessionId: session.id };
}

async function startCurrentTab(payload) {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  if (!enabled || requestedEnabled === false) {
    throw new Error("The extension is turned off.");
  }
  if (!Number.isInteger(payload.tabId) || !isHttpUrl(payload.url)) {
    throw new Error("This page cannot run the extension.");
  }

  let session = await findSessionByTab(payload.tabId);
  let created = false;
  if (!session) {
    session = createSession(
      cleanJobContext({
        url: payload.url,
        jobTitle: payload.jobTitle || "Current application"
      }),
      payload.tabId
    );
    await saveNewSession(session);
    created = true;
  } else if (session.panelDismissed) {
    session = await updateSession(session.id, { panelDismissed: false });
  }
  if (created) {
    const { profile = {} } = await chrome.storage.local.get({ profile: {} });
    await saveSessionProfile(session.id, profile);
  }

  const result = await injectPanel(session, { autofill: Boolean(payload.autofill) });
  return { ...result, sessionId: session.id };
}

async function applyEnabledState(nextEnabled, expectedEnablementVersion) {
  if (enablementVersion !== expectedEnablementVersion) {
    return { ok: true, enabled: Boolean(requestedEnabled) };
  }

  await chrome.storage.local.set({ enabled: nextEnabled });
  if (enablementVersion !== expectedEnablementVersion) {
    return { ok: true, enabled: Boolean(requestedEnabled) };
  }
  await setGlobalBadge(nextEnabled);

  let activeSessions;

  if (!nextEnabled) {
    activeSessions = await mutateSessions((sessions) => {
      if (enablementVersion !== expectedEnablementVersion) {
        return [];
      }

      const active = [];
      for (const session of Object.values(sessions)) {
        if (
          !Number.isInteger(session.tabId) ||
          session.panelDismissed ||
          ["dismissed", "closed", "left-application"].includes(session.status)
        ) {
          continue;
        }
        sessions[session.id] = {
          ...session,
          status: "paused",
          updatedAt: new Date().toISOString()
        };
        active.push(sessions[session.id]);
      }
      return active;
    });
    if (enablementVersion !== expectedEnablementVersion) {
      return { ok: true, enabled: Boolean(requestedEnabled) };
    }
    await Promise.allSettled(
      activeSessions.map(async (session) => {
        await chrome.action.setBadgeText({ tabId: session.tabId, text: "OFF" });
        await chrome.action.setBadgeBackgroundColor({
          tabId: session.tabId,
          color: "#667085"
        });
        await chrome.tabs.sendMessage(
          session.tabId,
          { type: "JOB_AUTOFILL_EXTENSION_DISABLED" },
          { frameId: 0 }
        );
        const embedded = embeddedFrameRegistry.get(session.id);
        await Promise.allSettled(
          (embedded ? Array.from(embedded.frames.values()) : []).map((frame) =>
            chrome.tabs.sendMessage(
              session.tabId,
              { type: "JOB_AUTOFILL_EXTENSION_DISABLED" },
              { frameId: frame.frameId }
            )
          )
        );
        embeddedFrameRegistry.delete(session.id);
      })
    );
  } else {
    const { applicationSessions = {} } = await chrome.storage.local.get(
      "applicationSessions"
    );
    if (enablementVersion !== expectedEnablementVersion) {
      return { ok: true, enabled: Boolean(requestedEnabled) };
    }
    activeSessions = Object.values(applicationSessions).filter(
      (session) =>
        Number.isInteger(session.tabId) &&
        !session.panelDismissed &&
        !["dismissed", "closed", "left-application"].includes(session.status)
    );
    await Promise.allSettled(
      activeSessions.map(async (session) => {
        await chrome.action.setBadgeText({ tabId: session.tabId, text: "ON" });
        await chrome.action.setBadgeBackgroundColor({
          tabId: session.tabId,
          color: "#16794f"
        });
      })
    );
  }

  return { ok: true, enabled: nextEnabled };
}

function setEnabled(enabled) {
  const nextEnabled = Boolean(enabled);
  requestedEnabled = nextEnabled;
  const expectedEnablementVersion = ++enablementVersion;
  const operation = enablementMutationQueue.then(() =>
    applyEnabledState(nextEnabled, expectedEnablementVersion)
  );
  enablementMutationQueue = operation.catch(() => undefined);
  return operation;
}

function sanitizeProgress(progress = {}) {
  const number = (value) => Math.max(0, Number.parseInt(value, 10) || 0);
  const unknownFields = Array.isArray(progress.unknownFields)
    ? progress.unknownFields.slice(0, 75).map((field) => ({
        key: String(field.key || "").slice(0, 160),
        label: String(field.label || "Unlabeled field").slice(0, 240),
        required: Boolean(field.required),
        reason: String(field.reason || "Needs a manual answer").slice(0, 240),
        controlKind: String(field.controlKind || "").slice(0, 40),
        status: String(field.status || "unknown").slice(0, 40),
        confidence: Math.min(100, number(field.confidence)),
        suggestedField: String(field.suggestedField || "").slice(0, 120)
      }))
    : [];

  return {
    total: number(progress.total),
    answered: number(progress.answered),
    filledByExtension: number(progress.filledByExtension),
    readyToFill: number(progress.readyToFill),
    recognized: number(progress.recognized),
    needsAttention: number(progress.needsAttention),
    uncertain: number(progress.uncertain),
    platform: String(progress.platform || "").slice(0, 80),
    unknownFields
  };
}

async function handleInternalMessage(message, sender) {
  switch (message.type) {
    case "JOB_AUTOFILL_GET_STATE": {
      const state = await chrome.storage.local.get(STORAGE_DEFAULTS);
      const tabId = Number.isInteger(message.tabId) ? message.tabId : sender.tab?.id;
      const session = Number.isInteger(tabId) ? await findSessionByTab(tabId) : null;
      return {
        ok: true,
        enabled: state.enabled,
        profileConfigured: Object.values(state.profile || {}).some(
          (value) => String(value || "").trim().length > 0
        ),
        session,
        extensionId: chrome.runtime.id
      };
    }
    case "JOB_AUTOFILL_GET_PROFILE": {
      const { enabled } = await chrome.storage.local.get({ enabled: true });
      const tabId = sender.tab?.id;
      const senderUrl = sender.url || sender.tab?.url;
      const session = Number.isInteger(tabId)
        ? await findSessionByTab(tabId)
        : null;
      if (
        !enabled ||
        requestedEnabled === false ||
        !senderUrl ||
        !session ||
        session.id !== message.sessionId ||
        session.panelDismissed ||
        ["paused", "dismissed", "closed", "left-application"].includes(
          session.status
        ) ||
        !isAuthorizedSessionDocument(session, senderUrl, sender.frameId)
      ) {
        return { ok: false, error: "The application session is not active." };
      }
      const profile = await profileForSession(session.id);
      const { resumeFile = null } = await transientStorage().get({
        resumeFile: null
      });
      return { ok: true, profile, resumeFile };
    }
    case "JOB_AUTOFILL_SET_ENABLED":
      return setEnabled(message.enabled);
    case "JOB_AUTOFILL_START_TAB":
      return startCurrentTab(message);
    case "JOB_AUTOFILL_SCAN_EMBEDDED":
    case "JOB_AUTOFILL_FILL_EMBEDDED": {
      const tabId = sender.tab?.id;
      const senderUrl = sender.url || sender.tab?.url;
      const session = Number.isInteger(tabId)
        ? await findSessionByTab(tabId)
        : null;
      if (
        !senderUrl ||
        !session ||
        session.id !== message.sessionId ||
        session.panelDismissed ||
        !sessionScope.isAllowedUrl(session, senderUrl)
      ) {
        return { ok: false, error: "The application session is not active." };
      }
      const fill = message.type === "JOB_AUTOFILL_FILL_EMBEDDED";
      const results = await runEmbeddedFrameAction(
        session,
        fill ? "JOB_AUTOFILL_FILL" : "JOB_AUTOFILL_SCAN",
        { force: fill }
      );
      if (fill) {
        return {
          ok: true,
          filled: results.reduce(
            (total, result) => total + Number(result.filled || 0),
            0
          )
        };
      }
      return {
        ok: true,
        progress: results
          .filter((result) => result.progress)
          .map((result) => {
            const progress = sanitizeProgress(result.progress);
            progress.unknownFields = progress.unknownFields.map(
              (field, index) => ({
                ...field,
                key: `frame-${result.frame.frameId}-${index}`
              })
            );
            return progress;
          })
      };
    }
    case "JOB_AUTOFILL_PROGRESS": {
      const tabId = sender.tab?.id;
      const senderUrl = sender.url || sender.tab?.url;
      if (!tabId || !senderUrl || !message.sessionId) {
        throw new Error("Progress did not come from an application tab.");
      }
      const progress = sanitizeProgress(message.progress);
      const session = await updateSessionProgress(
        message.sessionId,
        tabId,
        senderUrl,
        progress
      );
      if (!session) {
        return { ok: true, ignored: true };
      }
      await setTabProgressBadge(tabId, progress);
      return { ok: true };
    }
    case "JOB_AUTOFILL_DISMISS_PANEL": {
      const tabId = sender.tab?.id;
      const senderUrl = sender.url || sender.tab?.url;
      if (!message.sessionId || !Number.isInteger(tabId) || !senderUrl) {
        throw new Error("Missing application session.");
      }
      const dismissed = await dismissSession(
        message.sessionId,
        tabId,
        senderUrl
      );
      if (dismissed) {
        const embedded = embeddedFrameRegistry.get(message.sessionId);
        await Promise.allSettled(
          (embedded ? Array.from(embedded.frames.values()) : []).map((frame) =>
            chrome.tabs.sendMessage(
              tabId,
              { type: "JOB_AUTOFILL_EXTENSION_DISABLED" },
              { frameId: frame.frameId }
            )
          )
        );
        embeddedFrameRegistry.delete(message.sessionId);
      }
      return { ok: true, ignored: !dismissed };
    }
    default:
      return { ok: false, error: "Unknown extension message." };
  }
}

async function handleExternalMessage(message) {
  switch (message.type) {
    case "JOB_AUTOFILL_PING": {
      const { enabled } = await chrome.storage.local.get({ enabled: true });
      return {
        ok: true,
        enabled,
        extensionId: chrome.runtime.id,
        version: chrome.runtime.getManifest().version
      };
    }
    case "JOB_AUTOFILL_LAUNCH":
      return launchApplication(message);
    case "JOB_AUTOFILL_SET_PROFILE": {
      const profile = await replaceProfile(message.profile);
      if (Object.prototype.hasOwnProperty.call(message, "resumeFile")) {
        await replaceResumeFile(message.resumeFile);
      }
      return {
        ok: true,
        profileConfigured: Object.values(profile).some(Boolean)
      };
    }
    case "JOB_AUTOFILL_GET_PROGRESS": {
      const { applicationSessions = {} } = await chrome.storage.local.get(
        "applicationSessions"
      );
      const session = applicationSessions[message.sessionId];
      return session
        ? { ok: true, session }
        : { ok: false, error: "Application session was not found." };
    }
    default:
      return { ok: false, error: "Unknown dashboard message." };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeBackground();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeBackground();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type?.startsWith("JOB_AUTOFILL_")) {
    return false;
  }

  initializeBackground()
    .then(() => handleInternalMessage(message, sender))
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  initializeBackground()
    .then(() => handleExternalMessage(message || {}, sender))
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  void (async () => {
    await initializeBackground();
    const session = await findSessionByTab(tabId);
    if (!session) {
      return;
    }

    const transition = await transitionSessionForNavigation(
      session.id,
      tabId,
      tab.url
    );
    if (!transition) {
      return;
    }
    if (!transition.allowed) {
      await chrome.action.setBadgeText({ tabId, text: "" });
      return;
    }

    await injectPanel(transition.session);
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    await initializeBackground();
    const session = await findSessionByTab(tabId);
    if (session) {
      embeddedFrameRegistry.delete(session.id);
      await updateSession(session.id, {
        tabId: null,
        status: "closed",
        closedAt: new Date().toISOString()
      });
    }
  })();
});

void initializeBackground();
