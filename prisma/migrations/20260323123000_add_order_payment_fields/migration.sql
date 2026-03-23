-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('ECPAY');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "merchantTradeNo" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "tradeNo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantTradeNo_key" ON "Order"("merchantTradeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tradeNo_key" ON "Order"("tradeNo");
