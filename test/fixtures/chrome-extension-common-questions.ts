export interface CommonQuestionCase {
  category: string;
  expectedKey: string;
  controlKind: string;
  autocomplete?: string;
  optionTexts?: string[];
  signals: Array<{
    text: string;
    weight: number;
    source: string;
  }>;
}

const yesNo = ["Yes", "No"];

function question(
  category: string,
  expectedKey: string,
  controlKind: string,
  label: string,
  details: {
    autocomplete?: string;
    description?: string;
    metadata?: string;
    optionTexts?: string[];
    placeholder?: string;
  } = {},
): CommonQuestionCase {
  const signals: CommonQuestionCase["signals"] = [
    { text: label, weight: 1, source: "label" },
  ];
  if (details.description) {
    signals.push({
      text: details.description,
      weight: 0.74,
      source: "description",
    });
  }
  if (details.metadata) {
    signals.push({
      text: details.metadata,
      weight: 0.92,
      source: "platform",
    });
  }
  if (details.placeholder) {
    signals.push({
      text: details.placeholder,
      weight: 0.84,
      source: "placeholder",
    });
  }
  return {
    category,
    expectedKey,
    controlKind,
    autocomplete: details.autocomplete,
    optionTexts: details.optionTexts,
    signals,
  };
}

export const commonQuestionCorpus: CommonQuestionCase[] = [
  question("identity", "firstName", "text", "First / Given Name", {
    metadata: "candidate_first_name",
  }),
  question("identity", "firstName", "text", "Your legal given name", {
    description: "Enter the first name shown on your legal documents.",
  }),
  question("identity", "lastName", "text", "Family / Last Name", {
    metadata: "candidate_last_name",
  }),
  question("identity", "lastName", "text", "What is your surname?"),
  question("identity", "preferredName", "text", "Preferred or chosen name"),
  question("identity", "preferredName", "text", "Name you go by"),
  question("identity", "middleName", "text", "Middle / Additional Name"),
  question("identity", "nameSuffix", "select", "Generational suffix"),
  question("identity", "fullName", "text", "Applicant legal full name", {
    autocomplete: "name",
  }),

  question("contact", "email", "text", "Email address", {
    description: "Please provide your personal electronic mail address.",
    metadata: "candidateEmail",
  }),
  question("contact", "email", "text", "Best email for recruiting updates", {
    autocomplete: "email",
  }),
  question("contact", "phone", "text", "Best phone number to reach you"),
  question("contact", "phone", "text", "Mobile / Cell Number", {
    metadata: "candidate_phone_number",
  }),
  question("contact", "phoneCountryCode", "select", "International dialing code"),
  question("contact", "phoneExtension", "text", "Telephone extension"),
  question("contact", "homeAddressLine1", "text", "Residential street address"),
  question("contact", "homeAddressLine2", "text", "Apartment, suite, or unit"),
  question("contact", "homePostalCode", "text", "ZIP / Postal Code", {
    autocomplete: "postal-code",
  }),

  question("location", "location", "text", "Where are you currently based?"),
  question("location", "location", "text", "Where do you currently live?"),
  question("location", "location", "combobox", "Current city and state / province"),
  question("location", "city", "select", "Location (City)", {
    metadata: "candidate_location_city",
  }),
  question("location", "city", "combobox", "City of residence", {
    autocomplete: "address-level2",
  }),
  question("location", "region", "select", "State / Province / Region", {
    autocomplete: "address-level1",
  }),
  question("location", "country", "select", "Country / Region of residence"),
  question("location", "homeCountry", "combobox", "Home address country"),

  question(
    "links",
    "linkedinUrl",
    "text",
    "LinkedIn URL Please provide your LinkedIn URL",
    { metadata: "candidate_linkedin_profile_url" },
  ),
  question("links", "linkedinUrl", "text", "Professional networking profile URL"),
  question("links", "linkedinUrl", "text", "Public LinkedIn profile", {
    placeholder: "https://www.linkedin.com/in/your-name",
  }),
  question("links", "githubUrl", "text", "Code hosting profile URL"),
  question("links", "githubUrl", "text", "Source code repository profile"),
  question("links", "portfolioUrl", "text", "Personal site or portfolio link"),
  question("links", "portfolioUrl", "text", "Website / work samples URL"),

  question("education", "school", "text", "College or university name"),
  question("education", "school", "combobox", "Educational institution attended"),
  question("education", "degree", "select", "Highest qualification earned"),
  question("education", "degree", "combobox", "What academic degree did you receive?"),
  question("education", "fieldOfStudy", "text", "Major / Area of Study"),
  question("education", "fieldOfStudy", "combobox", "Academic program or concentration"),
  question("education", "educationStartDate", "date", "When did you begin school?"),
  question("education", "graduationDate", "text", "Expected completion month and year"),
  question("education", "certifications", "textarea", "Licenses, certificates, or professional credentials"),
  question("education", "undergraduateGpa", "text", "Bachelor's cumulative GPA"),
  question("education", "graduateGpa", "text", "Master's cumulative GPA"),

  question("experience", "relevantExperienceYears", "text", "Total relevant experience in years"),
  question("experience", "relevantExperienceYears", "select", "How many years have you worked professionally?"),
  question(
    "experience",
    "softwareIndustryExperienceYears",
    "text",
    "Years of professional software development experience",
    { description: "Do not count internships or school projects." },
  ),
  question(
    "experience",
    "softwareIndustryExperienceYears",
    "select",
    "Software engineering industry tenure excluding internships",
  ),
  question("experience", "previousEmployers", "choice", "Have you ever been employed by Acme?", {
    optionTexts: yesNo,
  }),
  question("experience", "previousEmployers", "select", "Were you formerly an Acme employee?", {
    optionTexts: yesNo,
  }),
  question("experience", "securityClearances", "select", "Current security clearance level"),

  question("source", "heardAboutJob", "select", "How did you learn about this opportunity?"),
  question("source", "heardAboutJob", "combobox", "Where did you discover this opening?"),
  question("source", "heardAboutJob", "select", "Recruiting source"),
  question("referral", "referrerName", "text", "Who referred you? Employee full name"),
  question("referral", "referrerEmail", "text", "Referring employee's work email"),
  question("referral", "heardAboutJobOther", "text", "Other recruiting source details"),

  question(
    "authorization",
    "workAuthorization",
    "choice",
    "Are you legally eligible to work in the country for this role?",
    { optionTexts: yesNo },
  ),
  question(
    "authorization",
    "workAuthorization",
    "select",
    "Do you have unrestricted authorization to work here?",
    { optionTexts: yesNo },
  ),
  question(
    "authorization",
    "workAuthorization",
    "choice",
    "Can you work in the United States without requiring visa sponsorship?",
    { optionTexts: yesNo },
  ),
  question(
    "sponsorship",
    "requiresSponsorship",
    "choice",
    "Will you now or later need employer immigration sponsorship?",
    { optionTexts: yesNo },
  ),
  question(
    "sponsorship",
    "requiresSponsorship",
    "select",
    "Would the company need to sponsor a work visa for you?",
    { optionTexts: yesNo },
  ),
  question(
    "sponsorship",
    "requiresSponsorship",
    "choice",
    "Do you not require visa sponsorship?",
    { optionTexts: yesNo },
  ),

  question("compensation", "compensationExpectation", "text", "Desired total compensation per year"),
  question("compensation", "compensationExpectation", "text", "What are your annual salary expectations?"),
  question("compensation", "compensationCurrency", "select", "Currency for expected pay"),
  question("compensation", "compensationFrequency", "select", "Expected pay basis or frequency"),

  question("availability", "availableStartDate", "date", "When could you begin employment?"),
  question("availability", "availableStartDate", "date", "Available start date", {
    description: "Take into account the notice you must give your current employer.",
  }),
  question("availability", "availableStartDate", "text", "Earliest date you can join"),
  question("availability", "noticePeriod", "text", "How much notice must you give your current employer?"),
  question("availability", "willingToRelocate", "choice", "Would you be open to relocating?", {
    optionTexts: yesNo,
  }),
  question("availability", "willingToTravel", "choice", "Are you able and willing to travel?", {
    optionTexts: yesNo,
  }),
  question("availability", "maxTravelPercentage", "select", "What percent travel can you accommodate?"),
  question(
    "availability",
    "preferredOfficeLocations",
    "check-many",
    "Select every office where you are able to work",
  ),

  question(
    "requirements",
    "canPerformEssentialFunctions",
    "choice",
    "Can you carry out the essential duties of this job with or without reasonable accommodation?",
    { optionTexts: yesNo },
  ),
  question("requirements", "isAtLeast18", "choice", "Are you age 18 or above?", {
    optionTexts: yesNo,
  }),
  question("requirements", "citizenshipStatus", "select", "Current nationality / citizenship status"),

  question("demographics", "pronouns", "select", "Which pronouns should we use for you?"),
  question("demographics", "gender", "select", "How do you self-describe your gender identity?"),
  question("demographics", "transgenderStatus", "choice", "Do you identify as transgender?", {
    optionTexts: yesNo,
  }),
  question("demographics", "raceEthnicity", "select", "How would you self-identify your race / ethnicity?"),
  question("demographics", "hispanicLatino", "choice", "Do you identify as Latino or Hispanic?", {
    optionTexts: yesNo,
  }),
  question("demographics", "disabilityStatus", "select", "Disability self-identification status"),
  question("demographics", "veteranStatus", "select", "Protected veteran classification"),
];

