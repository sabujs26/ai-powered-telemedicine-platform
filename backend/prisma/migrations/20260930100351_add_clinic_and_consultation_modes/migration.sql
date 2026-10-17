-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('ONLINE', 'PHYSICAL', 'BOTH');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "clinicId" TEXT,
ADD COLUMN     "consultationMode" "ConsultationMode" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "consultationModes" "ConsultationMode" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "experience" INTEGER,
ADD COLUMN     "languages" TEXT;

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "city" TEXT,
    "contactInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_doctorId_key" ON "Clinic"("doctorId");

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
