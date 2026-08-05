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
      aliases: [
        "full name",
        "legal name",
        "your name",
        "candidate name",
        "applicant name",
        "name"
      ],
      exactAliases: ["name"],
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
      aliases: [
        "email",
        "email address",
        "e mail",
        "personal email",
        "candidate email",
        "contact email"
      ],
      controls: ["text"],
      placeholder: "jane@example.com"
    },
    {
      key: "emailConfirmation",
      label: "Email confirmation",
      group: "contact",
      stored: false,
      input: "email",
      aliases: [
        "confirm email",
        "confirm email address",
        "email confirmation",
        "re enter email",
        "retype email"
      ],
      controls: ["text"]
    },
    {
      key: "phone",
      label: "Phone number",
      group: "contact",
      input: "tel",
      autocomplete: ["tel", "tel-national"],
      aliases: [
        "phone",
        "phone number",
        "mobile",
        "mobile number",
        "telephone",
        "primary phone",
        "contact number",
        "candidate phone"
      ],
      exactAliases: ["phone"],
      excludeAliases: [
        "phone extension",
        "phone number extension",
        "country calling code",
        "phone country code",
        "national phone number"
      ],
      controls: ["text"],
      placeholder: "+1 555 555 0123"
    },
    {
      key: "phoneCountryCode",
      label: "Phone country code",
      group: "contact",
      stored: false,
      input: "text",
      aliases: [
        "phone country code",
        "country calling code",
        "dialing code",
        "dial code",
        "telephone country code"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "phoneNational",
      label: "National phone number",
      group: "contact",
      stored: false,
      input: "tel",
      aliases: [
        "national phone number",
        "local phone number",
        "phone without country code",
        "phone number without country code"
      ],
      controls: ["text"]
    },
    {
      key: "location",
      label: "Current location",
      group: "contact",
      input: "text",
      aliases: [
        "location",
        "current location",
        "current address",
        "city state",
        "city province",
        "where are you located",
        "where do you live"
      ],
      controls: ["text", "combobox"],
      placeholder: "Toronto, ON"
    },
    {
      key: "city",
      label: "City",
      group: "contact",
      stored: false,
      input: "text",
      autocomplete: ["address-level2"],
      aliases: [
        "city",
        "current city",
        "address section city",
        "city town",
        "town city",
        "municipality"
      ],
      exactAliases: ["city"],
      controls: ["text", "combobox"]
    },
    {
      key: "region",
      label: "State or province",
      group: "contact",
      stored: false,
      input: "text",
      autocomplete: ["address-level1"],
      aliases: [
        "state",
        "province",
        "state province",
        "state or province",
        "province territory",
        "region",
        "current state",
        "current province"
      ],
      excludeAliases: [
        "please state",
        "state your",
        "employment status",
        "application status",
        "marital status",
        "veteran status"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "country",
      label: "Country",
      group: "contact",
      stored: false,
      input: "text",
      autocomplete: ["country", "country-name"],
      aliases: [
        "country",
        "country region",
        "country or region",
        "country of residence",
        "current country"
      ],
      exactAliases: ["country"],
      excludeAliases: ["calling code", "country code", "country calling code"],
      controls: ["text", "select", "combobox"],
      placeholder: "United States"
    },
    {
      key: "linkedinUrl",
      label: "LinkedIn URL",
      group: "links",
      input: "url",
      aliases: [
        "linkedin",
        "linkedin url",
        "linkedin profile",
        "linkedin profile url",
        "linkedin website"
      ],
      controls: ["text"],
      placeholder: "https://www.linkedin.com/in/jane-doe"
    },
    {
      key: "githubUrl",
      label: "GitHub URL",
      group: "links",
      input: "url",
      aliases: [
        "github",
        "github url",
        "github profile",
        "github profile url",
        "code repository",
        "code sample url"
      ],
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
        "personal site",
        "personal url",
        "professional website"
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
        "work authorization",
        "work authorisation",
        "right to work",
        "permitted to work",
        "permission to work",
        "can you legally work",
        "work without sponsorship",
        "work without visa sponsorship",
        "work without the need for visa sponsorship",
        "without requiring sponsorship"
      ],
      controls: ["choice", "select", "combobox"],
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
        "sponsorship now or in the future",
        "employer sponsorship",
        "employment sponsorship",
        "future sponsorship",
        "sponsor you now or in the future"
      ],
      controls: ["choice", "select", "combobox"],
      options: [
        { value: "", label: "Select an answer" },
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    },
    {
      key: "resumeFile",
      label: "Resume PDF",
      group: "eligibility",
      stored: false,
      aliases: [
        "resume",
        "resume pdf",
        "resume file",
        "upload resume",
        "attach resume",
        "attach your resume",
        "upload your resume",
        "upload cv",
        "resume cv",
        "cv",
        "curriculum vitae"
      ],
      excludeAliases: [
        "cover letter",
        "transcript",
        "portfolio",
        "work sample",
        "writing sample",
        "supporting document"
      ],
      controls: ["file"]
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

  function locationParts(value) {
    const location = String(value || "")
      .trim()
      .replace(/\s+(?:or|\/)\s+remote$/i, "")
      .trim();
    if (!location || /^remote$/i.test(location)) {
      return { city: "", region: "" };
    }
    const parts = location
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 1) {
      const abbreviated = parts[0].match(/^(.+?)\s+([A-Z]{2})$/);
      if (abbreviated) {
        return { city: abbreviated[1].trim(), region: abbreviated[2] };
      }
    }
    return {
      city: parts[0] || "",
      region: parts.length > 1 ? parts[1] : ""
    };
  }

  function phoneParts(value, country) {
    const phone = String(value || "").trim();
    if (!phone) {
      return { countryCode: "", national: "" };
    }
    const northAmerican = ["ca", "canada", "us", "usa", "united states"].includes(
      String(country || "").trim().toLowerCase()
    );
    const explicitCountryCode = phone.startsWith("+1")
      ? "+1"
      : phone.match(/^\+\d{1,3}(?=[\s(.-]|$)/)?.[0] || "";
    const countryCode = explicitCountryCode || (northAmerican ? "+1" : "");
    const national = countryCode
      ? phone.replace(new RegExp(`^\\${countryCode}[\\s.-]*`), "")
      : phone;
    return { countryCode, national };
  }

  function buildEffectiveProfile(profile = {}, context = {}) {
    const firstName = String(profile.firstName || "").trim();
    const lastName = String(profile.lastName || "").trim();
    const country = String(context.country || "").trim().toLowerCase();
    const location = String(profile.location || "").trim();
    const locationValues = locationParts(location);
    const phoneValues = phoneParts(profile.phone, country);

    return {
      ...profile,
      preferredName: String(profile.preferredName || firstName).trim(),
      fullName: [firstName, lastName].filter(Boolean).join(" "),
      emailConfirmation: String(profile.email || "").trim(),
      phoneCountryCode: phoneValues.countryCode,
      phoneNational: phoneValues.national,
      city: locationValues.city,
      region: locationValues.region,
      country:
        country === "ca" || country === "canada"
          ? "Canada"
          : country === "us" || country === "united states"
            ? "United States"
            : "",
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
