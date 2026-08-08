(function registerControlInteractions(root) {
  function text(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function controlledListboxIds(element) {
    return [
      element?.getAttribute?.("aria-controls"),
      element?.getAttribute?.("aria-owns")
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/\s+/))
      .filter(Boolean);
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

  function resolveControl(reference) {
    if (reference?.element?.isConnected) {
      return reference.element;
    }
    if (!reference?.id || !reference.rootNode) {
      return null;
    }
    if (typeof reference.rootNode.getElementById === "function") {
      const byId = reference.rootNode.getElementById(reference.id);
      if (byId) {
        return byId;
      }
    }
    return (
      Array.from(reference.rootNode.querySelectorAll?.("[id]") || []).find(
        (candidate) => candidate.id === reference.id
      ) || null
    );
  }

  function selectedSiblingValue(element) {
    if (element?.getAttribute?.("role") !== "combobox") {
      return "";
    }
    const control = element.closest?.("[class*='__control']");
    const selectedValues = Array.from(
      control?.querySelectorAll?.("[class*='__single-value']") || []
    )
      .map((candidate) => text(candidate.textContent))
      .filter(Boolean);
    return selectedValues.length === 1 ? selectedValues[0] : "";
  }

  function committedControlValue(element) {
    return (
      text(element?.value) ||
      text(element?.getAttribute?.("data-value")) ||
      text(element?.getAttribute?.("aria-valuetext")) ||
      selectedSiblingValue(element) ||
      text(element?.textContent)
    );
  }

  const api = Object.freeze({
    committedControlValue,
    controlledListboxIds,
    controlReference,
    resolveControl,
    scopedListboxes,
    setNativeProperty
  });

  root.JobAutofillControlInteractions = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
