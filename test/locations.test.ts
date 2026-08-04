import { describe, expect, it } from "vitest";
import { normalizeLocation, normalizeLocationKey } from "../lib/locations";

describe("normalizeLocation", () => {
  it("returns null for empty / non-string input", () => {
    expect(normalizeLocation(null)).toBeNull();
    expect(normalizeLocation(undefined)).toBeNull();
    expect(normalizeLocation("")).toBeNull();
    expect(normalizeLocation("   ")).toBeNull();
  });

  it("collapses San Francisco variants to one canonical bucket", () => {
    for (const raw of [
      "San Francisco",
      "San Francisco, CA",
      "San Francisco, California",
      "San Francisco, California, United States",
      "San Francisco | San Francisco, California, United States",
      "San Francisco, CA (HQ)",
    ]) {
      expect(normalizeLocation(raw)).toBe("San Francisco, CA");
    }
  });

  it("collapses every New York spelling to New York, NY", () => {
    for (const raw of ["New York", "New York, NY", "NYC", "NY, NY", "New York City"]) {
      expect(normalizeLocation(raw)).toBe("New York, NY");
    }
  });

  it("infers state for country→region→city ordered strings", () => {
    expect(normalizeLocation("United States, Washington, Redmond")).toBe("Redmond, WA");
    expect(normalizeLocation("Seattle, Washington, USA")).toBe("Seattle, WA");
  });

  it("treats Washington + DC as the city, not the state", () => {
    expect(normalizeLocation("Washington, DC")).toBe("Washington, DC");
    expect(normalizeLocation("Washington, D.C.")).toBe("Washington, DC");
    expect(normalizeLocation("Washington")).toBe("Washington, DC");
  });

  it("normalizes Canadian provinces to two-letter codes", () => {
    expect(normalizeLocation("Toronto, Ontario, CAN")).toBe("Toronto, ON");
    expect(normalizeLocation("Vancouver, British Columbia, CAN")).toBe("Vancouver, BC");
    expect(normalizeLocation("Toronto, Canada")).toBe("Toronto, ON");
  });

  it("maps any remote phrasing to Remote", () => {
    for (const raw of ["Remote", "Remote, US", "Remote in USA", "Remote | United States"]) {
      expect(normalizeLocation(raw)).toBe("Remote");
    }
  });

  it("takes the first place from a multi-location list", () => {
    expect(normalizeLocation("Boston, MA | Seattle, WA | NYC")).toBe("Boston, MA");
  });

  it("strips HQ / parenthetical / prefix noise", () => {
    expect(normalizeLocation("Mountain View, California (HQ) | Nuro HQ - Mountain View, CA")).toBe(
      "Mountain View, CA",
    );
    expect(normalizeLocation("Hawthorne, CA | Hawthorne, CA, United States")).toBe("Hawthorne, CA");
  });

  it("drops country-only / vague strings", () => {
    expect(normalizeLocation("United States")).toBeNull();
    expect(normalizeLocation("California")).toBeNull();
    expect(normalizeLocation("Multiple Locations")).toBeNull();
  });

  it("keeps an unknown city as its own bucket", () => {
    expect(normalizeLocation("Hawthorne, CA")).toBe("Hawthorne, CA");
    expect(normalizeLocation("London")).toBe("London");
  });

  it("normalizeLocationKey lowercases for matching", () => {
    expect(normalizeLocationKey("San Francisco, CA")).toBe("san francisco, ca");
  });
});
