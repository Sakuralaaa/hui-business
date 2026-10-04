DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='workbench_app') THEN CREATE ROLE workbench_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='workbench_worker') THEN CREATE ROLE workbench_worker NOLOGIN NOSUPERUSER BYPASSRLS; END IF;
END $$;
-- statement
GRANT USAGE ON SCHEMA public TO workbench_app,workbench_worker;
-- statement
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO workbench_app,workbench_worker;
-- statement
DO $$ DECLARE tab text; scoped boolean; BEGIN
  FOREACH tab IN ARRAY ARRAY['Shop','CollectionRequest','UploadGrant','ImportBatch','ImportFile','StagingRow','MappingProfile','BusinessRecord','RecordVersion','EntityLink','InventoryMovement','DatasetSnapshot','AnalysisRun','ActionDraft','Asset','ModelConfig','ModelCall','Audit','Idempotency','WorkItem'] LOOP
    SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tab AND column_name='shopId') INTO scoped;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON %I',tab);
    IF scoped THEN
      EXECUTE format('CREATE POLICY tenant_scope ON %I TO workbench_app USING ("enterpriseId"::text=current_setting(''app.tenant_id'',true) AND (current_setting(''app.shop_ids'',true)=''*'' OR "shopId"::text=ANY(string_to_array(current_setting(''app.shop_ids'',true),'','')))) WITH CHECK ("enterpriseId"::text=current_setting(''app.tenant_id'',true) AND (current_setting(''app.shop_ids'',true)=''*'' OR "shopId"::text=ANY(string_to_array(current_setting(''app.shop_ids'',true),'',''))))',tab);
    ELSE
      EXECUTE format('CREATE POLICY tenant_scope ON %I TO workbench_app USING ("enterpriseId"::text=current_setting(''app.tenant_id'',true)) WITH CHECK ("enterpriseId"::text=current_setting(''app.tenant_id'',true))',tab);
    END IF;
  END LOOP;
END $$;
-- statement
CREATE OR REPLACE FUNCTION lookup_upload_grant(digest text) RETURNS TABLE(id uuid,"enterpriseId" uuid,"shopId" uuid,"collectionRequestId" uuid,"expiresAt" timestamp,"revokedAt" timestamp) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT id,"enterpriseId","shopId","collectionRequestId","expiresAt","revokedAt" FROM "UploadGrant" WHERE "tokenHash"=digest LIMIT 1 $$;
-- statement
REVOKE ALL ON FUNCTION lookup_upload_grant(text) FROM PUBLIC;
-- statement
GRANT EXECUTE ON FUNCTION lookup_upload_grant(text) TO workbench_app;
-- statement
CREATE INDEX IF NOT EXISTS knowledge_search ON "BusinessRecord" USING GIN (to_tsvector('simple',coalesce(data->>'title','')||' '||coalesce(data->>'body',''))) WHERE dataset='knowledge';
-- statement
REVOKE ALL ON "_WorkbenchSchema" FROM workbench_app,workbench_worker;
