-- The project has no plans or license keys; nothing reads these anymore.
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "plan";

DROP TABLE IF EXISTS "app_settings";
