import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface ListboxLike {
  id: string;
}

interface ControlInteractions {
  comboboxCommitEvidence(
    element: unknown,
    options?: {
      initiallyVisible?: unknown[];
      includeSelectedOptions?: boolean;
      includeUnassociatedHidden?: boolean;
      visibleListboxes?: unknown[];
    },
  ): { source: string; value: string }[];
  committedControlValue(element: unknown): string;
  componentCommitState(
    element: unknown,
    options?: { initiallyVisible?: unknown[]; visibleListboxes?: unknown[] },
  ): string;
  controlOwnershipState(element: unknown): string;
  controlledListboxIds(element: unknown): string[];
  controlReference(element: unknown): unknown;
  resolveControl(reference: unknown): unknown;
  resolveControlledListboxes(
    element: unknown,
    options?: { initiallyVisible?: unknown[]; visibleListboxes?: unknown[] },
  ): unknown[];
  resolveOwnedControl(reference: unknown, expectedValue?: string | null): unknown;
  restoreOwnedControlValue(
    reference: unknown,
    ownedValue: string | null,
    originalValue: string,
    ownedCommitState: string,
    options?: { initiallyVisible?: unknown[] },
  ): unknown;
  scopedListboxes(
    element: unknown,
    visibleListboxes: ListboxLike[],
    initiallyVisible?: ListboxLike[],
  ): ListboxLike[];
  setNativeProperty(
    element: unknown,
    property: string,
    value: unknown,
  ): void;
}

const require = createRequire(import.meta.url);
const interactions = require(
  "../apps/chrome-extension/lib/control-interactions.js",
) as ControlInteractions;

function attributes(values: Record<string, string>) {
  return {
    getAttribute(name: string) {
      return values[name] ?? null;
    },
  };
}

