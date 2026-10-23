-- AlterTable
ALTER TABLE "teacher" ADD COLUMN     "max_weekly_lessons" SMALLINT,
ADD COLUMN     "planning_periods" SMALLINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "teacher_unavailability" (
    "teacher_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "period_id" UUID NOT NULL,

    CONSTRAINT "teacher_unavailability_pkey" PRIMARY KEY ("teacher_id","weekday","period_id")
);

-- CreateIndex
CREATE INDEX "teacher_unavailability_period_id_idx" ON "teacher_unavailability"("period_id");

-- AddForeignKey
ALTER TABLE "teacher_unavailability" ADD CONSTRAINT "teacher_unavailability_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_unavailability" ADD CONSTRAINT "teacher_unavailability_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "shift_period"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariantes do domínio representáveis no banco
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_max_weekly_lessons_range" CHECK ("max_weekly_lessons" IS NULL OR "max_weekly_lessons" BETWEEN 1 AND 60);
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_planning_periods_range" CHECK ("planning_periods" BETWEEN 0 AND 40);
ALTER TABLE "teacher_unavailability" ADD CONSTRAINT "teacher_unavailability_weekday_range" CHECK ("weekday" BETWEEN 1 AND 5);
