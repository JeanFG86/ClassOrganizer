-- CreateTable
CREATE TABLE "generation_run" (
    "id" UUID NOT NULL,
    "planning_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "options" JSONB NOT NULL,
    "input" JSONB NOT NULL,
    "input_digest" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" VARCHAR(100),
    "lease_expires_at" TIMESTAMPTZ(3),
    "heartbeat_at" TIMESTAMPTZ(3),
    "cancel_requested_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "result" JSONB,
    "applied_at" TIMESTAMPTZ(3),
    "applied_by" UUID,

    CONSTRAINT "generation_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_run_revision_id_requested_at_idx" ON "generation_run"("revision_id", "requested_at");

-- CreateIndex
CREATE INDEX "generation_run_planning_id_idx" ON "generation_run"("planning_id");

-- CreateIndex
CREATE INDEX "generation_run_status_requested_at_idx" ON "generation_run"("status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "planning_revision_id_planning_id_key" ON "planning_revision"("id", "planning_id");

-- AddForeignKey
ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_planning_id_fkey" FOREIGN KEY ("planning_id") REFERENCES "planning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_revision_id_planning_id_fkey" FOREIGN KEY ("revision_id", "planning_id") REFERENCES "planning_revision"("id", "planning_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Garantias que também valem para gravações fora dos casos de uso (ADR 0014).
-- Uma única execução ativa por planejamento.
CREATE UNIQUE INDEX generation_run_active_key ON generation_run (planning_id)
  WHERE status IN ('queued', 'running');
ALTER TABLE generation_run ADD CONSTRAINT generation_run_valid CHECK (
  status IN ('queued', 'running', 'feasible', 'infeasible', 'inconclusive', 'cancelled', 'invalid_model', 'failed')
  AND attempts >= 0
  AND input_digest ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof(options) = 'object'
  AND jsonb_typeof(input) = 'object'
  AND (status IN ('queued', 'running')) = (finished_at IS NULL)
  AND (status IN ('queued', 'running')) = (result IS NULL)
  AND (status <> 'running' OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
  AND (status <> 'queued' OR lease_owner IS NULL)
  AND (result IS NULL OR jsonb_typeof(result) = 'object')
  AND (status <> 'feasible' OR jsonb_typeof(result->'placements') = 'array')
  AND (applied_at IS NULL) = (applied_by IS NULL)
  AND (applied_at IS NULL OR status = 'feasible')
);
CREATE FUNCTION protect_generation_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Execuções de geração não são excluídas'; END IF;
  IF NEW.id <> OLD.id OR NEW.planning_id <> OLD.planning_id OR NEW.revision_id <> OLD.revision_id
    OR NEW.requested_by <> OLD.requested_by OR NEW.requested_at <> OLD.requested_at
    OR NEW.input IS DISTINCT FROM OLD.input OR NEW.input_digest <> OLD.input_digest
    OR NEW.options IS DISTINCT FROM OLD.options THEN
    RAISE EXCEPTION 'A solicitação de geração é imutável';
  END IF;
  -- Terminada, a execução só pode ser marcada como aplicada, uma única vez.
  IF OLD.status NOT IN ('queued', 'running') AND (
    OLD.applied_at IS NOT NULL OR NEW.status <> OLD.status
    OR NEW.result IS DISTINCT FROM OLD.result OR NEW.finished_at IS DISTINCT FROM OLD.finished_at
  ) THEN
    RAISE EXCEPTION 'O resultado de uma geração terminada é imutável';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER generation_run_protected BEFORE UPDATE OR DELETE ON generation_run FOR EACH ROW EXECUTE FUNCTION protect_generation_run();

-- A aplicação de uma proposta entra no histórico da grade e pode ser desfeita.
ALTER TABLE timetable_change DROP CONSTRAINT timetable_change_valid;
ALTER TABLE timetable_change ADD CONSTRAINT timetable_change_valid CHECK (
  sequence > 0
  AND kind IN ('operation', 'undo', 'import', 'generation')
  AND (kind = 'undo') = (reverts_id IS NOT NULL)
  AND length(trim(summary)) > 0
  AND jsonb_typeof(delta) = 'object'
  AND jsonb_typeof(delta->'removed') = 'array'
  AND jsonb_typeof(delta->'added') = 'array'
);
CREATE OR REPLACE FUNCTION protect_timetable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'O histórico da grade é somente de acréscimo'; END IF;
  IF EXISTS (SELECT 1 FROM planning_revision WHERE id = NEW.revision_id AND sealed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'A grade de uma revisão concluída é imutável';
  END IF;
  IF NEW.reverts_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM timetable_change
    WHERE id = NEW.reverts_id AND revision_id = NEW.revision_id AND kind IN ('operation', 'generation')
  ) THEN
    RAISE EXCEPTION 'Desfazer aponta para uma alteração da mesma revisão';
  END IF;
  RETURN NEW;
END; $$;
