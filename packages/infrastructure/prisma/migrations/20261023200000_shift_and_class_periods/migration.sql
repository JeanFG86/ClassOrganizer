-- AlterTable
ALTER TABLE "class_group" ADD COLUMN     "shift_id" UUID;

-- CreateTable
CREATE TABLE "shift" (
    "id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "normalized_name" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_period" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,

    CONSTRAINT "shift_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_group_period" (
    "class_group_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,

    CONSTRAINT "class_group_period_pkey" PRIMARY KEY ("class_group_id","period_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_normalized_name_key" ON "shift"("normalized_name");

-- CreateIndex
CREATE INDEX "shift_period_shift_id_idx" ON "shift_period"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_period_id_shift_id_key" ON "shift_period"("id", "shift_id");

-- CreateIndex
CREATE INDEX "class_group_period_period_id_shift_id_idx" ON "class_group_period"("period_id", "shift_id");

-- CreateIndex
CREATE INDEX "class_group_shift_id_idx" ON "class_group"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_group_id_shift_id_key" ON "class_group"("id", "shift_id");

-- AddForeignKey
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_period" ADD CONSTRAINT "shift_period_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_period" ADD CONSTRAINT "class_group_period_class_group_id_shift_id_fkey" FOREIGN KEY ("class_group_id", "shift_id") REFERENCES "class_group"("id", "shift_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_period" ADD CONSTRAINT "class_group_period_period_id_shift_id_fkey" FOREIGN KEY ("period_id", "shift_id") REFERENCES "shift_period"("id", "shift_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariantes do domínio representáveis no banco
ALTER TABLE "shift" ADD CONSTRAINT "shift_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "shift" ADD CONSTRAINT "shift_version_positive" CHECK ("version" >= 1);
ALTER TABLE "shift_period" ADD CONSTRAINT "shift_period_minutes_in_day" CHECK ("start_minute" >= 0 AND "end_minute" <= 1439);
ALTER TABLE "shift_period" ADD CONSTRAINT "shift_period_ends_after_start" CHECK ("end_minute" > "start_minute");
