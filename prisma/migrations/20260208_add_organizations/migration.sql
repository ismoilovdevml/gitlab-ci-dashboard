-- Multi-Tenant: Add Organization model and organizationId to all data models
-- Migration strategy: nullable FKs → create default org → backfill → (future: make non-nullable)

-- 1. Create organizations table
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- 2. Create organization_members table
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- 3. Add organizationId to all tenant-scoped tables (nullable for backward compat)

-- alert_channels: remove old unique on type, add org-scoped unique
ALTER TABLE "alert_channels" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "alert_channels" DROP CONSTRAINT IF EXISTS "alert_channels_type_key";
CREATE UNIQUE INDEX "alert_channels_organizationId_type_key" ON "alert_channels"("organizationId", "type");

-- alert_history
ALTER TABLE "alert_history" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "alert_history_organizationId_idx" ON "alert_history"("organizationId");

-- gitlab_config
ALTER TABLE "gitlab_config" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "gitlab_config_organizationId_idx" ON "gitlab_config"("organizationId");

-- pipeline_status: update unique constraint to include orgId
ALTER TABLE "pipeline_status" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "pipeline_status" DROP CONSTRAINT IF EXISTS "pipeline_status_projectId_pipelineId_key";
CREATE UNIQUE INDEX "pipeline_status_organizationId_projectId_pipelineId_key" ON "pipeline_status"("organizationId", "projectId", "pipelineId");
CREATE INDEX "pipeline_status_organizationId_idx" ON "pipeline_status"("organizationId");

-- deployments
ALTER TABLE "deployments" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "deployments_organizationId_idx" ON "deployments"("organizationId");

-- incidents
ALTER TABLE "incidents" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "incidents_organizationId_idx" ON "incidents"("organizationId");

-- dora_metrics: update unique constraint to include orgId
ALTER TABLE "dora_metrics" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "dora_metrics" DROP CONSTRAINT IF EXISTS "dora_metrics_projectId_period_periodStart_key";
CREATE UNIQUE INDEX "dora_metrics_organizationId_projectId_period_periodStart_key" ON "dora_metrics"("organizationId", "projectId", "period", "periodStart");
CREATE INDEX "dora_metrics_organizationId_idx" ON "dora_metrics"("organizationId");

-- dashboards
ALTER TABLE "dashboards" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "dashboards_organizationId_idx" ON "dashboards"("organizationId");

-- trend_data
ALTER TABLE "trend_data" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "trend_data_organizationId_idx" ON "trend_data"("organizationId");

-- 4. Add foreign keys
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gitlab_config" ADD CONSTRAINT "gitlab_config_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pipeline_status" ADD CONSTRAINT "pipeline_status_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deployments" ADD CONSTRAINT "deployments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dora_metrics" ADD CONSTRAINT "dora_metrics_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trend_data" ADD CONSTRAINT "trend_data_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
