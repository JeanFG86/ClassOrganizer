-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "subject" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalized_name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subject_normalized_name_key" ON "subject"("normalized_name");


-- Invariantes do domínio representáveis no banco
ALTER TABLE "subject" ADD CONSTRAINT "subject_name_not_blank" CHECK (length(btrim("name")) > 0);
