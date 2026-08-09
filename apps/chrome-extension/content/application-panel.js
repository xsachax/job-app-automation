(function installApplicationPanel(root) {
  if (root.__jobAutofillPanelInstalled) {
    return;
  }

  root.__jobAutofillPanelInstalled = true;

  const profileSchema = root.JobAutofillProfile;
  const matcher = root.JobAutofillMatcher;
  const interactions = root.JobAutofillControlInteractions;
  const sessionScope = root.JobAutofillSessionScope;
  const ats = root.JobAutofillAts;
  if (!profileSchema || !matcher || !interactions || !sessionScope || !ats) {
    throw new Error("Job autofill libraries were not loaded.");
  }

  const state = {
    session: null,
    profile: {},
    profileLoaded: false,
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
    adapter: null,
    page: null,
    definitions: profileSchema.fields,
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
  const requiredSignalSources = new Set([
    "aria",
    "description",
    "label",
    "prompt"
  ]);

  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function text(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function setProfileAvailability(availability) {
    state.profileAvailability = new Set(
      Object.entries(availability || {})
        .filter(([, available]) => available === true)
        .map(([key]) => key)
    );
  }

  function refreshProfileAvailability() {
    state.profileAvailability = new Set(
      Object.entries({
        ...profileSchema.profileAvailability(state.profile, state.context),
        resumeFile: Boolean(state.profile.resumeFile)
      })
        .filter(([, available]) => available)
        .map(([key]) => key)
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
    const visible =
      isVisible(element) || state.adapter?.allowsHiddenControl?.(element);
    if (
      !visible ||
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

  function nearbyPrompts(element, elements) {
    const container = ats.questionContainer(element, state.adapter, elements);
    if (!container || container === element) {
      return [];
    }
    const candidates = Array.from(
      container.querySelectorAll(
        ":scope > label, :scope > legend, :scope > p, :scope > span, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [class*='label'], :scope > [class*='question'], :scope > [data-automation-id*='label']"
      )
    );
    return candidates
      .filter(
        (candidate) =>
          !elements.some((questionElement) =>
            candidate.contains(questionElement)
          ) &&
          !candidate.querySelector(
            "input, textarea, select, button, [contenteditable='true'], [role='combobox'], [role='radio'], [role='checkbox']"
          )
      )
      .map((candidate) => text(candidate.textContent))
      .filter((value) => value.length >= 2 && value.length <= 240);
  }

  function structuralSignalElements(element, elements) {
    return Array.from(
      new Set(
        [
          element.closest?.(
            "fieldset, [role='radiogroup'], [role='group']"
          ),
          ats.questionContainer(element, state.adapter, elements)
        ].filter((candidate) => candidate && candidate !== element)
      )
    );
  }

  function signalsForQuestion(elements, grouped, adapterDetails = null) {
    const first = elements[0];
    const signals = [];
    const add = (value, weight, source) => {
      const clean = text(value);
      if (
        clean &&
        !signals.some(
          (signal) => signal.text === clean && signal.source === source
        )
      ) {
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
    for (const prompt of nearbyPrompts(first, elements)) {
      add(prompt, 0.92, "nearby");
    }
    add(first.getAttribute("placeholder"), 0.84, "placeholder");
    add(first.getAttribute("name"), 0.76, "name");
    add(first.id, 0.72, "id");
    add(sectionPrompt(first), 0.55, "section");
    for (const signalElement of [
      first,
      ...structuralSignalElements(first, elements)
    ]) {
      if (signalElement !== first) {
        add(signalElement.getAttribute?.("aria-label"), 0.96, "aria");
        add(
          getTextByIds(
            signalElement.getAttribute?.("aria-labelledby"),
            signalElement.ownerDocument
          ),
          0.96,
          "aria"
        );
        add(
          getTextByIds(
            signalElement.getAttribute?.("aria-describedby"),
            signalElement.ownerDocument
          ),
          0.74,
          "description"
        );
        add(signalElement.id, 0.64, "id");
      }
      for (const signal of ats.metadataSignals(signalElement)) {
        add(signal.text, signal.weight, signal.source);
      }
    }
    for (const signal of adapterDetails?.signals || []) {
      add(signal.text, signal.weight, signal.source);
    }

    return signals;
  }

  function hasOptionalMarker(value) {
    return /\boptional\b|\bnot required\b|\bnot mandatory\b|\bif applicable\b/i.test(
      String(value || "")
    );
  }

  function hasRequiredMarker(value) {
    const candidate = String(value || "");
    return (
      /(?:^|\s|\()required(?:\s|\)|:|$)/i.test(candidate) ||
      /(?:^|\s|\()mandatory(?:\s|\)|:|$)/i.test(candidate) ||
      /[*∗✱]/.test(candidate)
    );
  }

  function isRequiredQuestion(elements, signals) {
    const elementSet = new Set(elements);
    const groups = elements
      .map((element) =>
        element.closest?.("fieldset, [role='group'], [role='radiogroup']")
      )
      .filter(
        (group) =>
          group &&
          Array.from(
            group.querySelectorAll(ats.candidateSelectorFor(state.adapter))
          )
            .filter(isCandidateControl)
            .every((control) => elementSet.has(control))
      );
    const structuralCandidates = [...elements, ...groups];
    if (
      structuralCandidates.some(
        (element) =>
          Boolean(element.required) ||
          element.hasAttribute?.("required") ||
          String(element.getAttribute?.("aria-required") || "").toLowerCase() ===
            "true"
      ) ||
      elements.some((element) =>
        ats.hasRequiredMetadata(element, state.adapter, elements)
      )
    ) {
      return true;
    }

    const requirementSignals = (signals || []).filter((signal) =>
      requiredSignalSources.has(signal.source)
    );
    if (requirementSignals.some((signal) => hasOptionalMarker(signal.text))) {
      return false;
    }
    return requirementSignals.some((signal) => hasRequiredMarker(signal.text));
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
    if (controlKind(elements) === "combobox" && isInput(first)) {
      if (text(interactions.committedControlValue(first))) {
        return true;
      }
      return (
        first.getAttribute("aria-expanded") === "false" &&
        Boolean(text(first.value))
      );
    }
    if (controlKind(elements) === "combobox") {
      const explicitValue =
        first.getAttribute("data-value") ||
        first.getAttribute("aria-valuetext");
      if (text(explicitValue)) {
        return true;
      }
      const hasSelectedOption = interactions
        .resolveControlledListboxes(first)
        .some((listbox) =>
          listbox.querySelector?.(
            '[role="option"][aria-selected="true"], option:checked'
          )
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

  function inputSnapshot(elements) {
    return elements.map((element) =>
      JSON.stringify({
        ariaChecked: element.getAttribute("aria-checked"),
        ariaSelected: element.getAttribute("aria-selected"),
        ariaValueText: element.getAttribute("aria-valuetext"),
        checked: Boolean(element.checked),
        dataValue: element.getAttribute("data-value"),
        files: Array.from(element.files || []).map((file) => file.name),
        text:
          isContentEditable(element) ||
          (!isInput(element) && !isSelect(element) && !isTextarea(element))
            ? text(element.textContent)
            : "",
        value: "value" in element ? String(element.value || "") : ""
      })
    );
  }

  function questionRemainsReady(question) {
    const answered =
      !state.fillIssues.has(question.key) &&
      (question.kind === "check-many"
        ? isCheckManyAnswered(
            question.elements,
            question.matchedValue,
            question.match?.definition?.key
          )
        : isAnswered(question.elements));
    if (
      question.elements.some(
        (element) => !element.isConnected || !isCandidateControl(element)
      ) ||
      question.inputSnapshot.some(
        (snapshot, index) =>
          snapshot !== inputSnapshot([question.elements[index]])[0]
      ) ||
      answered
    ) {
      return false;
    }

    const grouped =
      question.elements.length > 1 ||
      inputType(question.elements[0]) === "radio" ||
      elementRole(question.elements[0]) === "radio";
    return isRequiredQuestion(
      question.elements,
      signalsForQuestion(question.elements, grouped, question.adapterDetails)
    );
  }

  function shouldAttemptQuestion(question) {
    return (
      question.status === "ready" ||
      (question.status === "failed" &&
        !question.answered &&
        state.fillIssues.has(question.key))
    );
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
      if (
        elementRole(element) === "combobox" &&
        filledValue?.kind === "combobox-commit"
      ) {
        return interactions
          .comboboxCommitEvidence(element, {
            includeUnassociatedHidden: true
          })
          .some(
            (evidence) =>
              evidence.source === filledValue.source &&
              text(evidence.value) === text(filledValue.value)
          );
      }
      if (isContentEditable(element)) {
        return text(element.textContent) === text(filledValue);
      }
      return (
        text(element.value) === text(filledValue) ||
        (elementRole(element) === "combobox" &&
          text(interactions.committedControlValue(element)) === text(filledValue))
      );
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
        ats.candidateSelectorFor(state.adapter)
      ) || []) {
        if (
          !seen.has(element) &&
          isCandidateControl(element) &&
          !state.adapter?.shouldIgnoreElement?.(element)
        ) {
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
          state.definitions
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

  function identityValue(value) {
    return encodeURIComponent(text(value));
  }

  function stableDomPath(element, ignoreElementId = false) {
    const segments = [];
    let current = element;
    for (let depth = 0; current && depth < 10; depth += 1) {
      if (current.id && (!ignoreElementId || current !== element)) {
        segments.unshift(`#${identityValue(current.id)}`);
        break;
      }
      const parent = current.parentElement;
      const tag = tagName(current).toLowerCase() || "element";
      if (!parent) {
        segments.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter(
        (candidate) => tagName(candidate) === tagName(current)
      );
      segments.unshift(`${tag}:${siblings.indexOf(current) + 1}`);
      current = parent;
    }
    return segments.join("/");
  }

  function semanticControlIdentity(element) {
    const attributes = [
      ["data-automation-id", element?.getAttribute?.("data-automation-id")],
      ["data-testid", element?.getAttribute?.("data-testid")],
      ["data-field-name", element?.getAttribute?.("data-field-name")],
      ["name", element?.getAttribute?.("name")],
      ["autocomplete", element?.getAttribute?.("autocomplete")],
      ["aria-label", element?.getAttribute?.("aria-label")]
    ];
    const explicit = attributes.find(([, value]) => text(value));
    const path = stableDomPath(element, true);
    if (explicit) {
      return `${explicit[0]}:${identityValue(explicit[1])}@${path}`;
    }
    return `path:${path}`;
  }

  function stableRootIdentity(element) {
    const rootNode = element?.getRootNode?.();
    if (rootNode?.host) {
      return `shadow:${semanticControlIdentity(rootNode.host)}`;
    }
    let frameElement = null;
    try {
      frameElement = element?.ownerDocument?.defaultView?.frameElement || null;
    } catch {
      frameElement = null;
    }
    const documentUrl = element?.ownerDocument?.URL || location.href;
    return frameElement
      ? `frame:${identityValue(documentUrl)}:${semanticControlIdentity(
          frameElement
        )}`
      : `document:${identityValue(documentUrl)}`;
  }

  function stableQuestionIdentity(elements, kind, label, match) {
    const first = elements[0];
    const roleGroup = first.closest?.(
      '[role="radiogroup"], [role="group"], fieldset'
    );
    const anchors = roleGroup ? [roleGroup] : elements;
    const controls = anchors
      .map(semanticControlIdentity)
      .sort()
      .join("|");
    return [
      stableRootIdentity(first),
      kind,
      match?.definition?.key || "unmatched",
      identityValue(label),
      controls
    ].join("::");
  }

  function resolveMatchedValue(
    match,
    kind,
    signals,
    effectiveProfile,
    nativeInputType,
    adapterDetails
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
    const adapterResolution = state.adapter?.resolveValue?.(
      match.definition.key,
      effectiveProfile,
      adapterDetails,
      nativeInputType
    );
    if (adapterResolution) {
      return {
        ...adapterResolution,
        value: profileSchema.formatControlValue(adapterResolution.value, kind),
        available: state.profileLoaded
          ? adapterResolution.available
          : state.profileAvailability.has(adapterResolution.availabilityKey)
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
      ["city", "location"].includes(match.definition.key) &&
      ["select", "combobox"].includes(kind)
    ) {
      const explicitLocation =
        effectiveProfile.location || effectiveProfile.city;
      const contextualLocation = matcher.contextualLocationChoice(
        explicitLocation,
        effectiveProfile.country
      );
      if (contextualLocation === null) {
        return {
          value: "",
          searchValue: "",
          safe: false,
          available: true,
          reason:
            "The saved location conflicts with the application country and needs manual review."
        };
      }
      return {
        value: profileSchema.formatControlValue(
          contextualLocation,
          kind
        ),
        searchValue: profileSchema.formatControlValue(explicitLocation, kind),
        safe: true,
        available:
          state.profileAvailability.has("location") ||
          state.profileAvailability.has("city")
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

    for (const [groupKey, elements] of groups) {
      const grouped =
        elements.length > 1 ||
        inputType(elements[0]) === "radio" ||
        elementRole(elements[0]) === "radio";
      const kind = controlKind(elements);
      const adapterDetails = state.adapter?.questionDetails?.(elements[0]) || null;
      const signals = signalsForQuestion(elements, grouped, adapterDetails);
      const label = questionLabel(signals, elements, kind);

      if (shouldIgnoreQuestion(label)) {
        continue;
      }

      const analysis = matcher.analyzeDefinition(
        {
          autocomplete: elements[0].getAttribute("autocomplete"),
          signals,
          controlKind: kind,
          optionTexts: questionOptionTexts(elements, kind)
        },
        state.page?.scanOnly ? [] : state.definitions
      );
      const match =
        analysis.status === "confident"
          ? analysis.match
          : matcher.equivalentCandidateMatch(analysis, effectiveProfile);
      const resolved = resolveMatchedValue(
        match,
        kind,
        signals,
        effectiveProfile,
        inputType(elements[0]),
        adapterDetails
      );
      const key =
        stableQuestionIdentity(elements, kind, label, match) || groupKey;
      const matchedValue = resolved.value;
      const matchedSearchValue = resolved.searchValue || matchedValue;
      const answered =
        !state.fillIssues.has(key) &&
        (kind === "check-many"
          ? isCheckManyAnswered(
              elements,
              matchedValue,
              match?.definition?.key
            )
          : isAnswered(elements));
      const required = isRequiredQuestion(elements, signals);
      const filledByExtension = answered && wasFilledByExtension(elements);
      const safeSingleCheckbox =
        state.adapter?.allowsSingleCheckbox?.(
          adapterDetails,
          match?.definition?.key,
          matchedValue
        ) ||
        (["canPerformEssentialFunctions", "isAtLeast18"].includes(
          match?.definition?.key
        ) &&
          matcher.canonicalChoice(matchedValue, match.definition.key) === "yes");

      let status = "unknown";
      let reason = "The field was not recognized.";

      if (state.fillIssues.has(key)) {
        status = "failed";
        reason = state.fillIssues.get(key);
      } else if (answered) {
        status = "answered";
        reason = "";
      } else if (!required) {
        status = "optional";
        reason = "Optional fields are left unchanged.";
      } else if (
        (inputType(elements[0]) === "checkbox" ||
          elementRole(elements[0]) === "checkbox") &&
        (kind !== "check-many" || !match) &&
        !safeSingleCheckbox
      ) {
        status = "manual";
        reason = "Review this checkbox manually.";
      } else if (analysis.status === "uncertain" && !match) {
        status = "uncertain";
        reason = analysis.reason;
      } else if (match && !resolved.safe) {
        status = "uncertain";
        reason =
          resolved.reason || "The wording needs manual review before filling.";
      } else if (
        match &&
        matcher.requiresExplicitChoice(match.definition.key) &&
        !matchedValue
      ) {
        status = "manual";
        reason = "Save an explicit nonblank answer before filling this field.";
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
        adapterDetails,
        match,
        analysis,
        confidence: analysis.confidence,
        suggestedField:
          match?.definition?.label ||
          analysis.candidates?.[0]?.definition?.label ||
          "",
        matchedValue,
        matchedSearchValue,
        answered,
        required,
        inputSnapshot: inputSnapshot(elements),
        filledByExtension,
        status,
        reason
      });
    }

    return questions;
  }

  function summarize(questions) {
    const requiredQuestions = questions.filter((question) => question.required);
    const unknownFields = requiredQuestions
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
      total: requiredQuestions.length,
      answered: requiredQuestions.filter((question) => question.answered).length,
      filledByExtension: requiredQuestions.filter(
        (question) => question.filledByExtension
      ).length,
      readyToFill: requiredQuestions.filter(
        (question) => question.status === "ready"
      ).length,
      recognized: questions.filter((question) => Boolean(question.match)).length,
      needsAttention: unknownFields.length,
      uncertain: requiredQuestions.filter(
        (question) => question.status === "uncertain"
      ).length,
      platform: state.page
        ? `${state.platform.label} · ${state.page.label}`
        : state.platform.label,
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
        !question.required ||
        (question.status !== "uncertain" &&
          question.status !== "failed" &&
          question.status !== "unknown")
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
    state.adapter = ats.activeAdapter(location.href, document);
    state.platform = ats.detectPlatform(location.href, document);
    state.page = state.adapter?.pageInfo?.(document) || null;
    state.definitions =
      state.adapter?.augmentDefinitions?.(profileSchema.fields) ||
      profileSchema.fields;
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
    const observerKey = state.adapter?.key || "generic";
    for (const [rootNode, registration] of state.observers) {
      if (!roots.has(rootNode) || registration.key !== observerKey) {
        registration.observer.disconnect();
        rootNode.removeEventListener?.("input", handleFieldChange, true);
        rootNode.removeEventListener?.("change", handleFieldChange, true);
        rootNode.removeEventListener?.("click", handleFieldClick, true);
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
      observer.observe(
        target,
        state.adapter?.observerOptions || { childList: true, subtree: true }
      );
      rootNode.addEventListener?.("input", handleFieldChange, true);
      rootNode.addEventListener?.("change", handleFieldChange, true);
      rootNode.addEventListener?.("click", handleFieldClick, true);
      state.observers.set(rootNode, { key: observerKey, observer });
    }
  }

  function setNativeProperty(element, property, value) {
    interactions.setNativeProperty(element, property, value);
  }

  function dispatchValueEvents(element) {
    const EventConstructor = element.ownerDocument?.defaultView?.Event || Event;
    element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    element.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    if (element.ownerDocument?.activeElement === element && element.blur) {
      element.blur();
    } else {
      const FocusEventConstructor =
        element.ownerDocument?.defaultView?.FocusEvent || FocusEvent;
      element.dispatchEvent(
        new FocusEventConstructor("blur", { bubbles: true })
      );
    }
  }

  function dispatchCommittedChoiceEvents(element) {
    const EventConstructor = element.ownerDocument?.defaultView?.Event || Event;
    element.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    if (element.ownerDocument?.activeElement === element && element.blur) {
      element.blur();
    } else {
      const FocusEventConstructor =
        element.ownerDocument?.defaultView?.FocusEvent || FocusEvent;
      element.dispatchEvent(
        new FocusEventConstructor("blur", { bubbles: true })
      );
    }
  }

  function dispatchClickEvent(element) {
    const MouseEventConstructor =
      element.ownerDocument?.defaultView?.MouseEvent || MouseEvent;
    element.dispatchEvent(
      new MouseEventConstructor("click", {
        bubbles: true,
        cancelable: true,
        view: element.ownerDocument?.defaultView
      })
    );
  }

  function dispatchPointerClick(element) {
    const ownerWindow = element.ownerDocument?.defaultView || root;
    const PointerEventConstructor = ownerWindow.PointerEvent;
    const MouseEventConstructor = ownerWindow.MouseEvent || MouseEvent;
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: ownerWindow
    };
    if (PointerEventConstructor) {
      element.dispatchEvent(
        new PointerEventConstructor("pointerdown", eventInit)
      );
    }
    element.dispatchEvent(new MouseEventConstructor("mousedown", eventInit));
    if (PointerEventConstructor) {
      element.dispatchEvent(new PointerEventConstructor("pointerup", eventInit));
    }
    element.dispatchEvent(new MouseEventConstructor("mouseup", eventInit));
    element.click();
  }

  function fillFailure(question, reason) {
    question.failureReason = reason;
    return false;
  }

  function committedElement(question, reference) {
    const element = interactions.resolveControl(reference);
    if (element) {
      question.committedElements = [element];
    }
    return element;
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

  function questionOptionTexts(elements, kind) {
    let options = [];
    const first = elements[0];
    if (isSelect(first)) {
      options = Array.from(first.options || []);
    } else if (["choice", "check-many"].includes(kind)) {
      options = elements;
    } else if (kind === "combobox") {
      options = Array.from(
        new Set(
          interactions.resolveControlledListboxes(first).flatMap((listbox) =>
            Array.from(
              listbox.querySelectorAll(ats.optionSelectorFor(state.adapter)) || []
            )
          )
        )
      );
    }
    return Array.from(
      new Set(options.map((option) => optionText(option)).filter(Boolean))
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

  function rankFallbackOptions(options, value, fieldKey) {
    if (!text(value)) {
      return [];
    }
    return options
      .filter(
        (option) =>
          !option.disabled && option.getAttribute?.("aria-disabled") !== "true"
      )
      .map((option) => ({
        option,
        score: matcher.scoreSafeFallback(
          fieldKey,
          option.value || option.getAttribute?.("data-value") || option.id,
          optionText(option)
        )
      }))
      .sort((left, right) => right.score - left.score);
  }

  function supportsSafeFallback(fieldKey) {
    return (
      matcher.scoreSafeFallback(fieldKey, "other", "Other") >=
      matcher.MINIMUM_SCORE
    );
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

  function visibleListboxes(element) {
    const ownerDocument = element.ownerDocument;
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
    return listboxes;
  }

  function visibleComboOptions(element, initiallyVisible = []) {
    const optionsFrom = (container) =>
      Array.from(
        container?.querySelectorAll?.(ats.optionSelectorFor(state.adapter)) || []
      ).filter(isVisible);
    const controlledIds = interactions.controlledListboxIds(element);

    if (controlledIds.length) {
      return Array.from(
        new Set(
          interactions
            .resolveControlledListboxes(element, { initiallyVisible })
            .flatMap(optionsFrom)
        )
      );
    }

    return Array.from(
      new Set(
        interactions
          .scopedListboxes(
            element,
            visibleListboxes(element),
            initiallyVisible
          )
          .flatMap(optionsFrom)
      )
    );
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForComboboxOptions(
    reference,
    value,
    fieldKey,
    assertActive,
    ownedState,
    initiallyVisible,
    ranker = rankOptions
  ) {
    const deadline = Date.now() + 1_500;
    do {
      assertActive();
      const current = interactions.resolveOwnedControl(reference, ownedState);
      if (!current) {
        return false;
      }
      const ranked = ranker(
        visibleComboOptions(current, initiallyVisible),
        value,
        fieldKey
      );
      if (hasUniqueChoice(ranked)) {
        return true;
      }
      await wait(75);
      assertActive();
    } while (Date.now() < deadline);
    return Boolean(interactions.resolveOwnedControl(reference, ownedState));
  }

  async function fillCombobox(question, value, assertActive) {
    const reference = interactions.controlReference(question.elements[0]);
    const originalValue = isInput(question.elements[0])
      ? String(question.elements[0].value)
      : "";
    let ownedValue = isInput(question.elements[0]) ? originalValue : null;
    let ownedState = interactions.controlOwnershipState(question.elements[0]);
    let initiallyVisible = [];
    const commitStateFor = (control) =>
      interactions.componentCommitState(control, {
        initiallyVisible,
        visibleListboxes: visibleListboxes(control)
      });
    let ownedCommitState = commitStateFor(question.elements[0]);
    let committed = false;
    const restoreTypedValue = () => {
      const liveControl = interactions.resolveControl(reference);
      const restored = interactions.restoreOwnedControlValue(
        reference,
        ownedValue,
        originalValue,
        ownedCommitState,
        {
          initiallyVisible,
          visibleListboxes: liveControl ? visibleListboxes(liveControl) : []
        }
      );
      if (restored) {
        dispatchValueEvents(restored);
      }
    };
    try {
      assertActive();
      let current = interactions.resolveOwnedControl(reference, ownedState);
      if (!current) {
        return fillFailure(
          question,
          "The field was replaced before the extension could open it."
        );
      }
      initiallyVisible = visibleListboxes(current);
      current.focus?.();
      dispatchPointerClick(current);
      await wait(60);
      assertActive();

      const fieldKey = question.match?.definition.key;
      const searchQueries = matcher.choiceSearchQueries(
        question.matchedSearchValue || value,
        fieldKey
      );
      current = interactions.resolveOwnedControl(reference, ownedState);
      if (!current) {
        return fillFailure(
          question,
          "The field was replaced while its options were opening."
        );
      }
      let ranked = rankOptions(
        visibleComboOptions(current, initiallyVisible),
        value,
        fieldKey
      );
      let usedFallback = false;
      if (!hasUniqueChoice(ranked) && isInput(current) && !current.readOnly) {
        for (const query of searchQueries) {
          assertActive();
          current = interactions.resolveOwnedControl(reference, ownedState);
          if (!isInput(current) || String(current.value) !== ownedValue) {
            return fillFailure(
              question,
              "The field changed before the extension could retry its search."
            );
          }
          if (ownedValue !== originalValue) {
            current = interactions.restoreOwnedControlValue(
              reference,
              ownedValue,
              originalValue,
              ownedCommitState,
              {
                initiallyVisible,
                visibleListboxes: visibleListboxes(current)
              }
            );
            if (!isInput(current)) {
              return fillFailure(
                question,
                "The field changed before the extension could restore its owned search."
              );
            }
            const RestoreEventConstructor =
              current.ownerDocument?.defaultView?.Event || Event;
            current.dispatchEvent(
              new RestoreEventConstructor("input", { bubbles: true })
            );
            current = interactions.resolveControl(reference);
            if (
              !isInput(current) ||
              String(current.value) !== originalValue ||
              commitStateFor(current) !== ownedCommitState
            ) {
              return fillFailure(
                question,
                "The field changed or committed a newer value while the extension restored its owned search."
              );
            }
            ownedValue = String(current.value);
            ownedState = interactions.controlOwnershipState(current);
            ownedCommitState = commitStateFor(current);
          }
          assertActive();
          current = interactions.resolveOwnedControl(reference, ownedState);
          if (!isInput(current) || String(current.value) !== originalValue) {
            return fillFailure(
              question,
              "The field changed before the extension could enter its search."
            );
          }
          setNativeProperty(current, "value", query);
          ownedValue = String(current.value);
          ownedState = interactions.controlOwnershipState(current);
          ownedCommitState = commitStateFor(current);
          const EventConstructor =
            current.ownerDocument?.defaultView?.Event || Event;
          current.dispatchEvent(new EventConstructor("input", { bubbles: true }));
          current = interactions.resolveOwnedControl(reference, ownedState);
          if (!current) {
            return fillFailure(
              question,
              "The field changed while the extension entered its search."
            );
          }
          await waitForComboboxOptions(
            reference,
            value,
            fieldKey,
            assertActive,
            ownedState,
            initiallyVisible
          );
          current = interactions.resolveOwnedControl(reference, ownedState);
          if (!current) {
            return fillFailure(
              question,
              "The field changed while the extension ranked its search results."
            );
          }
          ranked = rankOptions(
            visibleComboOptions(current, initiallyVisible),
            value,
            fieldKey
          );
          if (hasUniqueChoice(ranked)) {
            break;
          }
        }
      } else if (!hasUniqueChoice(ranked)) {
        await waitForComboboxOptions(
          reference,
          value,
          fieldKey,
          assertActive,
          ownedState,
          initiallyVisible
        );
      }

      current = interactions.resolveOwnedControl(reference, ownedState);
      if (!current) {
        return fillFailure(
          question,
          "The field changed or was replaced while its options were loading."
        );
      }
      ranked = rankOptions(
        visibleComboOptions(current, initiallyVisible),
        value,
        fieldKey
      );
      if (!hasUniqueChoice(ranked) && supportsSafeFallback(fieldKey)) {
        current = interactions.resolveOwnedControl(reference, ownedState);
        if (!current) {
          return fillFailure(
            question,
            "The field changed before the extension could choose a fallback option."
          );
        }
        let fallbackRanked = [];
        if (
          isInput(current) &&
          ownedValue !== null &&
          String(current.value) === ownedValue &&
          String(current.value) !== originalValue
        ) {
          assertActive();
          current = interactions.restoreOwnedControlValue(
            reference,
            ownedValue,
            originalValue,
            ownedCommitState,
            {
              initiallyVisible,
              visibleListboxes: visibleListboxes(current)
            }
          );
          if (!isInput(current)) {
            return fillFailure(
              question,
              "The field changed before the extension could prepare fallback options."
            );
          }
          ownedValue = String(current.value);
          ownedState = interactions.controlOwnershipState(current);
          ownedCommitState = commitStateFor(current);
          const EventConstructor =
            current.ownerDocument?.defaultView?.Event || Event;
          current.dispatchEvent(
            new EventConstructor("input", { bubbles: true })
          );
          current = interactions.resolveOwnedControl(reference, ownedState);
          if (!current) {
            return fillFailure(
              question,
              "The field changed while the extension prepared fallback options."
            );
          }
          await waitForComboboxOptions(
            reference,
            value,
            fieldKey,
            assertActive,
            ownedState,
            initiallyVisible,
            rankFallbackOptions
          );
          current = interactions.resolveOwnedControl(reference, ownedState);
          if (!current) {
            return fillFailure(
              question,
              "The field changed before the extension could choose a fallback option."
            );
          }
          fallbackRanked = rankFallbackOptions(
            visibleComboOptions(current, initiallyVisible),
            value,
            fieldKey
          );
        } else {
          current = interactions.resolveOwnedControl(reference, ownedState);
          if (!current) {
            return fillFailure(
              question,
              "The field changed before the extension could rank fallback options."
            );
          }
          fallbackRanked = rankFallbackOptions(
            visibleComboOptions(current, initiallyVisible),
            value,
            fieldKey
          );
        }
        if (hasUniqueChoice(fallbackRanked)) {
          ranked = fallbackRanked;
          usedFallback = true;
        }
      }

      if (!hasUniqueChoice(ranked)) {
        return fillFailure(
          question,
          "No unique option owned by this field matched the saved answer."
        );
      }

      assertActive();
      current = interactions.resolveOwnedControl(reference, ownedState);
      if (!current) {
        return fillFailure(
          question,
          "The field changed before the extension could click its option."
        );
      }
      ranked = (usedFallback ? rankFallbackOptions : rankOptions)(
        visibleComboOptions(current, initiallyVisible),
        value,
        fieldKey
      );
      if (!hasUniqueChoice(ranked) || !ranked[0].option.isConnected) {
        return fillFailure(
          question,
          "The matching option was replaced before the extension could click it."
        );
      }
      const commitEvidenceBeforeClick = new Set(
        interactions
          .comboboxCommitEvidence(current, {
            initiallyVisible,
            includeUnassociatedHidden: true,
            visibleListboxes: visibleListboxes(current)
          })
          .map(
            (evidence) => `${evidence.source}\u0000${evidence.value}`
          )
      );
      assertActive();
      current = interactions.resolveOwnedControl(reference, ownedState);
      if (!current) {
        return fillFailure(
          question,
          "The field changed before the extension could commit its option."
        );
      }
      ranked = (usedFallback ? rankFallbackOptions : rankOptions)(
        visibleComboOptions(current, initiallyVisible),
        value,
        fieldKey
      );
      if (!hasUniqueChoice(ranked) || !ranked[0].option.isConnected) {
        return fillFailure(
          question,
          "The matching option changed before the extension could commit it."
        );
      }
      dispatchPointerClick(ranked[0].option);
      await wait(0);
      assertActive();
      current = committedElement(question, reference);
      if (!current) {
        return fillFailure(
          question,
          "The field was replaced before its selected value could be verified."
        );
      }
      dispatchCommittedChoiceEvents(current);

      const commitDeadline = Date.now() + 750;
      do {
        await wait(50);
        assertActive();
        current = committedElement(question, reference);
        if (!current) {
          continue;
        }
        const committedEvidence = interactions
          .comboboxCommitEvidence(current, {
            initiallyVisible,
            includeUnassociatedHidden: true,
            visibleListboxes: visibleListboxes(current)
          })
          .filter(
            (evidence) =>
              !commitEvidenceBeforeClick.has(
                `${evidence.source}\u0000${evidence.value}`
              )
          )
          .find(
            (evidence) =>
              matcher.scoreChoice(
                value,
                evidence.value,
                evidence.value,
                fieldKey
              ) >= matcher.MINIMUM_SCORE ||
              (usedFallback &&
                matcher.scoreSafeFallback(
                  fieldKey,
                  evidence.value,
                  evidence.value
                ) >= matcher.MINIMUM_SCORE)
          );
        const popupClosed =
          current.getAttribute("aria-expanded") !== "true" &&
          visibleComboOptions(current, initiallyVisible).length === 0;
        if (committedEvidence && popupClosed) {
          state.extensionValues.set(current, {
            kind: "combobox-commit",
            source: committedEvidence.source,
            value: committedEvidence.value
          });
          committed = true;
          return true;
        }
      } while (Date.now() < commitDeadline);

      return fillFailure(
        question,
        "The field matched, but the selected value did not remain committed after the form updated."
      );
    } finally {
      if (!committed) {
        restoreTypedValue();
      }
    }
  }

  async function fillCheckMany(question, value, assertActive) {
    const matches = matchingChoiceElements(
      question.elements,
      value,
      question.match?.definition.key
    );
    if (!matches.length) {
      return fillFailure(
        question,
        "No explicit saved checkbox option matched this group."
      );
    }

    const committed = [];
    for (const element of matches) {
      const reference = interactions.controlReference(element);
      const selected =
        Boolean(element.checked) ||
        element.getAttribute("aria-checked") === "true";
      if (!selected) {
        assertActive();
        dispatchPointerClick(element);
      }
      await wait(25);
      assertActive();
      let current = interactions.resolveControl(reference);
      if (!current) {
        return fillFailure(
          question,
          "A checkbox was replaced before its saved selection could be verified."
        );
      }
      if (isInput(current) && !current.checked) {
        setNativeProperty(current, "checked", true);
        dispatchValueEvents(current);
        await wait(25);
        assertActive();
        current = interactions.resolveControl(reference);
      }
      if (
        !current ||
        (!current.checked &&
          current.getAttribute("aria-checked") !== "true")
      ) {
        return fillFailure(
          question,
          "A matched checkbox did not remain selected after the form updated."
        );
      }
      committed.push(current);
      if (!selected) {
        state.extensionValues.set(
          current,
          String(current.value || optionText(current))
        );
      }
    }
    question.committedElements = committed;
    return true;
  }

  async function fillChoice(question, value, assertActive) {
    const first = question.elements[0];

    if (question.kind === "combobox") {
      return fillCombobox(question, value, assertActive);
    }

    if (isSelect(first)) {
      const reference = interactions.controlReference(first);
      const options = Array.from(first.options);
      const fieldKey = question.match?.definition.key;
      let ranked = rankOptions(options, value, fieldKey);
      if (!hasUniqueChoice(ranked)) {
        const fallbackRanked = rankFallbackOptions(options, value, fieldKey);
        if (hasUniqueChoice(fallbackRanked)) {
          ranked = fallbackRanked;
        }
      }
      if (!hasUniqueChoice(ranked)) {
        return fillFailure(
          question,
          "No unique option in this select matched the saved answer."
        );
      }
      const expectedValue = String(ranked[0].option.value);
      assertActive();
      first.focus?.();
      dispatchClickEvent(first);
      setNativeProperty(first, "value", expectedValue);
      dispatchValueEvents(first);
      await wait(50);
      assertActive();
      const current = committedElement(question, reference);
      const selected =
        isSelect(current) &&
        String(current.value) === expectedValue &&
        Boolean(current.options[current.selectedIndex]) &&
        !current.options[current.selectedIndex].disabled;
      if (selected) {
        state.extensionValues.set(current, String(current.value));
        return true;
      }
      return fillFailure(
        question,
        "The field matched, but the selected value did not remain committed after the form updated."
      );
    }

    if (inputType(first) === "radio" || elementRole(first) === "radio") {
      const ranked = rankOptions(
        question.elements,
        value,
        question.match?.definition.key
      );
      if (!hasUniqueChoice(ranked)) {
        return fillFailure(
          question,
          "No unique radio option matched the explicit saved answer."
        );
      }
      const selectedElement = ranked[0].option;
      const reference = interactions.controlReference(selectedElement);
      assertActive();
      dispatchPointerClick(selectedElement);
      await wait(25);
      assertActive();
      let current = interactions.resolveControl(reference);
      if (
        isInput(current) &&
        !current.checked
      ) {
        setNativeProperty(current, "checked", true);
        dispatchValueEvents(current);
        await wait(25);
        assertActive();
        current = interactions.resolveControl(reference);
      }
      const selected =
        Boolean(current?.checked) ||
        current?.getAttribute("aria-checked") === "true";
      if (selected) {
        state.extensionValues.set(
          current,
          String(current.value || optionText(current))
        );
        question.committedElements = [current];
        current.blur?.();
        return true;
      }
      return fillFailure(
        question,
        "The matched radio option did not remain selected after the form updated."
      );
    }

    if (
      inputType(first) === "checkbox" ||
      elementRole(first) === "checkbox"
    ) {
      if (
        matcher.canonicalChoice(value, question.match?.definition.key) !== "yes"
      ) {
        return fillFailure(
          question,
          "This checkbox requires an explicit saved affirmative answer."
        );
      }
      const reference = interactions.controlReference(first);
      assertActive();
      const selectedBefore =
        Boolean(first.checked) || first.getAttribute("aria-checked") === "true";
      if (!selectedBefore) {
        dispatchPointerClick(first);
      }
      await wait(25);
      assertActive();
      let current = interactions.resolveControl(reference);
      if (isInput(current) && !current.checked) {
        setNativeProperty(current, "checked", true);
        dispatchValueEvents(current);
        await wait(25);
        assertActive();
        current = interactions.resolveControl(reference);
      }
      const selected =
        Boolean(current?.checked) ||
        current?.getAttribute("aria-checked") === "true";
      if (selected) {
        state.extensionValues.set(
          current,
          String(current.value || optionText(current) || "yes")
        );
        question.committedElements = [current];
        return true;
      }
      return fillFailure(
        question,
        "The matched checkbox did not remain selected after the form updated."
      );
    }

    return fillFailure(question, "This choice control could not be committed.");
  }

  async function fillText(question, value, assertActive) {
    const element = question.elements[0];
    const reference = interactions.controlReference(element);
    if (
      isInput(element) &&
      inputType(element) === "number" &&
      !Number.isFinite(Number(value))
    ) {
      return fillFailure(question, "The saved value is not a valid number.");
    }

    if (isContentEditable(element)) {
      element.focus?.();
      element.textContent = value;
      dispatchValueEvents(element);
    } else {
      element.focus?.();
      setNativeProperty(element, "value", value);
      dispatchValueEvents(element);
    }
    await wait(50);
    assertActive();
    const current = committedElement(question, reference);
    const committedValue = isContentEditable(current)
      ? current.textContent
      : current?.value;
    if (current && text(committedValue) === text(value)) {
      state.extensionValues.set(current, String(committedValue));
      return true;
    }
    return fillFailure(
      question,
      "The field matched, but the value did not remain committed after the form updated."
    );
  }

  async function fillFile(question, savedFile, assertActive) {
    const element = question.elements[0];
    const reference = interactions.controlReference(element);
    if (
      !isInput(element) ||
      inputType(element) !== "file" ||
      !savedFile ||
      savedFile.mimeType !== "application/pdf" ||
      typeof savedFile.base64 !== "string"
    ) {
      return fillFailure(
        question,
        "Only the saved resume PDF can be attached to this field."
      );
    }

    let file;
    try {
      const binary = atob(savedFile.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const frameWindow = element.ownerDocument?.defaultView || root;
      file = new frameWindow.File([bytes], savedFile.fileName || "resume.pdf", {
        type: "application/pdf",
        lastModified: Date.now()
      });
      const transfer = new frameWindow.DataTransfer();
      transfer.items.add(file);
      element.focus?.();
      setNativeProperty(element, "files", transfer.files);
      dispatchValueEvents(element);
    } catch {
      return fillFailure(
        question,
        "The saved resume PDF could not be attached to this field."
      );
    }
    await wait(50);
    assertActive();
    const current = committedElement(question, reference);
    if (current?.files?.[0]?.name === file.name) {
      state.extensionValues.set(current, file.name);
      return true;
    }
    return fillFailure(
      question,
      "The resume field matched, but the PDF attachment did not remain committed."
    );
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
    state.profileLoaded = true;
    refreshProfileAvailability();
    state.adapter = ats.activeAdapter(location.href, document);
    state.platform = ats.detectPlatform(location.href, document);
    state.page = state.adapter?.pageInfo?.(document) || null;
    state.definitions =
      state.adapter?.augmentDefinitions?.(profileSchema.fields) ||
      profileSchema.fields;

    if (state.page?.scanOnly) {
      const status = state.shadow?.querySelector("[data-status]");
      if (status) {
        status.textContent = `Workday ${state.page.label.toLowerCase()} is review-only. Complete it manually.`;
      }
      scan();
      return { ok: true, filled: 0 };
    }
    await state.adapter?.prepareRepeatedSections?.({
      documentLike: document,
      profile: profileSchema.buildEffectiveProfile(state.profile, state.context),
      assertActive,
      wait
    });
    assertActive();
    let filled = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      const questions = collectQuestions();
      let passFilled = 0;
      let staleSkipped = false;

      for (const question of questions) {
        assertActive();
        if (!question.required || !shouldAttemptQuestion(question)) {
          continue;
        }
        if (!questionRemainsReady(question)) {
          staleSkipped = true;
          continue;
        }

        const succeeded =
          question.kind === "file"
            ? await fillFile(question, question.matchedValue, assertActive)
            : question.kind === "check-many"
              ? await fillCheckMany(
                  question,
                  question.matchedValue,
                  assertActive
                )
              : ["choice", "select", "combobox"].includes(question.kind)
                ? await fillChoice(
                    question,
                    question.matchedValue,
                    assertActive
                  )
                : await fillText(
                    question,
                    question.matchedValue,
                    assertActive
                  );
        assertActive();

        if (succeeded) {
          filled += 1;
          passFilled += 1;
          state.fillIssues.delete(question.key);
          highlight(question.committedElements || question.elements);
        } else {
          state.fillIssues.set(
            question.key,
            question.failureReason ||
              `The field matched ${question.match.definition.label.toLowerCase()}, but its value could not be committed.`
          );
        }
      }

      await wait(75);
      assertActive();
      if (passFilled === 0 && !staleSkipped) {
        break;
      }
    }

    const status = state.shadow?.querySelector("[data-status]");
    if (status) {
      status.textContent = filled
        ? `Filled ${filled} required field${filled === 1 ? "" : "s"}. Review every answer.`
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
          ? `Filled ${total} required field${total === 1 ? "" : "s"}. Review every answer.`
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
        button.textContent = "Autofill required fields";
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
            <p>Fill recognized required fields, then review every answer before submitting.</p>
            <button class="autofill-button" data-autofill type="button">Autofill required fields</button>
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

  function questionForEditTarget(target) {
    const selectedOption = target.closest?.("[role='option']");
    const listbox = selectedOption?.closest?.("[role='listbox']");
    return collectQuestions().find((question) => {
      if (
        question.elements.some(
          (element) =>
            element === target ||
            element.contains?.(target) ||
            ats.questionContainer(element, state.adapter, question.elements)
              ?.contains?.(target)
        )
      ) {
        return true;
      }
      return Boolean(
        listbox?.id &&
          question.elements.some((element) =>
            interactions.controlledListboxIds(element).includes(listbox.id)
          )
      );
    });
  }

  function clearFillIssueForTrustedEdit(event) {
    if (!event.isTrusted || !state.fillIssues.size || !event.target?.closest) {
      return false;
    }
    const question = questionForEditTarget(event.target);
    if (!question || !state.fillIssues.delete(question.key)) {
      return false;
    }
    state.progressSignature = "";
    return true;
  }

  function handleFieldChange(event) {
    clearFillIssueForTrustedEdit(event);
    scheduleScan();
  }

  function handleFieldClick(event) {
    if (
      !event.target?.closest?.(
        "[role='option'], input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox']"
      )
    ) {
      return;
    }
    if (clearFillIssueForTrustedEdit(event)) {
      scheduleScan();
    }
  }

  function unmountPanel() {
    clearTimeout(state.scanTimer);
    for (const [rootNode, registration] of state.observers) {
      registration.observer.disconnect();
      rootNode.removeEventListener?.("input", handleFieldChange, true);
      rootNode.removeEventListener?.("change", handleFieldChange, true);
      rootNode.removeEventListener?.("click", handleFieldClick, true);
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
    state.profileLoaded = false;
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
    state.profile = {};
    state.profileLoaded = false;
    state.profileAvailability = new Set();
    state.adapter = null;
    state.page = null;
    state.definitions = profileSchema.fields;
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
