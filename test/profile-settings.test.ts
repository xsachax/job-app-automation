import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import { getProfile, saveProfile } from "../lib/settings";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("structured application profile", () => {
  it("normalizes legacy credentials and interdependent Workday values", async () => {
    await prisma.profile.create({
      data: {
        id: "me",
        data: JSON.stringify({
          certifications: [
            " AWS Certified Developer ",
            {
              name: "Permanent credential",
              issuer: "Issuer",
              credentialId: "",
              issueDate: "2024-01",
              expirationDate: "2028-01",
              doesNotExpire: true,
            },
          ],
          workExperiences: [
            {
              company: " Acme ",
              title: " Engineer ",
              location: "",
              startDate: "2024-01",
              endDate: "2026-01",
              currentRole: true,
              description: "",
            },
          ],
          additionalEducation: [
            {
              school: " University ",
              degree: "Bachelor's degree",
              degreeOther: "",
              fieldOfStudy: "Computer Science",
              startDate: "not-a-month",
              graduationDate: "2025-05",
              graduationDateExact: "2025-05-31",
              gpa: "3.8",
            },
          ],
          availableStartDate: "2026-02-31",
          willingToTravel: false,
          maxTravelPercentage: "25",
        }),
      },
    });

    await expect(getProfile()).resolves.toMatchObject({
      certifications: [
        {
          name: "AWS Certified Developer",
          issuer: "",
          credentialId: "",
          issueDate: "",
          expirationDate: "",
          doesNotExpire: null,
        },
        {
          name: "Permanent credential",
          expirationDate: "",
          doesNotExpire: true,
        },
      ],
      workExperiences: [
        {
          company: "Acme",
          title: "Engineer",
          endDate: "",
          currentRole: true,
        },
      ],
      additionalEducation: [
        {
          school: "University",
          startDate: "",
          graduationDate: "2025-05",
          graduationDateExact: "2025-05-31",
        },
      ],
      availableStartDate: "",
      maxTravelPercentage: "",
    });
  });

  it("preserves exact graduation dates without changing month-only records", async () => {
    await saveProfile({
      graduationDate: "2024-02",
      graduationDateExact: "2024-02-29",
    });
    await expect(getProfile()).resolves.toMatchObject({
      graduationDate: "2024-02",
      graduationDateExact: "2024-02-29",
    });

    await saveProfile({
      graduationDate: "2025-05",
      graduationDateExact: "",
    });
    await expect(getProfile()).resolves.toMatchObject({
      graduationDate: "2025-05",
      graduationDateExact: "",
    });

    await saveProfile({
      graduationDate: "2025-05",
      graduationDateExact: "2023-02-29",
    });
    await expect(getProfile()).resolves.toMatchObject({
      graduationDate: "2025-05",
      graduationDateExact: "",
    });
  });

  it("migrates a blank relocation preference to Yes and preserves explicit No", async () => {
    await prisma.profile.create({
      data: {
        id: "me",
        data: JSON.stringify({ willingToRelocate: null }),
      },
    });

    await expect(getProfile()).resolves.toMatchObject({
      willingToRelocate: true,
    });

    await saveProfile({ willingToRelocate: false });
    await expect(getProfile()).resolves.toMatchObject({
      willingToRelocate: false,
    });
  });

  it("versions each structured collection as one atomic profile field", async () => {
    await saveProfile(
      {
        workExperiences: [
          {
            company: "Newest Company",
            title: "Engineer",
            location: "",
            startDate: "",
            endDate: "",
            currentRole: null,
            description: "",
          },
        ],
      },
      { fieldVersions: { workExperiences: 200 } },
    );
    await saveProfile(
      {
        workExperiences: [
          {
            company: "Stale Company",
            title: "Engineer",
            location: "",
            startDate: "",
            endDate: "",
            currentRole: null,
            description: "",
          },
        ],
        languages: [
          {
            language: "English",
            overallProficiency: "Native",
            speakingProficiency: "",
            readingProficiency: "",
            writingProficiency: "",
          },
        ],
      },
      {
        fieldVersions: {
          workExperiences: 100,
          languages: 300,
        },
      },
    );

    await expect(getProfile()).resolves.toMatchObject({
      workExperiences: [
        expect.objectContaining({ company: "Newest Company" }),
      ],
      languages: [
        expect.objectContaining({
          language: "English",
          overallProficiency: "Native",
        }),
      ],
    });
  });
});
