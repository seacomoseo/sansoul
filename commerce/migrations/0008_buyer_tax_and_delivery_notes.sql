-- 14.4: company tax ID and name collected by Stripe Checkout (tax_id_collection) and
-- delivery fields collected as Checkout custom fields. Same table, access and
-- retention as the rest of the delivery data; the invoice keeps its own copy.
ALTER TABLE order_delivery_details ADD COLUMN buyer_business_name TEXT;
ALTER TABLE order_delivery_details ADD COLUMN buyer_tax_id TEXT;
ALTER TABLE order_delivery_details ADD COLUMN buyer_tax_id_type TEXT;
ALTER TABLE order_delivery_details ADD COLUMN recipient_phone TEXT;
ALTER TABLE order_delivery_details ADD COLUMN delivery_notes TEXT;
