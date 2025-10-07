-- Set meta ads budgets for events based on provided list
-- Also fix currency for Canadian events that were set to USD

-- Fix currency for Canadian cities
UPDATE events SET currency = 'CAD' WHERE eid IN ('AB3070', 'AB3068', 'AB3069');

-- Set meta ads budgets (using event's local currency)
-- Amsterdam (EUR)
UPDATE events SET meta_ads_budget = 250 WHERE eid = 'AB3030';

-- Melbourne (AUD)
UPDATE events SET meta_ads_budget = 200 WHERE eid = 'AB3049';

-- Ottawa (CAD)
UPDATE events SET meta_ads_budget = 100 WHERE eid = 'AB3055';

-- Wilmington (USD)
UPDATE events SET meta_ads_budget = 200 WHERE eid = 'AB3064';

-- Toronto Masters (CAD)
UPDATE events SET meta_ads_budget = 200 WHERE eid = 'AB2941';

-- San Francisco x Help for Children (USD)
UPDATE events SET meta_ads_budget = 350 WHERE eid = 'AB3032';

-- Bangkok (THB) - $500 USD ≈ 17,000 THB
UPDATE events SET meta_ads_budget = 17000 WHERE eid = 'AB3065';

-- Victoria (CAD)
UPDATE events SET meta_ads_budget = 200 WHERE eid = 'AB3070';

-- San Francisco x Help for Children (USD)
UPDATE events SET meta_ads_budget = 350 WHERE eid = 'AB2947';

-- Lancaster (USD)
UPDATE events SET meta_ads_budget = 100 WHERE eid = 'AB3054';

-- Edmonton (CAD)
UPDATE events SET meta_ads_budget = 150 WHERE eid = 'AB3068';

-- Sydney City Finals (AUD)
UPDATE events SET meta_ads_budget = 300 WHERE eid = 'AB3010';

-- Toronto (CAD)
UPDATE events SET meta_ads_budget = 200 WHERE eid = 'AB2944';

-- Chicago (USD)
UPDATE events SET meta_ads_budget = 150 WHERE eid = 'AB3061';

-- San Francisco (USD)
UPDATE events SET meta_ads_budget = 350 WHERE eid = 'AB3034';

-- Toronto (CAD)
UPDATE events SET meta_ads_budget = 200 WHERE eid = 'AB2952';

-- Note: Events with "tbc" (to be confirmed) or "N/A" were not updated
-- AB3038, AB3006, AB3060, AB3051, AB3062, AB3069, AB3067, AB3071, AB3076,
-- AB3058, AB3066, AB3045, AB3057, AB3081, AB3075, AB3085, AB3082
