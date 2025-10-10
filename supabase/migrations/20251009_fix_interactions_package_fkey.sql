-- Fix sponsorship_interactions.package_id foreign key to point to templates instead of event packages
-- Since we now use sponsorship_package_templates with city pricing

-- Drop old foreign key constraint
ALTER TABLE sponsorship_interactions
DROP CONSTRAINT IF EXISTS sponsorship_interactions_package_id_fkey;

-- Add new foreign key constraint to sponsorship_package_templates
ALTER TABLE sponsorship_interactions
ADD CONSTRAINT sponsorship_interactions_package_id_fkey
FOREIGN KEY (package_id) REFERENCES sponsorship_package_templates(id)
ON DELETE SET NULL;

COMMENT ON CONSTRAINT sponsorship_interactions_package_id_fkey ON sponsorship_interactions IS
'Links to sponsorship_package_templates (not event_sponsorship_packages) since we use city pricing model';
