-- Fix sponsorship_purchases.main_package_id foreign key to point to templates
-- This aligns with our city pricing model where we use package templates

-- Drop old foreign key constraint
ALTER TABLE sponsorship_purchases
DROP CONSTRAINT IF EXISTS sponsorship_purchases_main_package_id_fkey;

-- Add new foreign key constraint to sponsorship_package_templates
ALTER TABLE sponsorship_purchases
ADD CONSTRAINT sponsorship_purchases_main_package_id_fkey
FOREIGN KEY (main_package_id) REFERENCES sponsorship_package_templates(id)
ON DELETE SET NULL;

COMMENT ON CONSTRAINT sponsorship_purchases_main_package_id_fkey ON sponsorship_purchases IS
'Links to sponsorship_package_templates (not event_sponsorship_packages) since we use city pricing model';
