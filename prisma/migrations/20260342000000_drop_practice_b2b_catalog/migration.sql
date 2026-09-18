-- DropForeignKey
ALTER TABLE "b2b_order_items" DROP CONSTRAINT IF EXISTS "b2b_order_items_order_id_fkey";
ALTER TABLE "b2b_order_items" DROP CONSTRAINT IF EXISTS "b2b_order_items_product_id_fkey";
ALTER TABLE "b2b_orders" DROP CONSTRAINT IF EXISTS "b2b_orders_practice_id_fkey";
ALTER TABLE "b2b_orders" DROP CONSTRAINT IF EXISTS "b2b_orders_invoice_id_fkey";
ALTER TABLE "b2b_invoices" DROP CONSTRAINT IF EXISTS "b2b_invoices_practice_id_fkey";
ALTER TABLE "practice_products" DROP CONSTRAINT IF EXISTS "practice_products_practice_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "b2b_order_items";
DROP TABLE IF EXISTS "b2b_orders";
DROP TABLE IF EXISTS "b2b_invoices";
DROP TABLE IF EXISTS "practice_products";

-- DropEnum
DROP TYPE IF EXISTS "B2bOrderStatus";
DROP TYPE IF EXISTS "ProductChannel";
