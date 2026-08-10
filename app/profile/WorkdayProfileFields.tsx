"use client";

import type {
  ProfileCredential,
  ProfileData,
  ProfileEducationEntry,
  ProfileLanguage,
  ProfileWebsite,
  ProfileWorkExperience,
} from "@/lib/settings";
import { cls } from "../components/ui";

interface Props {
  profile: ProfileData;
  onChange: <K extends keyof ProfileData>(
    key: K,
    value: ProfileData[K],
  ) => void;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={cls.label}>{label}</label>
      <div className="mt-1">{children}</div>
      {hint && (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{hint}</p>
      )}
    </div>
  );
}

function TriState({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean | null | undefined;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        aria-label={label}
        className={cls.input}
        value={value === true ? "yes" : value === false ? "no" : ""}
        onChange={(event) =>
          onChange(
            event.target.value === "yes"
              ? true
              : event.target.value === "no"
                ? false
                : null,
          )
        }
      >
        <option value="">Select an answer</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </Field>
  );
}

function RepeatList<T>({
  title,
  description,
  itemName,
  items,
  maxItems,
  createItem,
  onChange,
  children,
}: {
  title: string;
  description: string;
  itemName: string;
  items: T[];
  maxItems: number;
  createItem: () => T;
  onChange: (items: T[]) => void;
  children: (
    item: T,
    index: number,
    update: (patch: Partial<T>) => void,
  ) => React.ReactNode;
}) {
  return (
    <section className="border-t border-gray-200 pt-5 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
            {title}
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
            {description}
          </p>
        </div>
        <button
          type="button"
          className={cls.btn}
          disabled={items.length >= maxItems}
          onClick={() => onChange([...items, createItem()])}
        >
          Add {itemName}
        </button>
      </div>
      {items.length ? (
        <div className="mt-4 space-y-4">
          {items.map((item, index) => (
            <fieldset
              key={index}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <legend className="px-1 text-sm font-semibold">
                {itemName} {index + 1}
              </legend>
              {children(item, index, (patch) =>
                onChange(
                  items.map((candidate, itemIndex) =>
                    itemIndex === index ? { ...candidate, ...patch } : candidate,
                  ),
                ),
              )}
              <button
                type="button"
                className={`${cls.btn} mt-4`}
                onClick={() =>
                  onChange(items.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                Remove {itemName.toLowerCase()} {index + 1}
              </button>
            </fieldset>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          No {itemName.toLowerCase()} entries saved.
        </p>
      )}
    </section>
  );
}

function emptyWorkExperience(): ProfileWorkExperience {
  return {
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    currentRole: null,
    description: "",
  };
}

function emptyEducation(): ProfileEducationEntry {
  return {
    school: "",
    degree: "",
    degreeOther: "",
    fieldOfStudy: "",
    startDate: "",
    graduationDate: "",
    graduationDateExact: "",
    gpa: "",
  };
}

function emptyCredential(): ProfileCredential {
  return {
    name: "",
    issuer: "",
    credentialId: "",
    issueDate: "",
    expirationDate: "",
    doesNotExpire: null,
  };
}

function emptyLanguage(): ProfileLanguage {
  return {
    language: "",
    overallProficiency: "",
    speakingProficiency: "",
    readingProficiency: "",
    writingProficiency: "",
  };
}

function emptyWebsite(): ProfileWebsite {
  return { label: "", url: "" };
}

export function WorkdayProfileFields({ profile, onChange }: Props) {
  return (
    <section className={cls.card}>
      <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">
        Workday application details
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        Structured entries support Workday&apos;s repeated application pages.
        Blank legal, eligibility, and identity answers are always left for manual
        review.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Address line 1">
          <input
            aria-label="Address line 1"
            className={cls.input}
            autoComplete="address-line1"
            value={profile.homeAddressLine1}
            onChange={(event) =>
              onChange("homeAddressLine1", event.target.value)
            }
          />
        </Field>
        <Field label="Address line 2">
          <input
            aria-label="Address line 2"
            className={cls.input}
            autoComplete="address-line2"
            value={profile.homeAddressLine2}
            onChange={(event) =>
              onChange("homeAddressLine2", event.target.value)
            }
          />
        </Field>
        <Field label="Home city">
          <input
            aria-label="Home city"
            className={cls.input}
            autoComplete="address-level2"
            value={profile.homeCity}
            onChange={(event) => onChange("homeCity", event.target.value)}
          />
        </Field>
        <Field label="State / province / region">
          <input
            aria-label="State / province / region"
            className={cls.input}
            autoComplete="address-level1"
            value={profile.homeRegion}
            onChange={(event) => onChange("homeRegion", event.target.value)}
          />
        </Field>
        <Field label="Postal code">
          <input
            aria-label="Postal code"
            className={cls.input}
            autoComplete="postal-code"
            value={profile.homePostalCode}
            onChange={(event) => onChange("homePostalCode", event.target.value)}
          />
        </Field>
        <Field label="Home country">
          <input
            aria-label="Home country"
            className={cls.input}
            autoComplete="country-name"
            value={profile.homeCountry}
            onChange={(event) => onChange("homeCountry", event.target.value)}
          />
        </Field>
        <Field label="Phone country code">
          <input
            aria-label="Phone country code"
            className={cls.input}
            autoComplete="tel-country-code"
            placeholder="+1"
            value={profile.phoneCountryCode}
            onChange={(event) =>
              onChange("phoneCountryCode", event.target.value)
            }
          />
        </Field>
        <Field label="Phone type">
          <select
            aria-label="Phone type"
            className={cls.input}
            value={profile.phoneType}
            onChange={(event) => onChange("phoneType", event.target.value)}
          >
            <option value="">Select a phone type</option>
            <option value="Mobile">Mobile</option>
            <option value="Home">Home</option>
            <option value="Work">Work</option>
          </select>
        </Field>
        <Field label="Phone extension">
          <input
            aria-label="Phone extension"
            className={cls.input}
            autoComplete="tel-extension"
            value={profile.phoneExtension}
            onChange={(event) => onChange("phoneExtension", event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-6 space-y-6">
        <RepeatList
          title="Work history"
          description="Workday adds one repeated section per saved role. Existing entries and values on the page are preserved."
          itemName="Work experience"
          items={profile.workExperiences ?? []}
          maxItems={20}
          createItem={emptyWorkExperience}
          onChange={(items) => onChange("workExperiences", items)}
        >
          {(entry, index, update) => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={`Company ${index + 1}`}>
                <input
                  aria-label={`Company ${index + 1}`}
                  className={cls.input}
                  value={entry.company}
                  onChange={(event) => update({ company: event.target.value })}
                />
              </Field>
              <Field label={`Job title ${index + 1}`}>
                <input
                  aria-label={`Job title ${index + 1}`}
                  className={cls.input}
                  value={entry.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </Field>
              <Field label={`Work location ${index + 1}`}>
                <input
                  aria-label={`Work location ${index + 1}`}
                  className={cls.input}
                  value={entry.location}
                  onChange={(event) => update({ location: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Start month ${index + 1}`}>
                  <input
                    aria-label={`Start month ${index + 1}`}
                    type="month"
                    className={cls.input}
                    value={entry.startDate}
                    onChange={(event) =>
                      update({ startDate: event.target.value })
                    }
                  />
                </Field>
                <Field label={`End month ${index + 1}`}>
                  <input
                    aria-label={`End month ${index + 1}`}
                    type="month"
                    className={cls.input}
                    disabled={entry.currentRole === true}
                    value={entry.currentRole ? "" : entry.endDate}
                    onChange={(event) => update({ endDate: event.target.value })}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  aria-label={`I currently work here ${index + 1}`}
                  type="checkbox"
                  checked={entry.currentRole === true}
                  onChange={(event) =>
                    update({
                      currentRole: event.target.checked,
                      ...(event.target.checked ? { endDate: "" } : {}),
                    })
                  }
                />
                I currently work here
              </label>
              <Field label={`Role description ${index + 1}`}>
                <textarea
                  aria-label={`Role description ${index + 1}`}
                  className={`${cls.input} min-h-24 md:col-span-2`}
                  value={entry.description}
                  onChange={(event) =>
                    update({ description: event.target.value })
                  }
                />
              </Field>
            </div>
          )}
        </RepeatList>

        <RepeatList
          title="Additional education"
          description="Your primary school and degree above are used first; add only additional education here."
          itemName="Education"
          items={profile.additionalEducation ?? []}
          maxItems={10}
          createItem={emptyEducation}
          onChange={(items) => onChange("additionalEducation", items)}
        >
          {(entry, index, update) => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={`School ${index + 1}`}>
                <input
                  aria-label={`Additional school ${index + 1}`}
                  className={cls.input}
                  value={entry.school}
                  onChange={(event) => update({ school: event.target.value })}
                />
              </Field>
              <Field label={`Degree ${index + 1}`}>
                <select
                  aria-label={`Additional degree ${index + 1}`}
                  className={cls.input}
                  value={entry.degree}
                  onChange={(event) => update({ degree: event.target.value })}
                >
                  <option value="">Select a degree</option>
                  <option value="High school diploma">High school diploma</option>
                  <option value="Associate degree">Associate degree</option>
                  <option value="Bachelor's degree">Bachelor&apos;s degree</option>
                  <option value="Master's degree">Master&apos;s degree</option>
                  <option value="Doctorate">Doctorate</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              {entry.degree === "Other" && (
                <Field label={`Other degree ${index + 1}`}>
                  <input
                    aria-label={`Additional other degree ${index + 1}`}
                    className={cls.input}
                    value={entry.degreeOther}
                    onChange={(event) =>
                      update({ degreeOther: event.target.value })
                    }
                  />
                </Field>
              )}
              <Field label={`Field of study ${index + 1}`}>
                <input
                  aria-label={`Additional field of study ${index + 1}`}
                  className={cls.input}
                  value={entry.fieldOfStudy}
                  onChange={(event) =>
                    update({ fieldOfStudy: event.target.value })
                  }
                />
              </Field>
              <Field label={`Education start month ${index + 1}`}>
                <input
                  aria-label={`Additional education start month ${index + 1}`}
                  type="month"
                  className={cls.input}
                  value={entry.startDate}
                  onChange={(event) =>
                    update({ startDate: event.target.value })
                  }
                />
              </Field>
              <Field label={`Education end month ${index + 1}`}>
                <input
                  aria-label={`Additional education end month ${index + 1}`}
                  type="month"
                  className={cls.input}
                  value={entry.graduationDate}
                  onChange={(event) =>
                    update({
                      graduationDate: event.target.value,
                      graduationDateExact:
                        entry.graduationDateExact?.slice(0, 7) ===
                        event.target.value
                          ? entry.graduationDateExact
                          : "",
                    })
                  }
                />
              </Field>
              <Field label={`Exact education end date ${index + 1}`}>
                <input
                  aria-label={`Additional exact education end date ${index + 1}`}
                  type="date"
                  className={cls.input}
                  value={entry.graduationDateExact ?? ""}
                  onChange={(event) =>
                    update({
                      graduationDate:
                        event.target.value.slice(0, 7) || entry.graduationDate,
                      graduationDateExact: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label={`GPA ${index + 1}`}>
                <input
                  aria-label={`Additional GPA ${index + 1}`}
                  className={cls.input}
                  value={entry.gpa}
                  onChange={(event) => update({ gpa: event.target.value })}
                />
              </Field>
            </div>
          )}
        </RepeatList>

        <RepeatList
          title="Certifications and licenses"
          description="Use exact saved values for names, issuers, identifiers, and dates."
          itemName="Credential"
          items={profile.certifications ?? []}
          maxItems={20}
          createItem={emptyCredential}
          onChange={(items) => onChange("certifications", items)}
        >
          {(entry, index, update) => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={`Credential name ${index + 1}`}>
                <input
                  aria-label={`Credential name ${index + 1}`}
                  className={cls.input}
                  value={entry.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </Field>
              <Field label={`Issuer ${index + 1}`}>
                <input
                  aria-label={`Credential issuer ${index + 1}`}
                  className={cls.input}
                  value={entry.issuer}
                  onChange={(event) => update({ issuer: event.target.value })}
                />
              </Field>
              <Field label={`Credential or license number ${index + 1}`}>
                <input
                  aria-label={`Credential number ${index + 1}`}
                  className={cls.input}
                  value={entry.credentialId}
                  onChange={(event) =>
                    update({ credentialId: event.target.value })
                  }
                />
              </Field>
              <Field label={`Issue month ${index + 1}`}>
                <input
                  aria-label={`Credential issue month ${index + 1}`}
                  type="month"
                  className={cls.input}
                  value={entry.issueDate}
                  onChange={(event) =>
                    update({ issueDate: event.target.value })
                  }
                />
              </Field>
              <Field label={`Expiration month ${index + 1}`}>
                <input
                  aria-label={`Credential expiration month ${index + 1}`}
                  type="month"
                  className={cls.input}
                  disabled={entry.doesNotExpire === true}
                  value={entry.doesNotExpire ? "" : entry.expirationDate}
                  onChange={(event) =>
                    update({ expirationDate: event.target.value })
                  }
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  aria-label={`Credential does not expire ${index + 1}`}
                  type="checkbox"
                  checked={entry.doesNotExpire === true}
                  onChange={(event) =>
                    update({
                      doesNotExpire: event.target.checked,
                      ...(event.target.checked ? { expirationDate: "" } : {}),
                    })
                  }
                />
                This credential does not expire
              </label>
            </div>
          )}
        </RepeatList>

        <RepeatList
          title="Languages"
          description="Save only proficiency values you are comfortable using verbatim."
          itemName="Language"
          items={profile.languages ?? []}
          maxItems={20}
          createItem={emptyLanguage}
          onChange={(items) => onChange("languages", items)}
        >
          {(entry, index, update) => (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Language", "language"],
                  ["Overall proficiency", "overallProficiency"],
                  ["Speaking", "speakingProficiency"],
                  ["Reading", "readingProficiency"],
                  ["Writing", "writingProficiency"],
                ] as const
              ).map(([label, key]) => (
                <Field key={key} label={`${label} ${index + 1}`}>
                  <input
                    aria-label={`${label} ${index + 1}`}
                    className={cls.input}
                    value={entry[key]}
                    onChange={(event) =>
                      update({ [key]: event.target.value } as Partial<ProfileLanguage>)
                    }
                  />
                </Field>
              ))}
            </div>
          )}
        </RepeatList>

        <RepeatList
          title="Additional websites and social links"
          description="LinkedIn, GitHub, and your primary website are already included automatically."
          itemName="Website"
          items={profile.additionalWebsites ?? []}
          maxItems={20}
          createItem={emptyWebsite}
          onChange={(items) => onChange("additionalWebsites", items)}
        >
          {(entry, index, update) => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={`Website label ${index + 1}`}>
                <input
                  aria-label={`Website label ${index + 1}`}
                  className={cls.input}
                  value={entry.label}
                  onChange={(event) => update({ label: event.target.value })}
                />
              </Field>
              <Field label={`Website URL ${index + 1}`}>
                <input
                  aria-label={`Additional website URL ${index + 1}`}
                  type="url"
                  className={cls.input}
                  value={entry.url}
                  onChange={(event) => update({ url: event.target.value })}
                />
              </Field>
            </div>
          )}
        </RepeatList>
      </div>

      <section className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
          Availability and recurring answers
        </h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          Consequential yes/no answers remain blank until you explicitly choose
          one.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Available start date">
            <input
              aria-label="Available start date"
              type="date"
              className={cls.input}
              value={profile.availableStartDate}
              onChange={(event) =>
                onChange("availableStartDate", event.target.value)
              }
            />
          </Field>
          <Field label="Notice period">
            <input
              aria-label="Notice period"
              className={cls.input}
              placeholder="Two weeks"
              value={profile.noticePeriod}
              onChange={(event) => onChange("noticePeriod", event.target.value)}
            />
          </Field>
          <Field label="Compensation currency">
            <input
              aria-label="Compensation currency"
              className={cls.input}
              placeholder="USD"
              value={profile.compensationCurrency}
              onChange={(event) =>
                onChange("compensationCurrency", event.target.value)
              }
            />
          </Field>
          <Field label="Compensation frequency">
            <select
              aria-label="Compensation frequency"
              className={cls.input}
              value={profile.compensationFrequency}
              onChange={(event) =>
                onChange("compensationFrequency", event.target.value)
              }
            >
              <option value="">Select a frequency</option>
              <option value="Hourly">Hourly</option>
              <option value="Monthly">Monthly</option>
              <option value="Annual">Annual</option>
            </select>
          </Field>
          <TriState
            label="Willing to relocate?"
            hint="Defaults to Yes for application autofill; choose No to override."
            value={profile.willingToRelocate}
            onChange={(value) => onChange("willingToRelocate", value)}
          />
          <TriState
            label="Willing to travel?"
            value={profile.willingToTravel}
            onChange={(value) => onChange("willingToTravel", value)}
          />
          <Field label="Maximum travel percentage">
            <input
              aria-label="Maximum travel percentage"
              type="number"
              min="0"
              max="100"
              className={cls.input}
              value={profile.maxTravelPercentage}
              onChange={(event) =>
                onChange("maxTravelPercentage", event.target.value)
              }
            />
          </Field>
          <Field label="Referrer name">
            <input
              aria-label="Referrer name"
              className={cls.input}
              value={profile.referrerName}
              onChange={(event) => onChange("referrerName", event.target.value)}
            />
          </Field>
          <Field label="Referrer email">
            <input
              aria-label="Referrer email"
              type="email"
              className={cls.input}
              value={profile.referrerEmail}
              onChange={(event) => onChange("referrerEmail", event.target.value)}
            />
          </Field>
          <TriState
            label="Are you at least 18 years old?"
            value={profile.isAtLeast18}
            onChange={(value) => onChange("isAtLeast18", value)}
          />
        </div>
      </section>
    </section>
  );
}
