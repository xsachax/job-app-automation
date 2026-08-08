(function registerAtsAdapter(root) {
  const platformRules = [
    {
      key: "greenhouse",
      label: "Greenhouse",
      hosts: ["boards.greenhouse.io", "job-boards.greenhouse.io", "grnhse.com"],
      markers: [
        "#application-form",
        "form[action*='greenhouse.io']",
        "[data-mapped='first_name']"
      ]
    },
    {
      key: "lever",
      label: "Lever",
      hosts: ["jobs.lever.co"],
      markers: [
        "form.application-form",
        ".application-page",
        "input[name='urls[LinkedIn]']"
      ]
    },
    {
      key: "ashby",
      label: "Ashby",
      hosts: ["jobs.ashbyhq.com"],
      markers: ["[class*='ashby']", "[data-testid*='application']"]
    },
    {
      key: "workday",
      label: "Workday",
      hostSuffixes: [".myworkdayjobs.com"],
      markers: ["[data-automation-id]", "[data-uxi-element-id]"]
    },
    {
      key: "smartrecruiters",
      label: "SmartRecruiters",
      hosts: ["jobs.smartrecruiters.com", "careers.smartrecruiters.com"],
      markers: ["[data-test*='application']", "[class*='smartrecruiters']"]
    },
    {
      key: "icims",
      label: "iCIMS",
      hostSuffixes: [".icims.com"],
      markers: ["[class*='iCIMS']", "[id*='icims']", "[data-icims]"]
    },
    {
      key: "oracle",
      label: "Oracle / Taleo",
      hostSuffixes: [".taleo.net", ".oraclecloud.com"],
      markers: [
        "[id*='CandidateExperience']",
        "[class*='candidate-experience']",
        "form[action*='taleo']"
      ]
    },
    {
      key: "successfactors",
      label: "SAP SuccessFactors",
      hostSuffixes: [".successfactors.com"],
      markers: ["[id*='careerSite']", "[class*='careerSite']"]
    }
  ];

  const metadataAttributes = [
    ["data-automation-id", 0.96],
    ["data-uxi-element-id", 0.94],
    ["data-field-name", 0.92],
    ["data-mapped", 0.92],
    ["data-qa", 0.9],
    ["data-test", 0.88],
    ["data-testid", 0.86],
    ["data-cy", 0.82],
    ["data-field", 0.82],
    ["data-name", 0.8]
  ];

  const requiredMetadataAttributes = [
    "data-required",
    "data-is-required",
    "data-mandatory",
    "data-field-required",
    "data-required-field"
  ];

  const requiredMarkerSelector = [
    "[data-automation-id='required' i]",
    "[data-automation-id='requiredIndicator' i]",
    "[data-uxi-element-id='required' i]",
    "[data-testid='required' i]",
    "[data-testid*='required-indicator' i]",
    "[data-test='required' i]",
    "[data-test*='required-indicator' i]",
    "[data-qa='required' i]",
    "[data-qa*='required-indicator' i]",
    "[aria-label='required' i]",
    "[title='required' i]",
    "[data-required='true' i]",
    "[data-is-required='true' i]",
    "[data-mandatory='true' i]",
    "[data-field-required='true' i]",
    "[data-required-field='true' i]"
  ].join(",");

  const candidateSelector = [
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='combobox']",
    "[role='radio']",
    "[role='checkbox']",
    "button[aria-haspopup='listbox']"
  ].join(",");

  const optionSelector = [
    "[role='option']",
    "[role='listbox'] li",
    "[data-automation-id='promptOption']",
    "[data-automation-id*='selectOption']",
    "[data-testid*='option']"
  ].join(",");

  const questionContainerSelector = [
    ".application-question",
    ".application-field",
    ".form-group",
    ".field",
    "[data-automation-id*='formField']",
    "[data-automation-id*='question']",
    "[data-testid*='field']",
    "[data-testid*='question']",
    "[data-test*='field']",
    "fieldset",
    "[role='radiogroup']",
    "[role='group']"
  ].join(",");

  function hostnameOf(value) {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function hostMatches(hostname, rule) {
    return (
      (rule.hosts || []).includes(hostname) ||
      (rule.hostSuffixes || []).some(
        (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix)
      )
    );
  }

  function markerMatches(documentLike, rule) {
    if (!documentLike?.querySelector) {
      return false;
    }
    return (rule.markers || []).some((selector) => {
      try {
        return Boolean(documentLike.querySelector(selector));
      } catch {
        return false;
      }
    });
  }

  function detectPlatform(url, documentLike) {
    const hostname = hostnameOf(url);
    const rule =
      platformRules.find((candidate) => hostMatches(hostname, candidate)) ||
      platformRules.find((candidate) => markerMatches(documentLike, candidate));
    return rule
      ? { key: rule.key, label: rule.label }
      : { key: "generic", label: "Custom application" };
  }

  function metadataSignals(element) {
    const signals = [];
    for (const [attribute, weight] of metadataAttributes) {
      const value = element?.getAttribute?.(attribute);
      if (value) {
        signals.push({
          text: value,
          weight,
          source: "platform"
        });
      }
    }
    const inputType = String(element?.getAttribute?.("type") || "").toLowerCase();
    if (["email", "tel", "url"].includes(inputType)) {
      signals.push({ text: inputType, weight: 0.88, source: "metadata" });
    }
    const inputMode = element?.getAttribute?.("inputmode");
    if (inputMode) {
      signals.push({ text: inputMode, weight: 0.64, source: "metadata" });
    }
    const title = element?.getAttribute?.("title");
    if (title) {
      signals.push({ text: title, weight: 0.82, source: "title" });
    }
    return signals;
  }

  function requiredMetadataValue(element, attribute) {
    const value = element?.getAttribute?.(attribute);
    const present =
      element?.hasAttribute?.(attribute) ??
      (value !== null && value !== undefined);
    if (!present) {
      return false;
    }
    return ["", "1", "true", "yes", "required", "mandatory"].includes(
      String(value || "").trim().toLowerCase()
    );
  }

  function isSingleQuestionContainer(container) {
    const controls = Array.from(
      container?.querySelectorAll?.(candidateSelector) || []
    ).filter(
      (control) =>
        !["hidden", "button", "submit"].includes(
          String(control.getAttribute?.("type") || "").toLowerCase()
        )
    );
    if (controls.length <= 1) {
      return true;
    }

    const choiceKinds = controls.map((control) => {
      const type = String(control.getAttribute?.("type") || "").toLowerCase();
      const role = String(control.getAttribute?.("role") || "").toLowerCase();
      return ["radio", "checkbox"].includes(type)
        ? type
        : ["radio", "checkbox"].includes(role)
          ? role
          : "";
    });
    if (!choiceKinds[0] || choiceKinds.some((kind) => kind !== choiceKinds[0])) {
      return false;
    }
    const names = new Set(
      controls
        .map((control) => String(control.getAttribute?.("name") || ""))
        .filter(Boolean)
    );
    if (names.size === 1) {
      return true;
    }
    const containerRole = String(
      container.getAttribute?.("role") || ""
    ).toLowerCase();
    return (
      ["group", "radiogroup"].includes(containerRole) &&
      controls.every(
        (control) =>
          String(control.getAttribute?.("role") || "").toLowerCase() ===
          choiceKinds[0]
      )
    );
  }

  function hasRequiredMetadata(element) {
    const candidates = [
      element,
      element?.closest?.("fieldset, [role='group'], [role='radiogroup']"),
      questionContainer(element)
    ].filter(Boolean);
    for (const candidate of new Set(candidates)) {
      const hasQuestionScope =
        candidate === element || isSingleQuestionContainer(candidate);
      if (
        hasQuestionScope &&
        requiredMetadataAttributes.some((attribute) =>
          requiredMetadataValue(candidate, attribute)
        )
      ) {
        return true;
      }
      try {
        if (
          hasQuestionScope &&
          candidate.querySelector?.(requiredMarkerSelector)
        ) {
          return true;
        }
      } catch {
        // Ignore malformed third-party markup and continue with semantic signals.
      }
    }
    return false;
  }

  function questionContainer(element) {
    const semanticContainer = element?.closest?.(questionContainerSelector);
    if (semanticContainer) {
      return semanticContainer;
    }
    const parent = element?.parentElement;
    if (
      !parent ||
      ["BODY", "FORM", "MAIN"].includes(parent.tagName) ||
      parent.querySelectorAll(candidateSelector).length > 2
    ) {
      return element;
    }
    return parent;
  }

  function isKnownAtsUrl(value) {
    const hostname = hostnameOf(value);
    return platformRules.some((rule) => hostMatches(hostname, rule));
  }

  const api = Object.freeze({
    candidateSelector,
    detectPlatform,
    hasRequiredMetadata,
    isKnownAtsUrl,
    metadataSignals,
    optionSelector,
    questionContainer,
    platformRules
  });

  root.JobAutofillAts = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
