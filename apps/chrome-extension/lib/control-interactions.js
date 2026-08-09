(function registerControlInteractions(root) {
  function text(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function controlledListboxIds(element) {
    return Array.from(
      new Set(
        [
          element?.getAttribute?.("aria-controls"),
          element?.getAttribute?.("aria-owns")
        ]
          .filter(Boolean)
          .flatMap((value) => String(value).split(/\s+/))
          .filter(Boolean)
      )
    );
  }

  function scopedListboxes(element, visibleListboxes, initiallyVisible = []) {
    const controlledIds = new Set(controlledListboxIds(element));
    if (controlledIds.size) {
      return visibleListboxes.filter((listbox) => controlledIds.has(listbox.id));
    }

    const newlyVisible = visibleListboxes.filter(
      (listbox) => !wasInitiallyVisible(listbox, initiallyVisible)
    );
    return newlyVisible.length === 1 ? newlyVisible : [];
  }

  function listboxRoot(listbox) {
    return listbox?.getRootNode?.() || listbox?.ownerDocument || null;
  }

  function sameListboxIdentity(left, right) {
    if (left === right) {
      return true;
    }
    const leftRoot = listboxRoot(left);
    const rightRoot = listboxRoot(right);
    return Boolean(
      left?.id &&
        right?.id &&
        left.id === right.id &&
        leftRoot &&
        leftRoot === rightRoot
    );
  }

  function wasInitiallyVisible(listbox, initiallyVisible) {
    return Array.from(initiallyVisible || []).some((candidate) =>
      sameListboxIdentity(candidate, listbox)
    );
  }

  function nativePropertyDescriptor(element, property) {
    let prototype = Object.getPrototypeOf(element);
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (descriptor) {
        return descriptor;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    return null;
  }

  function setNativeProperty(element, property, value) {
    const descriptor = nativePropertyDescriptor(element, property);
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element[property] = value;
    }
  }

  function contextForControl(element) {
    return (
      element?.closest?.(
        ".application-question, .field, [role='group'], fieldset, label"
      ) ||
      element?.parentElement ||
      null
    );
  }

  function nodesWithId(rootNode, id) {
    if (!rootNode || !id) {
      return [];
    }
    const candidates = new Set();
    if (typeof rootNode.getElementById === "function") {
      const byId = rootNode.getElementById(id);
      if (byId) {
        candidates.add(byId);
      }
    }
    for (const candidate of rootNode.querySelectorAll?.("[id]") || []) {
      if (candidate.id === id) {
        candidates.add(candidate);
      }
    }
    return Array.from(candidates);
  }

  function textWithoutControls(element) {
    if (!element?.cloneNode) {
      return text(element?.textContent);
    }
    const copy = element.cloneNode(true);
    for (const control of copy.querySelectorAll?.(
      "input, textarea, select, button, [role='combobox'], [role='radio'], [role='checkbox'], [role='option']"
    ) || []) {
      control.remove?.();
    }
    return text(copy.textContent);
  }

  function referencedText(element, attribute) {
    const rootNode =
      element?.getRootNode?.() || element?.ownerDocument || null;
    return text(
      String(element?.getAttribute?.(attribute) || "")
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((id) => nodesWithId(rootNode, id))
        .map((candidate) => textWithoutControls(candidate))
        .join(" ")
    );
  }

  function semanticLabelText(element) {
    const explicitLabels = Array.from(
      new Set(
        [
          text(element?.getAttribute?.("aria-label")),
          referencedText(element, "aria-labelledby")
        ].filter(Boolean)
      )
    );
    if (explicitLabels.length) {
      return explicitLabels.join(" ");
    }
    const labels = new Set(element?.labels || []);
    const closestLabel = element?.closest?.("label");
    if (closestLabel) {
      labels.add(closestLabel);
    }
    return Array.from(
      new Set(Array.from(labels).map(textWithoutControls).filter(Boolean))
    ).join(" ");
  }

  function contextPromptText(element, context) {
    if (!context || context === element) {
      return "";
    }
    const prompt = Array.from(
      context.querySelectorAll?.(
        ":scope > label, :scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [class*='label'], :scope > [class*='question'], :scope > [data-automation-id*='label']"
      ) || []
    ).find(
      (candidate) =>
        candidate !== element &&
        !candidate.contains?.(element) &&
        textWithoutControls(candidate)
    );
    return text(
      [
        context.getAttribute?.("aria-label"),
        referencedText(context, "aria-labelledby"),
        textWithoutControls(prompt)
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  function elementFingerprint(element) {
    const form = element?.form || null;
    const context = contextForControl(element);
    const attributes = (candidate) => ({
      ariaLabel: text(candidate?.getAttribute?.("aria-label")),
      ariaLabelledBy: text(candidate?.getAttribute?.("aria-labelledby")),
      automationId: text(candidate?.getAttribute?.("data-automation-id")),
      fieldName: text(candidate?.getAttribute?.("data-field-name")),
      id: text(candidate?.id),
      name: text(candidate?.getAttribute?.("name") || candidate?.name),
      placeholder: text(candidate?.getAttribute?.("placeholder")),
      role: text(candidate?.getAttribute?.("role")),
      testId: text(candidate?.getAttribute?.("data-testid")),
      type: text(candidate?.getAttribute?.("type") || candidate?.type)
    });
    return JSON.stringify({
      context: context
        ? {
            ...attributes(context),
            prompt: contextPromptText(element, context)
          }
        : null,
      control: {
        ...attributes(element),
        id: ""
      },
      form: form
        ? {
            action: text(form.getAttribute?.("action")),
            id: text(form.id),
            name: text(form.getAttribute?.("name") || form.name)
          }
        : null,
      label: semanticLabelText(element),
      tagName: String(element?.tagName || "").toUpperCase()
    });
  }

  function controlRelationships(element) {
    return {
      ariaControls: text(element?.getAttribute?.("aria-controls")),
      ariaOwns: text(element?.getAttribute?.("aria-owns"))
    };
  }

  function relationshipsMatch(element, relationships) {
    const current = controlRelationships(element);
    return ["ariaControls", "ariaOwns"].every(
      (key) => !relationships?.[key] || current[key] === relationships[key]
    );
  }

  function controlReference(element) {
    return {
      contextNode: contextForControl(element),
      element,
      fingerprint: elementFingerprint(element),
      formNode: element?.form || null,
      id: String(element?.id || ""),
      relationships: controlRelationships(element),
      rootNode: element?.getRootNode?.() || element?.ownerDocument || null
    };
  }

  function rootIsLive(rootNode) {
    if (rootNode?.host) {
      return (
        Boolean(rootNode.host.isConnected) &&
        rootIsLive(rootNode.host.ownerDocument)
      );
    }
    if (rootNode?.nodeType === 9) {
      const ownerWindow = rootNode.defaultView;
      if (!ownerWindow) {
        return false;
      }
      try {
        const frameElement = ownerWindow.frameElement;
        return frameElement
          ? Boolean(
              frameElement.isConnected &&
                frameElement.contentDocument === rootNode
            )
          : ownerWindow.document === rootNode;
      } catch {
        return false;
      }
    }
    return true;
  }

  function controlMatchesReference(control, reference) {
    if (!control?.isConnected || !rootIsLive(reference?.rootNode)) {
      return false;
    }
    if (reference?.id && String(control.id || "") !== reference.id) {
      return false;
    }
    if (!relationshipsMatch(control, reference?.relationships)) {
      return false;
    }
    const currentRoot = control.getRootNode?.();
    if (currentRoot && reference?.rootNode && currentRoot !== reference.rootNode) {
      return false;
    }
    if (
      reference?.contextNode?.isConnected &&
      contextForControl(control) !== reference.contextNode
    ) {
      return false;
    }
    if (
      reference?.formNode?.isConnected &&
      control.form !== reference.formNode
    ) {
      return false;
    }
    return elementFingerprint(control) === reference?.fingerprint;
  }

  function resolveControl(reference) {
    const candidates = new Set();
    if (reference?.element) {
      candidates.add(reference.element);
    }
    if (reference?.id && reference.rootNode) {
      if (typeof reference.rootNode.getElementById === "function") {
        const byId = reference.rootNode.getElementById(reference.id);
        if (byId) {
          candidates.add(byId);
        }
      }
      for (const candidate of reference.rootNode.querySelectorAll?.("[id]") ||
        []) {
        if (candidate.id === reference.id) {
          candidates.add(candidate);
        }
      }
    }
    const matches = Array.from(candidates).filter((candidate) =>
      controlMatchesReference(candidate, reference)
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function componentCommitState(element, options = {}) {
    return JSON.stringify(
      comboboxCommitEvidence(element, {
        initiallyVisible: options.initiallyVisible,
        includeSelectedOptions: true,
        includeUnassociatedHidden: true,
        visibleListboxes: options.visibleListboxes
      }).map((item) => `${item.source}\u0000${item.value}`)
    );
  }

  function controlOwnershipState(element) {
    const tagName = String(element?.tagName || "").toUpperCase();
    const evidence = comboboxCommitEvidence(element, {
      includeSelectedOptions: false,
      includeUnassociatedHidden: true
    }).map((item) => `${item.source}\u0000${item.value}`);
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
      return JSON.stringify({
        evidence,
        value: String(element?.value || "")
      });
    }
    return JSON.stringify({
      ariaValueText: text(element?.getAttribute?.("aria-valuetext")),
      dataValue: text(element?.getAttribute?.("data-value")),
      evidence,
      text: text(element?.textContent),
      value: "value" in (element || {}) ? String(element.value || "") : ""
    });
  }

  function resolveOwnedControl(reference, expectedState = null) {
    const control = resolveControl(reference);
    if (!control) {
      return null;
    }
    if (
      expectedState !== null &&
      controlOwnershipState(control) !== expectedState
    ) {
      return null;
    }
    return control;
  }

  function restoreOwnedControlValue(
    reference,
    ownedValue,
    originalValue,
    ownedCommitState,
    options = {}
  ) {
    if (ownedValue === null) {
      return null;
    }
    const control = resolveControl(reference);
    if (
      !control ||
      !("value" in control) ||
      String(control.value) !== String(ownedValue) ||
      componentCommitState(control, options) !== ownedCommitState ||
      String(control.value) === String(originalValue)
    ) {
      return null;
    }
    setNativeProperty(control, "value", originalValue);
    return control;
  }

  function connectedElementsById(rootNode, id) {
    if (!rootNode || !id || !rootIsLive(rootNode)) {
      return [];
    }
    return nodesWithId(rootNode, id).filter((candidate) => {
      if (!candidate?.isConnected) {
        return false;
      }
      const candidateRoot = candidate.getRootNode?.();
      return !candidateRoot || candidateRoot === rootNode;
    });
  }

  function connectedElementById(rootNode, id) {
    const candidates = connectedElementsById(rootNode, id);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function documentPortalBelongsToControl(element, listbox) {
    const activeDescendant = text(
      element?.getAttribute?.("aria-activedescendant")
    );
    if (
      activeDescendant &&
      Array.from(listbox?.querySelectorAll?.("[id]") || []).some(
        (candidate) => candidate.id === activeDescendant
      )
    ) {
      return true;
    }
    const controlId = text(element?.id);
    if (!controlId) {
      return false;
    }
    const ownerIds = [
      listbox?.getAttribute?.("data-owner"),
      listbox?.getAttribute?.("data-control"),
      listbox?.getAttribute?.("data-for"),
      listbox?.getAttribute?.("aria-labelledby")
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/\s+/));
    return ownerIds.includes(controlId);
  }

  function resolveControlledListboxes(element, options = {}) {
    const ownerDocument = element?.ownerDocument || null;
    const rootNode = element?.getRootNode?.() || ownerDocument;
    const initiallyVisible = options.initiallyVisible || null;
    const listboxes = [];
    for (const id of controlledListboxIds(element)) {
      const localCandidates = connectedElementsById(rootNode, id);
      if (
        localCandidates.length === 1 &&
        localCandidates[0].getAttribute?.("role") === "listbox"
      ) {
        listboxes.push(localCandidates[0]);
        continue;
      }
      if (localCandidates.length) {
        continue;
      }
      if (rootNode === ownerDocument) {
        continue;
      }
      const portal = connectedElementById(ownerDocument, id);
      if (
        portal?.getAttribute?.("role") === "listbox" &&
        (documentPortalBelongsToControl(element, portal) ||
          (initiallyVisible &&
            !wasInitiallyVisible(portal, initiallyVisible)))
      ) {
        listboxes.push(portal);
      }
    }
    return Array.from(new Set(listboxes));
  }

  function semanticTokens(...values) {
    const ignored = new Set([
      "combobox",
      "control",
      "field",
      "hidden",
      "input",
      "label",
      "option",
      "select",
      "trigger",
      "value"
    ]);
    return new Set(
      values
        .flatMap((value) =>
          text(value)
            .toLowerCase()
            .split(/[^a-z0-9]+/)
        )
        .filter((value) => value.length > 2 && !ignored.has(value))
    );
  }

  function hiddenInputBelongsToCombobox(element, input) {
    const inputId = text(input?.id);
    const referencedIds = [
      element?.getAttribute?.("aria-controls"),
      element?.getAttribute?.("aria-describedby"),
      element?.getAttribute?.("aria-owns")
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/\s+/));
    if (inputId && referencedIds.includes(inputId)) {
      return true;
    }

    const controlTokens = semanticTokens(
      element?.id,
      element?.getAttribute?.("name"),
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("aria-labelledby"),
      element?.getAttribute?.("data-automation-id"),
      element?.getAttribute?.("data-field-name"),
      element?.getAttribute?.("data-testid")
    );
    const inputTokens = semanticTokens(
      input?.id,
      input?.name,
      input?.getAttribute?.("data-automation-id"),
      input?.getAttribute?.("data-field-name"),
      input?.getAttribute?.("data-testid")
    );
    return Array.from(inputTokens).some((token) => controlTokens.has(token));
  }

  function comboboxCommitEvidence(element, options = {}) {
    const includeUnassociatedHidden = Boolean(
      options.includeUnassociatedHidden
    );
    const includeSelectedOptions = options.includeSelectedOptions !== false;
    const evidence = [];
    const seen = new Set();
    const add = (source, value) => {
      const normalized = text(value);
      const fingerprint = `${source}\u0000${normalized}`;
      if (!normalized || seen.has(fingerprint)) {
        return;
      }
      seen.add(fingerprint);
      evidence.push({ source, value: normalized });
    };

    add("data-value", element?.getAttribute?.("data-value"));
    add("aria-valuetext", element?.getAttribute?.("aria-valuetext"));

    const scopeSelector =
      "[class*='select__container'], [class*='select-shell'], [class*='combobox'], [data-control], .application-question, .field, [role='group']";
    const closestScope = element?.closest?.(scopeSelector);
    const enclosingScope =
      closestScope && closestScope !== element
        ? closestScope
        : element?.parentElement?.closest?.(scopeSelector) ||
          element?.parentElement ||
          null;
    const evidenceScopes = Array.from(
      new Set([element, enclosingScope].filter(Boolean))
    );
    const reactControl = element?.closest?.("[class*='__control']");
    const selectedValues = Array.from(
      new Set(
        [reactControl, ...evidenceScopes]
          .filter(Boolean)
          .flatMap((scope) =>
            Array.from(
              scope.querySelectorAll?.(
                "[class*='__single-value'], .single-value, [data-selected-value]"
              ) || []
            )
          )
      )
    );
    for (const [index, candidate] of selectedValues.entries()) {
      add(
        `selected-value:${candidate.id || index}`,
        candidate.getAttribute?.("data-selected-value") ||
          candidate.getAttribute?.("data-value") ||
          candidate.textContent
      );
    }

    if (includeSelectedOptions) {
      const controlledIds = controlledListboxIds(element);
      const listboxes = controlledIds.length
        ? resolveControlledListboxes(element, {
            initiallyVisible: options.initiallyVisible
          })
        : scopedListboxes(
            element,
            options.visibleListboxes || [],
            options.initiallyVisible || []
          );
      for (const listbox of listboxes) {
        const id = listbox.id;
        const selectedOptions = Array.from(
          listbox?.querySelectorAll?.(
            "[role='option'][aria-selected='true'], option:checked"
          ) || []
        );
        for (const [index, option] of selectedOptions.entries()) {
          add(
            `selected-option:${id}:${option.id || index}`,
            option.getAttribute?.("data-value") ||
              option.value ||
              option.getAttribute?.("aria-label") ||
              option.textContent
          );
        }
      }
    }

    const hiddenInputs = Array.from(
      new Set(
        evidenceScopes.flatMap((scope) =>
          Array.from(scope.querySelectorAll?.("input[type='hidden']") || [])
        )
      )
    );
    for (const [index, input] of hiddenInputs.entries()) {
      if (
        !includeUnassociatedHidden &&
        !hiddenInputBelongsToCombobox(element, input)
      ) {
        continue;
      }
      add(
        `hidden-value:${input.id || input.name || index}`,
        input.value || input.getAttribute?.("value")
      );
    }

    const tagName = String(element?.tagName || "").toUpperCase();
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
      add("trigger-text", element?.textContent);
    }

    return evidence;
  }

  function committedControlValue(element) {
    const evidence = comboboxCommitEvidence(element);
    return (
      text(element?.value) ||
      evidence[0]?.value ||
      text(element?.textContent)
    );
  }

  const api = Object.freeze({
    comboboxCommitEvidence,
    committedControlValue,
    componentCommitState,
    controlOwnershipState,
    controlledListboxIds,
    controlReference,
    resolveControl,
    resolveControlledListboxes,
    resolveOwnedControl,
    restoreOwnedControlValue,
    scopedListboxes,
    setNativeProperty
  });

  root.JobAutofillControlInteractions = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
