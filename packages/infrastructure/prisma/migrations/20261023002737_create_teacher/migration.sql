-- CreateTable
CREATE TABLE "teacher" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subject" (
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "teacher_subject_pkey" PRIMARY KEY ("teacher_id","subject_id")
);

-- CreateIndex
CREATE INDEX "teacher_subject_subject_id_idx" ON "teacher_subject"("subject_id");

-- AddForeignKey
ALTER TABLE "teacher_subject" ADD CONSTRAINT "teacher_subject_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject" ADD CONSTRAINT "teacher_subject_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariantes do domínio representáveis no banco
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "teacher_subject" ADD CONSTRAINT "teacher_subject_position_non_negative" CHECK ("position" >= 0);