describe("Chrome extension control interactions", () => {
  it("limits declared portal controls to their owned listboxes", () => {
    const owned = { id: "school-options" };
    const unrelated = { id: "global-search-options" };
    const control = attributes({
      "aria-controls": "school-options",
      "aria-owns": "school-help school-options",
    });

    expect(interactions.controlledListboxIds(control)).toEqual([
      "school-options",
      "school-help",
    ]);
    expect(
      interactions.scopedListboxes(control, [unrelated, owned], [unrelated]),
    ).toEqual([owned]);
    expect(
      interactions.scopedListboxes(control, [unrelated], [unrelated]),
    ).toEqual([]);
  });

  it("uses an unowned portal only when exactly one new listbox appeared", () => {
    const existing = { id: "global-options" };
    const portal = { id: "new-options" };
    const secondPortal = { id: "other-new-options" };
    const control = attributes({});

    expect(
      interactions.scopedListboxes(control, [existing, portal], [existing]),
    ).toEqual([portal]);
    expect(
      interactions.scopedListboxes(
        control,
        [existing, portal, secondPortal],
        [existing],
      ),
    ).toEqual([]);
  });

  it("uses the native prototype setter instead of an instance shadow", () => {
    let committed = "";
    const prototype = {};
    Object.defineProperty(prototype, "value", {
      set(value: string) {
        committed = value;
      },
    });
    const control = Object.create(prototype) as Record<string, unknown>;
    Object.defineProperty(control, "value", {
      configurable: true,
      value: "stale",
      writable: true,
    });

    interactions.setNativeProperty(control, "value", "selected");

    expect(committed).toBe("selected");
    expect(control.value).toBe("stale");
  });

  it("re-resolves a same-id controlled node after a reactive replacement", () => {
    const replacement = { id: "degree", isConnected: true };
    const original = {
      id: "degree",
      isConnected: false,
      getRootNode() {
        return {
          getElementById(id: string) {
            return id === "degree" ? replacement : null;
          },
        };
      },
    };

    const reference = interactions.controlReference(original);

    expect(interactions.resolveControl(reference)).toBe(replacement);
  });

  it("rejects same-id candidates in a detached shadow root", () => {
    const detached = { id: "degree", isConnected: false };
    const original = {
      id: "degree",
      isConnected: false,
      getRootNode() {
        return {
          getElementById() {
            return detached;
          },
          querySelectorAll() {
            return [detached];
          },
        };
      },
    };

    expect(
      interactions.resolveControl(interactions.controlReference(original)),
    ).toBeNull();
  });

  it("skips a detached subtree candidate and finds the live replacement", () => {
    const detached = { id: "degree", isConnected: false };
    const replacement = { id: "degree", isConnected: true };
    const original = {
      id: "degree",
      isConnected: false,
      getRootNode() {
        return {
          getElementById() {
            return detached;
          },
          querySelectorAll() {
            return [detached, replacement];
          },
        };
      },
    };

    expect(
      interactions.resolveControl(interactions.controlReference(original)),
    ).toBe(replacement);
  });

  it("restores only the extension-owned query on a live replacement", () => {
    const replacement = { id: "source", isConnected: true, value: "LinkedIn" };
    const root = {
      getElementById() {
        return replacement;
      },
    };
    const original = {
      id: "source",
      isConnected: false,
      value: "",
      getRootNode() {
        return root;
      },
    };
    const reference = interactions.controlReference(original);
    const ownedCommitState = interactions.componentCommitState(replacement);

    expect(
      interactions.restoreOwnedControlValue(
        reference,
        "LinkedIn",
        "",
        ownedCommitState,
      ),
    ).toBe(replacement);
    expect(replacement.value).toBe("");

    replacement.value = "User choice";
    expect(
      interactions.restoreOwnedControlValue(
        reference,
        "LinkedIn",
        "",
        ownedCommitState,
      ),
    ).toBeNull();
    expect(replacement.value).toBe("User choice");
  });

  it("does not restore a query after component commit evidence changes", () => {
    const values: Record<string, string> = {
      "data-value": "",
      role: "combobox",
    };
    const control = {
      id: "source",
      isConnected: true,
      tagName: "INPUT",
      value: "LinkedIn",
      getAttribute(name: string) {
        return values[name] ?? null;
      },
      closest() {
        return null;
      },
    };
    const reference = interactions.controlReference(control);
    const ownedCommitState = interactions.componentCommitState(control);

    values["data-value"] = "employee-referral";

    expect(
      interactions.restoreOwnedControlValue(
        reference,
        "LinkedIn",
        "",
        ownedCommitState,
      ),
    ).toBeNull();
    expect(control.value).toBe("LinkedIn");
  });

  it("finds changed hidden commit evidence beside a combobox input", () => {
    const hidden = {
      id: "source-value",
      name: "source",
      value: "",
      getAttribute(name: string) {
        return name === "value" ? this.value : null;
      },
    };
    const wrapper = {
      closest() {
        return this;
      },
      querySelectorAll(selector: string) {
        return selector === "input[type='hidden']" ? [hidden] : [];
      },
    };
    const control = {
      id: "source",
      isConnected: true,
      tagName: "INPUT",
      value: "LinkedIn",
      parentElement: wrapper,
      getAttribute(name: string) {
        const values: Record<string, string> = {
          class: "combobox-input",
          role: "combobox",
        };
        return values[name] ?? null;
      },
      closest(selector: string) {
        return selector.includes("[class*='combobox']") ? this : null;
      },
      querySelectorAll() {
        return [];
      },
    };
    const reference = interactions.controlReference(control);
    const ownedCommitState = interactions.componentCommitState(control);

    hidden.value = "employee-referral";

    expect(
      interactions.restoreOwnedControlValue(
        reference,
        "LinkedIn",
        "",
        ownedCommitState,
      ),
    ).toBeNull();
    expect(control.value).toBe("LinkedIn");
  });

  it("does not restore after a newly visible document portal selects an option", () => {
    let selected = false;
    const option = {
      id: "source-option",
      textContent: "Employee referral",
      value: "",
      getAttribute(name: string) {
        const values: Record<string, string> = {
          "aria-selected": selected ? "true" : "false",
          "data-value": "employee-referral",
        };
        return values[name] ?? null;
      },
    };
    const ownerDocument = {
      getElementById() {
        return listbox;
      },
      querySelectorAll() {
        return [listbox];
      },
    };
    const shadowRoot = {
      host: { isConnected: true },
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    const listbox = {
      id: "source-listbox",
      isConnected: true,
      getRootNode() {
        return ownerDocument;
      },
      getAttribute(name: string) {
        return name === "role" ? "listbox" : null;
      },
      querySelectorAll(selector: string) {
        if (selector === "[id]") return [option];
        return selected ? [option] : [];
      },
    };
    const control = {
      id: "",
      isConnected: true,
      ownerDocument,
      tagName: "INPUT",
      value: "LinkedIn",
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        const values: Record<string, string> = {
          "aria-controls": "source-listbox",
          role: "combobox",
        };
        return values[name] ?? null;
      },
      closest() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    const reference = interactions.controlReference(control);
    const options = { initiallyVisible: [] };
    const ownedCommitState = interactions.componentCommitState(
      control,
      options,
    );

    selected = true;

    expect(
      interactions.restoreOwnedControlValue(
        reference,
        "LinkedIn",
        "",
        ownedCommitState,
        options,
      ),
    ).toBeNull();
    expect(control.value).toBe("LinkedIn");
  });

  it("does not restore after an unowned interaction portal selects an option", () => {
    let selected = false;
    const option = {
      id: "source-option",
      textContent: "Employee referral",
      value: "",
      getAttribute(name: string) {
        const values: Record<string, string> = {
          "aria-selected": selected ? "true" : "false",
          "data-value": "employee-referral",
        };
        return values[name] ?? null;
      },
    };
    const ownerDocument = {};
    const existing = {
      id: "existing-listbox",
      ownerDocument,
      getRootNode() {
        return ownerDocument;
      },
    };
    const portal = {
      id: "",
      ownerDocument,
      querySelectorAll() {
        return selected ? [option] : [];
      },
      getRootNode() {
        return ownerDocument;
      },
    };
    const control = {
      id: "source",
      isConnected: true,
      ownerDocument,
      tagName: "INPUT",
      value: "LinkedIn",
      getRootNode() {
        return ownerDocument;
      },
      getAttribute(name: string) {
        return name === "role" ? "combobox" : null;
      },
      closest() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    const reference = interactions.controlReference(control);
    const options = {
      initiallyVisible: [existing],
      visibleListboxes: [existing, portal],
    };
    const ownedCommitState = interactions.componentCommitState(
      control,
      options,
    );

    selected = true;

    expect(
      interactions.restoreOwnedControlValue(
        reference,
        "LinkedIn",
        "",
        ownedCommitState,
        options,
      ),
    ).toBeNull();
    expect(control.value).toBe("LinkedIn");
  });

  it("rejects a replacement that no longer contains the owned query", () => {
    const replacement = {
      id: "source",
      isConnected: true,
      tagName: "INPUT",
      value: "User choice",
    };
    const original = {
      id: "source",
      isConnected: false,
      tagName: "INPUT",
      value: "LinkedIn",
      getRootNode() {
        return {
          getElementById() {
            return replacement;
          },
        };
      },
    };

    expect(
      interactions.resolveOwnedControl(
        interactions.controlReference(original),
        interactions.controlOwnershipState(original),
      ),
    ).toBeNull();
    expect(
      interactions.resolveOwnedControl(
        interactions.controlReference(original),
        interactions.controlOwnershipState({
          tagName: "INPUT",
          value: "",
        }),
      ),
    ).toBeNull();
  });

  it("rejects a connected original moved outside its captured root or ID", () => {
    const firstRoot = {};
    const secondRoot = {};
    let currentRoot = firstRoot;
    const control = {
      id: "source",
      isConnected: true,
      getRootNode() {
        return currentRoot;
      },
    };
    const reference = interactions.controlReference(control);

    currentRoot = secondRoot;
    control.id = "other";

    expect(interactions.resolveControl(reference)).toBeNull();
  });

  it("keeps resolving the original live control after mutable state changes", () => {
    const values: Record<string, string> = {
      "aria-describedby": "source-help",
      class: "combobox-input",
      role: "combobox",
    };
    const root = {};
    const control = {
      id: "source",
      isConnected: true,
      getRootNode() {
        return root;
      },
      getAttribute(name: string) {
        return values[name] ?? null;
      },
    };
    const reference = interactions.controlReference(control);

    values.class = "combobox-input is-focused is-dirty";
    values["aria-describedby"] = "source-help source-error";

    expect(interactions.resolveControl(reference)).toBe(control);
  });

  it("rejects a live control repurposed for a different question", () => {
    const values: Record<string, string> = {
      "aria-label": "How did you hear about us?",
      name: "source",
      role: "combobox",
    };
    const root = {};
    const control = {
      id: "application-field",
      isConnected: true,
      getRootNode() {
        return root;
      },
      getAttribute(name: string) {
        return values[name] ?? null;
      },
    };
    const reference = interactions.controlReference(control);

    values["aria-label"] = "Country";
    values.name = "country";

    expect(interactions.resolveControl(reference)).toBeNull();
  });

  it("rejects a same-ID replacement whose resolved question changed", () => {
    const label = {
      id: "source-label",
      textContent: "School",
    };
    const attributes = {
      "aria-labelledby": "source-label",
      name: "source",
      role: "combobox",
    };
    const replacement = {
      id: "source",
      isConnected: true,
      tagName: "INPUT",
      getAttribute(name: string) {
        return attributes[name as keyof typeof attributes] ?? null;
      },
      closest() {
        return null;
      },
    };
    const root = {
      getElementById(id: string) {
        return id === "source" ? replacement : id === "source-label" ? label : null;
      },
      querySelectorAll() {
        return [replacement, label];
      },
    };
    const original = {
      ...replacement,
      isConnected: false,
      getRootNode() {
        return root;
      },
    };
    const reference = interactions.controlReference(original);

    label.textContent = "Country";

    expect(interactions.resolveControl(reference)).toBeNull();
  });

  it("skips an unrelated same-ID node and resolves one semantic replacement", () => {
    const compatible = {
      id: "source",
      isConnected: true,
      tagName: "INPUT",
      type: "text",
      value: "",
      getAttribute(name: string) {
        const values: Record<string, string> = {
          name: "source",
          role: "combobox",
          type: "text",
        };
        return values[name] ?? null;
      },
    };
    const unrelated = {
      ...compatible,
      getAttribute(name: string) {
        const values: Record<string, string> = {
          name: "unrelated",
          role: "combobox",
          type: "text",
        };
        return values[name] ?? null;
      },
    };
    const root = {
      getElementById() {
        return unrelated;
      },
      querySelectorAll() {
        return [unrelated, compatible];
      },
    };
    const original = {
      ...compatible,
      isConnected: false,
      getRootNode() {
        return root;
      },
    };

    expect(
      interactions.resolveControl(interactions.controlReference(original)),
    ).toBe(compatible);
  });

  it("fails closed when two same-ID replacements are semantically compatible", () => {
    const first = {
      id: "source",
      isConnected: true,
      tagName: "INPUT",
      type: "text",
      value: "LinkedIn",
      getAttribute(name: string) {
        const values: Record<string, string> = {
          name: "source",
          role: "combobox",
          type: "text",
        };
        return values[name] ?? null;
      },
      closest() {
        return null;
      },
    };
    const second = { ...first };
    const root = {
      getElementById() {
        return first;
      },
      querySelectorAll() {
        return [first, second];
      },
    };
    const original = {
      ...first,
      isConnected: false,
      getRootNode() {
        return root;
      },
    };
    const reference = interactions.controlReference(original);

    expect(interactions.resolveControl(reference)).toBeNull();
    expect(
      interactions.restoreOwnedControlValue(
        reference,
        "LinkedIn",
        "",
        interactions.componentCommitState(first),
      ),
    ).toBeNull();
    expect(first.value).toBe("LinkedIn");
    expect(second.value).toBe("LinkedIn");
  });

  it("rejects controls from a detached iframe document", () => {
    const frameElement = {
      contentDocument: null as unknown,
      isConnected: false,
    };
    const ownerWindow = {
      document: null as unknown,
      frameElement,
    };
    const ownerDocument = {
      defaultView: ownerWindow,
      nodeType: 9,
    };
    ownerWindow.document = ownerDocument;
    frameElement.contentDocument = ownerDocument;
    const control = {
      id: "source",
      isConnected: true,
      getRootNode() {
        return ownerDocument;
      },
    };

    expect(
      interactions.resolveControl(interactions.controlReference(control)),
    ).toBeNull();
  });

  it("rejects a button combobox whose selection state changed while waiting", () => {
    const root = {};
    const values: Record<string, string> = {
      "aria-valuetext": "",
      "data-value": "",
    };
    const control = {
      id: "source",
      isConnected: true,
      tagName: "BUTTON",
      textContent: "Choose a source",
      value: "",
      getRootNode() {
        return root;
      },
      getAttribute(name: string) {
        return values[name] ?? null;
      },
      closest() {
        return null;
      },
    };
    const reference = interactions.controlReference(control);
    const baseline = interactions.controlOwnershipState(control);

    control.value = "user-choice";
    expect(interactions.resolveOwnedControl(reference, baseline)).toBeNull();

    control.value = "";
    values["aria-valuetext"] = "User choice";
    values["data-value"] = "user-choice";
    control.textContent = "User choice";

    expect(interactions.resolveOwnedControl(reference, baseline)).toBeNull();
  });

  it("resolves duplicate owned listbox IDs from the control shadow root first", () => {
    const shadowRoot = {
      host: { isConnected: true },
      getElementById(id: string) {
        return id === "shared-listbox" ? shadowListbox : null;
      },
    };
    const ownerDocument = {
      getElementById(id: string) {
        return id === "shared-listbox" ? documentListbox : null;
      },
    };
    const shadowOption = {
      id: "shadow-option",
      textContent: "Shadow LinkedIn",
      value: "",
      getAttribute(name: string) {
        const values: Record<string, string> = {
          "aria-selected": "true",
          "data-value": "shadow-linkedin",
        };
        return values[name] ?? null;
      },
    };
    const documentOption = {
      id: "document-option",
      textContent: "Document LinkedIn",
      value: "",
      getAttribute(name: string) {
        const values: Record<string, string> = {
          "aria-selected": "true",
          "data-value": "document-linkedin",
        };
        return values[name] ?? null;
      },
    };
    const shadowListbox = {
      id: "shared-listbox",
      isConnected: true,
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        return name === "role" ? "listbox" : null;
      },
      querySelectorAll() {
        return [shadowOption];
      },
    };
    const documentListbox = {
      id: "shared-listbox",
      isConnected: true,
      getRootNode() {
        return ownerDocument;
      },
      getAttribute(name: string) {
        const values: Record<string, string> = {
          role: "listbox",
          "data-owner": "source-trigger",
        };
        return values[name] ?? null;
      },
      querySelectorAll() {
        return [documentOption];
      },
    };
    const control = {
      id: "source-trigger",
      ownerDocument,
      tagName: "INPUT",
      textContent: "",
      value: "",
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        const values: Record<string, string> = {
          role: "combobox",
          "aria-controls": "shared-listbox",
        };
        return values[name] ?? null;
      },
      closest() {
        return null;
      },
    };

    expect(interactions.resolveControlledListboxes(control)).toEqual([
      shadowListbox,
    ]);
    expect(interactions.comboboxCommitEvidence(control)).toEqual([
      {
        source: "selected-option:shared-listbox:shadow-option",
        value: "shadow-linkedin",
      },
    ]);
  });

  it("accepts an ID-less shadow control's forward-controlled document portal", () => {
    const shadowRoot = {
      host: { isConnected: true },
      getElementById() {
        return null;
      },
    };
    const ownerDocument = {
      getElementById() {
        return listbox;
      },
    };
    const option = { id: "active-option" };
    const listbox = {
      id: "portal-listbox",
      isConnected: true,
      getRootNode() {
        return ownerDocument;
      },
      getAttribute(name: string) {
        return name === "role" ? "listbox" : null;
      },
      querySelectorAll(selector: string) {
        expect(selector).toBe("[id]");
        return [option];
      },
    };
    const control = {
      id: "",
      ownerDocument,
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        const values: Record<string, string> = {
          "aria-controls": "portal-listbox",
        };
        return values[name] ?? null;
      },
    };

    expect(
      interactions.resolveControlledListboxes(control, {
        initiallyVisible: [],
      }),
    ).toEqual([listbox]);
  });

  it("waits for a shadow-local listbox instead of using a preexisting document duplicate", () => {
    let localListbox: unknown = null;
    const shadowRoot = {
      host: { isConnected: true },
      getElementById() {
        return localListbox;
      },
    };
    const documentListbox = {
      id: "shared-listbox",
      isConnected: true,
      getRootNode() {
        return ownerDocument;
      },
      getAttribute(name: string) {
        return name === "role" ? "listbox" : null;
      },
    };
    const ownerDocument = {
      getElementById() {
        return documentListbox;
      },
    };
    const control = {
      id: "source",
      ownerDocument,
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        return name === "aria-controls" ? "shared-listbox" : null;
      },
    };

    expect(
      interactions.resolveControlledListboxes(control, {
        initiallyVisible: [documentListbox],
      }),
    ).toEqual([]);

    localListbox = {
      ...documentListbox,
      getRootNode() {
        return shadowRoot;
      },
    };
    expect(
      interactions.resolveControlledListboxes(control, {
        initiallyVisible: [documentListbox],
      }),
    ).toEqual([localListbox]);
  });

  it("does not treat a rerendered preexisting document duplicate as a new portal", () => {
    const shadowRoot = {
      host: { isConnected: true },
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    const ownerDocument = {
      getElementById() {
        return replacement;
      },
      querySelectorAll() {
        return [replacement];
      },
    };
    const original = {
      id: "shared-listbox",
      isConnected: false,
      getRootNode() {
        return ownerDocument;
      },
    };
    const replacement = {
      id: "shared-listbox",
      isConnected: true,
      getRootNode() {
        return ownerDocument;
      },
      getAttribute(name: string) {
        return name === "role" ? "listbox" : null;
      },
    };
    const control = {
      id: "source",
      ownerDocument,
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        return name === "aria-controls" ? "shared-listbox" : null;
      },
    };

    expect(
      interactions.resolveControlledListboxes(control, {
        initiallyVisible: [original],
      }),
    ).toEqual([]);
  });

  it("does not fall back to a document portal when local IDs are ambiguous", () => {
    const firstLocal = {
      id: "shared-listbox",
      isConnected: true,
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        return name === "role" ? "listbox" : null;
      },
    };
    const secondLocal = { ...firstLocal };
    const shadowRoot = {
      host: { isConnected: true },
      getElementById() {
        return firstLocal;
      },
      querySelectorAll() {
        return [firstLocal, secondLocal];
      },
    };
    const documentPortal = {
      id: "shared-listbox",
      isConnected: true,
      getRootNode() {
        return ownerDocument;
      },
      getAttribute(name: string) {
        const values: Record<string, string> = {
          "data-owner": "source",
          role: "listbox",
        };
        return values[name] ?? null;
      },
    };
    const ownerDocument = {
      getElementById() {
        return documentPortal;
      },
      querySelectorAll() {
        return [documentPortal];
      },
    };
    const control = {
      id: "source",
      ownerDocument,
      getRootNode() {
        return shadowRoot;
      },
      getAttribute(name: string) {
        return name === "aria-controls" ? "shared-listbox" : null;
      },
    };

    expect(interactions.resolveControlledListboxes(control)).toEqual([]);
  });

  it("reads committed values from non-value-holding visible triggers", () => {
    const control = {
      value: "",
      textContent: "Choose a school",
      getAttribute(name: string) {
        return name === "data-value" ? "uottawa" : null;
      },
    };

    expect(interactions.committedControlValue(control)).toBe("uottawa");
  });

  it("reads a Greenhouse React Select value after its input is cleared", () => {
    const selected = { textContent: "United States" };
    const control = {
      value: "",
      textContent: "",
      tagName: "INPUT",
      getAttribute(name: string) {
        return name === "role" ? "combobox" : null;
      },
      closest(selector: string) {
        if (selector === "[class*='__control']") {
          return {
            querySelectorAll(selectedSelector: string) {
              expect(selectedSelector).toContain("[class*='__single-value']");
              return [selected];
            },
          };
        }
        return null;
      },
    };

    expect(interactions.committedControlValue(control)).toBe("United States");
  });

  it("does not treat editable combobox query text as commit evidence", () => {
    const control = {
      value: "LinkedIn",
      textContent: "",
      tagName: "INPUT",
      getAttribute(name: string) {
        return name === "role" ? "combobox" : null;
      },
      closest() {
        return null;
      },
    };

    expect(interactions.comboboxCommitEvidence(control)).toEqual([]);
    expect(interactions.committedControlValue(control)).toBe("");

    for (const attributes of [
      { role: "ComboBox" },
      { "aria-haspopup": "listbox" },
    ]) {
      const variant = {
        ...control,
        getAttribute(name: string) {
          return attributes[name as keyof typeof attributes] ?? null;
        },
      };
      expect(interactions.committedControlValue(variant)).toBe("");
    }
  });

  it("keeps collapsed editable combobox values separate from commit evidence", () => {
    const control = {
      value: "LinkedIn",
      textContent: "",
      tagName: "INPUT",
      getAttribute(name: string) {
        const attributes: Record<string, string> = {
          role: "combobox",
          "aria-expanded": "false",
        };
        return attributes[name] ?? null;
      },
      closest() {
        return null;
      },
    };

    expect(interactions.comboboxCommitEvidence(control)).toEqual([]);
    expect(interactions.committedControlValue(control)).toBe("");
  });

  it("does not treat unrelated hidden field metadata as a committed value", () => {
    const metadata = {
      id: "question_id",
      name: "question_id",
      value: "12345",
      getAttribute() {
        return null;
      },
    };
    const scope = {
      querySelectorAll(selector: string) {
        return selector === "input[type='hidden']" ? [metadata] : [];
      },
    };
    const control = {
      id: "source-combobox",
      value: "",
      textContent: "",
      tagName: "INPUT",
      getAttribute(name: string) {
        const values: Record<string, string> = {
          role: "combobox",
          "aria-labelledby": "source-label",
        };
        return values[name] ?? null;
      },
      closest(selector: string) {
        return selector === "[class*='__control']" ? null : scope;
      },
    };

    expect(interactions.comboboxCommitEvidence(control)).toEqual([]);
    expect(interactions.committedControlValue(control)).toBe("");
    expect(
      interactions.comboboxCommitEvidence(control, {
        includeUnassociatedHidden: true,
      }),
    ).toEqual([{ source: "hidden-value:question_id", value: "12345" }]);
  });
});
