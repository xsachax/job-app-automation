(function installApplicationPanel(root) {
  if (root.__jobAutofillPanelInstalled) {
    return;
  }

  root.__jobAutofillPanelInstalled = true;

  const profileSchema = root.JobAutofillProfile;
  const matcher = root.JobAutofillMatcher;
  const sessionScope = root.JobAutofillSessionScope;
  const ats = root.JobAutofillAts;

  if (!profileSchema || !matcher || !sessionScope || !ats) {
    throw new Error("Job autofill libraries were not loaded.");
  }

  const state = {
    session: null,
    profile: {},
    profileAvailability: new Set(),
    context: {},
    host: null,
    shadow: null,
    observers: new Map(),
    observedFrames: new WeakSet(),
    scanTimer: null,
    progressSignature: "",
    sessionGeneration: 0,
    extensionValues: new WeakMap(),
    elementIds: new WeakMap(),
    nextElementId: 1,
    fillIssues: new Map(),
    lastQuestions: new Map(),
    platform: { key: "generic", label: "Custom application" },
    frameMode: false,
    scanRevision: 0
  };

  const ignoredInputTypes = new Set([
    "hidden",
    "submit",
    "button",
    "reset",
    "image",
    "password"
  ]);

  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function text(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function setProfileAvailability(availability) {
    state.profileAvailability = new Set(
      profileSchema.fields
        .filter((field) => availability?.[field.key] === true)
        .map((field) => field.key)
    );
  }

  function refreshProfileAvailability() {
    const effective = profileSchema.buildEffectiveProfile(
      state.profile,
      state.context
    );
    state.profileAvailability = new Set(
      profileSchema.fields
        .filter((field) =>
          field.key === "resumeFile"
            ? Boolean(state.profile.resumeFile)
            : Boolean(text(effective[field.key]))
        )
        .map((field) => field.key)
    );
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

  function tagName(element) {
    return String(element?.tagName || "").toUpperCase();
  }

  function isInput(element) {
    return tagName(element) === "INPUT";
  }

  function isTextarea(element) {
    return tagName(element) === "TEXTAREA";
  }

  function isSelect(element) {
    return tagName(element) === "SELECT";
  }

  function inputType(element) {
    return isInput(element)
      ? String(element.getAttribute("type") || "text").toLowerCase()
      : "";
  }

  function elementRole(element) {
    return String(element?.getAttribute?.("role") || "").toLowerCase();
  }

  function isContentEditable(element) {
    return (
      element?.isContentEditable ||
      element?.getAttribute?.("contenteditable") === "true"
    );
  }

  function isVisible(element) {
    if (
      !element?.isConnected ||
      element.disabled ||
      element.getAttribute?.("aria-disabled") === "true"
    ) {
      return false;
    }
    const style =
      element.ownerDocument?.defaultView?.getComputedStyle(element) ||
      getComputedStyle(element);
    const directlyVisible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.getClientRects().length > 0;
    if (directlyVisible) {
      return true;
    }
    if (
      isInput(element) &&
      ["radio", "checkbox", "file"].includes(inputType(element))
    ) {
      return Array.from(element.labels || []).some((label) => {
        const labelStyle =
          label.ownerDocument?.defaultView?.getComputedStyle(label) ||
          getComputedStyle(label);
        return (
          labelStyle.display !== "none" &&
          labelStyle.visibility !== "hidden" &&
          labelStyle.opacity !== "0" &&
          label.getClientRects().length > 0
        );
      });
    }
    return false;
  }

  function isCandidateControl(element) {
    if (
      !isVisible(element) ||
      element.readOnly ||
      element.getAttribute("aria-disabled") === "true"
    ) {
      return false;
    }
    if (isInput(element)) {
      return !ignoredInputTypes.has(inputType(element));
    }
    if (isTextarea(element) || isSelect(element) || isContentEditable(element)) {
      return true;
    }
    return (
      ["combobox", "radio", "checkbox"].includes(elementRole(element)) ||
      element.getAttribute?.("aria-haspopup") === "listbox"
    );
  }

  function getTextByIds(value, ownerDocument = document) {
    return text(
      String(value || "")
        .split(/\s+/)
        .map((id) => ownerDocument?.getElementById?.(id)?.textContent || "")
        .join(" ")
    );
  }

  function associatedLabel(element) {
    const labels = new Set(element.labels || []);
    const closestLabel = element.closest?.("label");
    if (closestLabel) {
      labels.add(closestLabel);
    }
    return Array.from(labels)
      .map((label) => {
        const copy = label.cloneNode(true);
        for (const control of copy.querySelectorAll(
          "input, textarea, select, button, [role='combobox'], [role='radio'], [role='checkbox']"
        )) {
          control.remove();
        }
        return text(copy.textContent);
      })
      .filter(Boolean)
      .join(" ");
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
        getTextByIds(
          roleGroup.getAttribute("aria-labelledby"),
          roleGroup.ownerDocument
        );
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

  function nearbyPrompt(element) {
    const container = ats.questionContainer(element);
    if (!container || container === element) {
      return "";
    }
    const candidates = Array.from(
      container.querySelectorAll(
        ":scope > label, :scope > legend, :scope > p, :scope > span, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [class*='label'], :scope > [class*='question'], :scope > [data-automation-id*='label']"
      )
    );
    return (
      candidates
        .filter((candidate) => !candidate.contains(element))
        .map((candidate) => text(candidate.textContent))
        .find((value) => value.length >= 2 && value.length <= 240) || ""
    );
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
    add(
      getTextByIds(first.getAttribute("aria-labelledby"), first.ownerDocument),
      0.98,
      "aria"
    );
    add(
      getTextByIds(first.getAttribute("aria-describedby"), first.ownerDocument),
      0.74,
      "description"
    );
    add(nearbyPrompt(first), 0.92, "nearby");
    add(first.getAttribute("placeholder"), 0.84, "placeholder");
    add(first.getAttribute("name"), 0.76, "name");
    add(first.id, 0.72, "id");
    add(sectionPrompt(first), 0.55, "section");
    for (const signal of ats.metadataSignals(first)) {
      add(signal.text, signal.weight, signal.source);
    }

    return signals;
  }

  function controlKind(elements) {
    const first = elements[0];
    if (isSelect(first)) {
      return "select";
    }
    if (isTextarea(first) || isContentEditable(first)) {
      return "textarea";
    }
    if (
      elementRole(first) === "combobox" ||
      first.getAttribute("aria-haspopup") === "listbox"
    ) {
      return "combobox";
    }
    if (
      (inputType(first) === "checkbox" ||
        elementRole(first) === "checkbox") &&
      elements.length > 1
    ) {
      return "check-many";
    }
    if (
      ["radio", "checkbox"].includes(inputType(first)) ||
      ["radio", "checkbox"].includes(elementRole(first))
    ) {
      return "choice";
    }
    if (inputType(first) === "file") {
      return "file";
    }
    return "text";
  }

  function isAnswered(elements) {
    const first = elements[0];
    if (isSelect(first)) {
      const option = first.options[first.selectedIndex];
      return Boolean(first.value && option && !option.disabled);
    }
    if (
      ["radio", "checkbox"].includes(inputType(first)) ||
      ["radio", "checkbox"].includes(elementRole(first))
    ) {
      return elements.some(
        (element) =>
          Boolean(element.checked) ||
          element.getAttribute("aria-checked") === "true"
      );
    }
    if (inputType(first) === "file") {
      return Boolean(first.files?.length);
    }
    if (isContentEditable(first)) {
      return Boolean(text(first.textContent));
    }
    if (controlKind(elements) === "combobox" && !isInput(first)) {
      const explicitValue =
        first.getAttribute("data-value") ||
        first.getAttribute("aria-valuetext");
      if (text(explicitValue)) {
        return true;
      }
      const controlledIds = String(
        first.getAttribute("aria-controls") ||
          first.getAttribute("aria-owns") ||
          ""
      ).split(/\s+/);
      const hasSelectedOption = controlledIds.some((id) =>
        first.ownerDocument
          ?.getElementById(id)
          ?.querySelector?.('[role="option"][aria-selected="true"]')
      );
      if (hasSelectedOption) {
        return true;
      }
      const displayed = text(first.textContent);
      return Boolean(displayed) &&
        !/^(?:choose|select|pick|please select|none)(?:\b|$)/i.test(displayed);
    }
    return Boolean(text(first.value));
  }

  function wasFilledByExtension(elements) {
    return elements.some((element) => {
      if (!state.extensionValues.has(element)) {
        return false;
      }
      const filledValue = state.extensionValues.get(element);
      if (
        ["radio", "checkbox"].includes(inputType(element)) ||
        ["radio", "checkbox"].includes(elementRole(element))
      ) {
        const selected =
          Boolean(element.checked) ||
          element.getAttribute("aria-checked") === "true";
        return selected && filledValue === String(element.value || optionText(element));
      }
      if (inputType(element) === "file") {
        return element.files?.[0]?.name === filledValue;
      }
      if (isContentEditable(element)) {
        return text(element.textContent) === text(filledValue);
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

  function collectRoots() {
    const roots = [];
    const seen = new Set();

    function visit(rootNode) {
      if (!rootNode || seen.has(rootNode)) {
        return;
      }
      seen.add(rootNode);
      roots.push(rootNode);

      for (const element of rootNode.querySelectorAll?.("*") || []) {
        if (element.shadowRoot) {
          visit(element.shadowRoot);
        }
        if (tagName(element) === "IFRAME") {
          if (!state.observedFrames.has(element)) {
            state.observedFrames.add(element);
            element.addEventListener("load", () => scheduleScan(250));
          }
          try {
            if (element.contentDocument?.documentElement) {
              visit(element.contentDocument);
            }
          } catch {
            // Cross-origin frames cannot be inspected from the top-level page.
          }
        }
      }
    }

    visit(document);
    return roots;
  }

  function pageControls() {
    const controls = [];
    const seen = new Set();
    for (const rootNode of collectRoots()) {
      for (const element of rootNode.querySelectorAll?.(
        ats.candidateSelector
      ) || []) {
        if (!seen.has(element) && isCandidateControl(element)) {
          seen.add(element);
          controls.push(element);
        }
      }
    }
    return controls;
  }

  function groupIdentity(control) {
    const roleGroup = control.closest?.(
      '[role="radiogroup"], [role="group"], fieldset'
    );
    const checkbox =
      inputType(control) === "checkbox" || elementRole(control) === "checkbox";
    const checkManyPrompt = checkbox
      ? explicitGroupPrompt([control])
      : "";
    const recognizedCheckManyGroup =
      checkManyPrompt &&
      Boolean(
        matcher.findBestDefinition(
          {
            signals: [
              { text: checkManyPrompt, weight: 1, source: "prompt" }
            ],
            controlKind: "check-many"
          },
          profileSchema.fields
        )
      );
    if (
      checkbox &&
      roleGroup &&
      (!control.name || recognizedCheckManyGroup)
    ) {
      return `role:${elementIdentity(roleGroup)}`;
    }
    if (isInput(control) && control.name) {
      const formKey = control.form ? elementIdentity(control.form) : "page";
      return `${elementIdentity(control.ownerDocument)}:${inputType(
        control
      )}:${formKey}:${control.name}`;
    }
    if (
      checkbox &&
      !control.name &&
      !roleGroup
    ) {
      return `element:${elementIdentity(control)}`;
    }
    return roleGroup
      ? `role:${elementIdentity(roleGroup)}`
      : `element:${elementIdentity(control)}`;
  }

  function resolveMatchedValue(
    match,
    kind,
    signals,
    effectiveProfile,
    nativeInputType
  ) {
    if (!match) {
      return { value: "", safe: false };
    }
    if (kind === "file") {
      return {
        value:
          match.definition.key === "resumeFile"
            ? effectiveProfile.resumeFile
            : null,
        safe: match.definition.key === "resumeFile",
        available: state.profileAvailability.has("resumeFile")
      };
    }
    if (
      ["workAuthorization", "requiresSponsorship"].includes(
        match.definition.key
      )
    ) {
      const resolution = matcher.resolveEligibilityAnswer(
        match.definition.key,
        signals,
        effectiveProfile
      );
      const intent = matcher.eligibilityIntent(signals);
      const available =
        intent === "authorized-without-sponsorship"
          ? state.profileAvailability.has("workAuthorization") &&
            state.profileAvailability.has("requiresSponsorship")
          : intent === "work-authorization"
            ? state.profileAvailability.has("workAuthorization")
            : state.profileAvailability.has("requiresSponsorship");
      return {
        value: resolution
          ? profileSchema.formatControlValue(resolution, kind)
          : "",
        safe: Boolean(intent),
        available,
        reason: intent
          ? ""
          : "The eligibility wording needs manual review."
      };
    }
    if (match.definition.key === "previousEmployers") {
      const available = state.profileAvailability.has("previousEmployers");
      const resolution = matcher.resolvePreviousEmployerAnswer(
        signals,
        effectiveProfile.previousEmployers,
        state.context.company
      );
      return {
        value: resolution
          ? profileSchema.formatControlValue(resolution, kind)
          : "",
        safe: Boolean(resolution),
        available,
        reason: resolution
          ? ""
          : available
            ? "The employer-history wording needs manual review."
            : "Add a complete previous-employer list before answering this question."
      };
    }
    if (
      match.definition.key === "phone" &&
      effectiveProfile.phoneNational &&
      pageControls().some((control) => {
        const controlSignals = signalsForQuestion([control], false);
        return (
          matcher.findBestDefinition(
            {
              autocomplete: control.getAttribute("autocomplete"),
              signals: controlSignals,
              controlKind: controlKind([control])
            },
            profileSchema.fields
          )?.definition.key === "phoneCountryCode"
        );
      })
    ) {
      return {
        value: profileSchema.formatControlValue(
          effectiveProfile.phoneNational,
          kind
        ),
        safe: true,
        available: state.profileAvailability.has("phoneNational")
      };
    }
    if (
      match.definition.key === "graduationDate" &&
      nativeInputType === "month"
    ) {
      return {
        value: profileSchema.formatControlValue(
          effectiveProfile.graduationDateInput,
          kind
        ),
        safe: true,
        available: state.profileAvailability.has("graduationDate")
      };
    }
    return {
      value: profileSchema.formatControlValue(
        effectiveProfile[match.definition.key],
        kind
      ),
      safe: true,
      available: state.profileAvailability.has(match.definition.key)
    };
  }

  function collectQuestions() {
    const controls = pageControls();
    const groups = new Map();

    for (const control of controls) {
      const grouped =
        ["radio", "checkbox"].includes(inputType(control)) ||
        ["radio", "checkbox"].includes(elementRole(control));
      const key = grouped
        ? groupIdentity(control)
        : `element:${elementIdentity(control)}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(control);
    }

    const effectiveProfile = profileSchema.buildEffectiveProfile(
      state.profile,
      state.context
    );
    const questions = [];

    for (const [key, elements] of groups) {
      const grouped =
        elements.length > 1 ||
        inputType(elements[0]) === "radio" ||
        elementRole(elements[0]) === "radio";
      const kind = controlKind(elements);
      const signals = signalsForQuestion(elements, grouped);
      const label = questionLabel(signals, elements, kind);

      if (shouldIgnoreQuestion(label)) {
        continue;
      }

      const analysis = matcher.analyzeDefinition(
        {
          autocomplete: elements[0].getAttribute("autocomplete"),
          signals,
          controlKind: kind
        },
        profileSchema.fields
      );
      const match = analysis.status === "confident" ? analysis.match : null;
      const resolved = resolveMatchedValue(
        match,
        kind,
        signals,
        effectiveProfile,
        inputType(elements[0])
      );
      const matchedValue = resolved.value;
      const answered =
        kind === "check-many"
          ? isCheckManyAnswered(
              elements,
              matchedValue,
              match?.definition?.key
            )
          : isAnswered(elements);
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
      } else if (
        (inputType(elements[0]) === "checkbox" ||
          elementRole(elements[0]) === "checkbox") &&
        (kind !== "check-many" || !match)
      ) {
        status = "manual";
        reason = "Review this checkbox manually.";
      } else if (state.fillIssues.has(key)) {
        status = "failed";
        reason = state.fillIssues.get(key);
      } else if (analysis.status === "uncertain") {
        status = "uncertain";
        reason = analysis.reason;
      } else if (match && !resolved.safe) {
        status = "uncertain";
        reason =
          resolved.reason || "The wording needs manual review before filling.";
      } else if (match && (matchedValue || resolved.available)) {
        status = "ready";
        reason = "";
      } else if (match) {
        status = "missing-profile";
        reason =
          kind === "file"
            ? "Save a resume PDF in your profile."
            : match.definition.key === "preferredOfficeLocations"
              ? "Rank acceptable locations S–C on the location tier board."
            : `Add ${match.definition.label.toLowerCase()} to your profile.`;
      } else if (kind === "file") {
        status = "manual";
        reason = "Upload this file manually.";
      }

      questions.push({
        key,
        elements,
        kind,
        label,
        signals,
        match,
        analysis,
        confidence: analysis.confidence,
        suggestedField:
          match?.definition?.label ||
          analysis.candidates?.[0]?.definition?.label ||
          "",
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
        [
          "manual",
          "unknown",
          "uncertain",
          "missing-profile",
          "failed"
        ].includes(question.status)
      )
      .sort((left, right) => Number(right.required) - Number(left.required))
      .map((question) => ({
        key: question.key,
        label: question.label,
        required: question.required,
        reason: question.reason,
        controlKind: question.kind,
        status: question.status,
        confidence: question.confidence,
        suggestedField: question.suggestedField
      }));

    return {
      total: questions.length,
      answered: questions.filter((question) => question.answered).length,
      filledByExtension: questions.filter(
        (question) => question.filledByExtension
      ).length,
      readyToFill: questions.filter((question) => question.status === "ready")
        .length,
      recognized: questions.filter((question) => Boolean(question.match)).length,
      needsAttention: unknownFields.length,
      uncertain: questions.filter(
        (question) => question.status === "uncertain"
      ).length,
      platform: state.platform.label,
      unknownFields
    };
  }

  function ensureReviewStyle(rootNode) {
    if (rootNode.querySelector?.("[data-job-autofill-review-style]")) {
      return;
    }
    const ownerDocument = rootNode.nodeType === 9 ? rootNode : rootNode.ownerDocument;
    const style = ownerDocument.createElement("style");
    style.setAttribute("data-job-autofill-review-style", "");
    style.textContent = `
      [data-job-autofill-review="uncertain"] {
        outline: 3px solid #bf8700 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 5px rgba(191, 135, 0, 0.16) !important;
      }
      [data-job-autofill-review="failed"] {
        outline: 3px solid #cf222e !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 5px rgba(207, 34, 46, 0.14) !important;
      }
      [data-job-autofill-filled="true"] {
        outline: 3px solid #1a7f37 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 5px rgba(26, 127, 55, 0.14) !important;
      }
    `;
    if (rootNode.nodeType === 9) {
      (rootNode.head || rootNode.documentElement).append(style);
    } else {
      rootNode.append(style);
    }
  }

  function clearReviewMarkers(removeStyles = false) {
    for (const rootNode of collectRoots()) {
      if (!removeStyles) {
        ensureReviewStyle(rootNode);
      }
      for (const element of rootNode.querySelectorAll?.(
        "[data-job-autofill-review]"
      ) || []) {
        element.removeAttribute("data-job-autofill-review");
        element.removeAttribute("data-job-autofill-review-label");
      }
      if (removeStyles) {
        for (const style of rootNode.querySelectorAll?.(
          "[data-job-autofill-review-style]"
        ) || []) {
          style.remove();
        }
      }
    }
  }

  function reviewTarget(question) {
    const visibleControl = question.elements.find(isVisible);
    const first = visibleControl || question.elements[0];
    const container = ats.questionContainer(first);
    if (
      container &&
      container !== first &&
      text(container.textContent).length <= 800
    ) {
      return container;
    }
    return first;
  }

  function markQuestionsForReview(questions) {
    clearReviewMarkers();
    for (const question of questions) {
      if (
        question.status !== "uncertain" &&
        question.status !== "failed" &&
        !(question.required && question.status === "unknown")
      ) {
        continue;
      }
      const target = reviewTarget(question);
      const reviewState =
        question.status === "failed" ? "failed" : "uncertain";
      for (const element of new Set([target, ...question.elements])) {
        element?.setAttribute("data-job-autofill-review", reviewState);
        element?.setAttribute("data-job-autofill-review-label", question.label);
      }
    }
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
      const localQuestion = state.lastQuestions.get(field.key);
      const reviewControl = document.createElement(
        localQuestion ? "button" : "div"
      );
      reviewControl.className = "review-field";
      if (localQuestion) {
        reviewControl.type = "button";
        reviewControl.addEventListener("click", () => {
          const target = reviewTarget(localQuestion);
          target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
          localQuestion.elements
            .find(isVisible)
            ?.focus?.({ preventScroll: true });
        });
      }
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
      const confidence =
        field.status === "uncertain" && field.confidence
          ? ` ${Math.round(field.confidence)}% confidence.`
          : "";
      reason.textContent = `${field.reason}${confidence}`;
      reviewControl.append(heading, reason);
      item.append(reviewControl);
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

  function mergeProgress(base, embedded) {
    const totals = [
      "total",
      "answered",
      "filledByExtension",
      "readyToFill",
      "recognized",
      "needsAttention",
      "uncertain"
    ];
    const merged = {
      ...base,
      unknownFields: [...base.unknownFields]
    };
    const platforms = new Set(
      base.platform ? [base.platform] : []
    );
    for (const progress of embedded) {
      for (const key of totals) {
        merged[key] = Number(merged[key] || 0) + Number(progress[key] || 0);
      }
      merged.unknownFields.push(...(progress.unknownFields || []));
      if (progress.platform) {
        platforms.add(progress.platform);
      }
    }
    merged.unknownFields = merged.unknownFields.slice(0, 75);
    merged.platform = Array.from(platforms).join(", ");
    return merged;
  }

  async function addEmbeddedProgress(progress, revision) {
    try {
      const response = await sendMessage({
        type: "JOB_AUTOFILL_SCAN_EMBEDDED",
        sessionId: state.session?.id
      });
      if (
        state.frameMode ||
        revision !== state.scanRevision ||
        !state.host ||
        !response?.ok ||
        !Array.isArray(response.progress)
      ) {
        return;
      }
      const merged = mergeProgress(progress, response.progress);
      renderProgress(merged);
      await publishProgress(merged);
    } catch {
      // Embedded forms are additive; the top-level form remains usable on failure.
    }
  }

  function scan({ includeEmbedded = true } = {}) {
    if (!state.session) {
      return null;
    }
    if (!sessionScope.isAllowedUrl(state.session, location.href)) {
      teardown();
      return null;
    }
    const revision = ++state.scanRevision;
    state.platform = ats.detectPlatform(location.href, document);
    refreshObservers();
    const questions = collectQuestions();
    state.lastQuestions = new Map(
      questions.map((question) => [question.key, question])
    );
    markQuestionsForReview(questions);
    const progress = summarize(questions);
    if (state.host) {
      renderProgress(progress);
      void publishProgress(progress);
      if (includeEmbedded && !state.frameMode) {
        void addEmbeddedProgress(progress, revision);
      }
    }
    return progress;
  }

  function scheduleScan(delay = 120) {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(scan, delay);
  }

  function refreshObservers() {
    const roots = new Set(collectRoots());
    for (const [rootNode, observer] of state.observers) {
      if (!roots.has(rootNode)) {
        observer.disconnect();
        rootNode.removeEventListener?.("input", handleFieldChange, true);
        rootNode.removeEventListener?.("change", handleFieldChange, true);
        state.observers.delete(rootNode);
      }
    }
    for (const rootNode of roots) {
      if (state.observers.has(rootNode)) {
        continue;
      }
      const ownerDocument =
        rootNode.nodeType === 9 ? rootNode : rootNode.ownerDocument;
      const Observer =
        ownerDocument?.defaultView?.MutationObserver || MutationObserver;
      const observer = new Observer(() => scheduleScan(250));
      const target =
        rootNode.nodeType === 9
          ? rootNode.body || rootNode.documentElement
          : rootNode;
      observer.observe(target, { childList: true, subtree: true });
      rootNode.addEventListener?.("input", handleFieldChange, true);
      rootNode.addEventListener?.("change", handleFieldChange, true);
      state.observers.set(rootNode, observer);
    }
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
    const EventConstructor = element.ownerDocument?.defaultView?.Event || Event;
    element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    element.dispatchEvent(new EventConstructor("change", { bubbles: true }));
  }

  function optionText(element) {
    if (tagName(element) === "OPTION" || elementRole(element) === "option") {
      return (
        text(element.getAttribute("aria-label")) ||
        text(element.textContent) ||
        text(element.value)
      );
    }
    return (
      associatedLabel(element) ||
      text(element.getAttribute("aria-label")) ||
      getTextByIds(element.getAttribute("aria-labelledby"), element.ownerDocument) ||
      text(element.textContent) ||
      text(element.value)
    );
  }

  function rankOptions(options, value, fieldKey) {
    return options
      .filter(
        (option) =>
          !option.disabled && option.getAttribute?.("aria-disabled") !== "true"
      )
      .map((option) => ({
        option,
        score: matcher.scoreChoice(
          value,
          option.value || option.getAttribute?.("data-value") || option.id,
          optionText(option),
          fieldKey
        )
      }))
      .sort((left, right) => right.score - left.score);
  }

  function listValues(value) {
    const seen = new Set();
    return String(value || "")
      .split(/[\n;]/)
      .map((item) => item.trim())
      .filter((item) => {
        const key = matcher.normalizeText(item);
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function hasUniqueChoice(ranked) {
    const best = ranked[0];
    const next = ranked[1];
    return Boolean(
      best &&
        best.score >= matcher.MINIMUM_SCORE &&
        (!next ||
          (best.score !== next.score &&
            (best.score === 100 || best.score - next.score >= 7)))
    );
  }

  function matchingChoiceElements(elements, value, fieldKey) {
    const matches = new Set();
    for (const desiredValue of listValues(value)) {
      const ranked = rankOptions(elements, desiredValue, fieldKey);
      if (hasUniqueChoice(ranked)) {
        matches.add(ranked[0].option);
      }
    }
    return [...matches];
  }

  function isCheckManyAnswered(elements, value, fieldKey) {
    const matches = matchingChoiceElements(elements, value, fieldKey);
    return (
      matches.length > 0 &&
      matches.every(
        (element) =>
          Boolean(element.checked) ||
          element.getAttribute("aria-checked") === "true"
      )
    );
  }

  function visibleComboOptions(element) {
    const ownerDocument = element.ownerDocument;
    const optionsFrom = (container) =>
      Array.from(container?.querySelectorAll?.(ats.optionSelector) || []).filter(
        isVisible
      );
    const controlledIds = [
      element.getAttribute("aria-controls"),
      element.getAttribute("aria-owns")
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/\s+/));

    for (const id of controlledIds) {
      const controlled = ownerDocument.getElementById(id);
      const controlledOptions = optionsFrom(controlled);
      if (controlledOptions.length) {
        return controlledOptions;
      }
    }

    const listboxes = [];
    for (const rootNode of collectRoots()) {
      if (
        rootNode !== ownerDocument &&
        rootNode.ownerDocument !== ownerDocument
      ) {
        continue;
      }
      for (const listbox of rootNode.querySelectorAll?.("[role='listbox']") ||
        []) {
        if (isVisible(listbox)) {
          listboxes.push(listbox);
        }
      }
    }
    if (listboxes.length === 1) {
      return optionsFrom(listboxes[0]);
    }
    return [];
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForComboboxOptions(
    element,
    value,
    fieldKey,
    assertActive
  ) {
    const deadline = Date.now() + 1_500;
    let ranked = [];
    do {
      assertActive();
      ranked = rankOptions(visibleComboOptions(element), value, fieldKey);
      if (hasUniqueChoice(ranked)) {
        return ranked;
      }
      await wait(75);
      assertActive();
    } while (Date.now() < deadline);
    return ranked;
  }

  async function fillCombobox(question, value, assertActive) {
    const element = question.elements[0];
    const originalValue = isInput(element) ? element.value : "";
    let ownedValue = null;
    try {
      assertActive();
      element.focus?.();
      element.click?.();
      await wait(60);
      assertActive();

      const fieldKey = question.match?.definition.key;
      let ranked = rankOptions(visibleComboOptions(element), value, fieldKey);
      if (!hasUniqueChoice(ranked) && isInput(element) && !element.readOnly) {
        assertActive();
        setNativeProperty(element, "value", value);
        const EventConstructor =
          element.ownerDocument?.defaultView?.Event || Event;
        element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
        ownedValue = String(element.value);
        ranked = await waitForComboboxOptions(
          element,
          value,
          fieldKey,
          assertActive
        );
      } else if (!hasUniqueChoice(ranked)) {
        ranked = await waitForComboboxOptions(
          element,
          value,
          fieldKey,
          assertActive
        );
      }

      if (!hasUniqueChoice(ranked)) {
        if (
          isInput(element) &&
          ownedValue !== null &&
          element.value === ownedValue &&
          element.value !== originalValue
        ) {
          assertActive();
          setNativeProperty(element, "value", originalValue);
          dispatchValueEvents(element);
        }
        return false;
      }

      assertActive();
      ranked[0].option.click();
      if (isInput(element)) {
        ownedValue = String(element.value);
      }
      await wait(60);
      assertActive();
      const selected =
        ranked[0].option.getAttribute("aria-selected") === "true" ||
        matcher.scoreChoice(
          value,
          element.value || element.getAttribute("data-value"),
          element.getAttribute("aria-valuetext") || optionText(element),
          fieldKey
        ) >= matcher.MINIMUM_SCORE;
      if (selected) {
        state.extensionValues.set(
          element,
          String(element.value || element.getAttribute("data-value") || value)
        );
      }
      return selected;
    } catch (error) {
      if (
        isInput(element) &&
        ownedValue !== null &&
        element.value === ownedValue &&
        element.value !== originalValue
      ) {
        setNativeProperty(element, "value", originalValue);
        dispatchValueEvents(element);
      }
      throw error;
    }
  }

  function fillCheckMany(question, value) {
    const matches = matchingChoiceElements(
      question.elements,
      value,
      question.match?.definition.key
    );
    if (!matches.length) {
      return false;
    }

    for (const element of matches) {
      const selected =
        Boolean(element.checked) ||
        element.getAttribute("aria-checked") === "true";
      if (!selected) {
        element.click();
      }
      if (isInput(element) && !element.checked) {
        setNativeProperty(element, "checked", true);
        dispatchValueEvents(element);
      }
      state.extensionValues.set(
        element,
        String(element.value || optionText(element))
      );
    }
    return matches.every(
      (element) =>
        Boolean(element.checked) ||
        element.getAttribute("aria-checked") === "true"
    );
  }

  async function fillChoice(question, value, assertActive) {
    const first = question.elements[0];

    if (question.kind === "combobox") {
      return fillCombobox(question, value, assertActive);
    }

    if (isSelect(first)) {
      const ranked = rankOptions(
        Array.from(first.options),
        value,
        question.match?.definition.key
      );
      if (!hasUniqueChoice(ranked)) {
        return false;
      }
      assertActive();
      setNativeProperty(first, "value", ranked[0].option.value);
      dispatchValueEvents(first);
      const selected = String(first.value) === String(ranked[0].option.value);
      if (selected) {
        state.extensionValues.set(first, String(first.value));
      }
      return selected;
    }

    if (inputType(first) === "radio" || elementRole(first) === "radio") {
      const ranked = rankOptions(
        question.elements,
        value,
        question.match?.definition.key
      );
      if (!hasUniqueChoice(ranked)) {
        return false;
      }
      const selectedElement = ranked[0].option;
      assertActive();
      selectedElement.click();
      if (
        isInput(selectedElement) &&
        !selectedElement.checked
      ) {
        setNativeProperty(selectedElement, "checked", true);
        dispatchValueEvents(selectedElement);
      }
      const selected =
        Boolean(selectedElement.checked) ||
        selectedElement.getAttribute("aria-checked") === "true";
      if (selected) {
        state.extensionValues.set(
          selectedElement,
          String(selectedElement.value || optionText(selectedElement))
        );
      }
      return selected;
    }

    return false;
  }

  function fillText(question, value) {
    const element = question.elements[0];
    if (
      isInput(element) &&
      inputType(element) === "number" &&
      !Number.isFinite(Number(value))
    ) {
      return false;
    }

    if (isContentEditable(element)) {
      element.focus?.();
      element.textContent = value;
      dispatchValueEvents(element);
      state.extensionValues.set(element, String(element.textContent));
      return text(element.textContent) === text(value);
    }
    setNativeProperty(element, "value", value);
    dispatchValueEvents(element);
    state.extensionValues.set(element, String(element.value));
    return text(element.value) === text(value);
  }

  function fillFile(question, savedFile) {
    const element = question.elements[0];
    if (
      !isInput(element) ||
      inputType(element) !== "file" ||
      !savedFile ||
      savedFile.mimeType !== "application/pdf" ||
      typeof savedFile.base64 !== "string"
    ) {
      return false;
    }

    try {
      const binary = atob(savedFile.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const frameWindow = element.ownerDocument?.defaultView || root;
      const file = new frameWindow.File([bytes], savedFile.fileName || "resume.pdf", {
        type: "application/pdf",
        lastModified: Date.now()
      });
      const transfer = new frameWindow.DataTransfer();
      transfer.items.add(file);
      setNativeProperty(element, "files", transfer.files);
      dispatchValueEvents(element);
      state.extensionValues.set(element, file.name);
      return element.files?.[0]?.name === file.name;
    } catch {
      return false;
    }
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

  function assertAutofillSession(sessionId, sessionGeneration) {
    if (
      state.sessionGeneration !== sessionGeneration ||
      state.session?.id !== sessionId ||
      !sessionScope.isAllowedUrl(state.session, location.href)
    ) {
      throw new Error("Autofill was cancelled because the session changed.");
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
    const assertActive = () =>
      assertAutofillSession(sessionId, sessionGeneration);
    const response = await sendMessage({
      type: "JOB_AUTOFILL_GET_PROFILE",
      sessionId
    });
    assertActive();
    if (!response?.ok) {
      throw new Error(response?.error || "The extension profile is unavailable.");
    }
    state.profile = {
      ...(response.profile || {}),
      resumeFile: response.resumeFile || null
    };
    refreshProfileAvailability();

    state.fillIssues.clear();
    const questions = collectQuestions();
    let filled = 0;

    for (const question of questions) {
      assertActive();
      if (question.status !== "ready") {
        continue;
      }

      const succeeded =
        question.kind === "file"
          ? fillFile(question, question.matchedValue)
          : question.kind === "check-many"
            ? fillCheckMany(question, question.matchedValue)
          : ["choice", "select", "combobox"].includes(question.kind)
          ? await fillChoice(question, question.matchedValue, assertActive)
          : fillText(question, question.matchedValue);
      assertActive();

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

  async function handlePanelAutofill() {
    const button = state.shadow?.querySelector("[data-autofill]");
    if (!button || button.disabled) {
      return;
    }

    button.disabled = true;
    button.textContent = "Autofilling...";
    try {
      const local = await fillKnownFields();
      const embedded = await sendMessage({
        type: "JOB_AUTOFILL_FILL_EMBEDDED",
        sessionId: state.session?.id
      });
      const total = Number(local.filled || 0) + Number(embedded?.filled || 0);
      const status = state.shadow?.querySelector("[data-status]");
      if (status && embedded?.ok) {
        status.textContent = total
          ? `Filled ${total} field${total === 1 ? "" : "s"}. Review every answer.`
          : "No additional known fields could be filled.";
      }
    } catch (error) {
      const status = state.shadow?.querySelector("[data-status]");
      if (status) {
        status.textContent =
          error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (state.shadow && button.isConnected) {
        button.disabled = false;
        button.textContent = "Autofill ready fields";
      }
    }
  }

  function panelTemplate() {
    return `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; }
        .panel {
          background: #ffffff;
          border: 1px solid #d0d5dd;
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(16, 24, 40, 0.22);
          color: #101828;
          display: flex;
          flex-direction: column;
          font-size: 13px;
          max-height: min(720px, calc(100vh - 24px));
          max-width: calc(100vw - 24px);
          overflow: hidden;
          width: 380px;
        }
        header {
          align-items: flex-start;
          border-bottom: 1px solid #eaecf0;
          display: flex;
          gap: 10px;
          justify-content: space-between;
          padding: 16px;
        }
        header > div:first-child { min-width: 0; }
        h1, h2, p { margin: 0; }
        h1 { font-size: 15px; line-height: 1.35; }
        .job {
          color: #667085;
          font-size: 12px;
          line-height: 1.3;
          margin-top: 3px;
          overflow-wrap: anywhere;
        }
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
        main {
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          padding: 16px;
        }
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
          align-items: center;
          background: #f9fafb;
          border: 1px solid #eaecf0;
          border-radius: 9px;
          display: flex;
          gap: 7px;
          min-width: 0;
          padding: 9px;
        }
        .stat strong {
          flex: 0 0 auto;
          font-size: 17px;
          line-height: 1;
        }
        .stat span {
          color: #667085;
          font-size: 11px;
          line-height: 1.15;
          min-width: 0;
        }
        .autofill-guidance {
          background: #eff4ff;
          border: 1px solid #c7d7fe;
          border-radius: 9px;
          color: #1849a9;
          line-height: 1.45;
          padding: 10px 12px;
        }
        .autofill-guidance strong { display: block; margin-bottom: 2px; }
        .autofill-guidance p { font-size: 12px; }
        .autofill-button {
          background: #175cd3;
          border-color: #175cd3;
          color: #ffffff;
          margin-top: 9px;
          width: 100%;
        }
        .autofill-button:hover { background: #1849a9; }
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
        .review-field {
          background: transparent;
          border: 0;
          border-radius: 6px;
          display: block;
          padding: 3px;
          text-align: left;
          width: 100%;
        }
        button.review-field:hover { background: #f9fafb; }
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
            <p>Fill recognized fields, then review every answer before submitting.</p>
            <button class="autofill-button" data-autofill type="button">Autofill ready fields</button>
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
      right: "12px",
      top: "12px",
      zIndex: "2147483647"
    });
    state.shadow = state.host.attachShadow({ mode: "closed" });
    state.shadow.innerHTML = panelTemplate();
    document.documentElement.append(state.host);

    state.shadow
      .querySelector("[data-autofill]")
      .addEventListener("click", () => void handlePanelAutofill());
    state.shadow.querySelector("[data-rescan]").addEventListener("click", scan);
    state.shadow.querySelector("[data-close]").addEventListener("click", () => {
      unmountPanel();
      void sendMessage({
        type: "JOB_AUTOFILL_DISMISS_PANEL",
        sessionId: state.session.id
      });
    });
    refreshObservers();
  }

  function handleFieldChange() {
    scheduleScan();
  }

  function unmountPanel() {
    clearTimeout(state.scanTimer);
    for (const [rootNode, observer] of state.observers) {
      observer.disconnect();
      rootNode.removeEventListener?.("input", handleFieldChange, true);
      rootNode.removeEventListener?.("change", handleFieldChange, true);
    }
    state.observers.clear();
    clearReviewMarkers(true);
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
    const changingSession = state.session?.id !== message.session.id;
    state.sessionGeneration += 1;
    state.session = message.session;
    state.context = message.session;
    state.frameMode = Boolean(message.frameMode);
    state.profile = {
      ...(message.profile || {}),
      resumeFile: message.resumeFile || null
    };
    setProfileAvailability(message.profileAvailability);
    if (changingSession) {
      state.extensionValues = new WeakMap();
      state.fillIssues.clear();
      state.lastQuestions = new Map();
    }
    state.progressSignature = "";
    if (state.frameMode) {
      refreshObservers();
      return {
        ok: true,
        progress: scan({ includeEmbedded: false })
      };
    }
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
    state.context = {};
    state.profileAvailability = new Set();
    state.frameMode = false;
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
    if (message.type === "JOB_AUTOFILL_SCAN") {
      sendResponse({
        ok: true,
        progress: scan({ includeEmbedded: false })
      });
      return false;
    }
    if (message.type === "JOB_AUTOFILL_EXTENSION_DISABLED") {
      teardown();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})(globalThis);
