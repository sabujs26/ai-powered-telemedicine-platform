/*
  Warnings:

  - You are about to drop the column `slotId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `isBooked` on the `DoctorAvailability` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[doctorId,scheduledAt]` on the table `Appointment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[doctorId,dayOfWeek,startTime,endTime]` on the table `DoctorAvailability` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `scheduledAt` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dayOfWeek` to the `DoctorAvailability` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `DoctorAvailability` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_slotId_fkey";

-- DropIndex
DROP INDEX "Appointment_slotId_key";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "slotId",
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "scheduledAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "DoctorAvailability" DROP COLUMN "isBooked",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dayOfWeek" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "startTime" SET DATA TYPE TEXT,
ALTER COLUMN "endTime" SET DATA TYPE TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_doctorId_scheduledAt_key" ON "Appointment"("doctorId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorAvailability_doctorId_dayOfWeek_startTime_endTime_key" ON "DoctorAvailability"("doctorId", "dayOfWeek", "startTime", "endTime");