export const guardedQuestionCorpus = [
  question("guard", "none", "text", "Referrer's LinkedIn profile URL"),
  question("guard", "none", "text", "Reference contact email address"),
  question("guard", "none", "text", "Company website"),
  question("guard", "none", "text", "Country of birth"),
  question("guard", "none", "text", "City of birth"),
  question("guard", "none", "select", "State of birth"),
  question("guard", "none", "select", "Gender at birth"),
  question("guard", "none", "combobox", "Desired location"),
  question("guard", "none", "text", "Position location"),
  question("guard", "none", "combobox", "Where is this role located?"),
  {
    category: "guard",
    expectedKey: "none",
    controlKind: "combobox",
    signals: [
      {
        text: "birth_location",
        weight: 0.76,
        source: "name",
      },
    ],
  },
  question("guard", "none", "text", "Salary based on experience"),
  question("guard", "none", "text", "Live demo URL"),
  question("guard", "none", "text", "Municipality"),
  question("guard", "none", "date", "Employment start date"),
  question("guard", "none", "text", "Years of experience with Python"),
  question("guard", "none", "select", "Years of React experience"),
  question("guard", "none", "text", "Years of management experience"),
  {
    category: "guard",
    expectedKey: "none",
    controlKind: "date",
    signals: [
      { text: "Start date", weight: 1, source: "label" },
      { text: "Work experience", weight: 0.55, source: "section" },
    ],
  },
  question(
    "guard",
    "none",
    "choice",
    "Are you under the minimum age requirement?",
    { optionTexts: yesNo },
  ),
  question("guard", "none", "choice", "Are you younger than 18?", {
    optionTexts: yesNo,
  }),
  question("guard", "none", "choice", "Are you not willing to relocate?", {
    optionTexts: yesNo,
  }),
  question("guard", "none", "choice", "Do you not identify as transgender?", {
    optionTexts: yesNo,
  }),
  question("guard", "none", "choice", "Are you unable to perform the essential functions?", {
    optionTexts: yesNo,
  }),
  question("guard", "none", "select", "What type of visa do you currently hold?"),
  question("guard", "none", "choice", "Do you need authorization to work?", {
    optionTexts: yesNo,
  }),
  question("guard", "none", "choice", "Do you lack authorization to work?", {
    optionTexts: yesNo,
  }),
  question(
    "guard",
    "none",
    "choice",
    "Are you without authorization to work in the United States?",
    { optionTexts: yesNo },
  ),
  question("guard", "none", "choice", "Do you have no authorization to work here?", {
    optionTexts: yesNo,
  }),
  question("guard", "none", "select", "Will you need an export-control license?"),
  question("guard", "none", "text", "Email or mobile number"),
  question("guard", "none", "select", "Preferred office location"),
  {
    category: "guard",
    expectedKey: "none",
    controlKind: "choice",
    optionTexts: yesNo,
    signals: [
      {
        text: "do_not_identify_as_transgender",
        weight: 0.92,
        source: "platform",
      },
    ],
  },
  {
    category: "guard",
    expectedKey: "none",
    controlKind: "choice",
    optionTexts: yesNo,
    signals: [
      {
        text: "not_willing_to_relocate",
        weight: 0.92,
        source: "platform",
      },
    ],
  },
];
