UPDATE "Job"
SET "applyUrl" = 'https://careers.withwaymo.com/jobs?gh_jid=' || "externalId"
WHERE "company" = 'Waymo'
  AND "externalId" IS NOT NULL
  AND "applyUrl" IN (
    'https://careers.withwaymo.com/jobs',
    'https://careers.withwaymo.com/jobs/'
  );

UPDATE "Job"
SET "applyUrl" = 'https://www.hudsonrivertrading.com/careers/job/?gh_jid=' || "externalId"
WHERE "company" = 'Hudson River Trading'
  AND "externalId" IS NOT NULL
  AND "applyUrl" IN (
    'https://www.hudsonrivertrading.com/careers/job',
    'https://www.hudsonrivertrading.com/careers/job/'
  );
