import { describe, it, expect } from "vitest";
import { companyMatchKey } from "../lib/connections/normalize";
import { parseConnectionsCsv } from "../lib/connections/parse";
import {
  buildConnectionSet,
  lookupConnections,
  summarizeConnectionSet,
} from "../lib/connections/store";

describe("companyMatchKey", () => {
  it("normalizes casing, accents and punctuation", () => {
    expect(companyMatchKey("Nubank")).toBe("nubank");
    expect(companyMatchKey("  Doordash,  Inc. ")).toBe("doordash");
    expect(companyMatchKey("Björn Software")).toBe("bjorn");
  });

  it("strips corporate and industry suffix words symmetrically", () => {
    // A connection's free-text employer and a catalog company reduce to the
    // same key, so matching is a plain equality.
    expect(companyMatchKey("Jane Street Capital")).toBe(companyMatchKey("Jane Street"));
    expect(companyMatchKey("Hudson River Trading")).toBe(companyMatchKey("Hudson River"));
    expect(companyMatchKey("Stripe, Inc.")).toBe(companyMatchKey("Stripe"));
  });

  it("resolves brand/acronym aliases to the catalog key", () => {
    expect(companyMatchKey("Amazon Web Services (AWS)")).toBe(companyMatchKey("Amazon"));
    expect(companyMatchKey("AWS")).toBe(companyMatchKey("Amazon"));
    expect(companyMatchKey("Facebook")).toBe(companyMatchKey("Meta"));
    expect(companyMatchKey("Alphabet")).toBe(companyMatchKey("Google"));
    expect(companyMatchKey("HRT")).toBe(companyMatchKey("Hudson River"));
    expect(companyMatchKey("Anysphere")).toBe(companyMatchKey("Cursor"));
    expect(companyMatchKey("Uber Technologies, Inc.")).toBe(
      companyMatchKey("Uber"),
    );
    expect(companyMatchKey("General Dynamics Mission Systems")).toBe(
      companyMatchKey("General Dynamics"),
    );
  });

  it("returns empty for blank input", () => {
    expect(companyMatchKey("")).toBe("");
    expect(companyMatchKey(null)).toBe("");
    expect(companyMatchKey("   ")).toBe("");
  });
});

describe("parseConnectionsCsv", () => {
  const withPreamble = [
    "Notes:",
    '"When exporting your connection data, you may notice that ..."',
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    "Ada,Lovelace,https://linkedin.com/in/ada,,Stripe,Software Engineer,01 Jan 2024",
    'Alan,Turing,https://linkedin.com/in/alan,,"Jane Street Capital","Software Engineer, Platform",02 Feb 2024',
    "Grace,Hopper,https://linkedin.com/in/grace,,,Retired,03 Mar 2024",
  ].join("\n");

  it("skips the Notes preamble and parses rows", () => {
    const { connections, total, skipped } = parseConnectionsCsv(withPreamble);
    expect(connections).toHaveLength(2);
    expect(total).toBe(3);
    expect(skipped).toBe(1); // Grace has no company
    expect(connections[0]).toMatchObject({
      name: "Ada Lovelace",
      company: "Stripe",
      position: "Software Engineer",
    });
  });

  it("keeps quoted fields containing commas intact", () => {
    const { connections } = parseConnectionsCsv(withPreamble);
    const alan = connections.find((c) => c.name === "Alan Turing");
    expect(alan?.company).toBe("Jane Street Capital");
    expect(alan?.position).toBe("Software Engineer, Platform");
  });

  it("handles a BOM and header without a preamble", () => {
    const csv =
      "\uFEFFFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\n" +
      "Katherine,Johnson,https://linkedin.com/in/kj,,NASA,Mathematician,04 Apr 2024";
    const { connections } = parseConnectionsCsv(csv);
    expect(connections).toHaveLength(1);
    expect(connections[0].company).toBe("NASA");
  });

  it("returns empty when there is no recognizable header", () => {
    expect(parseConnectionsCsv("just,some,random\ndata,here,now")).toEqual({
      connections: [],
      total: 0,
      skipped: 0,
    });
  });
});

describe("buildConnectionSet + lookupConnections", () => {
  const parsed = parseConnectionsCsv(
    [
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Ada,Lovelace,https://linkedin.com/in/ada,,Jane Street Capital,SWE,01 Jan 2024",
      "Alan,Turing,https://linkedin.com/in/alan,,Jane Street,Quant,02 Feb 2024",
      "Grace,Hopper,https://linkedin.com/in/grace,,Amazon Web Services (AWS),SDE,03 Mar 2024",
    ].join("\n"),
  ).connections;

  it("groups differently-spelled employers under one company key", () => {
    const set = buildConnectionSet(parsed);
    // Jane Street Capital + Jane Street collapse to a single company.
    expect(set.distinctCompanies).toBe(2);
    const js = lookupConnections(set, "Jane Street");
    expect(js?.count).toBe(2);
    expect(js?.contacts.map((c) => c.name).sort()).toEqual(["Ada Lovelace", "Alan Turing"]);
  });

  it("matches a job's catalog company to an aliased employer", () => {
    const set = buildConnectionSet(parsed);
    // The catalog stores "Amazon"; the connection typed "Amazon Web Services (AWS)".
    expect(lookupConnections(set, "Amazon")?.count).toBe(1);
    expect(lookupConnections(set, "Netflix")).toBeNull();
  });

  it("summarizes top companies for the profile page", () => {
    const summary = summarizeConnectionSet(buildConnectionSet(parsed));
    expect(summary.total).toBe(3);
    expect(summary.distinctCompanies).toBe(2);
    expect(summary.topCompanies[0].count).toBe(2); // Jane Street leads
  });
});
