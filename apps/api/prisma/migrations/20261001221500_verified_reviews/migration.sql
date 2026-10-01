-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "orderItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderItemId_key" ON "Review"("orderItemId");

