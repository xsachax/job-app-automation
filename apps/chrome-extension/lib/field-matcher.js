(function registerFieldMatcher(root) {
  const MINIMUM_SCORE = 62;
  const applicantFieldGroups = new Set(["identity", "contact", "links"]);
  const eligibilityFieldKeys = new Set([
    "workAuthorization",
    "requiresSponsorship"
  ]);
  const thirdPartyContext = [
    "reference",
    "references",
    "referral",
    "referrals",
    "referrer",
    "referrers",
    "referred",
    "referred by",
    "referee",
    "referees",
    "emergency contact",
    "emergency contacts",
    "manager",
    "managers",
    "supervisor",
    "supervisors",
    "employer",
    "employers",
    "company",
    "companies",
    "recruiter",
    "recruiters",
    "school",
    "schools",
    "university",
    "universities"
  ];

  function normalizeText(value) {
    return String(value || "")
      .replace(/LinkedIn/gi, "Linkedin")
      .replace(/GitHub/gi, "Github")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function tokens(value) {
    const normalized = normalizeText(value);
    return normalized ? normalized.split(" ") : [];
  }

  function scoreText(value, alias) {
    const normalizedValue = normalizeText(value);
    const normalizedAlias = normalizeText(alias);

    if (!normalizedValue || !normalizedAlias) {
      return 0;
    }

    if (normalizedValue === normalizedAlias) {
      return 100;
    }

    const valueTokens = tokens(normalizedValue);
    const aliasTokens = tokens(normalizedAlias);
    const paddedValue = ` ${normalizedValue} `;

    if (paddedValue.includes(` ${normalizedAlias} `)) {
      return Math.max(78, 88 - (valueTokens.length - aliasTokens.length) * 2);
    }

    if (aliasTokens.every((token) => valueTokens.includes(token))) {
      return Math.max(64, 74 - (valueTokens.length - aliasTokens.length));
    }

    return 0;
  }

  function isExcluded(definition, signals) {
    return (definition.excludeAliases || []).some((excludedAlias) =>
      signals.some((signal) => scoreText(signal.text, excludedAlias) >= 86)
    );
  }

  function isCompatible(definition, controlKind) {
    return !definition.controls || definition.controls.includes(controlKind);
  }

  function hasThirdPartyContext(definition, signals) {
    if (!applicantFieldGroups.has(definition.group)) {
      return false;
    }

    return (signals || []).some((signal) => {
      const normalized = ` ${normalizeText(signal.text)} `;
      return thirdPartyContext.some((phrase) =>
        normalized.includes(` ${normalizeText(phrase)} `)
      );
    });
  }

  function hasAmbiguousEligibilityContext(definition, signals) {
    if (!eligibilityFieldKeys.has(definition.key)) {
      return false;
    }

    const normalizedSignals = (signals || [])
      .filter((signal) => !["name", "id"].includes(signal.source))
      .map((signal) => normalizeText(signal.text));
    const mentionsAuthorization = normalizedSignals.some((normalized) =>
      [
        "authorized to work",
        "authorised to work",
        "eligible to work",
        "work authorization"
      ].some((phrase) => normalized.includes(phrase))
    );
    const mentionsSponsorship = normalizedSignals.some((normalized) =>
      normalized.includes("sponsor")
    );
    const hasNegation = normalizedSignals.some((normalized) => {
      const signalTokens = tokens(normalized);
      return (
        signalTokens.some((token) =>
          ["no", "not", "never", "without", "cannot"].includes(token)
        ) ||
        signalTokens.some(
          (token, index) =>
            token === "t" &&
            index > 0 &&
            signalTokens[index - 1].endsWith("n")
        ) ||
        normalized.includes("sponsorship free") ||
        normalized.includes("free of sponsorship")
      );
    });

    if (hasNegation || (mentionsAuthorization && mentionsSponsorship)) {
      return true;
    }

    if (definition.key === "workAuthorization") {
      return !normalizedSignals.some(
        (normalized) =>
          normalized === "work authorization" ||
          [
            "authorized to work",
            "authorised to work",
            "eligible to work",
            "legally authorized",
            "legally authorised",
            "have work authorization",
            "hold work authorization",
            "possess work authorization"
          ].some((phrase) => normalized.includes(phrase))
      );
    }

    const requirementWords = new Set([
      "require",
      "requires",
      "required",
      "requiring",
      "requirement",
      "need",
      "needs",
      "needed",
      "needing"
    ]);
    const explicitlyRequiresSponsorship = normalizedSignals.some((normalized) => {
      const signalTokens = tokens(normalized);
      const requirementIndexes = signalTokens
        .map((token, index) => (requirementWords.has(token) ? index : -1))
        .filter((index) => index >= 0);
      const sponsorshipIndexes = signalTokens
        .map((token, index) => (token.startsWith("sponsor") ? index : -1))
        .filter((index) => index >= 0);

      return requirementIndexes.some((requirementIndex) =>
        sponsorshipIndexes.some(
          (sponsorshipIndex) =>
            Math.abs(requirementIndex - sponsorshipIndex) <= 10
        )
      );
    });

    return !explicitlyRequiresSponsorship;
  }

  function scoreDefinition(definition, context) {
    if (!isCompatible(definition, context.controlKind)) {
      return 0;
    }
    if (
      isExcluded(definition, context.signals || []) ||
      hasThirdPartyContext(definition, context.signals) ||
      hasAmbiguousEligibilityContext(definition, context.signals)
    ) {
      return 0;
    }

    const autocompleteTokens = String(context.autocomplete || "")
      .trim()
      .split(/\s+/)
      .map(normalizeText)
      .filter(Boolean);
    if (
      autocompleteTokens.length &&
      (definition.autocomplete || []).some(
        (value) => autocompleteTokens.includes(normalizeText(value))
      )
    ) {
      return 120;
    }

    let bestScore = 0;
    for (const signal of context.signals || []) {
      for (const alias of definition.aliases || []) {
        if (
          (definition.exactAliases || []).includes(alias) &&
          normalizeText(signal.text) !== normalizeText(alias)
        ) {
          continue;
        }
        const weightedScore = scoreText(signal.text, alias) * (signal.weight || 1);
        bestScore = Math.max(bestScore, weightedScore);
      }
    }

    return bestScore;
  }

  function findBestDefinition(context, definitions) {
    const ranked = definitions
      .map((definition) => ({
        definition,
        score: scoreDefinition(definition, context)
      }))
      .filter((match) => match.score >= MINIMUM_SCORE)
      .sort((left, right) => right.score - left.score);

    if (!ranked.length) {
      return null;
    }

    const [best, secondBest] = ranked;
    const ambiguous =
      Boolean(secondBest) &&
      best.score < 95 &&
      best.score - secondBest.score < 5;

    return ambiguous ? null : best;
  }

  function canonicalChoice(value) {
    const normalized = normalizeText(value);

    if (["yes", "true", "y", "1"].includes(normalized)) {
      return "yes";
    }
    if (["no", "false", "n", "0"].includes(normalized)) {
      return "no";
    }
    if (
      ["us", "usa", "u s", "united states of america", "united states"].includes(
        normalized
      )
    ) {
      return "united states";
    }

    return normalized;
  }

  function scoreChoice(savedValue, optionValue, optionLabel) {
    const saved = canonicalChoice(savedValue);
    const value = canonicalChoice(optionValue);
    const label = canonicalChoice(optionLabel);

    if (!saved) {
      return 0;
    }
    if (saved === value || saved === label) {
      return 100;
    }
    if (value.startsWith(saved) || label.startsWith(saved)) {
      return 70;
    }
    return 0;
  }

  const api = Object.freeze({
    MINIMUM_SCORE,
    normalizeText,
    scoreText,
    scoreDefinition,
    findBestDefinition,
    canonicalChoice,
    scoreChoice
  });

  root.JobAutofillMatcher = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
