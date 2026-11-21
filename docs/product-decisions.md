# Product decisions

## Audience and positioning
- 18+ social discovery product, Kenya-first with international expansion planned.
- Combines friendship, drinking-buddy discovery and optional dating intent.
- Do not position the product as a dating-only service.

## Discovery and matching
- Everyone can discover everyone.
- Users can optionally set gender and connection-intent preferences.
- Direct one-to-one messaging starts only after mutual matching.
- Group meetup conversations are allowed for approved meetup participants.

## Location and privacy
- User-selected meetup/venue location is separate from live GPS location.
- Visibility options: private, matches-only and public.
- Never expose precise live location by default.
- Use coarse area labels for discovery unless a user deliberately shares a public meetup location.

## Registration and age gate
- Email, Google and phone-number registration are planned.
- The product requires an explicit 18+ acknowledgement.
- The checkbox is a product-level declaration, not a legal conclusion that stronger age assurance can never be required.
- Do not market to minors.

## Venues and monetization
- Venue self-registration is open; public listings require admin approval.
- Free listing is the launch default.
- Admin can enable paid listing fees later without a code deployment.
- Package definitions, prices, billing intervals, included features, free trials and promotion limits are configurable.
- Keep listing access separate from paid promotion.
- Existing subscriptions retain a price snapshot; price changes must not silently alter an active agreement.
- Paid placement must be clearly labelled and should not override relevance in ordinary search.

## Payments and email
- M-Pesa Daraja is the initial Kenya payment option; use sandbox before production.
- Verify callbacks server-side and process payment events idempotently.
- Email is a central transactional service with templates, an outbox, retries and delivery logs.
- Never commit provider credentials.

## Safety and compliance
- Provide blocking, reporting, moderation, meetup exit controls and safety guidance.
- Do not encourage excessive drinking or pressure to consume alcohol.
- Obtain Kenyan legal/privacy review before enabling alcohol-related paid promotions.
