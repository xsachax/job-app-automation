import { describe, it, expect } from "vitest";
import { companyDomain, companyInitials, companyLogoUrl } from "../lib/companyDomain";

describe("companyDomain", () => {
  it("slugifies a plain company name to <slug>.com", () => {
    expect(companyDomain("OpenAI")).toBe("openai.com");
    expect(companyDomain("SpaceX")).toBe("spacex.com");
    expect(companyDomain("Jane Street")).toBe("janestreet.com");
  });

  it("applies curated overrides where a naive slug would be wrong", () => {
    expect(companyDomain("xAI")).toBe("x.ai");
    expect(companyDomain("Notion")).toBe("notion.so");
    expect(companyDomain("Scale AI")).toBe("scale.com");
    expect(companyDomain("Hudson River Trading")).toBe("hudson-trading.com");
  });

  it("pins defense/aerospace legal names to their real corporate domain", () => {
    // Without overrides these slugify to the wrong host, e.g.
    // "L3Harris Technologies" -> l3harristechnologies.com.
    expect(companyDomain("L3Harris Technologies")).toBe("l3harris.com");
    expect(companyDomain("Anduril Industries")).toBe("anduril.com");
    expect(companyDomain("General Dynamics Information Technology")).toBe("gdit.com");
    expect(companyDomain("General Dynamics Mission Systems")).toBe("gdmissionsystems.com");
    expect(companyDomain("Booz Allen Hamilton")).toBe("boozallen.com");
    expect(companyDomain("Raytheon")).toBe("rtx.com");
  });

  it("maps recognizable employers whose long name slugifies to a dead host", () => {
    // Short brand domains that differ from the full legal name's slug.
    expect(companyDomain("Texas Instruments")).toBe("ti.com");
    expect(companyDomain("Cadence Design Systems")).toBe("cadence.com");
    expect(companyDomain("Analog Devices")).toBe("analog.com");
    expect(companyDomain("PNC Financial Services")).toBe("pnc.com");
    expect(companyDomain("Renaissance Technologies")).toBe("rentec.com");
    expect(companyDomain("Steel Dynamics")).toBe("sdi.com");
    expect(companyDomain("Royal Bank of Canada")).toBe("rbc.com");
  });

  it("resolves brands that use a non-.com TLD", () => {
    expect(companyDomain("ElevenLabs")).toBe("elevenlabs.io");
    expect(companyDomain("Bland AI")).toBe("bland.ai");
    expect(companyDomain("Bot Auto")).toBe("bot.auto");
    expect(companyDomain("Socket")).toBe("socket.dev");
    expect(companyDomain("Mem0")).toBe("mem0.ai");
    expect(companyDomain("Porter")).toBe("porter.run");
    expect(companyDomain("LeoLabs")).toBe("leolabs.space");
  });

  it("matches override keys that contain punctuation", () => {
    // Overrides are looked up on the raw lower-cased name before slugifying, so
    // commas, periods, '+', '&', parentheses and a curly apostrophe must match.
    expect(companyDomain("Uber Technologies, Inc.")).toBe("uber.com");
    expect(companyDomain("Qualcomm Technologies, Inc.")).toBe("qualcomm.com");
    expect(companyDomain("Smith+Nephew")).toBe("smith-nephew.com");
    expect(companyDomain("SS&C")).toBe("ssctech.com");
    expect(companyDomain("Ritchie Bros.")).toBe("rbauction.com");
    expect(companyDomain("Sixtyfour (X25)")).toBe("sixtyfour.ai");
    expect(companyDomain("Cincinnati Children’s Hospital and Medical Center")).toBe(
      "cincinnatichildrens.org",
    );
  });

  it("routes public-sector names to their .edu/.gov/.info domains", () => {
    expect(companyDomain("Cornell University")).toBe("cornell.edu");
    expect(companyDomain("The Federal Reserve System")).toBe("federalreserve.gov");
    expect(companyDomain("Metropolitan Transportation Authority")).toBe("mta.info");
  });

  it("strips parentheticals and leading/trailing entity words", () => {
    expect(companyDomain("London Stock Exchange Group (LSEG)")).toBe("lseg.com"); // override
    expect(companyDomain("The Boeing Company")).toBe("boeing.com");
    expect(companyDomain("Acme Inc")).toBe("acme.com");
    expect(companyDomain("Foo Bar LLC")).toBe("foobar.com");
  });

  it("keeps meaningful words that happen to look like suffixes", () => {
    // "Trading"/"Capital" are part of real domains, not entity noise.
    expect(companyDomain("Jump Trading")).toBe("jumptrading.com");
    expect(companyDomain("Point72")).toBe("point72.com");
  });

  it("treats a name that is already a domain as the domain", () => {
    expect(companyDomain("Credal.ai")).toBe("credal.ai");
    expect(companyDomain("Lovable.dev")).toBe("lovable.dev");
    expect(companyDomain("Booking.com")).toBe("booking.com");
  });

  it("does not mistake a dotted name with an unknown suffix for a domain", () => {
    expect(companyDomain("St. Louis Robotics")).toBe("stlouisrobotics.com");
  });

  it("returns null for empty / missing input", () => {
    expect(companyDomain("")).toBeNull();
    expect(companyDomain(null)).toBeNull();
    expect(companyDomain(undefined)).toBeNull();
    expect(companyDomain("   ")).toBeNull();
  });
});

describe("companyLogoUrl", () => {
  it("points at our proxy route so a missing logo can 404 to a monogram", () => {
    expect(companyLogoUrl("NVIDIA")).toBe("/api/logo?company=NVIDIA");
    expect(companyLogoUrl("Jane Street")).toBe("/api/logo?company=Jane%20Street");
  });

  it("is null when no domain can be resolved", () => {
    expect(companyLogoUrl("")).toBeNull();
  });
});

describe("companyInitials", () => {
  it("uses the first letters of the first two words", () => {
    expect(companyInitials("Jane Street")).toBe("JS");
    expect(companyInitials("U.S. Bank")).toBe("UB");
  });

  it("uses the first two characters of a single-word name", () => {
    expect(companyInitials("OpenAI")).toBe("OP");
    expect(companyInitials("Stripe")).toBe("ST");
  });

  it("falls back to ? for empty input", () => {
    expect(companyInitials("")).toBe("?");
    expect(companyInitials(null)).toBe("?");
  });
});
