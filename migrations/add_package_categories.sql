-- Add package category types for personal, brand, business sponsorships
-- Migration: add_package_categories.sql
-- Date: 2025-10-10

-- The sponsorship_package_templates table already has a 'category' column
-- We'll use these values:
-- 'personal' - Individual/personal sponsorships (lowest tier)
-- 'brand' - Brand sponsorships (mid tier)
-- 'business' - Business/corporate sponsorships (premium tier)

-- Add a check constraint to ensure valid categories
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'sponsorship_package_templates_category_check'
    ) THEN
        ALTER TABLE sponsorship_package_templates
        DROP CONSTRAINT sponsorship_package_templates_category_check;
    END IF;

    -- Add new constraint with all valid categories
    ALTER TABLE sponsorship_package_templates
    ADD CONSTRAINT sponsorship_package_templates_category_check
    CHECK (category IN ('personal', 'brand', 'business', 'main', 'addon'));
END $$;

-- Update existing packages to use new categories based on price
-- Personal: < $200
-- Brand: $200-$499
-- Business: $500+

UPDATE sponsorship_package_templates
SET category = CASE
    WHEN category = 'addon' THEN 'addon'  -- Keep addons as-is
    ELSE (
        SELECT CASE
            WHEN MIN(scp.price) < 200 THEN 'personal'
            WHEN MIN(scp.price) >= 200 AND MIN(scp.price) < 500 THEN 'brand'
            WHEN MIN(scp.price) >= 500 THEN 'business'
            ELSE 'brand'  -- Default to brand if no pricing
        END
        FROM sponsorship_city_pricing scp
        WHERE scp.package_template_id = sponsorship_package_templates.id
    )
END
WHERE category NOT IN ('addon');

-- Add comment
COMMENT ON COLUMN sponsorship_package_templates.category IS
'Package category: personal (individual), brand (company brand), business (corporate), addon (add-on packages)';
