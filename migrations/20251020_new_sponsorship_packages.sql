-- =====================================================
-- NEW SPONSORSHIP PACKAGES MIGRATION
-- Date: 2025-10-20
-- Purpose: Replace placeholder packages with complete tier system
-- =====================================================

-- Clean slate: Remove old packages and pricing
DELETE FROM sponsorship_city_pricing;
DELETE FROM sponsorship_package_templates;

-- =====================================================
-- PERSONAL TIER: "Art Battle Patrons Circle"
-- =====================================================

INSERT INTO sponsorship_package_templates (name, slug, description, benefits, category, display_order) VALUES
('Creative Circle', 'creative-circle',
 'Support live art, connect with artists, and shape your local scene.',
 '["2 complimentary tickets", "Priority seating", "Name on event website", "$50 auction credit", "Instagram story feature (local account)"]'::jsonb,
 'personal', 10),

('Collector''s Circle', 'collectors-circle',
 'Deeper connection with artists and enhanced event experience.',
 '["4 complimentary tickets", "Artist meet & greet after event", "$100 auction credit + 10% bonus on purchases", "Signed artist print from the event", "Name on website & audience email"]'::jsonb,
 'personal', 11),

('Spotlight Patron', 'spotlight-patron',
 'You''re a known face at Art Battle - maximum personal recognition and access.',
 '["6 complimentary tickets", "Spotlight profile on event page (photo + your story)", "VIP artist area access during competition", "Artist meet & greet", "$200 auction credit + 10% bonus", "Dedicated Instagram post (local account)"]'::jsonb,
 'personal', 12);

-- =====================================================
-- BRAND TIER: "Connect Art, Culture & Community"
-- =====================================================

INSERT INTO sponsorship_package_templates (name, slug, description, benefits, category, display_order) VALUES
('Community Partner', 'community-partner',
 'Be seen live and online where creativity happens.',
 '["Logo on event page & audience email", "Emcee mention during opening", "2x Instagram story frames with your tag (local account)", "4 tickets + 2 VIP wristbands", "Offer distribution to ticket holders"]'::jsonb,
 'brand', 20),

('Round Sponsor', 'round-sponsor',
 'Own a complete round of competition - your brand seen throughout the entire round.',
 '["Own a complete round: \"Round X Presented by [Your Brand]\"", "Round sponsor display on timer page during your round", "Custom round transition graphic with your logo", "Logo on event pages (artbattle.com + artb.art)", "Emcee introduction at round start", "Round highlight clip post after event (local IG)", "6 tickets + 2 VIP backstage wristbands"]'::jsonb,
 'brand', 21),

('Title Sponsor', 'title-sponsor',
 'Own the event from start to finish - maximum visibility live and nationally.',
 '["Own opening & closing ceremonies", "Largest logo on timer page (seen throughout entire event!)", "Logo in official photo backdrop (in every attendee photo!)", "Instagram post on @artbattle main account (global reach!)", "Logo in event recap video", "Connect with all artist applicants", "10 tickets + 4 VIP wristbands"]'::jsonb,
 'brand', 22);

-- =====================================================
-- TACTICAL TIER: "Buy Specific Impact Moments"
-- =====================================================

INSERT INTO sponsorship_package_templates (name, slug, description, benefits, category, display_order) VALUES
('Prize Sponsor', 'prize-sponsor',
 'Own the winner prize and presentation moment - the most memorable part of the night.',
 '["Own the winner prize + on-stage presentation", "Your logo shown to ALL artist applicants in registration", "Your logo on winner announcement posts (viral content!)", "Emcee mentions throughout event", "Logo on website, emails, timer page", "Instagram post (local account)", "4 tickets"]'::jsonb,
 'business', 30),

('Auction Matching Sponsor', 'auction-matching-sponsor',
 'Match audience bids to make art affordable while supporting artists - creates real excitement.',
 '["Match audience auction bids up to $X (you set the cap)", "Real-time on-screen match total display", "Emcee announcements: \"Every bid matched by [Brand]!\"", "Logo on auction page", "PR opportunity: \"[Brand] matched $X for local artists\"", "6 tickets + $500 starting auction credit"]'::jsonb,
 'business', 31),

('Live Stream Sponsor', 'live-stream-sponsor',
 'Own the digital broadcast - reach thousands beyond the physical event.',
 '["Logo watermark on entire stream", "Featured on @artbattle TikTok broadcasts (75k+ followers!)", "Verbal shoutouts every 20 minutes", "Brand link in stream bio", "Pre-event promo on @artbattle main account", "4 tickets"]'::jsonb,
 'business', 32),

