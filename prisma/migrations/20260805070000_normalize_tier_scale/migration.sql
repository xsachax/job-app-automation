-- Preserve top-tier preferences while removing the legacy S++ and S+ labels.
UPDATE "CompanyTier" SET "tier" = 'S' WHERE "tier" IN ('S++', 'S+');
UPDATE "LocationTier" SET "tier" = 'S' WHERE "tier" IN ('S++', 'S+');
