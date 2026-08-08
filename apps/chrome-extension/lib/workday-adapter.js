(function registerWorkdayAdapter(root) {
  const HOST_SUFFIXES = [".myworkdayjobs.com", ".myworkdaysite.com"];
  const candidateSelector = [
    "[data-automation-id='multiselectInputContainer'][role='combobox']",
    "[data-automation-id='promptIcon'][role='combobox']"
  ].join(",");
  const optionSelector = [
    "[data-automation-id='promptOption']",
    "[data-automation-id='promptOption'] [role='option']",
    "[data-automation-id*='selectOption']"
  ].join(",");
  const scopedAddAutomationIds = Object.freeze([
    "add-another-button",
    "add-button",
    "Add Another"
  ]);
  const whiteLabelMarkerGroups = [
    [
      "[data-automation-id='candidateHome']",
      "[data-automation-id='applicationPage']",
      "[data-automation-id='applyFlowPage']",
      "[data-automation-id='jobPostingPage']"
    ],
    [
      "[data-automation-id='applicationHeader']",
      "[data-automation-id='progressBar']",
      "[data-automation-id='jobPostingHeader']"
    ],
    [
      "[data-uxi-widget-type]",
      "[data-uxi-element-id*='candidateExperience' i]"
    ]
  ];
  const pageRules = [
    {
      key: "account",
      label: "Account",
      scanOnly: true,
      selectors: [
        "[data-automation-id='createAccount']",
        "[data-automation-id='signInContent']",
        "[data-automation-id='accountCreationPage']"
      ]
    },
    {
      key: "review",
      label: "Review",
      scanOnly: true,
      selectors: [
        "[data-automation-id='reviewPage']",
        "[data-automation-id='reviewApplication']",
        "[data-automation-id='applicationReview']"
      ]
    },
    {
      key: "self-identification",
      label: "Voluntary self-identification",
      selectors: [
        "[data-automation-id='selfIdentificationPage']",
        "[data-automation-id='voluntaryDisclosures']",
        "[data-automation-id='disabilityPage']"
      ]
    },
    {
      key: "experience",
      label: "Experience and education",
      selectors: [
        "[data-automation-id='workExperienceSection']",
        "[data-automation-id='educationSection']",
        "[data-automation-id='languageSection']",
        "[data-automation-id='certificationSection']"
      ]
    },
    {
      key: "resume",
      label: "Resume or CV",
      selectors: [
        "[data-automation-id='resumePage']",
        "[data-automation-id='resumeUpload']",
        "[data-automation-id='file-upload-input-ref']"
      ]
    },
    {
      key: "contact",
      label: "Contact information",
      selectors: [
        "[data-automation-id='contactInformationPage']",
        "[data-automation-id='personalInformationPage']",
        "[data-automation-id='legalNameSection']",
        "[data-automation-id='addressSection']"
      ]
    },
    {
      key: "questionnaire",
      label: "Application questions",
      selectors: [
        "[data-automation-id='questionnairePage']",
        "[data-automation-id='primaryQuestionnaire']",
        "[data-automation-id='jobApplicationQuestions']"
      ]
    }
  ];

  const scalarAutomationFields = Object.freeze({
    legalnamesectionfirstname: "firstName",
    legalnamesectionmiddlename: "middleName",
    legalnamesectionlastname: "lastName",
    legalnamesectionsocial: "nameSuffix",
    legalnamesectionsuffix: "nameSuffix",
    firstname: "firstName",
    middlename: "middleName",
    lastname: "lastName",
    email: "email",
    emailaddress: "email",
    phonecountrycode: "phoneCountryCode",
    countryphonecode: "phoneCountryCode",
    phonenumber: "phoneNational",
    phonedevicetype: "phoneType",
    phoneextension: "phoneExtension",
    addresssectionaddressline1: "homeAddressLine1",
    addresssectionaddressline2: "homeAddressLine2",
    addresssectioncity: "homeCity",
    addresssectioncountryregion: "homeCountry",
    addresssectioncountryregionsubdivision1: "homeRegion",
    addresssectionpostalcode: "homePostalCode",
    addressline1: "homeAddressLine1",
    addressline2: "homeAddressLine2",
    postalcode: "homePostalCode",
    resumeupload: "resumeFile",
    fileuploadinputref: "resumeFile"
  });

  const repeatConfigs = Object.freeze({
    workExperiences: {
      addAutomationIds: ["addWorkExperience", "addAnotherWorkExperience"],
      scopedAddAutomationIds,
      sectionAutomationIds: ["workExperienceSection"],
      itemAutomationSelectors: [
        "[data-automation-id^='workExperience-']",
        "[data-automation-id^='workExperience_']",
        "[data-automation-id^='workExperienceSection-']",
        "[data-automation-id='workExperience']"
      ],
      itemAutomationPattern:
        /^(?:workExperience|workExperienceSection)(?:[-_]\d+)?$/i,
      fields: [
        ["workExperienceTitle", /(?:job|position|work)title$/],
        ["workExperienceCompany", /(?:company|employer)(?:name)?$/],
        ["workExperienceLocation", /(?:work)?location$/],
        ["workExperienceStartMonth", /start(?:date)?month$/],
        ["workExperienceStartYear", /start(?:date)?year$/],
        ["workExperienceStartDate", /startdate$/],
        ["workExperienceEndMonth", /end(?:date)?month$/],
        ["workExperienceEndYear", /end(?:date)?year$/],
        ["workExperienceEndDate", /enddate$/],
        ["workExperienceCurrentRole", /(?:currentlyworkhere|currentrole)$/],
        ["workExperienceDescription", /(?:description|responsibilities)$/]
      ]
    },
    educationEntries: {
      addAutomationIds: ["addEducation", "addAnotherEducation"],
      scopedAddAutomationIds,
      sectionAutomationIds: ["educationSection"],
      itemAutomationSelectors: [
        "[data-automation-id^='education-']",
        "[data-automation-id^='education_']",
        "[data-automation-id^='educationSection-']",
        "[data-automation-id='education']"
      ],
      itemAutomationPattern:
        /^(?:education|educationSection)(?:[-_]\d+)?$/i,
      fields: [
        ["educationSchool", /(?:school|institution)(?:name)?$/],
        ["educationDegreeOther", /(?:otherdegree|degreeother)$/],
        ["educationDegree", /degree$/],
        ["educationField", /(?:fieldofstudy|studyfield)$/],
        ["educationStartMonth", /start(?:date)?month$/],
        ["educationStartYear", /start(?:date)?year$/],
        ["educationStartDate", /startdate$/],
        ["educationEndMonth", /end(?:date)?month$/],
        ["educationEndYear", /end(?:date)?year$/],
        ["educationEndDate", /enddate$/],
        ["educationGpa", /(?:gpa|gradepointaverage)$/]
      ]
    },
    credentialEntries: {
      addAutomationIds: ["addCertification", "addAnotherCertification"],
      scopedAddAutomationIds,
      sectionAutomationIds: ["certificationSection"],
      itemAutomationSelectors: [
        "[data-automation-id^='certification-']",
        "[data-automation-id^='certificationSection-']",
        "[data-automation-id^='credential-']",
        "[data-automation-id^='license-']",
        "[data-automation-id='certification']"
      ],
      itemAutomationPattern:
        /^(?:certification|certificationSection|credential|license)(?:[-_]\d+)?$/i,
      fields: [
        ["credentialName", /(?:certification|credential|license)name$/],
        ["credentialIssuer", /(?:issuer|issuingorganization)$/],
        ["credentialNumber", /(?:credential|license)(?:id|number)$/],
        ["credentialIssueMonth", /issue(?:date)?month$/],
        ["credentialIssueYear", /issue(?:date)?year$/],
        ["credentialIssueDate", /issuedate$/],
        ["credentialExpirationMonth", /expir(?:ation|y)(?:date)?month$/],
        ["credentialExpirationYear", /expir(?:ation|y)(?:date)?year$/],
        ["credentialExpirationDate", /expir(?:ation|y)date$/],
        ["credentialDoesNotExpire", /(?:doesnotexpire|noexpiration)$/]
      ]
    },
    languages: {
      addAutomationIds: ["addLanguage", "addAnotherLanguage"],
      scopedAddAutomationIds,
      sectionAutomationIds: ["languageSection"],
      itemAutomationSelectors: [
        "[data-automation-id^='language-']",
        "[data-automation-id^='language_']",
        "[data-automation-id^='languageSection-']",
        "[data-automation-id='languageEntry']"
      ],
      itemAutomationPattern:
        /^(?:language|languageSection)(?:[-_]\d+)$|^languageEntry$/i,
      fields: [
        ["languageName", /(?:language|languagename)$/],
        ["languageProficiency", /(?:overall)?proficiency$/],
        ["languageSpeaking", /speaking(?:proficiency)?$/],
        ["languageReading", /reading(?:proficiency)?$/],
        ["languageWriting", /writing(?:proficiency)?$/]
      ]
    },
    additionalWebsites: {
      addAutomationIds: ["addWebsite", "addAnotherWebsite"],
      scopedAddAutomationIds,
      sectionAutomationIds: ["websiteSection", "socialNetworkSection"],
      itemAutomationSelectors: [
        "[data-automation-id^='website-']",
        "[data-automation-id^='website_']",
        "[data-automation-id^='websitePanelSet-']",
        "[data-automation-id^='websiteSection-']",
        "[data-automation-id^='socialNetwork-']"
      ],
      itemAutomationPattern:
        /^(?:website|websitePanelSet|websiteSection|socialNetwork)(?:[-_]\d+)$/i,
      fields: [
        ["websiteLabel", /(?:website|social)(?:type|label)$/],
        ["websiteUrl", /(?:website|social|link)(?:url)?$/]
      ]
    }
  });

  const structuredDefinitions = Object.freeze([
    ["workExperienceCompany", "Employer", "text"],
    ["workExperienceTitle", "Job title", "text"],
    ["workExperienceLocation", "Work location", "text"],
    ["workExperienceStartDate", "Work start date", "date"],
    ["workExperienceStartMonth", "Work start month", "choice"],
    ["workExperienceStartYear", "Work start year", "choice"],
    ["workExperienceEndDate", "Work end date", "date"],
    ["workExperienceEndMonth", "Work end month", "choice"],
    ["workExperienceEndYear", "Work end year", "choice"],
    ["workExperienceCurrentRole", "Current role", "choice"],
    ["workExperienceDescription", "Role description", "textarea"],
    ["educationSchool", "School", "text"],
    ["educationDegree", "Degree", "choice"],
    ["educationDegreeOther", "Other degree", "text"],
    ["educationField", "Field of study", "text"],
    ["educationStartDate", "Education start date", "date"],
    ["educationStartMonth", "Education start month", "choice"],
    ["educationStartYear", "Education start year", "choice"],
    ["educationEndDate", "Education end date", "date"],
    ["educationEndMonth", "Education end month", "choice"],
    ["educationEndYear", "Education end year", "choice"],
    ["educationGpa", "Education GPA", "text"],
    ["credentialName", "Credential name", "text"],
    ["credentialIssuer", "Credential issuer", "text"],
    ["credentialNumber", "Credential number", "text"],
    ["credentialIssueDate", "Credential issue date", "date"],
    ["credentialIssueMonth", "Credential issue month", "choice"],
    ["credentialIssueYear", "Credential issue year", "choice"],
    ["credentialExpirationDate", "Credential expiration date", "date"],
    ["credentialExpirationMonth", "Credential expiration month", "choice"],
    ["credentialExpirationYear", "Credential expiration year", "choice"],
    ["credentialDoesNotExpire", "Credential does not expire", "choice"],
    ["languageName", "Language", "choice"],
    ["languageProficiency", "Language proficiency", "choice"],
    ["languageSpeaking", "Speaking proficiency", "choice"],
    ["languageReading", "Reading proficiency", "choice"],
    ["languageWriting", "Writing proficiency", "choice"],
    ["websiteLabel", "Website type", "choice"],
    ["websiteUrl", "Website URL", "text"]
  ].map(([key, label, input]) => ({
    key,
    label,
    group: "workday",
    stored: false,
    input,
    aliases: [`workday field ${key}`],
    controls:
      input === "choice"
        ? ["text", "choice", "select", "combobox"]
        : input === "textarea"
          ? ["text", "textarea"]
          : ["text", "date", "select", "combobox"]
  })));

  const structuredValueRules = Object.freeze({
    workExperienceCompany: ["workExperiences", "company"],
    workExperienceTitle: ["workExperiences", "title"],
    workExperienceLocation: ["workExperiences", "location"],
    workExperienceStartDate: ["workExperiences", "startDate", "date"],
    workExperienceStartMonth: ["workExperiences", "startDate", "month"],
    workExperienceStartYear: ["workExperiences", "startDate", "year"],
    workExperienceEndDate: ["workExperiences", "endDate", "date"],
    workExperienceEndMonth: ["workExperiences", "endDate", "month"],
    workExperienceEndYear: ["workExperiences", "endDate", "year"],
    workExperienceCurrentRole: ["workExperiences", "currentRole", "checked"],
    workExperienceDescription: ["workExperiences", "description"],
    educationSchool: ["educationEntries", "school"],
    educationDegree: ["educationEntries", "degree"],
    educationDegreeOther: ["educationEntries", "degreeOther"],
    educationField: ["educationEntries", "fieldOfStudy"],
    educationStartDate: ["educationEntries", "startDate", "date"],
    educationStartMonth: ["educationEntries", "startDate", "month"],
    educationStartYear: ["educationEntries", "startDate", "year"],
    educationEndDate: ["educationEntries", "graduationDate", "date"],
    educationEndMonth: ["educationEntries", "graduationDate", "month"],
    educationEndYear: ["educationEntries", "graduationDate", "year"],
    educationGpa: ["educationEntries", "gpa"],
    credentialName: ["credentialEntries", "name"],
    credentialIssuer: ["credentialEntries", "issuer"],
    credentialNumber: ["credentialEntries", "credentialId"],
    credentialIssueDate: ["credentialEntries", "issueDate", "date"],
    credentialIssueMonth: ["credentialEntries", "issueDate", "month"],
    credentialIssueYear: ["credentialEntries", "issueDate", "year"],
    credentialExpirationDate: ["credentialEntries", "expirationDate", "date"],
    credentialExpirationMonth: ["credentialEntries", "expirationDate", "month"],
    credentialExpirationYear: ["credentialEntries", "expirationDate", "year"],
    credentialDoesNotExpire: ["credentialEntries", "doesNotExpire", "checked"],
    languageName: ["languages", "language"],
    languageProficiency: ["languages", "overallProficiency"],
    languageSpeaking: ["languages", "speakingProficiency"],
    languageReading: ["languages", "readingProficiency"],
    languageWriting: ["languages", "writingProficiency"],
    websiteLabel: ["additionalWebsites", "label"],
    websiteUrl: ["additionalWebsites", "url"]
  });

  function hostnameOf(value) {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function isKnownHost(value) {
    const hostname = hostnameOf(value);
    return Boolean(
      hostname &&
        HOST_SUFFIXES.some(
          (suffix) =>
            hostname === suffix.slice(1) || hostname.endsWith(suffix)
        )
    );
  }

  function query(documentLike, selector) {
    try {
      return documentLike?.querySelector?.(selector) || null;
    } catch {
      return null;
    }
  }

  function markerIsVisible(candidate) {
    if (
      !candidate ||
      candidate.hidden ||
      candidate.getAttribute?.("aria-hidden") === "true" ||
      candidate.closest?.("[hidden], [aria-hidden='true']")
    ) {
      return false;
    }
    const view = candidate.ownerDocument?.defaultView;
    const style = view?.getComputedStyle?.(candidate);
    return !style || (style.display !== "none" && style.visibility !== "hidden");
  }

  function visibleMarker(documentLike, selector) {
    try {
      const candidates = documentLike?.querySelectorAll
        ? Array.from(documentLike.querySelectorAll(selector))
        : [query(documentLike, selector)].filter(Boolean);
      return candidates.find(markerIsVisible) || null;
    } catch {
      return null;
    }
  }

  function hasWhiteLabelMarkers(documentLike) {
    return (
      whiteLabelMarkerGroups.filter((selectors) =>
        selectors.some((selector) => visibleMarker(documentLike, selector))
      ).length >= 2
    );
  }

  function detect(url, documentLike) {
    return isKnownHost(url) || hasWhiteLabelMarkers(documentLike);
  }

  function pageInfo(documentLike) {
    for (const rule of pageRules) {
      if (
        rule.selectors.some((selector) =>
          visibleMarker(documentLike, selector)
        )
      ) {
        return { key: rule.key, label: rule.label, scanOnly: rule.scanOnly === true };
      }
    }
    return { key: "application", label: "Application", scanOnly: false };
  }

  function normalizeToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function automationTokens(element) {
    const tokens = [];
    let candidate = element;
    for (let depth = 0; candidate && depth < 8; depth += 1) {
      for (const attribute of [
        "data-automation-id",
        "data-uxi-element-id",
        "data-workday-field"
      ]) {
        const token = normalizeToken(candidate.getAttribute?.(attribute));
        if (token && !tokens.includes(token)) tokens.push(token);
      }
      candidate = candidate.parentElement;
    }
    return tokens;
  }

  function collectionFor(element, tokens) {
    const explicit = element.closest?.("[data-workday-collection]")?.getAttribute?.(
      "data-workday-collection"
    );
    if (repeatConfigs[explicit]) return explicit;
    const joined = tokens.join(" ");
    if (/workexperience|employmenthistory/.test(joined)) return "workExperiences";
    if (/education/.test(joined)) return "educationEntries";
    if (/certification|credential|license/.test(joined)) return "credentialEntries";
    if (/language/.test(joined)) return "languages";
    if (/website|socialnetwork|sociallink/.test(joined)) return "additionalWebsites";
    return "";
  }

  function repeatIndex(element, collection) {
    const config = repeatConfigs[collection];
    let item = element.closest?.(
      `[data-workday-collection="${collection}"], [data-workday-index]`
    );
    if (!item) {
      let candidate = element;
      for (let depth = 0; candidate && depth < 12; depth += 1) {
        const automationId = candidate.getAttribute?.("data-automation-id");
        if (config?.itemAutomationPattern?.test(String(automationId || ""))) {
          item = candidate;
          break;
        }
        candidate = candidate.parentElement;
      }
    }
    const explicitIndexValue = item?.getAttribute?.("data-workday-index");
    const explicitIndex =
      explicitIndexValue == null ? Number.NaN : Number(explicitIndexValue);
    if (Number.isInteger(explicitIndex) && explicitIndex >= 0) {
      return explicitIndex;
    }
    if (item?.parentElement) {
      const syntheticItem =
        item.getAttribute?.("data-workday-collection") === collection;
      const itemSelector = syntheticItem
        ? `[data-workday-collection="${collection}"]`
        : (config?.itemAutomationSelectors || []).join(",");
      const siblings = Array.from(
        item.parentElement.querySelectorAll?.(itemSelector) || []
      ).filter((candidate) =>
        syntheticItem
          ? true
          : config.itemAutomationPattern.test(
              String(candidate.getAttribute?.("data-automation-id") || "")
            )
      );
      const index = siblings.indexOf(item);
      if (index >= 0) return index;
    }
    const numberedId = String(
      item?.getAttribute?.("data-automation-id") || ""
    ).match(/[-_](\d+)$/);
    return numberedId ? Math.max(0, Number(numberedId[1]) - 1) : 0;
  }

  function splitDateDetails(collection, tokens) {
    const datePartToken = tokens.find((token) =>
      /^datesection(?:month|year)input$/.test(token)
    );
    if (!datePartToken) return null;
    const part = datePartToken.includes("month") ? "Month" : "Year";
    const contextToken = tokens.find((token) =>
      /(?:start|from|end|to|issue|issued|expiration|expiry)date$/.test(token)
    );
    if (!contextToken) return null;
    const context = /(?:start|from)date$/.test(contextToken)
      ? "Start"
      : /(?:end|to)date$/.test(contextToken)
        ? "End"
        : /(?:issue|issued)date$/.test(contextToken)
          ? "Issue"
          : "Expiration";
    const fieldPrefixes = {
      workExperiences: "workExperience",
      educationEntries: "education",
      credentialEntries: "credential"
    };
    const prefix = fieldPrefixes[collection];
    if (!prefix || (prefix !== "credential" && !["Start", "End"].includes(context))) {
      return null;
    }
    if (
      prefix === "credential" &&
      !["Issue", "Expiration"].includes(context)
    ) {
      return null;
    }
    return {
      fieldKey: `${prefix}${context}${part}`,
      datePartFormat: part === "Month" ? "numeric-month" : "year"
    };
  }

  function questionDetails(element) {
    const tokens = automationTokens(element);
    const collection = collectionFor(element, tokens);
    const splitDate = splitDateDetails(collection, tokens);
    let fieldKey = splitDate?.fieldKey || "";
    if (collection) {
      const config = repeatConfigs[collection];
      if (!fieldKey) {
        for (const token of tokens) {
          const field = config.fields.find(([, pattern]) => pattern.test(token));
          if (field) {
            fieldKey = field[0];
            break;
          }
        }
      }
    } else {
      for (const token of tokens) {
        if (scalarAutomationFields[token]) {
          fieldKey = scalarAutomationFields[token];
          break;
        }
      }
    }
    return {
      collection,
      fieldKey,
      index: collection ? repeatIndex(element, collection) : 0,
      datePartFormat: splitDate?.datePartFormat || "",
      signals: fieldKey
        ? [{ text: `workday field ${fieldKey}`, weight: 1.2, source: "platform" }]
        : []
    };
  }

  function augmentDefinitions(definitions) {
    const scalarKeys = new Set(Object.values(scalarAutomationFields));
    return [
      ...definitions.map((definition) =>
        scalarKeys.has(definition.key)
          ? {
              ...definition,
              aliases: [
                ...(definition.aliases || []),
                `workday field ${definition.key}`
              ]
            }
          : definition
      ),
      ...structuredDefinitions
    ];
  }

  function monthPart(value) {
    const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return { date: "", month: "", monthNumber: "", year: "" };
    const month = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ][Number(match[2]) - 1];
    return {
      date: match[0],
      month,
      monthNumber: match[2],
      year: match[1]
    };
  }

  function resolveValue(definitionKey, profile, details, inputType) {
    const rule = structuredValueRules[definitionKey];
    if (!rule) return null;
    const [collection, property, format] = rule;
    const entries = Array.isArray(profile[collection]) ? profile[collection] : [];
    const entry = details?.collection === collection ? entries[details.index] : null;
    let value = entry?.[property];
    if (format === "checked") {
      value = value === true || value === "yes" ? "yes" : "";
    } else if (format) {
      const parts = monthPart(value);
      value =
        format === "month" && details?.datePartFormat === "numeric-month"
          ? parts.monthNumber
          : inputType === "month" && format === "date"
            ? parts.date
            : parts[format];
    }
    const normalizedValue = String(value || "").trim();
    return {
      value: normalizedValue,
      safe: true,
      available: Boolean(normalizedValue),
      availabilityKey: collection
    };
  }

  function questionContainer(element) {
    return (
      element?.closest?.(
        "[data-automation-id='formField'], [data-automation-id='questionItem'], [data-automation-id='promptQuestion'], [data-workday-question]"
      ) || null
    );
  }

  function hasRequiredMetadata(element) {
    const container = questionContainer(element);
    const candidates = [element, container].filter(Boolean);
    return candidates.some((candidate) => {
      if (
        candidate.required ||
        candidate.getAttribute?.("aria-required") === "true" ||
        candidate.getAttribute?.("data-required") === "true"
      ) {
        return true;
      }
      return Boolean(
        query(candidate, "[data-automation-id='required']") ||
          query(candidate, "[data-automation-id='requiredIndicator']")
      );
    });
  }

  function shouldIgnoreElement(element) {
    return Boolean(
      element?.closest?.(
        "[data-automation-id*='captcha' i], [class*='captcha' i], [data-testid*='captcha' i]"
      )
    );
  }

  function allowsHiddenControl(element) {
    const automationId = normalizeToken(
      element?.getAttribute?.("data-automation-id")
    );
    if (
      String(element?.tagName || "").toUpperCase() !== "INPUT" ||
      String(element?.getAttribute?.("type") || "").toLowerCase() !== "file" ||
      !["fileuploadinputref", "resumeupload"].includes(automationId)
    ) {
      return false;
    }
    const matchedContainer = element.closest?.(
      "[data-automation-id='resumeUpload'], [data-automation-id='fileUpload'], [data-automation-id='fileUploadField'], [data-automation-id='formField']"
    );
    const container =
      matchedContainer && matchedContainer !== element
        ? matchedContainer
        : element.parentElement;
    return (
      markerIsVisible(container) &&
      (hasRequiredMetadata(element) || hasRequiredMetadata(container))
    );
  }

  function allowsSingleCheckbox(details, definitionKey, value) {
    return (
      value === "yes" &&
      details?.fieldKey === definitionKey &&
      ["workExperienceCurrentRole", "credentialDoesNotExpire"].includes(
        definitionKey
      )
    );
  }

  function exactAutomationSelector(values) {
    return values
      .map((value) => `[data-automation-id="${value}"]`)
      .join(",");
  }

  function repeatItems(documentLike, collection) {
    const config = repeatConfigs[collection];
    const synthetic = Array.from(
      documentLike?.querySelectorAll?.(
        `[data-workday-collection="${collection}"]`
      ) || []
    );
    const automated = Array.from(
      documentLike?.querySelectorAll?.(
        (config?.itemAutomationSelectors || []).join(",")
      ) || []
    ).filter((candidate) =>
      config.itemAutomationPattern.test(
        String(candidate.getAttribute?.("data-automation-id") || "")
      )
    );
    return Array.from(
      new Set([...synthetic, ...automated])
    );
  }

  function repeatSection(documentLike, config) {
    return config.sectionAutomationIds
      .map((id) => query(documentLike, `[data-automation-id="${id}"]`))
      .find(Boolean);
  }

  function repeatButton(documentLike, config) {
    const section = repeatSection(documentLike, config);
    const scopedButton = query(
      section,
      exactAutomationSelector([
        ...config.addAutomationIds,
        ...(config.scopedAddAutomationIds || [])
      ])
    );
    return (
      scopedButton ||
      query(documentLike, exactAutomationSelector(config.addAutomationIds))
    );
  }

  function requiredRepeatSection(documentLike, config, button) {
    const section =
      button?.closest?.("[data-workday-repeat-section]") ||
      repeatSection(documentLike, config);
    return Boolean(
      section &&
        (section.getAttribute?.("data-required") === "true" ||
          section.getAttribute?.("aria-required") === "true" ||
          query(section, "[required]") ||
          query(section, "[aria-required='true']") ||
          query(section, "[data-automation-id='required']"))
    );
  }

  async function prepareRepeatedSections({
    documentLike,
    profile,
    assertActive,
    wait
  }) {
    let added = 0;
    for (const [collection, config] of Object.entries(repeatConfigs)) {
      const entries = Array.isArray(profile[collection]) ? profile[collection] : [];
      if (!entries.length) continue;
      for (let attempts = 0; attempts < entries.length; attempts += 1) {
        assertActive();
        const count = repeatItems(documentLike, collection).length;
        if (count >= entries.length) break;
        const button = repeatButton(documentLike, config);
        if (
          !button ||
          button.disabled ||
          button.getAttribute?.("aria-disabled") === "true" ||
          !requiredRepeatSection(documentLike, config, button)
        ) {
          break;
        }
        button.click();
        added += 1;
        const deadline = Date.now() + 1_000;
        do {
          await wait(50);
          assertActive();
          if (repeatItems(documentLike, collection).length > count) break;
        } while (Date.now() < deadline);
        if (repeatItems(documentLike, collection).length <= count) break;
      }
    }
    return added;
  }

  const api = Object.freeze({
    key: "workday",
    label: "Workday",
    candidateSelector,
    optionSelector,
    detect,
    isKnownHost,
    pageInfo,
    questionDetails,
    augmentDefinitions,
    resolveValue,
    questionContainer,
    hasRequiredMetadata,
    shouldIgnoreElement,
    allowsHiddenControl,
    allowsSingleCheckbox,
    prepareRepeatedSections,
    observerOptions: Object.freeze({
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-expanded",
        "aria-hidden",
        "aria-required",
        "class",
        "data-automation-id",
        "data-required",
        "disabled",
        "required",
        "style"
      ]
    }),
    repeatConfigs,
    structuredDefinitions
  });

  root.JobAutofillWorkday = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
