(function installApplicationPanel(root) {
  if (root.__jobAutofillPanelInstalled) {
    return;
  }
  root.__jobAutofillPanelInstalled = true;

  const profileSchema = root.JobAutofillProfile;
  const matcher = root.JobAutofillMatcher;
  const sessionScope = root.JobAutofillSessionScope;

  if (!profileSchema || !matcher || !sessionScope) {
    throw new Error("Job autofill libraries were not loaded.");
  }

  const state = {
    session: null,
    profile: {},
    host: null,
    shadow: null,
    observer: null,
    scanTimer: null,
    progressSignature: "",
    sessionGeneration: 0,
    extensionValues: new WeakMap(),
    elementIds: new WeakMap(),
    nextElementId: 1,
    fillIssues: new Map()
  };

  const ignoredInputTypes = new Set([
    "hidden",
    "submit",
    "button",
    "reset",
    "image",
    "password",
    "search"
  ]);

  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function text(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function humanize(value) {
    return text(
      String(value || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
    );
  }

  function elementIdentity(element) {
    if (!state.elementIds.has(element)) {
      state.elementIds.set(element, state.nextElementId++);
    }
    return state.elementIds.get(element);
  }

  function isVisible(element) {
    if (!element.isConnected || element.disabled) {
      return false;
    }
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.getClientRects().length > 0
    );
  }

  function isCandidateControl(element) {
    if (
      !isVisible(element) ||
      element.readOnly ||
      element.getAttribute("aria-disabled") === "true"
    ) {
      return false;
    }
    if (element instanceof HTMLInputElement) {
      return !ignoredInputTypes.has(element.type);
    }
    return (
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    );
  }

  function getTextByIds(value) {
    return text(
      String(value || "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
    );
  }

  function associatedLabel(element) {
    const labels = Array.from(element.labels || [])
      .map((label) => text(label.textContent))
      .filter(Boolean);
    return labels.join(" ");
  }

  function explicitGroupPrompt(elements) {
    const first = elements[0];
    const fieldset = first.closest("fieldset");
    const legend = fieldset?.querySelector(":scope > legend");
    if (legend && text(legend.textContent)) {
      return text(legend.textContent);
    }

    const roleGroup = first.closest('[role="radiogroup"], [role="group"]');
    if (roleGroup) {
      const ariaLabel =
        text(roleGroup.getAttribute("aria-label")) ||
        getTextByIds(roleGroup.getAttribute("aria-labelledby"));
      if (ariaLabel) {
        return ariaLabel;
      }
    }

    return "";
  }

  function groupPrompt(elements) {
    const explicitPrompt = explicitGroupPrompt(elements);
    if (explicitPrompt) {
      return explicitPrompt;
    }

    const first = elements[0];
    let container = first.parentElement;
    for (let depth = 0; container && depth < 4; depth += 1) {
      const candidates = Array.from(
        container.querySelectorAll(
          ":scope > legend, :scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [class*='question'], :scope > [class*='label']"
        )
      );
      const prompt = candidates
        .map((candidate) => text(candidate.textContent))
        .find((candidate) => candidate.length >= 3 && candidate.length <= 240);
      if (prompt) {
        return prompt;
      }
      container = container.parentElement;
    }

    return "";
  }

  function sectionPrompt(element) {
    let container = element.parentElement;
    for (let depth = 0; container && depth < 6; depth += 1) {
      const headings = Array.from(
        container.querySelectorAll(
          ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > [role='heading']"
        )
      );
      const prompt = headings
        .filter(
          (heading) =>
            heading.compareDocumentPosition(element) &
            Node.DOCUMENT_POSITION_FOLLOWING
        )
        .map((heading) => text(heading.textContent))
        .filter((value) => value.length >= 3 && value.length <= 240)
        .at(-1);
      if (prompt) {
        return prompt;
      }
      container = container.parentElement;
    }

    return "";
  }

  function signalsForQuestion(elements, grouped) {
    const first = elements[0];
    const signals = [];
    const add = (value, weight, source) => {
      const clean = text(value);
      if (clean && !signals.some((signal) => signal.text === clean)) {
        signals.push({ text: clean, weight, source });
      }
    };

    if (grouped) {
      add(groupPrompt(elements), 1, "prompt");
    } else {
      add(associatedLabel(first), 1, "label");
      add(explicitGroupPrompt(elements), 0.98, "prompt");
    }
    add(first.getAttribute("aria-label"), 0.98, "aria");
    add(getTextByIds(first.getAttribute("aria-labelledby")), 0.98, "aria");
    add(first.getAttribute("placeholder"), 0.84, "placeholder");
    add(first.getAttribute("name"), 0.76, "name");
    add(first.id, 0.72, "id");
    add(sectionPrompt(first), 0.55, "section");

    return signals;
  }

  function controlKind(elements) {
    const first = elements[0];
    if (first instanceof HTMLSelectElement) {
      return "select";
    }
    if (first instanceof HTMLTextAreaElement) {
      return "textarea";
    }
    if (first.type === "radio" || first.type === "checkbox") {
      return "choice";
    }
    if (first.type === "file") {
      return "file";
    }
    return "text";
  }

  function isAnswered(elements) {
    const first = elements[0];
    if (first instanceof HTMLSelectElement) {
      const option = first.options[first.selectedIndex];
      return Boolean(first.value && option && !option.disabled);
    }
    if (first.type === "radio" || first.type === "checkbox") {
      return elements.some((element) => element.checked);
    }
    if (first.type === "file") {
      return Boolean(first.files?.length);
    }
    return Boolean(text(first.value));
  }

  function wasFilledByExtension(elements) {
    return elements.some((element) => {
      if (!state.extensionValues.has(element)) {
        return false;
      }
      const filledValue = state.extensionValues.get(element);
      if (element.type === "radio" || element.type === "checkbox") {
        return element.checked && filledValue === String(element.value);
      }
      return text(element.value) === text(filledValue);
    });
  }

  function questionLabel(signals, elements, kind) {
    const preferredSignal = signals.find((signal) => signal.weight >= 0.9);
    if (preferredSignal) {
      return preferredSignal.text;
    }

    const first = elements[0];
    return (
      signals[0]?.text ||
      humanize(first.name || first.id) ||
      (kind === "file" ? "File upload" : "Unlabeled field")
    );
  }

  function shouldIgnoreQuestion(label) {
    const normalized = matcher.normalizeText(label);
    return [
      "search",
      "search jobs",
      "filter",
      "newsletter",
      "coupon",
      "sign in",
      "login"
    ].some(
      (ignored) =>
        normalized === ignored || normalized.startsWith(`${ignored} `)
    );
  }

  function collectQuestions() {
    const controls = Array.from(
      document.querySelectorAll("input, textarea, select")
    ).filter(isCandidateControl);
    const groups = new Map();

    for (const control of controls) {
      const grouped = ["radio", "checkbox"].includes(control.type) && control.name;
      const formKey = control.form ? elementIdentity(control.form) : "page";
      const key = grouped
        ? `${control.type}:${formKey}:${control.name}`
        : `element:${elementIdentity(control)}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(control);
    }

    const effectiveProfile = profileSchema.buildEffectiveProfile(
      state.profile,
      state.session
    );
    const questions = [];

    for (const [key, elements] of groups) {
      const grouped = elements.length > 1 || elements[0].type === "radio";
      const kind = controlKind(elements);
      const signals = signalsForQuestion(elements, grouped);
      const label = questionLabel(signals, elements, kind);

      if (shouldIgnoreQuestion(label)) {
        continue;
      }

      const match = matcher.findBestDefinition(
        {
          autocomplete: elements[0].getAttribute("autocomplete"),
          signals,
          controlKind: kind
        },
        profileSchema.fields
      );
      const matchedValue = match
        ? profileSchema.formatControlValue(
            effectiveProfile[match.definition.key],
            kind
          )
        : "";
      const answered = isAnswered(elements);
      const required = elements.some(
        (element) =>
          element.required || element.getAttribute("aria-required") === "true"
      );
      const filledByExtension = answered && wasFilledByExtension(elements);

      let status = "unknown";
      let reason = "The field was not recognized.";

      if (answered) {
        status = "answered";
        reason = "";
      } else if (kind === "file") {
        status = "manual";
        reason = "Upload a file manually.";
      } else if (elements[0].type === "checkbox") {
        status = "manual";
        reason = "Review this checkbox manually.";
      } else if (state.fillIssues.has(key)) {
        status = "failed";
        reason = state.fillIssues.get(key);
      } else if (match && matchedValue) {
        status = "ready";
        reason = "";
      } else if (match) {
        status = "missing-profile";
        reason = `Add ${match.definition.label.toLowerCase()} to your profile.`;
      }

      questions.push({
        key,
        elements,
        kind,
        label,
        signals,
        match,
        matchedValue,
        answered,
        required,
        filledByExtension,
        status,
        reason
      });
    }

    return questions;
  }

  function summarize(questions) {
    const unknownFields = questions
      .filter((question) =>
        ["manual", "unknown", "missing-profile", "failed"].includes(question.status)
      )
      .sort((left, right) => Number(right.required) - Number(left.required))
      .map((question) => ({
        label: question.label,
        required: question.required,
        reason: question.reason,
        controlKind: question.kind
      }));

    return {
      total: questions.length,
      answered: questions.filter((question) => question.answered).length,
      filledByExtension: questions.filter(
        (question) => question.filledByExtension
      ).length,
      readyToFill: questions.filter((question) => question.status === "ready")
        .length,
      needsAttention: unknownFields.length,
      unknownFields
    };
  }

  function renderProgress(progress) {
    if (!state.shadow) {
      return;
    }

    const percentage = progress.total
      ? Math.round((progress.answered / progress.total) * 100)
      : 0;
    state.shadow.querySelector("[data-progress-fill]").style.width = `${percentage}%`;
    state.shadow.querySelector(
      "[data-progress-label]"
    ).textContent = `${progress.answered} of ${progress.total} answered`;
    state.shadow.querySelector("[data-progress-percent]").textContent = `${percentage}%`;
    state.shadow.querySelector("[data-ready-count]").textContent =
      String(progress.readyToFill);
    state.shadow.querySelector("[data-attention-count]").textContent =
      String(progress.needsAttention);

    const list = state.shadow.querySelector("[data-unknown-list]");
    list.replaceChildren();

    if (!progress.unknownFields.length) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = progress.total
        ? "No unknown fields on this step."
        : "Waiting for application fields.";
      list.append(item);
      return;
    }

    for (const field of progress.unknownFields.slice(0, 20)) {
      const item = document.createElement("li");
      const heading = document.createElement("div");
      heading.className = "unknown-heading";
      heading.textContent = field.label;
      if (field.required) {
        const required = document.createElement("span");
        required.className = "required";
        required.textContent = "Required";
        heading.append(" ", required);
      }

      const reason = document.createElement("div");
      reason.className = "unknown-reason";
      reason.textContent = field.reason;
      item.append(heading, reason);
      list.append(item);
    }
  }

  async function publishProgress(progress) {
    const signature = JSON.stringify(progress);
    if (signature === state.progressSignature || !state.session) {
      return;
    }
    state.progressSignature = signature;

    try {
      await sendMessage({
        type: "JOB_AUTOFILL_PROGRESS",
        sessionId: state.session.id,
        progress
      });
    } catch (error) {
      state.progressSignature = "";
      console.warn("Unable to persist job application progress.", error);
    }
  }

  function scan() {
    if (!state.session || !state.host) {
      return;
    }
    if (!sessionScope.isAllowedUrl(state.session, location.href)) {
      teardown();
      return;
    }
    const progress = summarize(collectQuestions());
    renderProgress(progress);
    void publishProgress(progress);
  }

  function scheduleScan(delay = 120) {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(scan, delay);
  }

  function setNativeProperty(element, property, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element[property] = value;
    }
  }

  function dispatchValueEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function optionText(element) {
    return (
      associatedLabel(element) ||
      text(element.getAttribute("aria-label")) ||
      text(element.value)
    );
  }

  function fillChoice(question, value) {
    const first = question.elements[0];

    if (first instanceof HTMLSelectElement) {
      const ranked = Array.from(first.options)
        .map((option) => ({
          option,
          score: matcher.scoreChoice(value, option.value, option.textContent)
        }))
        .sort((left, right) => right.score - left.score);
      if (!ranked[0]?.score) {
        return false;
      }
      setNativeProperty(first, "value", ranked[0].option.value);
      dispatchValueEvents(first);
      state.extensionValues.set(first, String(first.value));
      return true;
    }

    if (first.type === "radio") {
      const ranked = question.elements
        .map((element) => ({
          element,
          score: matcher.scoreChoice(value, element.value, optionText(element))
        }))
        .sort((left, right) => right.score - left.score);
      if (!ranked[0]?.score) {
        return false;
      }
      setNativeProperty(ranked[0].element, "checked", true);
      dispatchValueEvents(ranked[0].element);
      state.extensionValues.set(
        ranked[0].element,
        String(ranked[0].element.value)
      );
      return true;
    }

    return false;
  }

  function fillText(question, value) {
    const element = question.elements[0];
    if (
      element instanceof HTMLInputElement &&
      element.type === "number" &&
      !Number.isFinite(Number(value))
    ) {
      return false;
    }

    setNativeProperty(element, "value", value);
    dispatchValueEvents(element);
    state.extensionValues.set(element, String(element.value));
    return text(element.value) === text(value);
  }

  function highlight(elements) {
    for (const element of elements) {
      element.setAttribute("data-job-autofill-filled", "true");
      setTimeout(
        () => element.removeAttribute("data-job-autofill-filled"),
        2500
      );
    }
  }

  async function fillKnownFields() {
    if (
      !state.session ||
      !sessionScope.isAllowedUrl(state.session, location.href)
    ) {
      throw new Error("This page is outside the approved application site.");
    }

    const sessionId = state.session.id;
    const sessionGeneration = state.sessionGeneration;
    const response = await sendMessage({
      type: "JOB_AUTOFILL_GET_PROFILE",
      sessionId
    });
    if (
      state.sessionGeneration !== sessionGeneration ||
      state.session?.id !== sessionId ||
      !sessionScope.isAllowedUrl(state.session, location.href)
    ) {
      throw new Error("Autofill was cancelled because the session changed.");
    }
    if (!response?.ok) {
      throw new Error(response?.error || "The extension profile is unavailable.");
    }
    state.profile = response.profile || {};

    state.fillIssues.clear();
    const questions = collectQuestions();
    let filled = 0;

    for (const question of questions) {
      if (question.status !== "ready") {
        continue;
      }

      const succeeded =
        question.kind === "choice" || question.kind === "select"
          ? fillChoice(question, question.matchedValue)
          : fillText(question, question.matchedValue);

      if (succeeded) {
        filled += 1;
        state.fillIssues.delete(question.key);
        highlight(question.elements);
      } else {
        state.fillIssues.set(
          question.key,
          `Saved ${question.match.definition.label.toLowerCase()} did not match this control.`
        );
      }
    }

    const status = state.shadow?.querySelector("[data-status]");
    if (status) {
      status.textContent = filled
        ? `Filled ${filled} field${filled === 1 ? "" : "s"}. Review every answer.`
        : "No additional known fields could be filled.";
    }

    scan();
    scheduleScan(500);
    return { ok: true, filled };
  }

  function panelTemplate() {
    return `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .panel {
          background: #ffffff;
          border: 1px solid #d0d5dd;
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(16, 24, 40, 0.22);
          color: #101828;
          display: flex;
          flex-direction: column;
          font-size: 13px;
          max-height: min(720px, calc(100vh - 32px));
          overflow: hidden;
          width: 360px;
        }
        header {
          align-items: flex-start;
          border-bottom: 1px solid #eaecf0;
          display: flex;
          gap: 10px;
          justify-content: space-between;
          padding: 16px;
        }
        h1, h2, p { margin: 0; }
        h1 { font-size: 15px; line-height: 1.35; }
        .job { color: #667085; font-size: 12px; margin-top: 3px; }
        .header-actions { display: flex; gap: 6px; }
        button {
          background: #ffffff;
          border: 1px solid #d0d5dd;
          border-radius: 8px;
          color: #344054;
          cursor: pointer;
          font: inherit;
          font-weight: 600;
          padding: 7px 10px;
        }
        button:hover { background: #f9fafb; }
        button:disabled { cursor: wait; opacity: 0.6; }
        .icon-button { font-size: 12px; padding: 6px 8px; }
        main { overflow-y: auto; padding: 16px; }
        .progress-row {
          align-items: center;
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .progress-label { font-weight: 650; }
        .percentage { color: #475467; font-variant-numeric: tabular-nums; }
        .track {
          background: #eaecf0;
          border-radius: 999px;
          height: 8px;
          overflow: hidden;
        }
        .fill {
          background: #16794f;
          border-radius: inherit;
          height: 100%;
          transition: width 180ms ease;
          width: 0;
        }
        .stats {
          display: grid;
          gap: 8px;
          grid-template-columns: 1fr 1fr;
          margin: 12px 0;
        }
        .stat {
          background: #f9fafb;
          border: 1px solid #eaecf0;
          border-radius: 9px;
          padding: 9px;
        }
        .stat strong { display: block; font-size: 17px; }
        .stat span { color: #667085; font-size: 11px; }
        .autofill-guidance {
          background: #eff4ff;
          border: 1px solid #c7d7fe;
          border-radius: 9px;
          color: #1849a9;
          line-height: 1.45;
          padding: 10px 12px;
        }
        .autofill-guidance strong { display: block; margin-bottom: 2px; }
        .status {
          color: #475467;
          font-size: 12px;
          line-height: 1.45;
          margin: 9px 0 16px;
        }
        h2 { font-size: 13px; margin-bottom: 8px; }
        ul { list-style: none; margin: 0; padding: 0; }
        li {
          border-top: 1px solid #eaecf0;
          line-height: 1.35;
          padding: 9px 0;
        }
        li:first-child { border-top: 0; }
        .unknown-heading { font-weight: 600; overflow-wrap: anywhere; }
        .unknown-reason { color: #667085; font-size: 11px; margin-top: 2px; }
        .required {
          background: #fee4e2;
          border-radius: 999px;
          color: #b42318;
          font-size: 9px;
          padding: 2px 5px;
          text-transform: uppercase;
        }
        .empty { color: #667085; }
        footer {
          align-items: center;
          border-top: 1px solid #eaecf0;
          display: flex;
          justify-content: flex-end;
          padding: 10px 16px;
        }
        .link {
          border: 0;
          color: #175cd3;
          padding: 4px;
        }
      </style>
      <section class="panel" aria-label="Job application autofill">
        <header>
          <div>
            <h1 data-title>Application assistant</h1>
            <p class="job" data-job></p>
          </div>
          <div class="header-actions">
            <button class="icon-button" data-close type="button" aria-label="Close panel">Close</button>
          </div>
        </header>
        <main>
          <div class="progress-row">
            <span class="progress-label" data-progress-label>0 of 0 answered</span>
            <span class="percentage" data-progress-percent>0%</span>
          </div>
          <div class="track"><div class="fill" data-progress-fill></div></div>
          <div class="stats">
            <div class="stat"><strong data-ready-count>0</strong><span>ready to autofill</span></div>
            <div class="stat"><strong data-attention-count>0</strong><span>need attention</span></div>
          </div>
          <div class="autofill-guidance">
            <strong>Ready to autofill?</strong>
            Open the extension from Chrome's toolbar and choose Autofill current page.
          </div>
          <p class="status" data-status>Nothing is submitted automatically.</p>
          <h2>Needs your answer</h2>
          <ul data-unknown-list></ul>
        </main>
        <footer>
          <button class="link" data-rescan type="button">Rescan page</button>
        </footer>
      </section>
    `;
  }

  function mountPanel() {
    if (state.host?.isConnected) {
      state.host.hidden = false;
      return;
    }

    state.host = document.createElement("div");
    state.host.id = "job-autofill-extension-panel";
    Object.assign(state.host.style, {
      position: "fixed",
      right: "16px",
      top: "16px",
      zIndex: "2147483647"
    });
    state.shadow = state.host.attachShadow({ mode: "closed" });
    state.shadow.innerHTML = panelTemplate();
    document.documentElement.append(state.host);

    state.shadow.querySelector("[data-rescan]").addEventListener("click", scan);
    state.shadow.querySelector("[data-close]").addEventListener("click", () => {
      unmountPanel();
      void sendMessage({
        type: "JOB_AUTOFILL_DISMISS_PANEL",
        sessionId: state.session.id
      });
    });
    document.addEventListener("input", handleFieldChange, true);
    document.addEventListener("change", handleFieldChange, true);
    state.observer = new MutationObserver(() => scheduleScan(250));
    state.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function handleFieldChange() {
    scheduleScan();
  }

  function unmountPanel() {
    clearTimeout(state.scanTimer);
    state.observer?.disconnect();
    state.observer = null;
    document.removeEventListener("input", handleFieldChange, true);
    document.removeEventListener("change", handleFieldChange, true);
    state.host?.remove();
    state.host = null;
    state.shadow = null;
  }

  function startSession(message) {
    if (!sessionScope.isAllowedUrl(message.session, location.href)) {
      return {
        ok: false,
        error: "This page is outside the approved application site."
      };
    }
    state.sessionGeneration += 1;
    state.session = message.session;
    state.profile = message.profile || {};
    state.progressSignature = "";
    mountPanel();

    const jobName = [state.session.jobTitle, state.session.company]
      .filter(Boolean)
      .join(" at ");
    state.shadow.querySelector("[data-job]").textContent =
      jobName || new URL(state.session.url).hostname;
    scan();
    return { ok: true };
  }

  function teardown() {
    unmountPanel();
    state.sessionGeneration += 1;
    state.session = null;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "JOB_AUTOFILL_START_SESSION") {
      sendResponse(startSession(message));
      return false;
    }
    if (message.type === "JOB_AUTOFILL_FILL") {
      fillKnownFields()
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        );
      return true;
    }
    if (message.type === "JOB_AUTOFILL_EXTENSION_DISABLED") {
      teardown();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})(globalThis);
