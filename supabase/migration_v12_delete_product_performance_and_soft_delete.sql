-- 1. Create indexes to speed up foreign key constraint verification and query latency
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_company_id ON product_variants(company_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
