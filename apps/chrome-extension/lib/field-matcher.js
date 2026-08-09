(function registerFieldMatcher(root) {
  const MINIMUM_SCORE = 68;
  const UNCERTAIN_SCORE = 42;
  const MINIMUM_MARGIN = 7;
  const applicantFieldGroups = new Set(["identity", "contact", "links"]);
  const eligibilityFieldKeys = new Set([
    "workAuthorization",
    "requiresSponsorship"
  ]);
  const currentLocationFieldKeys = new Set([
    "city",
    "country",
    "location",
    "region"
  ]);
  const consequentialChoiceFieldKeys = new Set([
    "raceEthnicity",
    "veteranStatus"
  ]);
  const directChoiceNegationKeys = new Set([
    "willingToRelocate",
    "willingToTravel",
    "isAtLeast18",
    "citizenshipStatus",
    "gender",
    "hispanicLatino",
    "transgenderStatus",
    "raceEthnicity",
    "disabilityStatus",
    "veteranStatus"
  ]);
  const locationPreferencePattern =
    /\b(?:desired|prefer(?:red|ence|ences)?|relocat(?:e|ed|ing|ion)|willing)\b/;
  const instructionTokens = new Set([
    "a",
    "an",
    "and",
    "answer",
    "are",
    "at",
    "be",
    "can",
    "choose",
    "could",
    "did",
    "do",
    "does",
    "enter",
    "for",
    "from",
    "has",
    "have",
    "how",
    "in",
    "input",
    "is",
    "mandatory",
    "may",
    "of",
    "on",
    "optional",
    "out",
    "please",
    "provide",
    "required",
    "response",
    "select",
    "that",
    "the",
    "this",
    "to",
    "value",
    "what",
    "when",
    "where",
    "which",
    "who",
    "will",
    "would",
    "you",
    "your"
  ]);
  const requirementTokens = new Set(["mandatory", "optional", "required"]);
  const genericExperienceTokens = new Set([
    "career",
    "experience",
    "full",
    "length",
    "many",
    "number",
    "or",
    "overall",
    "professional",
    "relevant",
    "time",
    "total",
    "work",
    "year"
  ]);
  const softwareExperienceTokens = new Set([
    ...genericExperienceTokens,
    "developer",
    "development",
    "engineer",
    "engineering",
    "exclude",
    "excluding",
    "industry",
    "internship",
    "project",
    "school",
    "software",
    "technical",
    "technology"
  ]);
  const semanticTokenAliases = Object.freeze({
    above: "older",
    annually: "annual",
    authorised: "authorization",
    authorization: "authorization",
    authorized: "authorization",
    begin: "start",
    begins: "start",
    began: "start",
    carry: "perform",
    cities: "city",
    completed: "graduation",
    completion: "graduation",
    compensation: "compensation",
    countries: "country",
    currently: "current",
    desired: "desired",
    discovered: "discover",
    discover: "discover",
    duties: "function",
    duty: "function",
    eligible: "authorization",
    eligibility: "authorization",
    employed: "work",
    employee: "work",
    employment: "work",
    expectations: "desired",
    expectation: "desired",
    expected: "desired",
    experiences: "experience",
    find: "discover",
    found: "discover",
    formerly: "previous",
    former: "previous",
    functions: "function",
    graduate: "graduation",
    graduation: "graduation",
    hear: "discover",
    heard: "discover",
    internships: "internship",
    join: "start",
    learn: "discover",
    learned: "discover",
    located: "location",
    location: "location",
    older: "older",
    opening: "job",
    opportunities: "job",
    opportunity: "job",
    pay: "compensation",
    percentage: "percent",
    permitted: "authorization",
    permission: "authorization",
    position: "job",
    previously: "previous",
    prior: "previous",
    professionally: "professional",
    provinces: "region",
    province: "region",
    relocating: "relocate",
    relocation: "relocate",
    regions: "region",
    role: "job",
    salary: "compensation",
    sponsored: "sponsor",
    sponsoring: "sponsor",
    sponsorship: "sponsor",
    states: "region",
    state: "region",
    target: "desired",
    tenure: "experience",
    traveling: "travel",
    travelling: "travel",
    universities: "university",
    worked: "work",
    working: "work",
    yearly: "annual",
    years: "year"
  });
  const thirdPartyContext = [
    "reference",
    "references",
    "referral",
    "referrals",
    "referrer",
    "referrers",
    "referred",
    "referred by",
    "referring",
    "referring employee",
    "employee referral",
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
      "decline to self identification",
      "decline to disclose",
      "i decline to answer",
      "i decline to disclose",
      "i decline to self identify",
      "i decline to self identify my race ethnic identity",
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
      "not protected veteran",
      "veteran but not protected",
      "i am a veteran but i am not a protected veteran"
    ],
    "not a veteran": [
      "not a veteran",
      "i am not a veteran",
      "no i am not a veteran"
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
  const locationRegionKeys = new Set(
    Object.entries(choiceAliases)
      .filter(
        ([canonical, aliases]) =>
          !degreeChoiceKeys.has(canonical) &&
          !["united states", "canada"].includes(canonical) &&
          aliases.some((alias) => /^[a-z]{2}$/.test(alias))
      )
      .map(([canonical]) => canonical)
  );
  const locationCountries = new Set([
    "canada",
    "united states",
    "united states of america",
    "usa",
    "us"
  ]);
  const canadianRegionKeys = new Set([
    "alberta",
    "british columbia",
    "manitoba",
    "new brunswick",
    "newfoundland and labrador",
    "nova scotia",
    "northwest territories",
    "nunavut",
    "ontario",
    "prince edward island",
    "quebec",
    "saskatchewan",
    "yukon"
  ]);
  const safeFallbackFieldKeys = new Set([
    "degree",
    "fieldOfStudy",
    "heardAboutJob",
    "school"
  ]);

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

  function semanticTokens(value, preserveRequirement = false) {
    const seen = new Set();
    return tokens(value).flatMap((rawToken) => {
      const token = semanticTokenAliases[rawToken] || rawToken;
      if (
        (instructionTokens.has(rawToken) &&
          !(preserveRequirement && requirementTokens.has(rawToken))) ||
        seen.has(token)
      ) {
        return [];
      }
      seen.add(token);
      return [token];
    });
  }

  function semanticSignature(value, preserveRequirement = false) {
    return semanticTokens(value, preserveRequirement).join(" ");
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

  function normalizeExactSignal(value, preserveRequirement = false) {
    return semanticSignature(value, preserveRequirement);
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

    const lexicalAliasTokens = tokens(normalizedAlias);
    const semanticValueTokens = semanticTokens(normalizedValue);
    const semanticAliasTokens = semanticTokens(normalizedAlias, true);
    if (
      semanticValueTokens.length &&
      semanticAliasTokens.length &&
      semanticValueTokens.join(" ") === semanticAliasTokens.join(" ")
    ) {
      return 100;
    }
    const paddedValue = ` ${normalizedValue} `;

    if (paddedValue.includes(` ${normalizedAlias} `)) {
      const unmatchedTokens = semanticValueTokens.filter(
        (valueToken) =>
          !semanticAliasTokens.some((aliasToken) =>
            equivalentToken(aliasToken, valueToken)
          )
      ).length;
      return Math.max(
        78,
        Math.min(
          98,
          88 + Math.min(semanticAliasTokens.length - 1, 3) * 3 -
            unmatchedTokens * 5
        )
      );
    }

    const matchingAliasTokens = semanticAliasTokens.filter((aliasToken) =>
      semanticValueTokens.some((valueToken) =>
        equivalentToken(aliasToken, valueToken)
      )
    );
    if (
      semanticAliasTokens.length === 1 &&
      lexicalAliasTokens.length > 1 &&
      matchingAliasTokens.length === 1
    ) {
      return 0;
    }
    if (
      semanticAliasTokens.length &&
      matchingAliasTokens.length === semanticAliasTokens.length
    ) {
      const coverage =
        semanticAliasTokens.length /
        Math.max(semanticValueTokens.length, semanticAliasTokens.length);
      return Math.min(
        94,
        72 +
          Math.min(semanticAliasTokens.length - 1, 4) * 4 +
          Math.round(coverage * 10)
      );
    }
    if (
      semanticAliasTokens.length >= 2 &&
      matchingAliasTokens.length / semanticAliasTokens.length >= 0.67
    ) {
      return Math.max(
        42,
        Math.round(
          62 * (matchingAliasTokens.length / semanticAliasTokens.length)
        )
      );
    }

    return 0;
  }

  function literalPhraseMatches(value, alias) {
    const normalizedValue = normalizeText(value);
    const normalizedAlias = normalizeText(alias);
    return Boolean(
      normalizedValue &&
        normalizedAlias &&
        (normalizedValue === normalizedAlias ||
          ` ${normalizedValue} `.includes(` ${normalizedAlias} `))
    );
  }

  function hasUnsupportedChoiceNegation(definition, signals) {
    if (!directChoiceNegationKeys.has(definition.key)) {
      return false;
    }
    return (signals || [])
      .filter(
        (signal) =>
          !["description", "section"].includes(signal.source)
      )
      .some((signal) => {
        const normalized = normalizeText(signal.text);
        return (
          /\b(?:not|never|no longer|unable|unwilling)\b.{0,28}\b(?:willing|open|able|identify|identified|citizen|veteran|disabled|disability|hispanic|latino|transgender|gender)\b/.test(
            normalized
          ) ||
          /\b(?:do not|don t|does not|doesn t|are not|aren t|is not|isn t)\b.{0,28}\b(?:identify|have|consider|willing|able)\b/.test(
            normalized
          )
        );
      });
  }

  function controlEvidenceBonus(definition, context) {
    const options = (context.optionTexts || []).map(normalizeText).filter(Boolean);
    if (!options.length) {
      return 0;
    }
    const canonicalOptions = new Set(
      options.flatMap((option) => [
        canonicalChoice(option, definition.key),
        tokens(option)[0]
      ])
    );
    if (
      definition.controls?.includes("choice") &&
      canonicalOptions.has("yes") &&
      canonicalOptions.has("no")
    ) {
      return 2;
    }
    return 1;
  }

  function previousEmployerDefinitionMatches(definition, signals) {
    if (definition.key !== "previousEmployers") {
      return true;
    }
    const normalized = (signals || [])
      .filter((signal) => !machineSignalSources.has(signal.source))
      .map((signal) => normalizeText(signal.text))
      .filter(Boolean)
      .join(" ");
    if (
      !normalized ||
      /\b(?:authorization|authorisation|eligible|legally|sponsor|visa)\b/.test(
        normalized
      ) ||
      /\b(?:how many|how long|years?|months?|duration)\b/.test(normalized) ||
      /\b(?:not|never|haven t|hadn t|didn t|weren t|wasn t)\b/.test(normalized)
    ) {
      return false;
    }
    return (
      /\b(?:have|had) you (?:(?:ever|previously|formerly) )?(?:worked|been employed)\b/.test(
        normalized
      ) ||
      /\bdid you (?:(?:ever|previously|formerly) )?work\b/.test(normalized) ||
      /\bwere you (?:(?:ever|previously|formerly) )?employed\b/.test(
        normalized
      ) ||
      /\b(?:are|were) you .{0,36}\b(?:former|formerly|previous|prior) .{0,24}\bemployee\b/.test(
        normalized
      )
    );
  }

  function experienceDefinitionMatches(definition, signals) {
    const allowedTokens =
      definition.key === "relevantExperienceYears"
        ? genericExperienceTokens
        : definition.key === "softwareIndustryExperienceYears"
          ? softwareExperienceTokens
          : null;
    if (!allowedTokens) {
      return true;
    }
    return (signals || [])
      .filter((signal) => !["description", "section"].includes(signal.source))
      .every((signal) => {
        const signalTokens = semanticTokens(signal.text);
        if (
          !signalTokens.some((token) =>
            ["experience", "work", "year"].includes(token)
          )
        ) {
          return true;
        }
        return signalTokens.every((token) => allowedTokens.has(token));
      });
  }

  function hasAvailableStartIntent(normalized) {
    return (
      /\b(?:available|availability|earliest|soonest)\b.{0,40}\b(?:date|start|begin|join)\b/.test(
        normalized
      ) ||
      /\b(?:when|date)\b.{0,24}\b(?:can|could|able)\b.{0,24}\b(?:start|begin|join)\b/.test(
        normalized
      ) ||
      /\b(?:can|could|able)\b.{0,24}\b(?:start|begin|join)\b/.test(
        normalized
      ) ||
      /\b(?:start|begin|join)\b.{0,24}\b(?:availability|with us|this job|this role|the company)\b/.test(
        normalized
      )
    );
  }

  function availableStartDateDefinitionMatches(definition, signals) {
    if (definition.key !== "availableStartDate") {
      return true;
    }
    const normalizedSignals = (signals || [])
      .map((signal) => ({
        source: signal.source,
        text: normalizeText(signal.text)
      }))
      .filter((signal) => signal.text);
    const normalized = normalizedSignals.map((signal) => signal.text).join(" ");
    const primary = normalizedSignals
      .filter((signal) => !["description", "section"].includes(signal.source))
      .map((signal) => signal.text)
      .join(" ");
    if (hasAvailableStartIntent(primary)) {
      return true;
    }
    if (
      !normalized ||
      /\b(?:work|employment|job|position|professional) (?:history|experience)\b|\b(?:previous|former|prior|past|current) (?:job|role|employment|employer)\b|\b(?:started|began|hired)\b/.test(
        normalized
      )
    ) {
      return false;
    }
    return hasAvailableStartIntent(normalized);
  }

  function ageDefinitionMatches(definition, signals) {
    if (definition.key !== "isAtLeast18") {
      return true;
    }
    const normalized = (signals || [])
      .map((signal) => normalizeText(signal.text))
      .filter(Boolean)
      .join(" ");
    return !(
      /\b(?:under|below|younger than|less than|not yet|not|fail(?:ing)? to meet)\b.{0,32}\b(?:18|eighteen|minimum age|legal age)\b/.test(
        normalized
      ) ||
      /\b(?:18|eighteen)\b.{0,20}\b(?:or under|or younger|maximum age)\b/.test(
        normalized
      )
    );
  }

  function isExcluded(definition, signals) {
    const excludedSignals = signals.filter((signal) =>
      (definition.excludeAliases || []).some((excludedAlias) =>
        literalPhraseMatches(signal.text, excludedAlias)
      )
    );
    if (!excludedSignals.length) {
      return false;
    }
    if (!consequentialChoiceFieldKeys.has(definition.key)) {
      return true;
    }
    const explicitSources = new Set(["aria", "label", "nearby", "prompt"]);
    const hasExplicitFieldSignal = signals.some(
      (signal) =>
        explicitSources.has(signal.source) &&
        !excludedSignals.includes(signal) &&
        (definition.aliases || []).some(
          (alias) => scoreText(signal.text, alias) >= MINIMUM_SCORE
        )
    );
    return !hasExplicitFieldSignal;
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
    const normalized = [
      ...new Set(
        (signals || [])
          .filter((signal) => !machineSignalSources.has(signal.source))
          .map((signal) => normalizeText(signal.text))
          .filter(Boolean)
      )
    ].join(" ");
    if (!normalized) {
      return null;
    }

    const mentionsSponsorship = /\bsponsor(?:ship|ed|ing)?\b/.test(normalized);
    const mentionsWorkCapability =
      /\b(?:can|able to)\b.{0,20}\bwork\b/.test(normalized);
    const mentionsAuthorization =
      /\b(?:authorized|authorised|authorization|authorisation|eligible|legally permitted|right|permission)\b.{0,32}\bwork\b|\blegally\b.{0,20}\bwork\b|\bwork (?:authorization|authorisation|permit|eligibility|rights?)\b/.test(
        normalized
      ) ||
      (mentionsWorkCapability && mentionsSponsorship);
    const asksAboutWorkSchedule =
      /\b(?:availability|available|days?|hours?|schedule|shift|weekends?|overtime|on call|night work|evenings?)\b/.test(
        normalized
      );
    const asksForUnmodeledStatus =
      /\b(?:obtain|already have|currently have|immigration status|type of visa|which visa)\b/.test(
        normalized
      ) ||
      (/\bvisa status\b/.test(normalized) && !mentionsSponsorship);
    const asksIfAuthorizationIsNeeded =
      /\b(?:need|require|requires|required)\b.{0,20}\b(?:work (?:authorization|authorisation|permit)|(?:authorization|authorisation|permission|permit)\b.{0,12}\bto work)\b/.test(
        normalized
      );
    const negatesAuthorization =
      /\b(?:not|don t|doesn t|isn t|aren t|lack(?:s|ed|ing)?|without|no)\b.{0,28}\b(?:authorized|authorised|authorization|authorisation|eligible|permitted|permission|right|work)\b/.test(
        normalized
      ) ||
      /\b(?:unauthorized|unauthorised|ineligible|prohibited|barred)\b.{0,20}\b(?:to )?work\b/.test(
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
      /\b(?:can you|are you able to|ability to)\b.{0,48}\b(?:carry out|fulfill)\b.{0,48}\bessential (?:functions?|duties)\b.{0,48}\bwith or without\b.{0,24}\baccommodations?\b/.test(
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

  function profileList(value) {
    const seen = new Set();
    return String(value || "")
      .split(/[\n;]/)
      .map((item) => item.trim())
      .filter((item) => {
        const key = normalizeText(item);
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function canonicalCompany(value) {
    const suffixes = new Set([
      "co",
      "company",
      "corp",
      "corporation",
      "inc",
      "incorporated",
      "llc",
      "limited",
      "ltd",
      "plc"
    ]);
    const companyTokens = tokens(value);
    while (
      companyTokens.length > 1 &&
      suffixes.has(companyTokens[companyTokens.length - 1])
    ) {
      companyTokens.pop();
    }
    if (companyTokens[0] === "the") {
      companyTokens.shift();
    }
    return companyTokens.join(" ");
  }

  function sameCompany(left, right) {
    const normalizedLeft = canonicalCompany(left);
    const normalizedRight = canonicalCompany(right);
    if (!normalizedLeft || !normalizedRight) {
      return false;
    }
    return normalizedLeft === normalizedRight;
  }

  function resolvePreviousEmployerAnswer(
    signals,
    savedEmployers,
    currentCompany
  ) {
    const employers = profileList(savedEmployers);
    if (!employers.length) {
      return "";
    }
    const question = (signals || [])
      .filter((signal) => !machineSignalSources.has(signal.source))
      .map((signal) => ({
        text: normalizeText(signal.text),
        weight: Number(signal.weight || 0),
        source: signal.source
      }))
      .filter((signal) =>
        /\b(?:work|worked|employed|employment|employee)\b/.test(signal.text)
      )
      .sort(
        (left, right) =>
          Number(left.source === "section") -
            Number(right.source === "section") ||
          right.weight - left.weight
      )
      .map((signal) => signal.text)
      .filter(Boolean)
      .at(0);
    if (!question) {
      return "";
    }
    const asksApplicantEmployment =
      /\b(?:have|had)\s+you\s+(?:(?:ever|previously|formerly)\s+)?(?:worked|been employed)\b/.test(
        question
      ) ||
      /\bdid\s+you\s+(?:(?:ever|previously|formerly)\s+)?work\b/.test(
        question
      ) ||
      /\bwere\s+you\s+(?:(?:ever|previously|formerly)\s+)?employed\b/.test(
        question
      ) ||
      /\b(?:are|were)\s+you\s+(?:(?:a|an)\s+)?(?:former|previous|prior)\s+employee\b/.test(
        question
      );
    if (
      !asksApplicantEmployment ||
      /\b(?:not|never|haven t|hadn t|didn t|don t|weren t|wasn t)\b/.test(
        question
      ) ||
      /\b(?:related|relative|family|parent|sibling|child|guardian|spouse|partner|household|refer(?:red|ral)|reference)\b/.test(
        question
      )
    ) {
      return "";
    }
    const cleanTarget = (value) =>
      String(value || "")
        .replace(/\s+(?:before|previously|formerly|in the past)$/, "")
        .trim();
    const relationshipTarget = cleanTarget(
      question.match(
        /\b(?:work|worked|employed)\s+(?:(?:previously|formerly)\s+)?(?:at|for|by|with)\s+(.{1,80})/
      )?.[1]
    );
    const formerEmployeeQuestion =
      /\b(?:former|previous|prior)\b.{0,20}\b(?:employee|employment)\b/.test(
        question
      );
    const pureImplicitFormerEmployeeQuestion =
      /^(?:are|were) you (?:(?:a|an) )?(?:former|previous|prior) employee$/.test(
        question
      );
    const formerEmployerTarget = cleanTarget(
      question.match(
        /\b(?:former|previous|prior)\b.{0,20}\bemployee\b\s+(?:of|at|for|with)\s+(.{1,80})/
      )?.[1] ||
        question.match(
          /\b(?:previous|prior)\s+employment\s+(?:with|at|for)\s+(.{1,80})/
        )?.[1]
    );
    const employerTarget = relationshipTarget || formerEmployerTarget;
    if (
      (!employerTarget && !formerEmployeeQuestion) ||
      (employerTarget &&
        /^(?:more|less|over|under|at least|a minimum|a maximum|\d|how (?:many|long))\b/.test(
          employerTarget
        ))
    ) {
      return "";
    }

    const asksAboutCurrentCompany =
      employerTarget &&
      /^(?:us|our company|this company|this organization)$/.test(employerTarget);
    if (asksAboutCurrentCompany && currentCompany) {
      return employers.some((employer) => sameCompany(employer, currentCompany))
        ? "yes"
        : "no";
    }
    if (
      employerTarget &&
      currentCompany &&
      sameCompany(employerTarget, currentCompany)
    ) {
      return employers.some((employer) => sameCompany(employer, currentCompany))
        ? "yes"
        : "no";
    }
    if (
      !employerTarget &&
      pureImplicitFormerEmployeeQuestion &&
      currentCompany
    ) {
      return employers.some((employer) => sameCompany(employer, currentCompany))
        ? "yes"
        : "no";
    }
    return "";
  }

  function scoreDefinition(definition, context) {
    if (!isCompatible(definition, context.controlKind)) {
      return 0;
    }
    const genericLabel = hasGenericExplicitLabel(context.signals);
    const contextualGeneric =
      genericLabel && genericContextMatches(definition, context.signals);
    const hasLocationPreferenceIntent =
      currentLocationFieldKeys.has(definition.key) &&
      (context.signals || []).some(
        (signal) =>
          locationPreferencePattern.test(normalizeText(signal.text))
      );
    const hasNonCurrentLocationIntent =
      currentLocationFieldKeys.has(definition.key) &&
      (context.signals || []).some((signal) => {
        const normalized = `${normalizeText(signal.text)} ${semanticSignature(
          signal.text
        )}`;
        return (
          /\b(?:location|city|state|province|region|country)\b/.test(normalized) &&
          /\b(?:birth|born|natal|hometown|desired|preferred|target|job|role|position|posting|office|workplace|event)\b/.test(
            normalized
          )
        );
      });
    if (
      isExcluded(definition, context.signals || []) ||
      hasLocationPreferenceIntent ||
      hasNonCurrentLocationIntent ||
      hasThirdPartyContext(definition, context.signals) ||
      (genericLabel && !contextualGeneric) ||
      !eligibilityDefinitionMatches(definition, context.signals) ||
      !previousEmployerDefinitionMatches(definition, context.signals) ||
      !experienceDefinitionMatches(definition, context.signals) ||
      !availableStartDateDefinitionMatches(definition, context.signals) ||
      !ageDefinitionMatches(definition, context.signals) ||
      !canPerformDefinitionMatches(definition, context.signals) ||
      hasUnsupportedChoiceNegation(definition, context.signals)
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
      return 132;
    }

    let bestScore = contextualGeneric ? 88 : 0;
    const corroboratingEvidence = new Set();
    if (contextualGeneric) {
      corroboratingEvidence.add("generic-context");
    }
    for (const signal of context.signals || []) {
      let signalScore = 0;
      for (const alias of definition.aliases || []) {
        const isExactAlias = (definition.exactAliases || []).includes(alias);
        const semanticExact =
          normalizeExactSignal(signal.text) === normalizeExactSignal(alias, true);
        if (isExactAlias && !semanticExact) {
          continue;
        }
        const machinePhraseScore =
          machineSignalSources.has(signal.source) &&
          literalPhraseMatches(signal.text, alias)
            ? 90
            : 0;
        const aliasScore = Math.max(
          scoreText(signal.text, alias),
          machinePhraseScore,
          semanticExact ? (isExactAlias ? 112 : 108) : 0
        );
        const weightedScore = aliasScore * (signal.weight || 1);
        signalScore = Math.max(signalScore, weightedScore);
        bestScore = Math.max(bestScore, weightedScore);
      }
      if (signalScore >= UNCERTAIN_SCORE) {
        corroboratingEvidence.add(
          semanticSignature(signal.text) || normalizeText(signal.text)
        );
      }
    }

    return Math.min(
      140,
      bestScore +
      Math.min(12, Math.max(0, corroboratingEvidence.size - 1) * 4) +
        controlEvidenceBonus(definition, context)
    );
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

  const equivalentDefinitionGroups = [
    new Set(["location", "city", "homeCity"]),
    new Set(["country", "homeCountry"])
  ];

  function equivalentValueFingerprint(group, value) {
    const normalized = normalizeText(value);
    if (!normalized) {
      return "";
    }
    if (group.has("location")) {
      return normalizeText(String(value).split(",")[0]);
    }
    return normalized;
  }

  function equivalentCandidateMatch(analysis, profile) {
    if (
      analysis?.status !== "uncertain" ||
      !Array.isArray(analysis.candidates) ||
      analysis.candidates.length < 2
    ) {
      return null;
    }
    const best = analysis.candidates[0];
    if (!best || best.score < MINIMUM_SCORE) {
      return null;
    }
    const closeCandidates = analysis.candidates.filter(
      (candidate) => best.score - candidate.score < MINIMUM_MARGIN
    );
    const group = equivalentDefinitionGroups.find((candidateGroup) =>
      closeCandidates.every((candidate) =>
        candidateGroup.has(candidate.definition.key)
      )
    );
    if (!group) {
      return null;
    }
    const fingerprints = closeCandidates.map((candidate) =>
      equivalentValueFingerprint(group, profile?.[candidate.definition.key])
    );
    if (
      fingerprints.some((value) => !value) ||
      new Set(fingerprints).size !== 1
    ) {
      return null;
    }
    return best;
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

    if (fieldKey === "raceEthnicity") {
      const race = canonicalRaceChoice(normalized);
      if (race) {
        return race;
      }
    }
    if (fieldKey === "veteranStatus") {
      const veteran = canonicalVeteranChoice(normalized);
      if (veteran) {
        return veteran;
      }
    }
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

  function canonicalAlias(value, allowedCanonicals) {
    for (const [canonical, aliases] of Object.entries(choiceAliases)) {
      if (
        allowedCanonicals.has(canonical) &&
        (canonical === value || aliases.includes(value))
      ) {
        return canonical;
      }
    }
    return "";
  }

  const raceChoiceCanonicals = new Set([
    "american indian or alaska native",
    "asian",
    "black or african american",
    "hispanic or latino",
    "middle eastern or north african",
    "native hawaiian or other pacific islander",
    "other",
    "prefer not to answer",
    "two or more races",
    "white"
  ]);
  const veteranChoiceCanonicals = new Set([
    "not a protected veteran",
    "not a veteran",
    "prefer not to answer",
    "protected veteran"
  ]);

  function isDeclineChoice(normalized) {
    return (
      /\bdeclin(?:e|ed|ing)\b.{0,40}\b(?:answer|disclos|identif)/.test(
        normalized
      ) ||
      /\b(?:choose|prefer|wish) not to\b.{0,36}\b(?:answer|disclos|identif)/.test(
        normalized
      ) ||
      /\b(?:do not|don t) (?:wish|want|choose|prefer) to\b.{0,36}\b(?:answer|disclos|identif)/.test(
        normalized
      )
    );
  }

  function canonicalRaceChoice(normalized) {
    if (!normalized) {
      return "";
    }
    if (isDeclineChoice(normalized)) {
      return "prefer not to answer";
    }
    const withoutQualifier = normalized
      .replace(
        /\b(?:not|non) hispanic (?:or )?latino\b|\bnot of hispanic or latino (?:origin|descent)\b/g,
        ""
      )
      .replace(
        /^(?:i (?:(?:choose to )?self identify as|identify as|am)|my (?:race|race ethnicity|ethnicity) is) /,
        ""
      )
      .replace(/\ball races\b$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const direct = canonicalAlias(withoutQualifier, raceChoiceCanonicals);
    if (direct) {
      return direct;
    }
    if (
      /\b(?:multiracial|multi racial|multiple races|two or more races)\b/.test(
        withoutQualifier
      )
    ) {
      return "two or more races";
    }
    if (
      /^(?:other(?: please specify)?|other self describe|self describe|another race(?: or ethnicity)?|not listed(?: above)?)$/.test(
        withoutQualifier
      )
    ) {
      return "other";
    }
    return "";
  }

  function canonicalVeteranChoice(normalized) {
    if (!normalized) {
      return "";
    }
    if (
      /\b(?:not sure|unsure|uncertain|unknown|do not know|don t know)\b/.test(
        normalized
      )
    ) {
      return "";
    }
    if (isDeclineChoice(normalized)) {
      return "prefer not to answer";
    }
    const direct = canonicalAlias(normalized, veteranChoiceCanonicals);
    if (direct) {
      return direct;
    }
    if (/\bnot (?:a )?protected veteran\b/.test(normalized)) {
      return "not a protected veteran";
    }
    if (/\bnot (?:a )?veteran\b/.test(normalized)) {
      return "not a veteran";
    }
    if (
      /^(?:yes )?(?:i (?:am|identify as|choose to self identify as) )?(?:a |one or more (?:of the )?classifications of (?:a )?)?protected veteran(?: listed above)?$/.test(
        normalized
      )
    ) {
      return "protected veteran";
    }
    return "";
  }

  function normalizeCity(value) {
    return normalizeText(value)
      .replace(/^(?:city of|greater) /, "")
      .replace(
        / (?:city|office|metro area|metropolitan area|greater area|bay area)$/,
        ""
      )
      .trim();
  }

  function canonicalRegion(value) {
    const canonical = canonicalChoice(value, "region");
    return locationRegionKeys.has(canonical) ? canonical : "";
  }

  function stripCountrySuffix(value) {
    let normalized = normalizeText(value);
    for (const country of [...locationCountries].sort(
      (left, right) => right.length - left.length
    )) {
      if (normalized === country) {
        return "";
      }
      if (normalized.endsWith(` ${country}`)) {
        normalized = normalized.slice(0, -(country.length + 1)).trim();
        break;
      }
    }
    return normalized;
  }

  function hasLocationCountry(value) {
    const normalized = normalizeText(value);
    return [...locationCountries].some(
      (country) =>
        normalized === country || normalized.endsWith(` ${country}`)
    );
  }

  function locationCountry(value) {
    const normalized = normalizeText(value);
    const matched = [...locationCountries]
      .sort((left, right) => right.length - left.length)
      .find(
        (country) =>
          normalized === country || normalized.endsWith(` ${country}`)
      );
    if (!matched) {
      return "";
    }
    return canonicalChoice(matched, "country");
  }

  function locationIdentity(value) {
    let country = locationCountry(value);
    const rawParts = String(value || "")
      .split(/[,|/]+/)
      .map((part) => stripCountrySuffix(part))
      .filter(Boolean);
    if (!rawParts.length) {
      return { city: "", region: "", country };
    }

    let city = normalizeCity(rawParts[0]);
    let region = rawParts.length > 1 ? canonicalRegion(rawParts[1]) : "";
    if (!region && rawParts.length === 1) {
      const normalized = stripCountrySuffix(rawParts[0]);
      const regionAliases = Object.entries(choiceAliases)
        .filter(([canonical]) => locationRegionKeys.has(canonical))
        .flatMap(([canonical, aliases]) =>
          aliases.map((alias) => ({ alias: normalizeText(alias), canonical }))
        )
        .sort((left, right) => right.alias.length - left.alias.length);
      const suffix = regionAliases.find(
        ({ alias }) =>
          normalized.endsWith(` ${alias}`) &&
          normalized.length > alias.length + 1
      );
      if (suffix) {
        city = normalizeCity(
          normalized.slice(0, -(suffix.alias.length + 1))
        );
        region = suffix.canonical;
      }
    }
    if (!country && region) {
      country = canadianRegionKeys.has(region) ? "canada" : "united states";
    }
    if (!country && rawParts.length > 1) {
      const possibleCountry = normalizeText(rawParts.at(-1));
      if (
        possibleCountry &&
        !canonicalRegion(possibleCountry)
      ) {
        country = possibleCountry;
      }
    }
    return { city, region, country };
  }

  function isRemoteLocation(value) {
    return /\b(?:remote|work from home|anywhere)\b/.test(normalizeText(value));
  }

  function isNegatedRemoteLocation(value) {
    return /\b(?:not|non) remote\b|\bno remote(?: work)?\b|\bremote(?: work)? (?:is )?(?:unavailable|unsupported|prohibited|disallowed|(?:not|never) (?:available|possible|supported|offered|allowed|permitted|an option))\b/.test(
      normalizeText(value)
    );
  }

  function scoreRemoteOfficePreference(savedValue, optionValue, optionLabel) {
    const savedRemote =
      isRemoteLocation(savedValue) && !isNegatedRemoteLocation(savedValue);
    const normalizedLabel = normalizeText(optionLabel);
    const optionRemote =
      (isRemoteLocation(normalizedLabel) &&
        !isNegatedRemoteLocation(normalizedLabel)) ||
      (!normalizedLabel &&
        isRemoteLocation(optionValue) &&
        !isNegatedRemoteLocation(optionValue));
    if (!savedRemote && !optionRemote) {
      return null;
    }
    return savedRemote && optionRemote ? 100 : 0;
  }

  function scoreLocationChoice(savedValue, optionValue, optionLabel) {
    const saved = locationIdentity(savedValue);
    if (!saved.city || isRemoteLocation(optionLabel)) {
      return 0;
    }
    return Math.max(
      ...[optionValue, optionLabel].map((candidate) => {
        const option = locationIdentity(candidate);
        if (!option.city || option.city !== saved.city) {
          return 0;
        }
        if (
          saved.region &&
          option.region &&
          option.region !== saved.region
        ) {
          return 0;
        }
        if (
          saved.country &&
          option.country &&
          option.country !== saved.country
        ) {
          return 0;
        }
        return saved.region && option.region ? 100 : 94;
      })
    );
  }

  function hasLocationRegionConflict(savedValue, optionValue, optionLabel) {
    const saved = locationIdentity(savedValue);
    if (!saved.city || (!saved.region && !saved.country)) {
      return false;
    }
    const conflicts = (candidate) => {
      const option = locationIdentity(candidate);
      return (
        option.city &&
        option.city === saved.city &&
        ((option.region &&
          saved.region &&
          option.region !== saved.region) ||
          (option.country &&
            saved.country &&
            option.country !== saved.country))
      );
    };
    const label = locationIdentity(optionLabel);
    if (label.city && (label.region || hasLocationCountry(optionLabel))) {
      return conflicts(optionLabel);
    }
    return conflicts(optionLabel) || conflicts(optionValue);
  }

  function scoreChoice(savedValue, optionValue, optionLabel, fieldKey) {
    if (["city", "location", "preferredOfficeLocations"].includes(fieldKey)) {
      if (fieldKey === "preferredOfficeLocations") {
        const remoteScore = scoreRemoteOfficePreference(
          savedValue,
          optionValue,
          optionLabel
        );
        if (remoteScore !== null) {
          return remoteScore;
        }
      }
      if (hasLocationRegionConflict(savedValue, optionValue, optionLabel)) {
        return 0;
      }
      return scoreLocationChoice(savedValue, optionValue, optionLabel);
    }
    const saved = canonicalChoice(savedValue, fieldKey);
    const value = canonicalChoice(optionValue, fieldKey);
    const label = canonicalChoice(optionLabel, fieldKey);

    if (!saved) {
      return 0;
    }
    if (
      fieldKey === "raceEthnicity" &&
      saved === "hispanic or latino" &&
      [optionValue, optionLabel].some((candidate) =>
        /\b(?:not|non) hispanic (?:or )?latino\b/.test(normalizeText(candidate))
      )
    ) {
      return 0;
    }
    if (
      fieldKey === "veteranStatus" &&
      ((saved === "protected veteran" &&
        [value, label].some((candidate) =>
          ["not a protected veteran", "not a veteran"].includes(candidate)
        )) ||
        (["not a protected veteran", "not a veteran"].includes(saved) &&
          [value, label].includes("protected veteran")) ||
        (saved === "not a veteran" &&
          [value, label].includes("not a protected veteran")))
    ) {
      return 0;
    }
    if (consequentialChoiceFieldKeys.has(fieldKey)) {
      const allowed =
        fieldKey === "raceEthnicity"
          ? raceChoiceCanonicals
          : veteranChoiceCanonicals;
      const canonicalCandidates = [value, label].filter((candidate) =>
        allowed.has(candidate)
      );
      if (!allowed.has(saved) || !canonicalCandidates.length) {
        return 0;
      }
      return canonicalCandidates.includes(saved) ? 100 : 0;
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

  function choiceSearchQueries(savedValue, fieldKey) {
    const value = String(savedValue || "").trim();
    if (!value) {
      return [];
    }
    if (!["city", "location"].includes(fieldKey)) {
      return [value];
    }
    const city = String(value)
      .split(/[,|/]+/)[0]
      .trim()
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s+city$/i, "")
      .trim();
    return Array.from(
      new Map(
        [value, city]
          .filter(Boolean)
          .map((candidate) => [normalizeText(candidate), candidate])
      ).values()
    );
  }

  function contextualLocationChoice(savedValue, countryValue) {
    const value = String(savedValue || "").trim();
    if (!value) {
      return "";
    }
    const country = canonicalChoice(countryValue, "country");
    if (!country) {
      return value;
    }
    const savedCountry = locationIdentity(value).country;
    if (savedCountry) {
      return savedCountry === country ? value : null;
    }
    return `${value}, ${String(countryValue || "").trim()}`;
  }

  function requiresExplicitChoice(fieldKey) {
    return consequentialChoiceFieldKeys.has(fieldKey);
  }

  function scoreSafeFallback(fieldKey, optionValue, optionLabel) {
    if (!safeFallbackFieldKeys.has(fieldKey)) {
      return 0;
    }
    const candidates = [optionValue, optionLabel].map(normalizeText);
    if (
      candidates.some((candidate) =>
        /^(?:not listed|not listed above|not listed here|none of the above)$/.test(
          candidate
        )
      )
    ) {
      return 100;
    }
    if (
      candidates.some((candidate) =>
        /^(?:other|other please specify|other not listed)$/.test(candidate)
      )
    ) {
      return 94;
    }
    return 0;
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
    equivalentCandidateMatch,
    resolveEligibilityAnswer,
    resolvePreviousEmployerAnswer,
    canonicalChoice,
    choiceSearchQueries,
    contextualLocationChoice,
    requiresExplicitChoice,
    scoreChoice,
    scoreSafeFallback
  });

  root.JobAutofillMatcher = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
