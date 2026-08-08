import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface ListboxLike {
  id: string;
}

interface ControlInteractions {
  comboboxCommitEvidence(
    element: unknown,
    options?: { includeUnassociatedHidden?: boolean },
  ): { source: string; value: string }[];
  committedControlValue(element: unknown): string;
  controlledListboxIds(element: unknown): string[];
  controlReference(element: unknown): unknown;
  resolveControl(reference: unknown): unknown;
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
              expect(selectedSelector).toBe("[class*='__single-value']");
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
    expect(interactions.committedControlValue(control)).toBe("LinkedIn");
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
        expect(selector).toBe("input[type='hidden']");
        return [metadata];
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
