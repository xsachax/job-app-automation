import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface ListboxLike {
  id: string;
}

interface ControlInteractions {
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
      "school-options",
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
});
