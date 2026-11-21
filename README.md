# Drinking Buddies

An 18+ social discovery platform for finding drinking companions, making group plans, and discovering local venues and events. Kenya-first, designed for international expansion.

## Product decisions

- Launch in Kenya, then expand internationally.
- Brand combines social discovery and optional dating-style connections.
- Everyone can discover everyone; users may set optional gender and connection-intent preferences.
- Direct messaging requires a mutual match. Group meetup conversations are the exception.
- Registration methods: email, Google and phone-number registration. Email/password registration is implemented first; Google OAuth and phone OTP need provider credentials and are not enabled yet.
- Venue registration is open but listings require admin approval.
- Venue listing fees and package prices are controlled by admin settings. Free listing is the launch default; paid listings can be enabled later without a code deployment.
- User-selected meetup locations are distinct from live GPS location. Never expose precise live location by default.
- 18+ acknowledgement is required in the product flow; legal review may require stronger age assurance.

## Stack

- React 19 + TypeScript
- TanStack Start + TanStack Router
- Vite + Nitro
- Bun runtime
- PostgreSQL + PostGIS
- Drizzle ORM + SQL migrations
- Zod validation
- bcrypt password hashing
- Nodemailer transactional email outbox worker

## Local development

Requires a current Bun release and Docker.

```bash
bun install
cp .env.example .env
docker compose up -d db
bun run db:migrate
bun run dev
```

Open the local URL printed by Vite (default port 3000).

Build and typecheck:

```bash
bun run build
bun run typecheck
```

Run the transactional email worker after configuring SMTP:

```bash
bun run email:worker
```

The local PostGIS container uses development-only credentials. Change them before using a shared or production environment.

## API foundation

- `GET /api/health` — process health.
- `GET /api/ready` — database readiness.
- `POST /api/auth/register` — email/password registration with mandatory 18+ acknowledgement; queues a verification email.
- `POST /api/auth/verify-email (JSON body: { token })` — consumes a one-time verification token.
- `POST /api/auth/login` — verifies credentials and creates an HttpOnly session cookie.
- `GET /api/auth/me` — returns the current signed-in user.
- `POST /api/auth/logout` — revokes the current session.
- `GET /api/profile` / `PUT /api/profile` — read or save the signed-in user's profile and discovery preferences.
- `GET /api/discovery?area=<area>` — returns compatible discoverable profiles, excluding prior passes, outgoing likes, active matches and blocked users; selected home area is only returned when its owner sets location visibility to public.
- `POST /api/likes` with `{ "userId": "<uuid>" }` — records a like and creates a match plus match conversation after a reciprocal like.
- `POST /api/passes` with `{ "userId": "<uuid>" }` — records a pass so that profile is not shown again.

The email worker reads the transactional outbox, uses row locking to avoid duplicate concurrent delivery, retries failures with backoff and marks exhausted jobs failed.

## Database

The `drizzle/` directory contains versioned PostgreSQL migrations. The initial migration enables PostGIS and creates identity, profile, matching, meetup, venue, subscription, payment, settings and email-outbox tables. The social graph migrations add likes, passes, conversations, messages, blocks and reports.

```bash
bun run db:migrate
```

## Current implementation status

Implemented in this branch:
- TanStack Start app routing and server runtime foundation.
- Responsive discovery UI, meetup UI shell and venue directory shell.
- PostgreSQL/PostGIS Drizzle schema and SQL migrations.
- Local Docker PostGIS database.
- Email/password registration, 18+ acknowledgement, one-time email verification, login, session lookup and logout.
- Transactional email outbox and retrying SMTP worker.
- Health and database readiness endpoints.
- CI build/typecheck workflow.

Still to implement:
- Google OAuth and phone OTP provider integrations.
- Rate limiting, abuse controls and production security review for auth endpoints.
- Profile photo storage and richer profile editing.
- Persistent profile editing, gender-preference compatibility filtering, area-filtered discovery, pass/like actions and mutual-match creation. The discovery UI now uses authenticated API data rather than demo people. Discovery is area-based, not GPS-distance-based.
- Conversation membership authorization and real-time chat delivery.
- Meetup CRUD, approvals and group conversation membership.
- Venue self-registration, admin approval UI and admin-configurable package management.
- M-Pesa Daraja integration and payment callback verification.
- Admin dashboard, moderation tooling and analytics.

The meetup and venue sections still contain illustrative demo data. Do not treat those entries as real users, confirmed events or real-time venue availability.

## Security and operations

- Never commit `.env`, OAuth secrets, SMTP passwords, SMS credentials or payment credentials.
- All secrets are server-side; never prefix them with `VITE_`.
- Verify payment callbacks server-side and make payment processing idempotent.
- Store money in integer minor units with an explicit currency.
- Subscription records snapshot the agreed price so later admin price changes do not silently alter an active agreement.
- Apply authorization checks on every message, meetup and venue-management endpoint before enabling those modules.
- Minimize location collection and return only the user's selected visibility level.
- Add request rate limiting and monitoring before public registration launch.
- Complete Kenyan legal and privacy review before enabling alcohol-related paid promotions.
