-- CreateTable
CREATE TABLE "class_group" (
    "id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "normalized_name" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "class_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignment" (
    "id" UUID NOT NULL,
    "class_group_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "weekly_lessons" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "teaching_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_group_normalized_name_key" ON "class_group"("normalized_name");

-- CreateIndex
CREATE INDEX "teaching_assignment_teacher_id_subject_id_idx" ON "teaching_assignment"("teacher_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignment_class_group_subject_key" ON "teaching_assignment"("class_group_id", "subject_id");

-- AddForeignKey
ALTER TABLE "teaching_assignment" ADD CONSTRAINT "teaching_assignment_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "class_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignment" ADD CONSTRAINT "teaching_assignment_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignment" ADD CONSTRAINT "teaching_assignment_teacher_id_subject_id_fkey" FOREIGN KEY ("teacher_id", "subject_id") REFERENCES "teacher_subject"("teacher_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariantes do domínio representáveis no banco
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_version_positive" CHECK ("version" >= 1);
ALTER TABLE "teaching_assignment" ADD CONSTRAINT "teaching_assignment_weekly_lessons_range" CHECK ("weekly_lessons" BETWEEN 1 AND 40);
ALTER TABLE "teaching_assignment" ADD CONSTRAINT "teaching_assignment_version_positive" CHECK ("version" >= 1);
