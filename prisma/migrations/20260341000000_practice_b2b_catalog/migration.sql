-- CreateEnum
CREATE TYPE "ProductChannel" AS ENUM ('RETAIL', 'B2B');

-- CreateEnum
CREATE TYPE "B2bOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED', 'INVOICED');

-- CreateTable
CREATE TABLE "practice_products" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "price_inr" DOUBLE PRECISION NOT NULL,
    "channel" "ProductChannel" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_invoices" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "total_inr" DOUBLE PRECISION NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "b2b_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_orders" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "invoice_id" UUID,
    "buyer_name" TEXT NOT NULL,
    "buyer_company" TEXT,
    "buyer_phone" TEXT,
    "buyer_email" TEXT,
    "status" "B2bOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "total_inr" DOUBLE PRECISION NOT NULL,
    "ordered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b2b_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "b2b_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_products_practice_id_channel_is_active_idx" ON "practice_products"("practice_id", "channel", "is_active");

-- CreateIndex
CREATE INDEX "b2b_orders_practice_id_ordered_at_idx" ON "b2b_orders"("practice_id", "ordered_at");

-- CreateIndex
CREATE INDEX "b2b_orders_practice_id_status_idx" ON "b2b_orders"("practice_id", "status");

-- CreateIndex
CREATE INDEX "b2b_invoices_practice_id_period_start_period_end_idx" ON "b2b_invoices"("practice_id", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "practice_products" ADD CONSTRAINT "practice_products_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_invoices" ADD CONSTRAINT "b2b_invoices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_orders" ADD CONSTRAINT "b2b_orders_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_orders" ADD CONSTRAINT "b2b_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "b2b_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_order_items" ADD CONSTRAINT "b2b_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "b2b_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_order_items" ADD CONSTRAINT "b2b_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "practice_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
