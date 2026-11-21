# Drinking Buddies

An 18+ social discovery platform for finding drinking companions, making group plans, and discovering local venues and events. Kenya-first, designed for international expansion.

## Current status

This repository starter contains the first responsive frontend prototype:

- People discovery with profile cards, interest actions, search and area filters.
- Meetups discovery and a create-meetup draft modal.
- Places and venue discovery shell.
- Messages empty state explaining mutual-match messaging.
- Location privacy messaging and 18+ community positioning.
- Initial domain model outline and environment-variable template.

The current UI uses illustrative demo data. Authentication, API persistence, real matching, chat, payments, email delivery, venue registration and admin functions are not connected yet.

## Product decisions

- Launch in Kenya, then expand internationally.
- Brand combines social discovery and optional dating-style connections.
- Everyone can discover everyone; users may set optional gender preferences.
- Direct messaging requires a mutual match. Group meetup conversations are the exception.
- Registration methods: email, Google and phone-number registration.
- Venue registration is open but listings require admin approval.
- Venue listing fees and package prices are controlled by admin settings. Free listing is the launch default; paid listings can be enabled later without a code deployment.
- User-selected meetup locations are distinct from live GPS location. Never expose precise live location by default.
- 18+ acknowledgement is required in the product flow; legal review may require stronger age assurance.

## Development

Requires Bun 1.1+.

```bash
bun install
bun run dev
```

Build and typecheck:

```bash
bun run typecheck
bun run build
```

## Planned modules

1. Identity and profiles
2. Discovery and mutual matching
3. Conversations and notifications
4. Meetups and group membership
5. Venue directory and approval workflow
6. Admin-configurable venue packages and subscriptions
7. Payment orchestration (M-Pesa Daraja first; optional card provider)
8. Transactional email outbox, templates, retries and delivery logs
9. Reporting, blocking, moderation and safety controls

## Security notes

- Never commit `.env` files, API credentials, payment secrets or SMTP passwords.
- Verify payment callbacks server-side and make payment processing idempotent.
- Store amounts in integer minor units and persist the currency.
- Keep subscription price snapshots so admin price changes do not silently alter existing subscriptions.
- Apply authorization checks on every message, meetup and venue-management endpoint.
- Minimize location collection and return only the user's selected visibility level.
- Complete Kenyan legal and privacy review before enabling alcohol-related paid promotions.
