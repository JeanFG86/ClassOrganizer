-- AlterTable
ALTER TABLE "planning_revision" ADD COLUMN     "reviewed_items" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source_revision_id" UUID;

-- AddForeignKey
ALTER TABLE "planning_revision" ADD CONSTRAINT "planning_revision_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "planning_revision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Checklist da conferência (ADR 0022). As conferências antigas viram itens: regras e cargas
-- cobriam estrutura, professores, atribuições e regras; disponibilidade, a disponibilidade e a HA.
-- As revisões históricas são protegidas por trigger, desligado só durante a conversão.
ALTER TABLE planning_revision DISABLE TRIGGER planning_revision_immutable;
UPDATE planning_revision SET reviewed_items =
  (CASE WHEN rules_reviewed THEN ARRAY['structure', 'teachers', 'assignments'] ELSE ARRAY[]::TEXT[] END) ||
  (CASE WHEN availability_reviewed THEN ARRAY['availability'] ELSE ARRAY[]::TEXT[] END) ||
  (CASE WHEN rules_reviewed THEN ARRAY['rules'] ELSE ARRAY[]::TEXT[] END);
ALTER TABLE planning_revision ENABLE TRIGGER planning_revision_immutable;

ALTER TABLE planning_revision DROP CONSTRAINT planning_revision_valid;
ALTER TABLE "planning_revision" DROP COLUMN "availability_reviewed",
DROP COLUMN "rules_reviewed";
ALTER TABLE planning_revision
  ADD CONSTRAINT planning_revision_valid CHECK (
    number > 0
    AND reviewed_items <@ ARRAY['structure', 'teachers', 'assignments', 'availability', 'rules']::TEXT[]
    AND (sealed_at IS NULL OR reviewed_items @> ARRAY['structure', 'teachers', 'assignments', 'availability', 'rules']::TEXT[])
  ),
  ADD CONSTRAINT planning_revision_source_valid CHECK (source_revision_id IS NULL OR source_revision_id <> id);

-- A origem da cópia faz parte da identidade da revisão.
CREATE OR REPLACE FUNCTION protect_planning_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Revisões não podem ser excluídas'; END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
     NEW.restored_from_id IS DISTINCT FROM OLD.restored_from_id OR
     NEW.source_revision_id IS DISTINCT FROM OLD.source_revision_id OR
     NEW.id IS DISTINCT FROM OLD.id OR NEW.planning_id IS DISTINCT FROM OLD.planning_id OR
     NEW.number IS DISTINCT FROM OLD.number OR NEW.created_by IS DISTINCT FROM OLD.created_by OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR
     ((OLD.sealed_at IS NOT NULL OR EXISTS (
       SELECT 1 FROM planning_revision WHERE planning_id = OLD.planning_id AND number > OLD.number
     )) AND (to_jsonb(NEW) - 'name') IS DISTINCT FROM (to_jsonb(OLD) - 'name')) THEN
    RAISE EXCEPTION 'O conteúdo da revisão é imutável';
  END IF;
  RETURN NEW;
END; $$;
