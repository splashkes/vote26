-- Backfill hash values for people without hashes
-- Required for promo offer system where users access offers via unique hash
-- Date: 2025-10-03

-- ============================================
-- SAFETY CHECK: Verify current hash coverage
-- ============================================

DO $$
DECLARE
    total_people INTEGER;
    people_with_hash INTEGER;
    people_without_hash INTEGER;
    percentage_with_hash NUMERIC(5,2);
BEGIN
    SELECT COUNT(*) INTO total_people FROM people WHERE superseded_by IS NULL;
    SELECT COUNT(*) INTO people_with_hash FROM people WHERE superseded_by IS NULL AND hash IS NOT NULL;
    people_without_hash := total_people - people_with_hash;
    percentage_with_hash := ROUND(100.0 * people_with_hash / NULLIF(total_people, 0), 2);

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Hash Backfill Pre-Check';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Total active people: %', total_people;
    RAISE NOTICE 'People with hash: % (%.2f%%)', people_with_hash, percentage_with_hash;
    RAISE NOTICE 'People without hash: % (%.2f%%)', people_without_hash, (100.0 - percentage_with_hash);
    RAISE NOTICE '==========================================';
END $$;

-- ============================================
-- Backfill hashes for people without them
-- ============================================

-- Create function to generate unique hash
CREATE OR REPLACE FUNCTION generate_unique_person_hash()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    new_hash TEXT;
    hash_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 8-character hash from random MD5
        new_hash := substring(md5(random()::text || clock_timestamp()::text) from 1 for 8);

        -- Check if hash already exists
        SELECT EXISTS(SELECT 1 FROM people WHERE hash = new_hash) INTO hash_exists;

        -- Exit loop if unique
        EXIT WHEN NOT hash_exists;
    END LOOP;

    RETURN new_hash;
END;
$$;

-- Backfill hashes for people without them
DO $$
DECLARE
    person_record RECORD;
    updated_count INTEGER := 0;
    new_hash TEXT;
BEGIN
    RAISE NOTICE 'Starting hash backfill...';

    FOR person_record IN
        SELECT id, name, email, phone, created_at
        FROM people
        WHERE hash IS NULL
        ORDER BY created_at ASC  -- Oldest first
    LOOP
        -- Generate unique hash
        new_hash := generate_unique_person_hash();

        -- Update person with new hash
        UPDATE people
        SET hash = new_hash,
            updated_at = NOW()
        WHERE id = person_record.id;

        updated_count := updated_count + 1;

        -- Log progress every 1000 records
        IF updated_count % 1000 = 0 THEN
            RAISE NOTICE 'Processed % records...', updated_count;
        END IF;
    END LOOP;

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Hash Backfill Complete';
    RAISE NOTICE 'Updated % people with new hashes', updated_count;
    RAISE NOTICE '==========================================';
END $$;

-- ============================================
-- Verify results
-- ============================================

DO $$
DECLARE
    total_people INTEGER;
    people_with_hash INTEGER;
    people_without_hash INTEGER;
    percentage_with_hash NUMERIC(5,2);
BEGIN
    SELECT COUNT(*) INTO total_people FROM people WHERE superseded_by IS NULL;
    SELECT COUNT(*) INTO people_with_hash FROM people WHERE superseded_by IS NULL AND hash IS NOT NULL;
    people_without_hash := total_people - people_with_hash;
    percentage_with_hash := ROUND(100.0 * people_with_hash / NULLIF(total_people, 0), 2);

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Hash Backfill Post-Check';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Total active people: %', total_people;
    RAISE NOTICE 'People with hash: % (%.2f%%)', people_with_hash, percentage_with_hash;
    RAISE NOTICE 'People without hash: % (%.2f%%)', people_without_hash, (100.0 - percentage_with_hash);
    RAISE NOTICE '==========================================';

    IF people_without_hash > 0 THEN
        RAISE WARNING 'Still have % people without hashes - investigate!', people_without_hash;
    ELSE
        RAISE NOTICE '✅ All active people now have unique hashes';
    END IF;
END $$;

-- ============================================
-- Add constraint to prevent NULL hashes in future
-- ============================================

-- Note: We don't add NOT NULL constraint yet because new users
-- are created without hash and it's generated in custom_access_token_hook
-- The hook handles hash generation on first login

-- Add index on hash if not exists (should already exist)
CREATE INDEX IF NOT EXISTS idx_people_hash ON people(hash);

-- Drop the helper function (no longer needed)
DROP FUNCTION IF EXISTS generate_unique_person_hash();

-- ============================================
-- Summary
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Hash backfill migration complete';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. All existing users now have unique hashes';
    RAISE NOTICE '2. New users get hashes via custom_access_token_hook';
    RAISE NOTICE '3. Promo offer system can use /o/{hash} URLs';
    RAISE NOTICE '';
END $$;
