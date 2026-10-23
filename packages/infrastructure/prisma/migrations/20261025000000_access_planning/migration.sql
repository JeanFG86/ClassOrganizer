-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "username" VARCHAR(40) NOT NULL,
    "password_hash" VARCHAR(256) NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_session" (
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "login_session_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "login_attempt" (
    "key" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app_state" (
    "id" INTEGER NOT NULL,
    "catalog_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "app_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "copied_from_id" UUID,

    CONSTRAINT "planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_revision" (
    "id" UUID NOT NULL,
    "planning_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "rules_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "availability_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "sealed_at" TIMESTAMPTZ(3),

    CONSTRAINT "planning_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE INDEX "login_session_user_id_idx" ON "login_session"("user_id");

-- CreateIndex
CREATE INDEX "login_session_expires_at_idx" ON "login_session"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempt_expires_at_idx" ON "login_attempt"("expires_at");

-- CreateIndex
CREATE INDEX "audit_event_occurred_at_idx" ON "audit_event"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_event_entity_id_occurred_at_idx" ON "audit_event"("entity_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "planning_revision_planning_id_number_key" ON "planning_revision"("planning_id", "number");

-- AddForeignKey
ALTER TABLE "login_session" ADD CONSTRAINT "login_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning" ADD CONSTRAINT "planning_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "planning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_revision" ADD CONSTRAINT "planning_revision_planning_id_fkey" FOREIGN KEY ("planning_id") REFERENCES "planning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_revision" ADD CONSTRAINT "planning_revision_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Garantias que também valem para gravações fora dos casos de uso.
INSERT INTO app_state (id, catalog_version) VALUES (1, 1);
ALTER TABLE app_state ADD CONSTRAINT app_state_singleton CHECK (id = 1 AND catalog_version > 0);
ALTER TABLE app_user
  ADD CONSTRAINT app_user_role CHECK (role IN ('admin', 'editor', 'viewer')),
  ADD CONSTRAINT app_user_version CHECK (version > 0),
  ADD CONSTRAINT app_user_username CHECK (username ~ '^[a-z][a-z0-9._-]{3,39}$');
ALTER TABLE planning ADD CONSTRAINT planning_valid CHECK (
  version > 0 AND year BETWEEN 2000 AND 2200 AND length(trim(name)) BETWEEN 1 AND 100
);
ALTER TABLE planning_revision
  ADD CONSTRAINT planning_revision_valid CHECK (
    number > 0 AND (sealed_at IS NULL OR (rules_reviewed AND availability_reviewed))
  ),
  ADD CONSTRAINT planning_snapshot_valid CHECK (
    jsonb_typeof(snapshot) = 'object'
    AND snapshot ?& ARRAY['formatVersion', 'catalogVersion', 'capturedAt', 'subjects', 'teachers', 'classGroups', 'shifts', 'assignments']
    AND snapshot->>'formatVersion' = '1'
    AND snapshot->>'catalogVersion' ~ '^[1-9][0-9]*$'
    AND jsonb_typeof(snapshot->'capturedAt') = 'string'
    AND jsonb_typeof(snapshot->'subjects') = 'array'
    AND jsonb_typeof(snapshot->'teachers') = 'array'
    AND jsonb_typeof(snapshot->'classGroups') = 'array'
    AND jsonb_typeof(snapshot->'shifts') = 'array'
    AND jsonb_typeof(snapshot->'assignments') = 'array'
  );
CREATE FUNCTION protect_planning_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Revisões não podem ser excluídas'; END IF;
  IF OLD.sealed_at IS NOT NULL OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
     NEW.id IS DISTINCT FROM OLD.id OR NEW.planning_id IS DISTINCT FROM OLD.planning_id OR
     NEW.number IS DISTINCT FROM OLD.number OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'O conteúdo da revisão é imutável';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER planning_revision_immutable BEFORE UPDATE OR DELETE ON planning_revision FOR EACH ROW EXECUTE FUNCTION protect_planning_revision();
CREATE FUNCTION protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'A auditoria é somente de acréscimo'; END; $$;
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON audit_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