('Artist Materials Sponsor', 'artist-materials-sponsor',
 'Provide the materials artists use to create - organic exposure in every behind-the-scenes moment. You provide $500 retail value of materials per show.',
 '["You provide $500 retail value of materials per show", "Logo on all artist supply tables (in every behind-the-scenes photo!)", "Artist shoutouts: \"Creating with supplies from [Brand]\"", "Artists organically post your materials in their process content", "Emcee mentions during artist introductions", "4 tickets"]'::jsonb,
 'business', 33);

-- =====================================================
-- ADD-ONS: Enhance Any Package
-- =====================================================

INSERT INTO sponsorship_package_templates (name, slug, description, benefits, category, display_order) VALUES
('Team Night Pack', 'team-night-pack',
 'Bring your whole crew - 10 additional tickets.',
 '["10 additional complimentary tickets"]'::jsonb,
 'addon', 100),

('Auction Credit Boost', 'auction-credit-boost',
 'Increase your art purchasing power.',
 '["$500 toward artwork purchases"]'::jsonb,
 'addon', 101),

('Hospitality Pack', 'hospitality-pack',
 'VIP treatment for your guests with drinks and premium seating.',
 '["50 drink vouchers", "Reserved table", "Early entry access"]'::jsonb,
 'addon', 102),

('Branded Merch', 'branded-merch',
 'Walking advertisements - your logo on custom event t-shirts.',
 '["50 custom event t-shirts with sponsor logo", "Design preview included"]'::jsonb,
 'addon', 103),

('Artist Promo Package', 'artist-promo-package',
 'Viral potential - your logo shared by artists across their social accounts.',
 '["Logo in artist promotional images", "Avg 12+ artists share on their accounts", "Organic reach across multiple platforms"]'::jsonb,
 'addon', 104),

('Competition Floor Branding', 'competition-floor-branding',
 'Your branding in every photo and video of the competition.',
 '["Branding on competition floor coverings", "Visible in all competition photos/videos", "Per-city rate, multi-city discounts available"]'::jsonb,
 'addon', 105);

-- =====================================================
-- VICTORIA CITY PRICING (Example)
-- City ID for Victoria: d525ceaa-14c8-43b9-8511-9c22ef78910e
-- =====================================================

INSERT INTO sponsorship_city_pricing (package_template_id, city_id, price, currency)
SELECT
  spt.id,
  'd525ceaa-14c8-43b9-8511-9c22ef78910e'::uuid,
  CASE spt.slug
    -- Personal Tier
    WHEN 'creative-circle' THEN 200.00
    WHEN 'collectors-circle' THEN 400.00
    WHEN 'spotlight-patron' THEN 600.00
    -- Brand Tier
    WHEN 'community-partner' THEN 1000.00
    WHEN 'round-sponsor' THEN 2000.00
    WHEN 'title-sponsor' THEN 4000.00
    -- Tactical Tier
    WHEN 'prize-sponsor' THEN 1500.00
    WHEN 'auction-matching-sponsor' THEN 2500.00
    WHEN 'live-stream-sponsor' THEN 2500.00
    WHEN 'artist-materials-sponsor' THEN 200.00
    -- Add-ons
    WHEN 'team-night-pack' THEN 150.00
    WHEN 'auction-credit-boost' THEN 400.00
    WHEN 'hospitality-pack' THEN 250.00
    WHEN 'branded-merch' THEN 350.00
    WHEN 'artist-promo-package' THEN 300.00
    WHEN 'competition-floor-branding' THEN 250.00
  END,
  'CAD'
FROM sponsorship_package_templates spt
WHERE spt.active = true;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Count packages by category
SELECT category, COUNT(*) as package_count
FROM sponsorship_package_templates
WHERE active = true
GROUP BY category
ORDER BY category;

-- Show all packages with Victoria pricing
SELECT
  spt.name,
  spt.category,
  spt.display_order,
  scp.price,
  scp.currency
FROM sponsorship_package_templates spt
LEFT JOIN sponsorship_city_pricing scp ON spt.id = scp.package_template_id
WHERE spt.active = true
  AND (scp.city_id = 'd525ceaa-14c8-43b9-8511-9c22ef78910e' OR scp.city_id IS NULL)
ORDER BY spt.display_order;
