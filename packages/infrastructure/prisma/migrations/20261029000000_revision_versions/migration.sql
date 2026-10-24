ALTER TABLE "planning_revision" ADD COLUMN "name" VARCHAR(100),
ADD COLUMN "restored_from_id" UUID;

ALTER TABLE "planning_revision" ADD CONSTRAINT "planning_revision_restored_from_id_planning_id_fkey"
FOREIGN KEY ("restored_from_id", "planning_id") REFERENCES "planning_revision"("id", "planning_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

-- O nome é opcional; nomes informados não podem ser compostos só por espaços.
ALTER TABLE "planning_revision" ADD CONSTRAINT "planning_revision_name_not_blank"
CHECK ("name" IS NULL OR length(btrim("name")) > 0);
ALTER TABLE "planning_revision" ADD CONSTRAINT "planning_revision_restore_not_self"
CHECK ("restored_from_id" IS NULL OR "restored_from_id" <> "id");

-- O nome é metadado editável. Conteúdo, origem e identidade continuam imutáveis;
-- depois da conclusão, somente o nome pode mudar.
CREATE OR REPLACE FUNCTION protect_planning_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Revisões não podem ser excluídas'; END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
     NEW.restored_from_id IS DISTINCT FROM OLD.restored_from_id OR
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

CREATE FUNCTION revision_is_historical(target UUID) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM planning_revision r WHERE r.id = target AND
    (r.sealed_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM planning_revision newer WHERE newer.planning_id = r.planning_id AND newer.number > r.number
    ))
  );
$$;

CREATE OR REPLACE FUNCTION protect_sealed_timetable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.revision_id IS DISTINCT FROM OLD.revision_id THEN
    RAISE EXCEPTION 'A alocação não muda de revisão';
  END IF;
  IF revision_is_historical(target) THEN
    RAISE EXCEPTION 'A grade de uma revisão histórica é imutável';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;

CREATE OR REPLACE FUNCTION protect_timetable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'O histórico da grade é somente de acréscimo'; END IF;
  IF revision_is_historical(NEW.revision_id) THEN
    RAISE EXCEPTION 'A grade de uma revisão histórica é imutável';
  END IF;
  IF NEW.reverts_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM timetable_change
    WHERE id = NEW.reverts_id AND revision_id = NEW.revision_id AND kind IN ('operation', 'generation')
  ) THEN
    RAISE EXCEPTION 'Desfazer aponta para uma alteração da mesma revisão';
  END IF;
  RETURN NEW;
END; $$;
