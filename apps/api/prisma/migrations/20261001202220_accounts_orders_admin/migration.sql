-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('HOME', 'WORK', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PLACED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'PAID', 'COD_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('UPI', 'CARD', 'NETBANKING', 'WALLET', 'COD');

-- CreateEnum
CREATE TYPE "ShippingSpeed" AS ENUM ('STANDARD', 'EXPRESS');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('CATALOGUE', 'STUDIO');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('NOT_NEEDED', 'AWAITING_PROOF', 'PROOF_SENT', 'CHANGES_REQUESTED', 'APPROVED', 'IN_PRODUCTION', 'DONE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('LOGO', 'PET_PHOTO', 'PREVIEW', 'PROOF', 'PRODUCT_IMAGE', 'STITCH_FILE', 'STITCH_PREVIEW', 'INVOICE');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('SENT', 'APPROVED', 'CHANGES_REQUESTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'STAFF');

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gstRateBp" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "gstRule" TEXT NOT NULL DEFAULT 'threshold',
ADD COLUMN     "hsnCode" TEXT NOT NULL DEFAULT '6211';

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true,
    "codBlocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "customerId" TEXT,
    "adminId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT NOT NULL,
    "landmark" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'HOME',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "clientKey" TEXT,
    "status" "OrderStatus" NOT NULL,
    "paymentState" "PaymentState" NOT NULL,
    "paymentMethod" "PayMethod" NOT NULL,
    "shipping" "ShippingSpeed" NOT NULL,
    "couponCode" TEXT,
    "itemCount" INTEGER NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "mrpTotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "discountLabel" TEXT,
    "shippingPaise" INTEGER NOT NULL,
    "upiDiscountPaise" INTEGER NOT NULL,
    "codFeePaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "refundedPaise" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "whatsappUpdates" BOOLEAN NOT NULL DEFAULT true,
    "shipName" TEXT NOT NULL,
    "shipPhone" TEXT NOT NULL,
    "shipLine1" TEXT NOT NULL,
    "shipLine2" TEXT NOT NULL,
    "shipLandmark" TEXT NOT NULL DEFAULT '',
    "shipCity" TEXT NOT NULL,
    "shipState" TEXT NOT NULL,
    "shipPincode" TEXT NOT NULL,
    "addressType" "AddressType" NOT NULL DEFAULT 'HOME',
    "gstin" TEXT,
    "gstBusiness" TEXT,
    "giftNote" TEXT,
    "etaDate" TIMESTAMP(3),
    "courier" TEXT,
    "awb" TEXT,
    "trackingUrl" TEXT,
    "adminNotes" TEXT,
    "cancelReason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "placedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "ItemKind" NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imagePath" TEXT,
    "qty" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "unitMrpPaise" INTEGER NOT NULL,
    "extraPaise" INTEGER NOT NULL DEFAULT 0,
    "custom" BOOLEAN NOT NULL,
    "personalisation" JSONB,
    "studio" JSONB,
    "petName" TEXT,
    "giftWrap" BOOLEAN NOT NULL DEFAULT false,
    "hsnCode" TEXT NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "productionStatus" "ProductionStatus" NOT NULL DEFAULT 'NOT_NEEDED',
    "stockReserved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "method" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "errorReason" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actor" "Actor" NOT NULL DEFAULT 'SYSTEM',
    "adminId" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "pdfUploadId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "fy" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("fy")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "originalName" TEXT,
    "sha256" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT,
    "orderItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedAt" TIMESTAMP(3),

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proof" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "imageUploadId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "token" TEXT NOT NULL,
    "status" "ProofStatus" NOT NULL DEFAULT 'SENT',
    "customerComment" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Proof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchFile" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productId" TEXT,
    "label" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sourceUploadId" TEXT NOT NULL,
    "pesUploadId" TEXT,
    "previewUploadId" TEXT,
    "stitches" INTEGER NOT NULL,
    "colourChanges" INTEGER NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "threads" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StitchFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_customerId_idx" ON "Session"("customerId");

-- CreateIndex
CREATE INDEX "Session_adminId_idx" ON "Session"("adminId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_createdAt_idx" ON "OtpChallenge"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_ip_createdAt_idx" ON "OtpChallenge"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_clientKey_key" ON "Order"("customerId", "clientKey");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productionStatus_idx" ON "OrderItem"("productionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_pdfUploadId_key" ON "Invoice"("pdfUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_fy_seq_key" ON "Invoice"("fy", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_key_key" ON "Upload"("key");

-- CreateIndex
CREATE INDEX "Upload_orderItemId_idx" ON "Upload"("orderItemId");

-- CreateIndex
CREATE INDEX "Upload_attachedAt_createdAt_idx" ON "Upload"("attachedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proof_token_key" ON "Proof"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Proof_orderItemId_version_key" ON "Proof"("orderItemId", "version");

-- CreateIndex
CREATE INDEX "StitchFile_orderItemId_idx" ON "StitchFile"("orderItemId");

-- CreateIndex
CREATE INDEX "StitchFile_productId_idx" ON "StitchFile"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pdfUploadId_fkey" FOREIGN KEY ("pdfUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_imageUploadId_fkey" FOREIGN KEY ("imageUploadId") REFERENCES "Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchFile" ADD CONSTRAINT "StitchFile_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchFile" ADD CONSTRAINT "StitchFile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
