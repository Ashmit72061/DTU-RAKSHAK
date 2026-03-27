-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fathersName" TEXT NOT NULL,
    "dept" TEXT NOT NULL,
    "dateOfIssue" TIMESTAMP(3) NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "stickerNo" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "vehicleNoHash" TEXT,
    "mobileNo" TEXT NOT NULL,
    "mobileNoHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "long" DOUBLE PRECISION NOT NULL,
    "cameraType" TEXT NOT NULL,
    "cameraLocation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_exit_logs" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "vehicleNoHash" TEXT,
    "vehicleId" TEXT,
    "logType" TEXT NOT NULL DEFAULT 'ENTRY',
    "ocrConfidence" DOUBLE PRECISION,
    "modelConfidence" DOUBLE PRECISION,
    "rawPlate" TEXT NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitTime" TIMESTAMP(3),
    "vehicleDuration" INTEGER,
    "isAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_exit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sightings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ocrConfidence" DOUBLE PRECISION,
    "modelConfidence" DOUBLE PRECISION,
    "rawPlate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sightings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "rawPlate" TEXT NOT NULL,
    "cameraId" TEXT,
    "logId" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_stickerNo_key" ON "vehicles"("stickerNo");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vehicleNoHash_key" ON "vehicles"("vehicleNoHash");

-- CreateIndex
CREATE INDEX "vehicles_vehicleNoHash_idx" ON "vehicles"("vehicleNoHash");

-- CreateIndex
CREATE INDEX "entry_exit_logs_vehicleNoHash_idx" ON "entry_exit_logs"("vehicleNoHash");

-- CreateIndex
CREATE INDEX "sightings_sessionId_idx" ON "sightings"("sessionId");

-- CreateIndex
CREATE INDEX "sightings_cameraId_idx" ON "sightings"("cameraId");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- AddForeignKey
ALTER TABLE "entry_exit_logs" ADD CONSTRAINT "entry_exit_logs_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_exit_logs" ADD CONSTRAINT "entry_exit_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "entry_exit_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_logId_fkey" FOREIGN KEY ("logId") REFERENCES "entry_exit_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

