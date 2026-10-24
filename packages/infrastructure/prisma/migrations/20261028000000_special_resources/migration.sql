-- CreateTable
CREATE TABLE "resource" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "normalized_name" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_resource" (
    "assignment_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "assignment_resource_pkey" PRIMARY KEY ("assignment_id","resource_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_normalized_name_key" ON "resource"("normalized_name");

-- CreateIndex
CREATE INDEX "assignment_resource_resource_id_idx" ON "assignment_resource"("resource_id");

-- AddForeignKey
ALTER TABLE "assignment_resource" ADD CONSTRAINT "assignment_resource_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_resource" ADD CONSTRAINT "assignment_resource_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Garantias escritas à mão (ADR 0016).
ALTER TABLE "resource" ADD CONSTRAINT "resource_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "resource" ADD CONSTRAINT "resource_version_positive" CHECK ("version" >= 1);
ALTER TABLE "assignment_resource" ADD CONSTRAINT "assignment_resource_position_range" CHECK ("position" BETWEEN 0 AND 4);
