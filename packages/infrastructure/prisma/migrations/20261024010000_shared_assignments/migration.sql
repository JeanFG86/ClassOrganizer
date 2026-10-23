BEGIN;

-- Cria tabela
CREATE TABLE "assignment_participant" (
    "assignment_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "assignment_participant_pkey" PRIMARY KEY ("assignment_id","teacher_id")
);

-- Cria índice
CREATE INDEX "assignment_participant_teacher_id_subject_id_idx" ON "assignment_participant"("teacher_id", "subject_id");

-- Cria índice
CREATE INDEX "assignment_participant_subject_id_idx" ON "assignment_participant"("subject_id");

-- Cria índice
CREATE INDEX "teaching_assignment_class_group_id_idx" ON "teaching_assignment"("class_group_id");

-- Adiciona FK
ALTER TABLE "assignment_participant" ADD CONSTRAINT "assignment_participant_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Adiciona FK
ALTER TABLE "assignment_participant" ADD CONSTRAINT "assignment_participant_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Adiciona FK
ALTER TABLE "assignment_participant" ADD CONSTRAINT "assignment_participant_teacher_id_subject_id_fkey" FOREIGN KEY ("teacher_id", "subject_id") REFERENCES "teacher_subject"("teacher_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserva ids, carga, data e versão dos blocos; cada vínculo antigo vira uma participação.
INSERT INTO "assignment_participant" ("assignment_id", "teacher_id", "subject_id", "position")
SELECT "id", "teacher_id", "subject_id", 0 FROM "teaching_assignment";

-- Remove FK anterior
ALTER TABLE "teaching_assignment" DROP CONSTRAINT "teaching_assignment_subject_id_fkey";

-- Remove FK anterior
ALTER TABLE "teaching_assignment" DROP CONSTRAINT "teaching_assignment_teacher_id_subject_id_fkey";

-- Remove índice anterior
DROP INDEX "teaching_assignment_teacher_id_subject_id_idx";

-- Remove índice anterior
DROP INDEX "teaching_assignment_class_group_subject_key";

-- Remove colunas antigas após copiar os vínculos
ALTER TABLE "teaching_assignment" DROP COLUMN "subject_id",
DROP COLUMN "teacher_id";


-- Garantias complementares às FKs e à chave que impede professor repetido no bloco.
ALTER TABLE "assignment_participant" ADD CONSTRAINT "assignment_participant_position_nonnegative"
CHECK ("position" >= 0);

-- Um bloco precisa ter participantes ao terminar a transação. A checagem adiada
-- permite criar o bloco antes dos filhos e substituir participantes atomicamente.
CREATE FUNCTION check_assignment_has_participants() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'teaching_assignment' THEN
    target_id := NEW.id;
  ELSE
    target_id := OLD.assignment_id;
  END IF;

  -- Serializa também escritas diretas em participações do mesmo bloco.
  PERFORM id FROM teaching_assignment WHERE id = target_id FOR UPDATE;
  IF FOUND AND NOT EXISTS (SELECT 1 FROM assignment_participant WHERE assignment_id = target_id) THEN
    RAISE EXCEPTION 'O bloco precisa ter pelo menos um participante.'
      USING ERRCODE = '23514', CONSTRAINT = 'teaching_assignment_has_participants';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER teaching_assignment_has_participants
AFTER INSERT OR UPDATE ON teaching_assignment DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_assignment_has_participants();

CREATE CONSTRAINT TRIGGER assignment_participant_preserves_nonempty
AFTER DELETE OR UPDATE ON assignment_participant DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_assignment_has_participants();

COMMIT;
