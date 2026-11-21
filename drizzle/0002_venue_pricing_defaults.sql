INSERT INTO venue_packages (name, description, price_minor, currency, billing_interval, features, is_active, sort_order)
VALUES
  ('Basic', 'Standard venue directory listing', 0, 'KES', 'month', '{"directoryListing":true,"photos":true,"contactDetails":true,"eventPublishing":true,"analytics":false}'::jsonb, true, 0),
  ('Featured', 'Paid visibility placement and campaign analytics', 150000, 'KES', 'month', '{"directoryListing":true,"photos":true,"contactDetails":true,"eventPublishing":true,"featuredPlacement":true,"analytics":true}'::jsonb, false, 1),
  ('Premium', 'Advanced venue tools, promotion options and analytics', 350000, 'KES', 'month', '{"directoryListing":true,"photos":true,"contactDetails":true,"eventPublishing":true,"featuredPlacement":true,"advancedAnalytics":true,"staffAccounts":3,"prioritySupport":true}'::jsonb, false, 2)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO platform_settings (key, value)
VALUES (
  'venue_monetization',
  '{"paidListingsEnabled":false,"freeListingEnabled":true,"featuredPackagesEnabled":false,"sponsoredEventsEnabled":false,"defaultCurrency":"KES","trialDays":0}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
