(function registerProfileSchema(root) {
  const groups = [
    { key: "identity", label: "Identity" },
    { key: "contact", label: "Contact and location" },
    { key: "links", label: "Professional links" },
    { key: "education", label: "Education and credentials" },
    { key: "eligibility", label: "Application defaults" },
    { key: "demographics", label: "Voluntary self-identification" }
  ];

  const fields = [
    {
      key: "firstName",
      label: "First name",
      group: "identity",
      input: "text",
      autocomplete: ["given-name"],
      aliases: [
        "first name",
        "given name",
        "legal first name",
        "forename",
        "given or first name"
      ],
      controls: ["text"],
      placeholder: "Jane"
    },
    {
      key: "preferredName",
      label: "Preferred name",
      group: "identity",
      input: "text",
      autocomplete: ["nickname"],
      aliases: [
        "preferred name",
        "chosen name",
        "preferred or chosen name",
        "nickname",
        "name you go by"
      ],
      controls: ["text"],
      placeholder: "Jane"
    },
    {
      key: "middleName",
      label: "Middle name",
      group: "identity",
      input: "text",
      autocomplete: ["additional-name"],
      aliases: ["middle name", "legal middle name", "additional name"],
      controls: ["text"]
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
      key: "nameSuffix",
      label: "Name suffix",
      group: "identity",
      input: "select",
      autocomplete: ["honorific-suffix"],
      aliases: ["name suffix", "suffix", "generational suffix"],
      controls: ["text", "select", "combobox"]
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
        "electronic mail address",
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
        "telephone number",
        "cell phone",
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
      key: "phoneType",
      label: "Phone type",
      group: "contact",
      input: "select",
      aliases: [
        "phone type",
        "device type",
        "phone device type",
        "telephone type"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "phoneExtension",
      label: "Phone extension",
      group: "contact",
      input: "text",
      aliases: ["phone extension", "telephone extension", "extension"],
      controls: ["text"]
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
      key: "homeAddressLine1",
      label: "Street address",
      group: "contact",
      input: "text",
      autocomplete: ["address-line1", "street-address"],
      aliases: [
        "address line 1",
        "street address",
        "home address",
        "primary address"
      ],
      controls: ["text"]
    },
    {
      key: "homeAddressLine2",
      label: "Address line 2",
      group: "contact",
      input: "text",
      autocomplete: ["address-line2"],
      aliases: [
        "address line 2",
        "apartment suite",
        "apartment or suite",
        "unit number"
      ],
      controls: ["text"]
    },
    {
      key: "homeCity",
      label: "Home city",
      group: "contact",
      input: "text",
      aliases: ["home city", "address city", "city town", "municipality"],
      controls: ["text", "combobox"]
    },
    {
      key: "homeRegion",
      label: "Home state or province",
      group: "contact",
      input: "text",
      aliases: [
        "home state",
        "home province",
        "address state",
        "address province",
        "address region"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "homePostalCode",
      label: "Postal code",
      group: "contact",
      input: "text",
      autocomplete: ["postal-code"],
      aliases: ["postal code", "zip code", "zip postal code", "postcode"],
      controls: ["text"]
    },
    {
      key: "homeCountry",
      label: "Home country",
      group: "contact",
      input: "select",
      aliases: [
        "home country",
        "address country"
      ],
      controls: ["text", "select", "combobox"]
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
        "current city and state",
        "current city and province",
        "current city and state province",
        "city state",
        "city province",
        "where are you located",
        "where do you live",
        "where do you currently live",
        "where are you currently living",
        "where are you based",
        "where are you currently based"
      ],
      excludeAliases: [
        "preferred office location",
        "preferred location",
        "preferred work location",
        "location preference",
        "office location",
        "willing to relocate"
      ],
      controls: ["text", "select", "combobox"],
      placeholder: "Toronto, ON"
    },
    {
      key: "usCountry",
      label: "Saved U.S. country",
      group: "contact",
      aliases: [],
      controls: []
    },
    {
      key: "usLocation",
      label: "Saved U.S. location",
      group: "contact",
      aliases: [],
      controls: []
    },
    {
      key: "usWorkAuthorization",
      label: "Saved U.S. work authorization",
      group: "eligibility",
      aliases: [],
      controls: []
    },
    {
      key: "usRequiresSponsorship",
      label: "Saved U.S. sponsorship requirement",
      group: "eligibility",
      aliases: [],
      controls: []
    },
    {
      key: "usCitizenshipStatus",
      label: "Saved U.S. citizenship status",
      group: "eligibility",
      aliases: [],
      controls: []
    },
    {
      key: "usCitizenshipStatusOther",
      label: "Saved U.S. citizenship detail",
      group: "eligibility",
      aliases: [],
      controls: []
    },
    {
      key: "caCountry",
      label: "Saved Canada country",
      group: "contact",
      aliases: [],
      controls: []
    },
    {
      key: "caLocation",
      label: "Saved Canada location",
      group: "contact",
      aliases: [],
      controls: []
    },
    {
      key: "caWorkAuthorization",
      label: "Saved Canada work authorization",
      group: "eligibility",
      aliases: [],
      controls: []
    },
    {
      key: "caRequiresSponsorship",
      label: "Saved Canada sponsorship requirement",
      group: "eligibility",
      aliases: [],
      controls: []
    },
    {
      key: "caCitizenshipStatus",
      label: "Saved Canada citizenship status",
      group: "eligibility",
      aliases: [],
      controls: []
    },
    {
      key: "caCitizenshipStatusOther",
      label: "Saved Canada citizenship detail",
      group: "eligibility",
      aliases: [],
      controls: []
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
        "location city",
        "city only",
        "current city",
        "address section city",
        "city town",
        "town city",
        "municipality"
      ],
      exactAliases: ["city", "location city"],
      excludeAliases: [
        "preferred office city",
        "city and state",
        "city and province",
        "city state province",
        "preferred office location",
        "preferred city",
        "preferred location",
        "preferred work location",
        "location preference",
        "office location"
      ],
      controls: ["text", "select", "combobox"]
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
        "location city",
        "city only",
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
        "linkedin public profile",
        "professional networking profile",
        "professional networking profile url",
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
        "code sample url",
        "code hosting profile",
        "source code profile"
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
        "professional website",
        "work portfolio",
        "work samples url"
      ],
      excludeAliases: ["company website"],
      controls: ["text"],
      placeholder: "https://janedoe.dev"
    },
    {
      key: "school",
      label: "School",
      group: "education",
      input: "text",
      aliases: [
        "school",
        "school name",
        "university",
        "university name",
        "college",
        "college name",
        "educational institution",
        "institution name",
        "school attended"
      ],
      exactAliases: ["school", "university", "college"],
      excludeAliases: ["high school diploma", "school discipline"],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "degree",
      label: "Degree",
      group: "education",
      input: "select",
      aliases: [
        "degree",
        "degree type",
        "degree level",
        "highest degree",
        "highest level of education",
        "education level",
        "academic degree",
        "qualification earned"
      ],
      exactAliases: ["degree"],
      excludeAliases: [
        "degree discipline",
        "degree field",
        "field of study",
        "degree completion status",
        "degree completed",
        "degree gpa"
      ],
      controls: ["text", "choice", "select", "combobox"]
    },
    {
      key: "degreeOther",
      label: "Other degree",
      group: "education",
      input: "text",
      aliases: [
        "please specify degree",
        "please specify your degree",
        "other degree",
        "degree other",
        "self described degree"
      ],
      contextAliases: [
        "degree",
        "degree type",
        "degree level",
        "education level",
        "academic degree",
        "highest degree",
        "what is your highest degree",
        "please select your degree"
      ],
      allowGenericWithContext: true,
      controls: ["text", "textarea"]
    },
    {
      key: "fieldOfStudy",
      label: "Field of study",
      group: "education",
      input: "text",
      aliases: [
        "field of study",
        "degree field",
        "academic discipline",
        "discipline",
        "major",
        "major field",
        "program of study",
        "area of study",
        "concentration"
      ],
      exactAliases: ["discipline", "major"],
      excludeAliases: [
        "disciplinary action",
        "disciplinary history",
        "discipline record",
        "employee discipline"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "educationStartDate",
      label: "Education start month",
      group: "education",
      input: "month",
      aliases: [
        "education start date",
        "education start month",
        "school start date",
        "begin school",
        "school begin date"
      ],
      controls: ["text", "date", "select", "combobox"]
    },
    {
      key: "graduationDate",
      label: "Graduation date",
      group: "education",
      input: "text",
      aliases: [
        "graduation date",
        "expected graduation date",
        "date of graduation",
        "degree completion date",
        "graduation month and year",
        "expected completion month and year"
      ],
      controls: ["text", "date", "select", "combobox"]
    },
    {
      key: "graduationDateExact",
      label: "Exact graduation date",
      group: "education",
      input: "date",
      aliases: [],
      controls: []
    },
    {
      key: "graduationMonth",
      label: "Graduation month",
      group: "education",
      stored: false,
      input: "text",
      aliases: ["graduation month", "expected graduation month"],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "graduationYear",
      label: "Graduation year",
      group: "education",
      stored: false,
      input: "text",
      aliases: ["graduation year", "expected graduation year", "year graduated"],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "relevantExperienceYears",
      label: "Relevant experience",
      group: "education",
      input: "text",
      aliases: [
        "years of experience",
        "relevant experience",
        "professional experience",
        "years of professional experience",
        "total years of experience",
        "years worked professionally"
      ],
      excludeAliases: [
        "software engineering experience",
        "software development experience",
        "software industry experience",
        "experience excluding internships"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "softwareIndustryExperienceYears",
      label: "Software engineering industry experience",
      group: "education",
      input: "text",
      aliases: [
        "years of software engineering industry experience",
        "software engineering industry experience",
        "software engineer industry experience",
        "software development industry experience",
        "years of professional software development experience",
        "professional software development experience",
        "years of software engineering experience excluding internships",
        "software engineering experience excluding internships",
        "industry experience excluding internships"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "certifications",
      label: "Certifications",
      group: "education",
      input: "text",
      aliases: [
        "certifications",
        "professional certifications",
        "technical certifications",
        "licenses and certifications",
        "certificates"
      ],
      exactAliases: ["certifications"],
      controls: ["text", "textarea", "select", "combobox"]
    },
    {
      key: "undergraduateGpa",
      label: "Undergraduate GPA",
      group: "education",
      input: "text",
      aliases: [
        "gpa undergraduate",
        "undergraduate gpa",
        "undergrad gpa",
        "bachelors gpa",
        "bachelor gpa"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "graduateGpa",
      label: "Graduate GPA",
      group: "education",
      input: "text",
      aliases: [
        "gpa graduate",
        "graduate gpa",
        "masters gpa",
        "master gpa"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "doctorateGpa",
      label: "Doctorate GPA",
      group: "education",
      input: "text",
      aliases: [
        "gpa doctorate",
        "doctorate gpa",
        "doctoral gpa",
        "phd gpa"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "satScore",
      label: "SAT score",
      group: "education",
      input: "text",
      aliases: ["sat score", "sat total score", "sat composite score"],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "actScore",
      label: "ACT score",
      group: "education",
      input: "text",
      aliases: ["act score", "act composite score"],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "greScore",
      label: "GRE score",
      group: "education",
      input: "text",
      aliases: ["gre score", "gre total score", "graduate record examination score"],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "heardAboutJob",
      label: "How you heard about the job",
      group: "eligibility",
      input: "select",
      aliases: [
        "how did you hear about this job",
        "how did you hear about this position",
        "how did you hear about us",
        "where did you hear about this job",
        "where did you find this job",
        "job discovery source",
        "application source",
        "how did you learn about this opportunity",
        "where did you discover this opening",
        "recruiting source"
      ],
      controls: ["text", "choice", "select", "combobox"]
    },
    {
      key: "heardAboutJobOther",
      label: "Other job source",
      group: "eligibility",
      input: "text",
      aliases: [
        "please specify how you heard about this job",
        "please specify how you heard about us",
        "other application source",
        "other job source",
        "application source details",
        "other recruiting source details"
      ],
      contextAliases: [
        "how did you hear about this job",
        "how did you hear about this opportunity",
        "how did you hear about us",
        "application source"
      ],
      allowGenericWithContext: true,
      controls: ["text", "textarea"]
    },
    {
      key: "referrerName",
      label: "Referrer name",
      group: "eligibility",
      input: "text",
      aliases: [
        "referrer name",
        "referrer full name",
        "employee referral name",
        "referring employee name"
      ],
      controls: ["text"]
    },
    {
      key: "referrerEmail",
      label: "Referrer email",
      group: "eligibility",
      input: "email",
      aliases: [
        "referrer email",
        "referrer email address",
        "referral email address",
        "who referred you email address",
        "employee referral email",
        "referring employee email",
        "referring employee work email"
      ],
      controls: ["text"]
    },
    {
      key: "previousEmployers",
      label: "Previous employers",
      group: "eligibility",
      input: "select",
      maxLength: 5_000,
      aliases: [
        "have you worked at",
        "have you ever worked at",
        "have you previously worked at",
        "have you worked for",
        "have you ever worked for",
        "have you previously worked for",
        "were you previously employed by",
        "prior employment with",
        "former employee"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "compensationExpectation",
      label: "Target total annual compensation",
      group: "eligibility",
      input: "text",
      aliases: [
        "target total annual compensation expectations",
        "target total annual compensation expectation",
        "target total compensation expectations",
        "total annual compensation expectations",
        "expected total annual compensation",
        "desired total compensation per year",
        "annual salary expectations"
      ],
      controls: ["text", "textarea"]
    },
    {
      key: "compensationCurrency",
      label: "Compensation currency",
      group: "eligibility",
      input: "select",
      aliases: [
        "compensation currency",
        "salary currency",
        "desired pay currency"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "compensationFrequency",
      label: "Compensation frequency",
      group: "eligibility",
      input: "select",
      aliases: [
        "compensation frequency",
        "pay frequency",
        "salary frequency",
        "desired pay frequency"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "availableStartDate",
      label: "Available start date",
      group: "eligibility",
      input: "date",
      aliases: [
        "available start date",
        "date available to start",
        "earliest start date",
        "begin employment",
        "date you can join",
        "when can you start",
        "when could you start",
        "start availability"
      ],
      controls: ["text", "date"]
    },
    {
      key: "noticePeriod",
      label: "Notice period",
      group: "eligibility",
      input: "text",
      aliases: [
        "notice period",
        "required notice",
        "current employer notice period",
        "notice you must give your current employer"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "willingToRelocate",
      label: "Willing to relocate",
      group: "eligibility",
      input: "select",
      aliases: [
        "willing to relocate",
        "open to relocation",
        "relocation willingness",
        "can you relocate",
        "relocate if needed",
        "able to relocate",
        "unable to relocate",
        "unwilling to relocate",
        "not willing to relocate"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "officeWorkWillingness",
      label: "Ability and willingness to work in an office",
      group: "eligibility",
      stored: false,
      input: "select",
      aliases: [
        "able to work from our office",
        "able to work from the office",
        "unable to work from our office",
        "not able to work from our office",
        "can you work from our office",
        "can you work on site",
        "can you work onsite",
        "willing to work on site",
        "willing to work onsite",
        "willing to work a hybrid schedule",
        "able to work a hybrid schedule"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "willingToTravel",
      label: "Willing to travel",
      group: "eligibility",
      input: "select",
      aliases: [
        "willing to travel",
        "open to travel",
        "travel willingness"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "maxTravelPercentage",
      label: "Maximum travel percentage",
      group: "eligibility",
      input: "select",
      aliases: [
        "maximum travel percentage",
        "max travel percentage",
        "percentage willing to travel",
        "percent travel you can accommodate"
      ],
      controls: ["text", "select", "combobox"]
    },
    {
      key: "preferredOfficeLocations",
      label: "S–C ranked office locations",
      group: "eligibility",
      input: "text",
      maxLength: 5_000,
      aliases: [
        "office locations you can work from",
        "office locations can you work from",
        "following office locations",
        "select all office locations",
        "which office locations",
        "locations are you willing to work from",
        "office where you are able to work"
      ],
      controls: ["check-many"]
    },
    {
      key: "securityClearances",
      label: "Active security clearances",
      group: "eligibility",
      input: "text",
      aliases: [
        "active security clearances",
        "active security clearance",
        "security clearances",
        "security clearance",
        "clearance level",
        "clearance status"
      ],
      controls: ["text", "textarea", "select", "combobox"]
    },
    {
      key: "canPerformEssentialFunctions",
      label: "Ability to perform essential functions",
      group: "eligibility",
      input: "select",
      aliases: [
        "perform all of the essential functions",
        "perform all essential functions",
        "perform the essential functions",
        "perform essential job functions",
        "carry out the essential duties",
        "fulfill the essential duties",
        "with or without reasonable accommodations",
        "with or without reasonable accommodation"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "isAtLeast18",
      label: "At least 18 years old",
      group: "eligibility",
      input: "select",
      aliases: [
        "at least 18 years old",
        "18 years of age or older",
        "minimum age requirement",
        "age 18 or above"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "citizenshipStatus",
      label: "Citizenship status",
      group: "eligibility",
      input: "select",
      aliases: [
        "citizenship status",
        "current citizenship status",
        "citizenship",
        "nationality status"
      ],
      exactAliases: ["citizenship status"],
      excludeAliases: ["citizenship required", "citizenship requirement"],
      controls: ["text", "choice", "select", "combobox"]
    },
    {
      key: "citizenshipStatusOther",
      label: "Other citizenship status",
      group: "eligibility",
      input: "text",
      aliases: [
        "please specify citizenship status",
        "other citizenship status",
        "citizenship status other",
        "self described citizenship status"
      ],
      contextAliases: [
        "citizenship status",
        "citizenship",
        "nationality status",
        "what is your citizenship status",
        "please select your citizenship status"
      ],
      allowGenericWithContext: true,
      controls: ["text", "textarea"]
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
        "unrestricted authorization to work",
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
      key: "pronouns",
      label: "Pronouns",
      group: "demographics",
      input: "select",
      aliases: [
        "pronouns",
        "preferred pronouns",
        "what are your pronouns",
        "please select your pronouns",
        "which pronouns should we use for you"
      ],
      exactAliases: ["pronouns", "preferred pronouns"],
      controls: ["text", "choice", "select", "combobox"]
    },
    {
      key: "pronounsOther",
      label: "Self-described pronouns",
      group: "demographics",
      input: "text",
      aliases: [
        "please specify your pronouns",
        "self described pronouns",
        "other pronouns",
        "pronouns other"
      ],
      contextAliases: [
        "pronouns",
        "preferred pronouns",
        "what are your pronouns",
        "please select your pronouns"
      ],
      allowGenericWithContext: true,
      controls: ["text", "textarea"]
    },
    {
      key: "gender",
      label: "Gender",
      group: "demographics",
      input: "select",
      aliases: [
        "gender",
        "gender identity",
        "what is your gender",
        "how do you describe your gender",
        "how do you describe your gender identity"
      ],
      exactAliases: ["gender", "gender identity"],
      excludeAliases: ["preferred pronouns", "sexual orientation"],
      controls: ["text", "choice", "select", "combobox"]
    },
    {
      key: "genderOther",
      label: "Self-described gender",
      group: "demographics",
      input: "text",
      aliases: [
        "please self describe your gender",
        "please specify your gender",
        "self described gender",
        "other gender",
        "gender other"
      ],
      contextAliases: [
        "gender",
        "gender identity",
        "what is your gender",
        "how do you describe your gender",
        "how do you describe your gender identity"
      ],
      allowGenericWithContext: true,
      controls: ["text", "textarea"]
    },
    {
      key: "transgenderStatus",
      label: "Transgender identity",
      group: "demographics",
      input: "select",
      aliases: [
        "do you identify as transgender",
        "are you transgender",
        "transgender identity",
        "transgender status"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "raceEthnicity",
      label: "Race or ethnicity",
      group: "demographics",
      input: "select",
      aliases: [
        "race ethnicity",
        "race and ethnicity",
        "race or ethnicity",
        "racial ethnic identity",
        "race ethnic identity",
        "racial and ethnic identity",
        "ethnic identity",
        "voluntary self identification of race ethnicity",
        "voluntary self identification race ethnic identity",
        "voluntary self identification race ethnic identity pre offer",
        "race",
        "ethnicity"
      ],
      excludeAliases: [
        "equal opportunity employer",
        "equal employment opportunity",
        "do not discriminate",
        "non discrimination policy"
      ],
      exactAliases: ["race", "ethnicity", "race ethnicity"],
      controls: ["text", "choice", "select", "combobox"]
    },
    {
      key: "raceEthnicityOther",
      label: "Self-described race or ethnicity",
      group: "demographics",
      input: "text",
      aliases: [
        "please specify your race ethnicity",
        "please specify race or ethnicity",
        "self described race or ethnicity",
        "other race ethnicity",
        "race ethnicity other"
      ],
      contextAliases: [
        "race",
        "ethnicity",
        "race ethnicity",
        "race and ethnicity",
        "race or ethnicity",
        "racial ethnic identity"
      ],
      allowGenericWithContext: true,
      controls: ["text", "textarea"]
    },
    {
      key: "hispanicLatino",
      label: "Hispanic or Latino identity",
      group: "demographics",
      input: "select",
      aliases: [
        "are you hispanic or latino",
        "do you identify as hispanic or latino",
        "hispanic or latino identity",
        "hispanic latino ethnicity"
      ],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "disabilityStatus",
      label: "Disability status",
      group: "demographics",
      input: "select",
      aliases: [
        "disability status",
        "disability self identification status",
        "voluntary self identification of disability",
        "do you have a disability",
        "identify as a person with a disability",
        "person with a disability"
      ],
      exactAliases: ["disability status"],
      controls: ["choice", "select", "combobox"]
    },
    {
      key: "veteranStatus",
      label: "Protected veteran status",
      group: "demographics",
      input: "select",
      aliases: [
        "veteran status",
        "protected veteran status",
        "voluntary self identification of veteran status",
        "voluntary self identification of protected veteran status",
        "voluntary self identification of protected veteran classification",
        "voluntary self identification of protected veteran classification status post offer",
        "protected veteran",
        "veteran classification",
        "protected veteran classification",
        "protected veteran classification status",
        "pre offer protected veteran status",
        "post offer protected veteran status"
      ],
      excludeAliases: [
        "equal opportunity employer",
        "equal employment opportunity",
        "do not discriminate",
        "non discrimination policy"
      ],
      exactAliases: ["veteran status", "protected veteran status"],
      controls: ["choice", "select", "combobox"]
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

  function validExactDate(value) {
    const match = String(value || "")
      .trim()
      .match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    if (!match) {
      return "";
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? match[0]
      : "";
  }

  function graduationParts(value, exactValue) {
    const exact = validExactDate(exactValue);
    const monthInput = exact
      ? exact.slice(0, 7)
      : String(value || "").trim();
    const match = monthInput.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) {
      return {
        date: "",
        exact: "",
        exactText: "",
        input: "",
        month: "",
        year: ""
      };
    }
    const months = [
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
    ];
    const month = months[Number(match[2]) - 1];
    return {
      date: `${month} ${match[1]}`,
      exact,
      exactText: exact
        ? `${exact.slice(5, 7)}/${exact.slice(8, 10)}/${exact.slice(0, 4)}`
        : "",
      input: monthInput,
      month,
      year: match[1]
    };
  }

  function buildEffectiveProfile(profile = {}, context = {}) {
    const firstName = String(profile.firstName || "").trim();
    const lastName = String(profile.lastName || "").trim();
    const country = String(context.country || profile.country || "")
      .trim()
      .toLowerCase();
    const isCanada = country === "ca" || country === "canada";
    const isUnitedStates = [
      "us",
      "usa",
      "u s",
      "u s a",
      "united states",
      "united states of america"
    ].includes(country);
    const location = String(
      isCanada
        ? profile.caLocation || profile.location
        : isUnitedStates
          ? profile.usLocation || profile.location
          : profile.location || ""
    ).trim();
    const workAuthorization = String(
      isCanada
        ? profile.caWorkAuthorization || profile.workAuthorization
        : isUnitedStates
          ? profile.usWorkAuthorization || profile.workAuthorization
          : profile.workAuthorization || ""
    ).trim();
    const requiresSponsorship = String(
      isCanada
        ? profile.caRequiresSponsorship || profile.requiresSponsorship
        : isUnitedStates
          ? profile.usRequiresSponsorship || profile.requiresSponsorship
          : profile.requiresSponsorship || ""
    ).trim();
    const citizenshipStatus = String(
      isCanada
        ? profile.caCitizenshipStatus || profile.citizenshipStatus
        : isUnitedStates
          ? profile.usCitizenshipStatus || profile.citizenshipStatus
          : profile.citizenshipStatus || ""
    ).trim();
    const citizenshipStatusOther =
      citizenshipStatus === "Other"
        ? String(
            isCanada
              ? profile.caCitizenshipStatusOther ||
                  profile.citizenshipStatusOther
              : isUnitedStates
                ? profile.usCitizenshipStatusOther ||
                    profile.citizenshipStatusOther
                : profile.citizenshipStatusOther || ""
          ).trim()
        : "";
    const locationValues = locationParts(location);
    const phoneValues = phoneParts(profile.phone, country);
    const graduationValues = graduationParts(
      profile.graduationDate,
      profile.graduationDateExact
    );

    return {
      ...profile,
      preferredName: String(profile.preferredName || firstName).trim(),
      fullName: [firstName, lastName].filter(Boolean).join(" "),
      emailConfirmation: String(profile.email || "").trim(),
      phoneCountryCode: String(
        profile.phoneCountryCode || phoneValues.countryCode
      ).trim(),
      phoneNational: phoneValues.national,
      location,
      city: locationValues.city,
      region: locationValues.region,
      country:
        isCanada
          ? "Canada"
          : isUnitedStates
            ? "United States"
            : String(profile.country || context.country || "").trim(),
      workAuthorization,
      requiresSponsorship,
      citizenshipStatus,
      citizenshipStatusOther,
      usCitizenshipStatusOther:
        String(profile.usCitizenshipStatus || "").trim() === "Other"
          ? String(profile.usCitizenshipStatusOther || "").trim()
          : "",
      caCitizenshipStatusOther:
        String(profile.caCitizenshipStatus || "").trim() === "Other"
          ? String(profile.caCitizenshipStatusOther || "").trim()
          : "",
      willingToRelocate: String(profile.willingToRelocate || "yes").trim(),
      officeWorkWillingness: "yes",
      graduationDate: graduationValues.date,
      graduationDateExact: graduationValues.exact,
      graduationDateExactText: graduationValues.exactText,
      graduationDateInput: graduationValues.input,
      graduationMonth: graduationValues.month,
      graduationYear: graduationValues.year,
      coverLetter: renderCoverLetter(profile.coverLetter, context, profile)
    };
  }

  function formatControlValue(value, controlKind) {
    const rawValue = String(value || "").trim();
    return ["textarea", "check-many"].includes(controlKind)
      ? rawValue
      : rawValue.replace(/\s+/g, " ");
  }

  const structuredProfileSpecs = Object.freeze({
    workExperiences: {
      maxItems: 20,
      fields: {
        company: 300,
        title: 300,
        location: 300,
        startDate: 7,
        endDate: 7,
        currentRole: 3,
        description: 10_000
      }
    },
    educationEntries: {
      maxItems: 10,
      fields: {
        school: 300,
        degree: 300,
        degreeOther: 300,
        fieldOfStudy: 300,
        startDate: 7,
        graduationDate: 7,
        graduationDateExact: 10,
        gpa: 20
      }
    },
    credentialEntries: {
      maxItems: 20,
      legacyStringField: "name",
      fields: {
        name: 300,
        issuer: 300,
        credentialId: 300,
        issueDate: 7,
        expirationDate: 7,
        doesNotExpire: 3
      }
    },
    languages: {
      maxItems: 20,
      fields: {
        language: 200,
        overallProficiency: 200,
        speakingProficiency: 200,
        readingProficiency: 200,
        writingProficiency: 200
      }
    },
    additionalWebsites: {
      maxItems: 20,
      fields: { label: 200, url: 2_000 }
    }
  });

  function sanitizeStructuredEntries(rawEntries, spec) {
    if (!Array.isArray(rawEntries)) return [];
    return rawEntries
      .slice(0, spec.maxItems)
      .map((rawEntry) => {
        const entry =
          typeof rawEntry === "string" && spec.legacyStringField
            ? { [spec.legacyStringField]: rawEntry }
            : rawEntry;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }
        const sanitized = {};
        for (const [key, maxLength] of Object.entries(spec.fields)) {
          let value =
            typeof entry[key] === "string"
              ? entry[key].trim().slice(0, maxLength)
              : "";
          if (
            [
              "startDate",
              "endDate",
              "graduationDate",
              "issueDate",
              "expirationDate"
            ].includes(key) &&
            value &&
            !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)
          ) {
            value = "";
          }
          if (
            key === "graduationDateExact" &&
            value &&
            !validExactDate(value)
          ) {
            value = "";
          }
          if (
            ["currentRole", "doesNotExpire"].includes(key) &&
            !["", "yes", "no"].includes(value)
          ) {
            value = "";
          }
          sanitized[key] = value;
        }
        if (sanitized.currentRole === "yes") {
          sanitized.endDate = "";
        }
        if (sanitized.doesNotExpire === "yes") {
          sanitized.expirationDate = "";
        }
        for (const key of spec.booleans || []) {
          sanitized[key] = entry[key] === true;
        }
        return Object.values(sanitized).some(
          (value) => typeof value === "string" && value
        )
          ? sanitized
          : null;
      })
      .filter(Boolean);
  }

  function profileAvailability(profile = {}, context = {}) {
    const effective = buildEffectiveProfile(profile, context);
    const availability = Object.fromEntries(
      fields.map((field) => [field.key, Boolean(effective[field.key])])
    );
    for (const key of Object.keys(structuredProfileSpecs)) {
      availability[key] = Array.isArray(effective[key]) && effective[key].length > 0;
    }
    return availability;
  }

  function sanitizeStoredProfile(rawProfile) {
    if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) {
      throw new Error("The autofill profile is invalid.");
    }

    const profile = {};
    for (const field of fields) {
      if (field.stored === false) continue;
      const rawValue = rawProfile[field.key];
      const maxLength =
        field.maxLength || (field.key === "coverLetter" ? 20_000 : 1_000);
      let value =
        typeof rawValue === "string" ? rawValue.trim().slice(0, maxLength) : "";

      if (
        [
          "workAuthorization",
          "requiresSponsorship",
          "canPerformEssentialFunctions",
          "willingToRelocate",
          "willingToTravel",
          "isAtLeast18",
          "usWorkAuthorization",
          "usRequiresSponsorship",
          "caWorkAuthorization",
          "caRequiresSponsorship"
        ].includes(field.key) &&
        !["", "yes", "no"].includes(value)
      ) {
        value = "";
      }
      if (
        ["undergraduateGpa", "graduateGpa", "doctorateGpa"].includes(field.key) &&
        value &&
        (!/^\d{1,2}(?:\.\d{1,3})?$/.test(value) ||
          Number(value) < 0 ||
          Number(value) > 10)
      ) {
        value = "";
      }
      if (
        field.key === "satScore" &&
        value &&
        (!/^\d{3,4}$/.test(value) || Number(value) < 400 || Number(value) > 2400)
      ) {
        value = "";
      }
      if (
        field.key === "actScore" &&
        value &&
        (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 36)
      ) {
        value = "";
      }
      if (
        field.key === "greScore" &&
        value &&
        (!/^\d{3,4}$/.test(value) || Number(value) < 130 || Number(value) > 1600)
      ) {
        value = "";
      }
      if (
        ["graduationDate", "educationStartDate"].includes(field.key) &&
        value &&
        !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)
      ) {
        value = "";
      }
      if (
        field.key === "graduationDateExact" &&
        value &&
        !validExactDate(value)
      ) {
        value = "";
      }
      if (
        field.key === "availableStartDate" &&
        value &&
        !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)
      ) {
        value = "";
      }
      if (
        field.key === "maxTravelPercentage" &&
        value &&
        (!/^\d{1,3}$/.test(value) || Number(value) > 100)
      ) {
        value = "";
      }
      if (
        ["relevantExperienceYears", "softwareIndustryExperienceYears"].includes(
          field.key
        ) &&
        value &&
        (!/^\d{1,2}(?:\.\d)?$/.test(value) ||
          Number(value) < 0 ||
          Number(value) > 60)
      ) {
        value = "";
      }
      profile[field.key] = value;
    }
    if (profile.willingToTravel === "no") {
      profile.maxTravelPercentage = "";
    }
    for (const [key, spec] of Object.entries(structuredProfileSpecs)) {
      profile[key] = sanitizeStructuredEntries(rawProfile[key], spec);
    }
    return profile;
  }

  const api = Object.freeze({
    groups,
    fields,
    buildEffectiveProfile,
    formatControlValue,
    profileAvailability,
    sanitizeStoredProfile,
    sanitizeStructuredEntries,
    structuredProfileSpecs
  });
  root.JobAutofillProfile = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
