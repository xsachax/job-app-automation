(function registerProfileSchema(root) {
  const groups = [
    { key: "identity", label: "Identity" },
    { key: "contact", label: "Contact and location" },
    { key: "links", label: "Professional links" },
    { key: "eligibility", label: "Application defaults" }
  ];

  const fields = [
    {
      key: "firstName",
      label: "First name",
      group: "identity",
      input: "text",
      autocomplete: ["given-name"],
      aliases: ["first name", "given name", "legal first name", "forename"],
      controls: ["text"],
      placeholder: "Jane"
    },
    {
      key: "preferredName",
      label: "Preferred name",
      group: "identity",
      input: "text",
      autocomplete: ["nickname"],
      aliases: ["preferred name", "chosen name", "nickname"],
      controls: ["text"],
      placeholder: "Jane"
    },
    {
      key: "lastName",
      label: "Last name",
      group: "identity",
      input: "text",
      autocomplete: ["family-name"],
      aliases: ["last name", "family name", "legal last name", "surname"],
      controls: ["text"],
      placeholder: "Doe"
    },
    {
      key: "fullName",
      label: "Full name",
      group: "identity",
      stored: false,
      autocomplete: ["name"],
      aliases: ["full name", "legal name", "your name"],
      excludeAliases: [
        "first name",
        "last name",
        "preferred name",
        "company name",
        "school name"
      ],
      controls: ["text"]
    },
    {
      key: "email",
      label: "Email address",
      group: "contact",
      input: "email",
      autocomplete: ["email"],
      aliases: ["email", "email address", "e mail"],
      controls: ["text"],
      placeholder: "jane@example.com"
    },
    {
      key: "phone",
      label: "Phone number",
      group: "contact",
      input: "tel",
      autocomplete: ["tel", "tel-national"],
      aliases: ["phone", "phone number", "mobile", "mobile number", "telephone"],
      exactAliases: ["phone"],
      excludeAliases: ["phone extension", "phone number extension"],
      controls: ["text"],
      placeholder: "+1 555 555 0123"
    },
    {
      key: "addressLine1",
      label: "Street address",
      group: "contact",
      input: "text",
      autocomplete: ["street-address", "address-line1"],
      aliases: [
        "street address",
        "address line 1",
        "address 1",
        "home address",
        "mailing address"
      ],
      controls: ["text"],
      placeholder: "123 Main Street"
    },
    {
      key: "city",
      label: "City",
      group: "contact",
      input: "text",
      autocomplete: ["address-level2"],
      aliases: ["city", "town", "locality"],
      controls: ["text"],
      placeholder: "San Francisco"
    },
    {
      key: "state",
      label: "State / province",
      group: "contact",
      input: "text",
      autocomplete: ["address-level1"],
      aliases: ["state", "province", "state province", "region"],
      exactAliases: ["state", "region"],
      excludeAliases: ["statement"],
      controls: ["text", "select"],
      placeholder: "California"
    },
    {
      key: "postalCode",
      label: "Postal code",
      group: "contact",
      input: "text",
      autocomplete: ["postal-code"],
      aliases: ["postal code", "zip code", "zipcode", "zip"],
      controls: ["text"],
      placeholder: "94105"
    },
    {
      key: "country",
      label: "Country",
      group: "contact",
      input: "text",
      autocomplete: ["country", "country-name"],
      aliases: ["country", "country region", "country of residence"],
      exactAliases: ["country"],
      excludeAliases: ["calling code", "country code", "country calling code"],
      controls: ["text", "select"],
      placeholder: "United States"
    },
    {
      key: "linkedinUrl",
      label: "LinkedIn URL",
      group: "links",
      input: "url",
      aliases: ["linkedin", "linkedin url", "linkedin profile", "linkedin profile url"],
      controls: ["text"],
      placeholder: "https://www.linkedin.com/in/jane-doe"
    },
    {
      key: "githubUrl",
      label: "GitHub URL",
      group: "links",
      input: "url",
      aliases: ["github", "github url", "github profile", "github profile url"],
      controls: ["text"],
      placeholder: "https://github.com/jane-doe"
    },
    {
      key: "portfolioUrl",
      label: "Portfolio or website URL",
      group: "links",
      input: "url",
      autocomplete: ["url"],
      aliases: [
        "portfolio",
        "portfolio url",
        "personal website",
        "website",
        "website url",
        "personal site"
      ],
      excludeAliases: ["company website"],
      controls: ["text"],
      placeholder: "https://janedoe.dev"
    },
    {
      key: "workAuthorization",
      label: "Legally authorized to work",
      group: "eligibility",
      input: "select",
      aliases: [
        "authorized to work",
        "authorised to work",
        "legally authorized",
        "legally authorised",
        "eligible to work",
        "work authorization"
      ],
      controls: ["choice", "select"],
      options: [
        { value: "", label: "Select an answer" },
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    },
    {
      key: "requiresSponsorship",
      label: "Requires visa sponsorship",
      group: "eligibility",
      input: "select",
      aliases: [
        "require sponsorship",
        "requires sponsorship",
        "need sponsorship",
        "visa sponsorship",
        "immigration sponsorship",
        "sponsorship now or in the future"
      ],
      controls: ["choice", "select"],
      options: [
        { value: "", label: "Select an answer" },
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    },
    {
      key: "coverLetter",
      label: "Default cover letter",
      group: "eligibility",
      input: "textarea",
      aliases: ["cover letter", "message to hiring manager"],
      controls: ["textarea"],
      placeholder: "Optional default text. Review it for every application."
    }
  ];

  function renderCoverLetter(template, context, profile) {
    const replacements = {
      company: String(context?.company || "").trim(),
      title: String(context?.jobTitle || context?.title || "").trim(),
      firstname: String(profile.firstName || "").trim(),
      lastname: String(profile.lastName || "").trim()
    };
    const rendered = String(template || "").replace(
      /\{\{\s*(company|title|firstName|lastName)\s*\}\}/gi,
      (match, key) => replacements[String(key).toLowerCase()] || match
    );
    return /\{\{[^{}]+\}\}/.test(rendered) ? "" : rendered;
  }

  function buildEffectiveProfile(profile = {}, context = {}) {
    const firstName = String(profile.firstName || "").trim();
    const lastName = String(profile.lastName || "").trim();

    return {
      ...profile,
      preferredName: String(profile.preferredName || firstName).trim(),
      fullName: [firstName, lastName].filter(Boolean).join(" "),
      coverLetter: renderCoverLetter(profile.coverLetter, context, profile)
    };
  }

  function formatControlValue(value, controlKind) {
    const rawValue = String(value || "").trim();
    return controlKind === "textarea"
      ? rawValue
      : rawValue.replace(/\s+/g, " ");
  }

  function sanitizeStoredProfile(rawProfile) {
    if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) {
      throw new Error("The autofill profile is invalid.");
    }

    const profile = {};
    for (const field of fields) {
      if (field.stored === false) continue;
      const rawValue = rawProfile[field.key];
      const maxLength = field.key === "coverLetter" ? 20_000 : 1_000;
      let value =
        typeof rawValue === "string" ? rawValue.trim().slice(0, maxLength) : "";

      if (
        ["workAuthorization", "requiresSponsorship"].includes(field.key) &&
        !["", "yes", "no"].includes(value)
      ) {
        value = "";
      }
      profile[field.key] = value;
    }
    return profile;
  }

  const api = Object.freeze({
    groups,
    fields,
    buildEffectiveProfile,
    formatControlValue,
    sanitizeStoredProfile
  });
  root.JobAutofillProfile = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
