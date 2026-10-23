-- AlterTable
ALTER TABLE "subject" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "teacher" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Invariantes do domínio representáveis no banco
ALTER TABLE "subject" ADD CONSTRAINT "subject_version_positive" CHECK ("version" >= 1);
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_version_positive" CHECK ("version" >= 1);
