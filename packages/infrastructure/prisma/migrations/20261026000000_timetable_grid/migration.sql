-- AlterTable
ALTER TABLE "planning_revision" ADD COLUMN     "grid_rules" JSONB NOT NULL DEFAULT '{"formatVersion":1,"planningPeriods":"any_shift","daily":{"maxPerDay":2,"consecutive":true},"dailyExceptions":[]}';

-- CreateTable
CREATE TABLE "timetable_placement" (
    "revision_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "entity_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "period_id" UUID NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "timetable_placement_pkey" PRIMARY KEY ("revision_id","kind","entity_id","weekday","period_id")
);

-- CreateTable
CREATE TABLE "timetable_change" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "summary" TEXT NOT NULL,
    "delta" JSONB NOT NULL,
    "reverts_id" UUID,

    CONSTRAINT "timetable_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "timetable_change_reverts_id_key" ON "timetable_change"("reverts_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_change_revision_id_sequence_key" ON "timetable_change"("revision_id", "sequence");

-- AddForeignKey
ALTER TABLE "timetable_placement" ADD CONSTRAINT "timetable_placement_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "planning_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_change" ADD CONSTRAINT "timetable_change_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "planning_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_change" ADD CONSTRAINT "timetable_change_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_change" ADD CONSTRAINT "timetable_change_reverts_id_fkey" FOREIGN KEY ("reverts_id") REFERENCES "timetable_change"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Garantias que também valem para gravações fora dos casos de uso (ADR 0013).
ALTER TABLE planning_revision ADD CONSTRAINT planning_revision_grid_rules_valid CHECK (
  jsonb_typeof(grid_rules) = 'object'
  AND grid_rules->>'formatVersion' = '1'
  AND grid_rules->>'planningPeriods' IN ('any_shift', 'teaching_shifts')
  AND jsonb_typeof(grid_rules->'daily') = 'object'
  AND jsonb_typeof(grid_rules->'dailyExceptions') = 'array'
);
ALTER TABLE timetable_placement ADD CONSTRAINT timetable_placement_valid CHECK (
  kind IN ('lesson', 'planning') AND weekday BETWEEN 1 AND 5
);
ALTER TABLE timetable_change ADD CONSTRAINT timetable_change_valid CHECK (
  sequence > 0
  AND kind IN ('operation', 'undo', 'import')
  AND (kind = 'undo') = (reverts_id IS NOT NULL)
  AND length(trim(summary)) > 0
  AND jsonb_typeof(delta) = 'object'
  AND jsonb_typeof(delta->'removed') = 'array'
  AND jsonb_typeof(delta->'added') = 'array'
);
CREATE FUNCTION protect_sealed_timetable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.revision_id IS DISTINCT FROM OLD.revision_id THEN
    RAISE EXCEPTION 'A alocação não muda de revisão';
  END IF;
  IF EXISTS (SELECT 1 FROM planning_revision WHERE id = target AND sealed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'A grade de uma revisão concluída é imutável';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER timetable_placement_sealed BEFORE INSERT OR UPDATE OR DELETE ON timetable_placement FOR EACH ROW EXECUTE FUNCTION protect_sealed_timetable();
CREATE FUNCTION protect_timetable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'O histórico da grade é somente de acréscimo'; END IF;
  IF EXISTS (SELECT 1 FROM planning_revision WHERE id = NEW.revision_id AND sealed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'A grade de uma revisão concluída é imutável';
  END IF;
  IF NEW.reverts_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM timetable_change
    WHERE id = NEW.reverts_id AND revision_id = NEW.revision_id AND kind = 'operation'
  ) THEN
    RAISE EXCEPTION 'Desfazer aponta para uma alteração da mesma revisão';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER timetable_change_append_only BEFORE INSERT OR UPDATE OR DELETE ON timetable_change FOR EACH ROW EXECUTE FUNCTION protect_timetable_change();
