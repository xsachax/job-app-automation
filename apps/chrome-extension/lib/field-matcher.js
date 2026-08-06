(function registerFieldMatcher(root) {
  const MINIMUM_SCORE = 68;
  const UNCERTAIN_SCORE = 42;
  const MINIMUM_MARGIN = 7;
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
    "universities",
    "institution",
    "institutions",
    "organization",
    "organisation"
  ];
  const machineSignalSources = new Set([
    "name",
    "id",
    "metadata",
    "platform"
  ]);
  const genericContextSources = new Set([
    "aria",
    "nearby",
    "placeholder",
    "prompt",
    "section"
  ]);
  const degreeChoiceKeys = new Set([
    "bachelors degree",
    "masters degree",
    "doctorate",
    "associate degree",
    "high school diploma"
  ]);
  const choiceAliases = {
    "united states": [
      "us",
      "usa",
      "u s",
      "u s a",
      "united states",
      "united states of america"
    ],
    canada: ["can", "canada"],
    "bachelors degree": [
      "bachelor",
      "bachelors",
      "bachelor s",
      "bachelor s degree",
      "bachelor degree",
      "bachelors degree",
      "bachelor of science",
      "bachelor of arts",
      "bs",
      "b s",
      "ba",
      "b a",
      "bsc"
    ],
    "masters degree": [
      "master",
      "masters",
      "master s",
      "master s degree",
      "master degree",
      "masters degree",
      "master of science",
      "master of arts",
      "ms",
      "m s",
      "ma",
      "m a",
      "msc"
    ],
    doctorate: ["doctorate", "doctoral degree", "phd", "ph d"],
    "associate degree": ["associate", "associates", "associate s", "associate degree"],
    "high school diploma": [
      "high school",
      "high school diploma",
      "secondary school",
      "secondary school diploma"
    ],
    "company career site": [
      "company career site",
      "company careers site",
      "company website",
      "career site",
      "careers page"
    ],
    linkedin: ["linkedin", "linked in"],
    "employee referral": [
      "employee referral",
      "referred by employee",
      "current employee",
      "employee"
    ],
    other: [
      "other",
      "self describe",
      "self described",
      "prefer to self describe",
      "i prefer to self describe",
      "another identity",
      "another race or ethnicity",
      "a gender not listed here",
      "not listed",
      "not listed above"
    ],
    "prefer not to answer": [
      "prefer not to answer",
      "prefer not to say",
      "decline to answer",
      "decline to self identify",
      "i decline to answer",
      "choose not to disclose",
      "i choose not to self identify",
      "do not wish to disclose",
      "i do not wish to answer",
      "i don t wish to answer",
      "i do not want to answer",
      "i don t want to answer",
      "i prefer not to answer"
    ],
    "he him": ["he him", "he him his"],
    "she her": ["she her", "she her hers"],
    "they them": ["they them", "they them theirs"],
    "use my name": ["use my name", "name only", "use name only"],
    woman: ["woman", "female", "cisgender woman"],
    man: ["man", "male", "cisgender man"],
    "non binary": [
      "non binary",
      "nonbinary",
      "gender non conforming",
      "genderqueer"
    ],
    "american indian or alaska native": [
      "american indian or alaska native",
      "american indian or alaskan native",
      "american indian alaska native",
      "american indian alaskan native",
      "native american",
      "alaska native"
    ],
    asian: ["asian"],
    "black or african american": [
      "black or african american",
      "black african american",
      "black",
      "african american"
    ],
    "hispanic or latino": [
      "hispanic or latino",
      "hispanic latino",
      "hispanic or latino a x",
      "hispanic",
      "latino",
      "latina",
      "latinx"
    ],
    "middle eastern or north african": [
      "middle eastern or north african",
      "middle eastern north african",
      "mena"
    ],
    "native hawaiian or other pacific islander": [
      "native hawaiian or other pacific islander",
      "native hawaiian or pacific islander",
      "native hawaiian other pacific islander",
      "native hawaiian",
      "pacific islander"
    ],
    white: ["white", "caucasian"],
    "two or more races": [
      "two or more races",
      "multiracial",
      "multi racial",
      "multiple races"
    ],
    "protected veteran": [
      "protected veteran",
      "i am a protected veteran",
      "one or more classifications of a protected veteran",
      "i identify as one or more classifications of a protected veteran"
    ],
    "not a protected veteran": [
      "not a protected veteran",
      "i am not a protected veteran",
      "not protected veteran"
    ],
    "u s citizen": [
      "u s citizen",
      "us citizen",
      "united states citizen",
      "citizen of the united states"
    ],
    "permanent resident": [
      "permanent resident",
      "lawful permanent resident",
      "green card holder"
    ],
    "protected individual": [
      "protected individual",
      "protected person",
      "asylee",
      "refugee"
    ],
    "canadian citizen": ["canadian citizen", "citizen of canada"],
    "work permit holder": [
      "work permit holder",
      "valid work permit",
      "open work permit"
    ],
    alabama: ["al", "alabama"],
    alaska: ["ak", "alaska"],
    arizona: ["az", "arizona"],
    arkansas: ["ar", "arkansas"],
    california: ["ca", "california"],
    colorado: ["co", "colorado"],
    connecticut: ["ct", "connecticut"],
    delaware: ["de", "delaware"],
    "district of columbia": ["dc", "district of columbia", "washington dc"],
    florida: ["fl", "florida"],
    georgia: ["ga", "georgia"],
    hawaii: ["hi", "hawaii"],
    idaho: ["id", "idaho"],
    illinois: ["il", "illinois"],
    indiana: ["in", "indiana"],
    iowa: ["ia", "iowa"],
    kansas: ["ks", "kansas"],
    kentucky: ["ky", "kentucky"],
    louisiana: ["la", "louisiana"],
    maine: ["me", "maine"],
    maryland: ["md", "maryland"],
    massachusetts: ["ma", "massachusetts"],
    michigan: ["mi", "michigan"],
    minnesota: ["mn", "minnesota"],
    mississippi: ["ms", "mississippi"],
    missouri: ["mo", "missouri"],
    montana: ["mt", "montana"],
    nebraska: ["ne", "nebraska"],
    nevada: ["nv", "nevada"],
    "new hampshire": ["nh", "new hampshire"],
    "new jersey": ["nj", "new jersey"],
    "new mexico": ["nm", "new mexico"],
    "new york": ["ny", "new york"],
    "north carolina": ["nc", "north carolina"],
    "north dakota": ["nd", "north dakota"],
    ohio: ["oh", "ohio"],
    oklahoma: ["ok", "oklahoma"],
    oregon: ["or", "oregon"],
    pennsylvania: ["pa", "pennsylvania"],
    "rhode island": ["ri", "rhode island"],
    "south carolina": ["sc", "south carolina"],
    "south dakota": ["sd", "south dakota"],
    tennessee: ["tn", "tennessee"],
    texas: ["tx", "texas"],
    utah: ["ut", "utah"],
    vermont: ["vt", "vermont"],
    virginia: ["va", "virginia"],
    washington: ["wa", "washington"],
    "west virginia": ["wv", "west virginia"],
    wisconsin: ["wi", "wisconsin"],
    wyoming: ["wy", "wyoming"],
    "american samoa": ["as", "american samoa"],
    guam: ["gu", "guam"],
    "northern mariana islands": ["mp", "northern mariana islands"],
    "puerto rico": ["pr", "puerto rico"],
    "us virgin islands": ["vi", "us virgin islands", "virgin islands"],
    alberta: ["ab", "alberta"],
    "british columbia": ["bc", "british columbia"],
    manitoba: ["mb", "manitoba"],
    "new brunswick": ["nb", "new brunswick"],
    "newfoundland and labrador": [
      "nl",
      "newfoundland",
      "newfoundland and labrador"
    ],
    "nova scotia": ["ns", "nova scotia"],
    ontario: ["on", "ontario"],
    "prince edward island": ["pe", "prince edward island"],
    quebec: ["qc", "quebec"],
    saskatchewan: ["sk", "saskatchewan"],
    "northwest territories": ["nt", "northwest territories"],
    nunavut: ["nu", "nunavut"],
    yukon: ["yt", "yukon"]
  };

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

  function editDistance(left, right) {
    if (left === right) {
      return 0;
    }
    if (!left.length || !right.length) {
      return Math.max(left.length, right.length);
    }
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      let diagonal = previous[0];
      previous[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const above = previous[rightIndex];
        previous[rightIndex] = Math.min(
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + 1,
          diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
        diagonal = above;
      }
    }
    return previous[right.length];
  }

  function equivalentToken(left, right) {
    if (left === right) {
      return true;
    }
    if (Math.min(left.length, right.length) < 5) {
      return false;
    }
    return editDistance(left, right) <= 1;
  }

  function normalizeExactSignal(value) {
    return normalizeText(value)
      .replace(/^(?:optional|required) /, "")
      .replace(/ (?:optional|required)$/, "")
      .trim();
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

    const matchingAliasTokens = aliasTokens.filter((aliasToken) =>
      valueTokens.some((valueToken) => equivalentToken(aliasToken, valueToken))
    );
    if (matchingAliasTokens.length === aliasTokens.length) {
      return Math.max(64, 74 - (valueTokens.length - aliasTokens.length));
    }
    if (
      aliasTokens.length >= 2 &&
      matchingAliasTokens.length / aliasTokens.length >= 0.67
    ) {
      return Math.max(
        42,
        Math.round(62 * (matchingAliasTokens.length / aliasTokens.length))
      );
    }

    return 0;
  }

  function isExcluded(definition, signals) {
    return (definition.excludeAliases || []).some((excludedAlias) =>
      signals.some((signal) => scoreText(signal.text, excludedAlias) >= 78)
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

  function eligibilityIntent(signals) {
    const normalized = (signals || [])
      .filter((signal) => !machineSignalSources.has(signal.source))
      .map((signal) => normalizeText(signal.text))
      .filter(Boolean)
      .join(" ");
    if (!normalized) {
      return null;
    }

    const mentionsSponsorship = /\bsponsor(?:ship|ed|ing)?\b/.test(normalized);
    const mentionsWorkCapability =
      /\b(?:can|able to)\b.{0,20}\bwork\b/.test(normalized);
    const mentionsAuthorization =
      /\b(?:authorized|authorised|eligible|legally permitted|right|permission)\b.{0,32}\bwork\b|\blegally\b.{0,20}\bwork\b|\bwork (?:authorization|authorisation|permit|eligibility|rights?)\b/.test(
        normalized
      ) ||
      (mentionsWorkCapability && mentionsSponsorship);
    const asksAboutWorkSchedule =
      /\b(?:availability|available|days?|hours?|schedule|shift|weekends?|overtime|on call|night work|evenings?)\b/.test(
        normalized
      );
    const asksForUnmodeledStatus =
      /\b(?:obtain|already have|currently have|visa status|immigration status|type of visa|which visa)\b/.test(
        normalized
      );
    const asksIfAuthorizationIsNeeded =
      /\b(?:need|require|requires|required)\b.{0,16}\bwork (?:authorization|authorisation|permit)\b/.test(
        normalized
      );
    const negatesAuthorization =
      /\b(?:not|don t|doesn t|isn t|aren t)\b.{0,28}\b(?:authorized|authorised|eligible|permitted|right|permission)\b/.test(
        normalized
      );

    if (
      asksForUnmodeledStatus ||
      asksIfAuthorizationIsNeeded ||
      (mentionsWorkCapability && asksAboutWorkSchedule) ||
      (mentionsAuthorization && !mentionsSponsorship && negatesAuthorization)
    ) {
      return null;
    }

    const withoutSponsorship =
      /\bwithout\b.{0,28}\bsponsor|\bfree of\b.{0,20}\bsponsor|\bnot\b.{0,16}\b(?:need|require)\b.{0,20}\bsponsor|\bdon t\b.{0,12}\b(?:need|require)\b.{0,20}\bsponsor/.test(
        normalized
      );
    if (mentionsAuthorization && mentionsSponsorship && withoutSponsorship) {
      return "authorized-without-sponsorship";
    }
    if (mentionsSponsorship && withoutSponsorship) {
      return "does-not-require-sponsorship";
    }
    if (mentionsAuthorization && !mentionsSponsorship) {
      return "work-authorization";
    }
    if (
      mentionsSponsorship &&
      (/\b(?:need|needs|needed|require|requires|required|future|now)\b/.test(
        normalized
      ) ||
        /^(?:visa |immigration )?sponsorship$/.test(normalized))
    ) {
      return "requires-sponsorship";
    }
    return null;
  }

  function eligibilityDefinitionMatches(definition, signals) {
    if (!eligibilityFieldKeys.has(definition.key)) {
      return true;
    }
    const intent = eligibilityIntent(signals);
    if (!intent) {
      return false;
    }
    if (
      ["work-authorization", "authorized-without-sponsorship"].includes(intent)
    ) {
      return definition.key === "workAuthorization";
    }
    return definition.key === "requiresSponsorship";
  }

  function isGenericSpecifyText(value) {
    const normalized = normalizeText(value)
      .replace(
        /^(?:if|when) (?:you )?(?:(?:selected|select|choose|chose) )?other(?: above)? /,
        ""
      )
      .replace(/^other /, "")
      .replace(/\b(?:if|when) applicable\b/g, "")
      .replace(/\b(?:below|here|optional)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return /^(?:please )?specify(?: your (?:answer|response)| details)?$/.test(
      normalized
    );
  }

  function hasGenericExplicitLabel(signals) {
    for (const source of ["label", "aria", "nearby", "prompt", "placeholder"]) {
      const explicit = (signals || []).filter(
        (signal) => signal.source === source
      );
      if (explicit.length) {
        return explicit.some((signal) => isGenericSpecifyText(signal.text));
      }
    }
    return false;
  }

  function genericContextMatches(definition, signals) {
    if (!definition.allowGenericWithContext) {
      return false;
    }
    return (definition.contextAliases || []).some((alias) =>
      (signals || []).some(
        (signal) => {
          if (
            !genericContextSources.has(signal.source) ||
            isGenericSpecifyText(signal.text)
          ) {
            return false;
          }
          const context = normalizeText(signal.text);
          const normalizedAlias = normalizeText(alias);
          return [
            normalizedAlias,
            `${normalizedAlias} optional`,
            `${normalizedAlias} required`
          ].includes(context);
        }
      )
    );
  }

  function canPerformDefinitionMatches(definition, signals) {
    if (definition.key !== "canPerformEssentialFunctions") {
      return true;
    }
    const normalized = (signals || [])
      .filter((signal) => !machineSignalSources.has(signal.source))
      .map((signal) => normalizeText(signal.text))
      .filter(Boolean)
      .join(" ");
    const explicitlyAllowsAccommodation =
      /\bwith (?:or )?without\b.{0,24}\baccommodations?\b/.test(normalized);
    const excludesAccommodation =
      /\bwithout\b.{0,24}\baccommodations?\b|\bno accommodations?\b/.test(
        normalized
      );
    if (
      !normalized ||
      /\b(?:unable|cannot|can t|not able)\b/.test(normalized) ||
      /\b(?:not|never)\b.{0,12}\bperform\b|\bperform\b.{0,12}\b(?:not|never)\b/.test(
        normalized
      ) ||
      /\b(?:need|require|request)\b.{0,24}\b(?:an? )?(?:reasonable )?accommodations?\b/.test(
        normalized
      ) ||
      (excludesAccommodation && !explicitlyAllowsAccommodation)
    ) {
      return false;
    }
    return (
      /\b(?:can you|are you able to|ability to)\b.{0,48}\bperform\b.{0,48}\bessential functions?\b/.test(
        normalized
      ) ||
      /\bperform\b.{0,32}\bessential functions?\b.{0,48}\bwith or without\b.{0,24}\baccommodations?\b/.test(
        normalized
      )
    );
  }

  function invertYesNo(value) {
    return value === "yes" ? "no" : value === "no" ? "yes" : "";
  }

  function resolveEligibilityAnswer(definitionKey, signals, profile) {
    const intent = eligibilityIntent(signals);
    if (!eligibilityFieldKeys.has(definitionKey) || !intent) {
      return "";
    }
    if (intent === "work-authorization") {
      return String(profile?.workAuthorization || "");
    }
    if (intent === "requires-sponsorship") {
      return String(profile?.requiresSponsorship || "");
    }
    if (intent === "does-not-require-sponsorship") {
      return invertYesNo(String(profile?.requiresSponsorship || ""));
    }
    const authorization = String(profile?.workAuthorization || "");
    const sponsorship = String(profile?.requiresSponsorship || "");
    if (!authorization || !sponsorship) {
      return "";
    }
    return authorization === "yes" && sponsorship === "no" ? "yes" : "no";
  }

  function scoreDefinition(definition, context) {
    if (!isCompatible(definition, context.controlKind)) {
      return 0;
    }
    const genericLabel = hasGenericExplicitLabel(context.signals);
    const contextualGeneric =
      genericLabel && genericContextMatches(definition, context.signals);
    if (
      isExcluded(definition, context.signals || []) ||
      hasThirdPartyContext(definition, context.signals) ||
      (genericLabel && !contextualGeneric) ||
      !eligibilityDefinitionMatches(definition, context.signals) ||
      !canPerformDefinitionMatches(definition, context.signals)
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

    let bestScore = contextualGeneric ? 88 : 0;
    const corroboratingSources = new Set();
    if (contextualGeneric) {
      corroboratingSources.add("generic-context");
    }
    for (const signal of context.signals || []) {
      let signalScore = 0;
      for (const alias of definition.aliases || []) {
        if (
          (definition.exactAliases || []).includes(alias) &&
          normalizeExactSignal(signal.text) !== normalizeText(alias)
        ) {
          continue;
        }
        const weightedScore = scoreText(signal.text, alias) * (signal.weight || 1);
        signalScore = Math.max(signalScore, weightedScore);
        bestScore = Math.max(bestScore, weightedScore);
      }
      if (signalScore >= UNCERTAIN_SCORE) {
        corroboratingSources.add(signal.source || signal.text);
      }
    }

    return Math.min(120, bestScore + Math.max(0, corroboratingSources.size - 1) * 4);
  }

  function rankDefinitions(context, definitions) {
    return definitions
      .map((definition) => ({
        definition,
        score: scoreDefinition(definition, context)
      }))
      .filter((match) => match.score >= UNCERTAIN_SCORE)
      .sort((left, right) => right.score - left.score);
  }

  function analyzeDefinition(context, definitions) {
    const ranked = rankDefinitions(context, definitions);
    if (!ranked.length) {
      return {
        status: "none",
        match: null,
        candidates: [],
        confidence: 0,
        reason: "The field was not recognized."
      };
    }

    const [best, secondBest] = ranked;
    const ambiguous =
      Boolean(secondBest) &&
      best.score < 105 &&
      best.score - secondBest.score < MINIMUM_MARGIN;
    if (ambiguous) {
      return {
        status: "uncertain",
        match: null,
        candidates: ranked.slice(0, 3),
        confidence: Math.min(100, Math.round(best.score)),
        reason: `Could be ${best.definition.label.toLowerCase()} or ${secondBest.definition.label.toLowerCase()}.`
      };
    }
    if (best.score < MINIMUM_SCORE) {
      return {
        status: "uncertain",
        match: null,
        candidates: ranked.slice(0, 3),
        confidence: Math.min(100, Math.round(best.score)),
        reason: `Possible ${best.definition.label.toLowerCase()} match (${Math.round(
          best.score
        )}% confidence).`
      };
    }
    return {
      status: "confident",
      match: best,
      candidates: ranked.slice(0, 3),
      confidence: Math.min(100, Math.round(best.score)),
      reason: ""
    };
  }

  function findBestDefinition(context, definitions) {
    const analysis = analyzeDefinition(context, definitions);
    return analysis.status === "confident" ? analysis.match : null;
  }

  function canonicalChoice(value, fieldKey) {
    const normalized = normalizeText(value);

    if (["yes", "true", "y", "1", "affirmative"].includes(normalized)) {
      return "yes";
    }
    if (["no", "false", "n", "0", "negative"].includes(normalized)) {
      return "no";
    }
    for (const [canonical, aliases] of Object.entries(choiceAliases)) {
      if (degreeChoiceKeys.has(canonical) && fieldKey !== "degree") {
        continue;
      }
      if (aliases.includes(normalized)) {
        return canonical;
      }
    }

    return normalized;
  }

  function scoreChoice(savedValue, optionValue, optionLabel, fieldKey) {
    const saved = canonicalChoice(savedValue, fieldKey);
    const value = canonicalChoice(optionValue, fieldKey);
    const label = canonicalChoice(optionLabel, fieldKey);

    if (!saved) {
      return 0;
    }
    if (
      fieldKey === "veteranStatus" &&
      ((saved === "protected veteran" &&
        [value, label].includes("not a protected veteran")) ||
        (saved === "not a protected veteran" &&
          [value, label].includes("protected veteran")))
    ) {
      return 0;
    }
    if (saved === value || saved === label) {
      return 100;
    }
    if (
      ["yes", "no"].includes(saved) &&
      (tokens(value)[0] === saved || tokens(label)[0] === saved)
    ) {
      return 82;
    }
    return Math.min(
      92,
      Math.max(scoreText(value, saved), scoreText(label, saved))
    );
  }

  const api = Object.freeze({
    MINIMUM_SCORE,
    UNCERTAIN_SCORE,
    normalizeText,
    scoreText,
    scoreDefinition,
    analyzeDefinition,
    findBestDefinition,
    eligibilityIntent,
    resolveEligibilityAnswer,
    canonicalChoice,
    scoreChoice
  });

  root.JobAutofillMatcher = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
