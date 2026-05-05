-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('STANDARD', 'EXPRESS');

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "paymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentIntentId_key" ON "Order"("paymentIntentId");
