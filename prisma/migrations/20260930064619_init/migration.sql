-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RECEPTIONIST', 'MANAGER');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('REDDOORZ', 'WALK_IN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PENDING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'QRIS', 'TRANSFER', 'REDDOORZ_PREPAID');

-- CreateEnum
CREATE TYPE "WaDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('KTP', 'PASSPORT', 'SIM', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "room_number" TEXT NOT NULL,
    "room_type" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "base_price_per_night" DECIMAL(12,2) NOT NULL,
    "facilities" JSONB NOT NULL DEFAULT '[]',
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "id_type" "IdentityType" NOT NULL,
    "id_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "address" TEXT,
    "nationality" TEXT,
    "phone_whatsapp" TEXT NOT NULL,
    "id_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "booking_source" "BookingSource" NOT NULL,
    "reddoorz_booking_code" TEXT,
    "check_in_time" TIMESTAMP(3) NOT NULL,
    "expected_check_out_time" TIMESTAMP(3) NOT NULL,
    "actual_check_out_time" TIMESTAMP(3),
    "total_nights" INTEGER NOT NULL,
    "room_rate" DECIMAL(12,2) NOT NULL,
    "additional_charges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "additional_charges_detail" JSONB NOT NULL DEFAULT '[]',
    "total_amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "receptionist_user_id" TEXT,
    "wa_reminder_sent_at" TIMESTAMP(3),
    "wa_delivery_status" "WaDeliveryStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action_type" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_room_number_key" ON "rooms"("room_number");

-- CreateIndex
CREATE INDEX "rooms_status_idx" ON "rooms"("status");

-- CreateIndex
CREATE INDEX "rooms_room_type_floor_idx" ON "rooms"("room_type", "floor");

-- CreateIndex
CREATE INDEX "guests_id_type_id_number_idx" ON "guests"("id_type", "id_number");

-- CreateIndex
CREATE INDEX "guests_phone_whatsapp_idx" ON "guests"("phone_whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "guests_id_type_id_number_key" ON "guests"("id_type", "id_number");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_invoice_number_key" ON "reservations"("invoice_number");

-- CreateIndex
CREATE INDEX "reservations_room_id_idx" ON "reservations"("room_id");

-- CreateIndex
CREATE INDEX "reservations_guest_id_idx" ON "reservations"("guest_id");

-- CreateIndex
CREATE INDEX "reservations_check_in_time_idx" ON "reservations"("check_in_time");

-- CreateIndex
CREATE INDEX "reservations_expected_check_out_time_idx" ON "reservations"("expected_check_out_time");

-- CreateIndex
CREATE INDEX "reservations_invoice_number_idx" ON "reservations"("invoice_number");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "activity_logs_action_type_idx" ON "activity_logs"("action_type");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_receptionist_user_id_fkey" FOREIGN KEY ("receptionist_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
