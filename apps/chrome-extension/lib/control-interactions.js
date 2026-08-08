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

    const existing = new Set(initiallyVisible);
    const newlyVisible = visibleListboxes.filter(
      (listbox) => !existing.has(listbox)
    );
    return newlyVisible.length === 1 ? newlyVisible : [];
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

  function controlReference(element) {
    return {
      element,
      id: String(element?.id || ""),
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
    const currentRoot = control.getRootNode?.();
    return (
      !currentRoot || !reference?.rootNode || currentRoot === reference.rootNode
    );
  }

  function resolveControl(reference) {
    if (controlMatchesReference(reference?.element, reference)) {
      return reference.element;
    }
    if (!reference?.id || !reference.rootNode) {
      return null;
    }
    if (typeof reference.rootNode.getElementById === "function") {
      const byId = reference.rootNode.getElementById(reference.id);
      if (controlMatchesReference(byId, reference)) {
        return byId;
      }
    }
    return (
      Array.from(reference.rootNode.querySelectorAll?.("[id]") || []).find(
        (candidate) =>
          candidate.id === reference.id &&
          controlMatchesReference(candidate, reference)
      ) || null
    );
  }

  function controlOwnershipState(element) {
    const tagName = String(element?.tagName || "").toUpperCase();
    const evidence = comboboxCommitEvidence(element, {
      includeSelectedOptions: false
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

  function restoreOwnedControlValue(reference, ownedValue, originalValue) {
    if (ownedValue === null) {
      return null;
    }
    const control = resolveControl(reference);
    if (
      !control ||
      !("value" in control) ||
      String(control.value) !== String(ownedValue) ||
      String(control.value) === String(originalValue)
    ) {
      return null;
    }
    setNativeProperty(control, "value", originalValue);
    return control;
  }

  function connectedElementById(rootNode, id) {
    if (!rootNode || !id || !rootIsLive(rootNode)) {
      return null;
    }
    let candidate = null;
    if (typeof rootNode.getElementById === "function") {
      candidate = rootNode.getElementById(id);
    }
    if (!candidate) {
      candidate =
        Array.from(rootNode.querySelectorAll?.("[id]") || []).find(
          (element) => element.id === id
        ) || null;
    }
    if (!candidate?.isConnected) {
      return null;
    }
    const candidateRoot = candidate.getRootNode?.();
    return candidateRoot && candidateRoot !== rootNode ? null : candidate;
  }

  function resolveControlledListboxes(element) {
    const ownerDocument = element?.ownerDocument || null;
    const rootNode = element?.getRootNode?.() || ownerDocument;
    const listboxes = [];
    for (const id of controlledListboxIds(element)) {
      const local = connectedElementById(rootNode, id);
      if (local?.getAttribute?.("role") === "listbox") {
        listboxes.push(local);
        continue;
      }
      if (rootNode === ownerDocument) {
        continue;
      }
      const portal = connectedElementById(ownerDocument, id);
      if (portal?.getAttribute?.("role") === "listbox") {
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

    const control = element?.closest?.("[class*='__control']");
    const selectedValues = Array.from(
      control?.querySelectorAll?.("[class*='__single-value']") || []
    );
    for (const [index, candidate] of selectedValues.entries()) {
      add(
        `selected-value:${candidate.id || index}`,
        candidate.textContent
      );
    }

    if (includeSelectedOptions) {
      for (const listbox of resolveControlledListboxes(element)) {
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

    const scope =
      element?.closest?.(
        "[class*='select__container'], [class*='select-shell'], [class*='combobox'], [data-control], .application-question, .field, [role='group']"
      ) || element?.parentElement;
    const hiddenInputs = Array.from(
      scope?.querySelectorAll?.("input[type='hidden']") || []
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
