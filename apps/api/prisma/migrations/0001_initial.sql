-- CreateTable
CREATE TABLE "Enterprise" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'real',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "shopIds" TEXT[],

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "shopIds" TEXT[],
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unverified',

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRequest" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "datasets" TEXT[],
    "allowedMethods" TEXT[],
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "timezone" TEXT,
    "requiredFields" TEXT[],
    "notes" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadGrant" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "collectionRequestId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "collectionRequestId" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'uploading',
    "manifest" JSONB NOT NULL,
    "mapping" JSONB NOT NULL,
    "previewVersion" INTEGER NOT NULL DEFAULT 0,
    "previewHash" TEXT,
    "summary" JSONB,
    "error" TEXT,
    "confirmedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT,
    "uploadedAt" TIMESTAMP(3),

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingRow" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "canonical" JSONB,
    "errors" TEXT[],
    "decision" TEXT NOT NULL DEFAULT 'unmapped',
    "baseRecordId" UUID,
    "baseVersion" INTEGER,

    CONSTRAINT "StagingRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MappingProfile" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "columnsHash" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MappingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRecord" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "dataset" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceUpdatedAt" TIMESTAMP(3),
    "sourceRowId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordVersion" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "sourceRowId" UUID,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityLink" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "confirmedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "delta" TEXT NOT NULL,
    "reservedDelta" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetSnapshot" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "records" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "kind" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "metrics" JSONB,
    "insights" JSONB,
    "model" TEXT,
    "templateVersion" TEXT NOT NULL DEFAULT 'analysis-1.0',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionDraft" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "recordId" UUID,
    "baseVersion" INTEGER,
    "sourceHash" TEXT,
    "payload" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedBy" UUID,
    "appliedVersion" INTEGER,
    "previousData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "productId" UUID,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "monthlyBudget" DECIMAL(20,8) NOT NULL,
    "inputPrice" DECIMAL(20,8) NOT NULL,
    "outputPrice" DECIMAL(20,8) NOT NULL,
    "maxTokens" INTEGER NOT NULL DEFAULT 1800,
    "concurrency" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCall" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "runId" UUID,
    "model" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reservedCost" DECIMAL(20,8) NOT NULL,
    "cost" DECIMAL(20,8),
    "costKind" TEXT NOT NULL DEFAULT 'estimated',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idempotency" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" UUID NOT NULL,
    "enterpriseId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_enterpriseId_userId_key" ON "Membership"("enterpriseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_enterpriseId_id_key" ON "Shop"("enterpriseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRequest_enterpriseId_shopId_id_key" ON "CollectionRequest"("enterpriseId", "shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UploadGrant_tokenHash_key" ON "UploadGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "UploadGrant_enterpriseId_shopId_idx" ON "UploadGrant"("enterpriseId", "shopId");

-- CreateIndex
CREATE INDEX "ImportBatch_enterpriseId_shopId_createdAt_idx" ON "ImportBatch"("enterpriseId", "shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_enterpriseId_shopId_id_key" ON "ImportBatch"("enterpriseId", "shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_enterpriseId_shopId_id_key" ON "ImportFile"("enterpriseId", "shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_batchId_filename_key" ON "ImportFile"("batchId", "filename");

-- CreateIndex
CREATE INDEX "StagingRow_enterpriseId_shopId_fileId_idx" ON "StagingRow"("enterpriseId", "shopId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "StagingRow_fileId_rowNumber_key" ON "StagingRow"("fileId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MappingProfile_enterpriseId_shopId_name_version_key" ON "MappingProfile"("enterpriseId", "shopId", "name", "version");

-- CreateIndex
CREATE INDEX "BusinessRecord_enterpriseId_shopId_dataset_updatedAt_idx" ON "BusinessRecord"("enterpriseId", "shopId", "dataset", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecord_enterpriseId_shopId_id_key" ON "BusinessRecord"("enterpriseId", "shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecord_enterpriseId_shopId_dataset_sourcePlatform_e_key" ON "BusinessRecord"("enterpriseId", "shopId", "dataset", "sourcePlatform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordVersion_recordId_version_key" ON "RecordVersion"("recordId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EntityLink_enterpriseId_shopId_fromId_toId_kind_key" ON "EntityLink"("enterpriseId", "shopId", "fromId", "toId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetSnapshot_enterpriseId_shopId_fingerprint_key" ON "DatasetSnapshot"("enterpriseId", "shopId", "fingerprint");

-- CreateIndex
CREATE INDEX "AnalysisRun_enterpriseId_shopId_createdAt_idx" ON "AnalysisRun"("enterpriseId", "shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelConfig_enterpriseId_key" ON "ModelConfig"("enterpriseId");

-- CreateIndex
CREATE INDEX "Audit_enterpriseId_createdAt_idx" ON "Audit"("enterpriseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Idempotency_enterpriseId_shopId_key_key" ON "Idempotency"("enterpriseId", "shopId", "key");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_enterpriseId_shopId_fkey" FOREIGN KEY ("enterpriseId", "shopId") REFERENCES "Shop"("enterpriseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadGrant" ADD CONSTRAINT "UploadGrant_enterpriseId_shopId_collectionRequestId_fkey" FOREIGN KEY ("enterpriseId", "shopId", "collectionRequestId") REFERENCES "CollectionRequest"("enterpriseId", "shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_enterpriseId_shopId_fkey" FOREIGN KEY ("enterpriseId", "shopId") REFERENCES "Shop"("enterpriseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_enterpriseId_shopId_collectionRequestId_fkey" FOREIGN KEY ("enterpriseId", "shopId", "collectionRequestId") REFERENCES "CollectionRequest"("enterpriseId", "shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_enterpriseId_shopId_batchId_fkey" FOREIGN KEY ("enterpriseId", "shopId", "batchId") REFERENCES "ImportBatch"("enterpriseId", "shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingRow" ADD CONSTRAINT "StagingRow_enterpriseId_shopId_fileId_fkey" FOREIGN KEY ("enterpriseId", "shopId", "fileId") REFERENCES "ImportFile"("enterpriseId", "shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecord" ADD CONSTRAINT "BusinessRecord_enterpriseId_shopId_fkey" FOREIGN KEY ("enterpriseId", "shopId") REFERENCES "Shop"("enterpriseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordVersion" ADD CONSTRAINT "RecordVersion_enterpriseId_shopId_recordId_fkey" FOREIGN KEY ("enterpriseId", "shopId", "recordId") REFERENCES "BusinessRecord"("enterpriseId", "shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_enterpriseId_shopId_fkey" FOREIGN KEY ("enterpriseId", "shopId") REFERENCES "Shop"("enterpriseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

