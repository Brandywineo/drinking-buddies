# Paid meetups and host marketplace — technical plan

## Confirmed product rules

- Free meetups remain available to all eligible hosts.
- Paid meetups require a host subscription in `trialing` or `active` state.
- Premium host membership starts with the `free_trial` plan. Trial length, paid price, billing interval, and eligibility rules live in platform settings; the trial is granted once per host and is created when the host first attempts to publish a paid meetup.
- A paid meetup cannot be published unless the host has a non-expired `trialing` or `active` premium membership.
- Booking commission is admin-configurable and snapshotted in basis points on each booking.
- Host payout release is admin-configurable as a percentage schedule. Each schedule can define pre-event and post-event tranches and their release conditions.
- Hosts choose a cancellation/refund policy from admin-approved options. The selected policy is snapshotted on each booking so later policy edits do not rewrite existing bookings.
- Payouts require completed host verification and an eligible provider/country/currency route.
- Wallet balances are backed by an append-only transaction ledger. Balance summary columns are updated in the same database transaction as each ledger entry.
- All amounts use integer minor units and an explicit ISO currency code.

## Payment-provider decision

### Safaricom Daraja / M-PESA — launch integration

Daraja is the selected payment integration for this marketplace. The attendee checkout should use M-PESA STK Push: the server creates a checkout request, the attendee approves it on their phone, and the booking remains pending until a verified Daraja callback confirms the transaction. The callback must be authenticated/validated, persisted in the webhook inbox, and processed idempotently. A browser redirect or client-side success message must never confirm a booking.

Daraja is an M-PESA integration, not a global card-acquiring service. It supports M-PESA payment flows; it does not by itself provide worldwide Visa/Mastercard acceptance. If the product still requires attendees worldwide to pay by international card, that requires a separately approved card provider or payment rail. Do not describe Daraja-only checkout as global card acceptance.

Host disbursement must use a separately defined Daraja-supported payout flow and approved Safaricom shortcode/permissions. If hosts are paid to M-PESA wallets, the likely flow is Daraja B2C to verified Kenyan M-PESA numbers. Do not assume B2C sends funds directly to bank accounts. Confirm the payout destination and Safaricom's approval of the marketplace funds flow before implementing live disbursements.

For launch, keep payment and payout credentials server-side, use Daraja sandbox first, verify callbacks, reconcile the shortcode statement, and keep live transactions disabled until Safaricom has approved the exact collection, refunds, and host-disbursement model. No automatic split settlement is assumed; host release remains controlled by the platform's admin-configured schedule and ledger.


## Architecture

1. **Domain layer:** bookings, subscription entitlement, commission snapshots, refund policy snapshots, wallet ledger, payout schedules and reconciliation are provider-neutral.
2. **Provider adapter:** an interface owns checkout initialization, payment verification, refund execution, recipient onboarding, payout initiation and payout status lookup. No route calls a provider SDK directly.
3. **Capability registry:** a provider/country/currency matrix determines whether checkout and payout are enabled. Checkout capability and payout capability are separate; global card acceptance must never imply global host payouts.
4. **Webhook inbox:** persist provider event ID before processing, enforce uniqueness, apply provider-specific authenticity and transaction-correlation checks, and process idempotently.
5. **Daraja launch flow:** M-PESA STK Push for attendee collection, with callback validation and transaction reconciliation. Host disbursement is a separate approved Daraja payout capability (for example, B2C to verified M-PESA wallets); do not assume bank-account payouts or international card acceptance.
6. **Ledger:** immutable double-entry-style financial events with a transactionally maintained wallet summary. Never accept wallet balance or commission amounts from the client.
7. **Payout orchestration:** admin-configured release schedule, risk/refund reserve, host KYC state, country/currency capability and provider settlement status all gate release.

## Planned API

- `POST /api/meetups/:meetupId/bookings` — implemented: create an idempotent pending paid booking, snapshot price/commission/refund policy, and reserve capacity for 15 minutes. Reservations count against capacity until they expire; confirmed bookings remain counted. Daraja payment initialization is explicitly disabled pending sandbox implementation and Safaricom approval.
- Paid meetups cannot use the free meetup join endpoint; attendees must use the ticket-booking flow. The current booking endpoint supports public paid meetups; approval-required paid meetups are rejected until an approval/payment sequence is designed.
- `GET /api/bookings` and `GET /api/bookings/:bookingId` — attendee booking history/details.
- `POST /api/bookings/:bookingId/checkout` — initialize provider checkout.
- `POST /api/bookings/:bookingId/cancel` — apply the booking's snapshotted host policy and request refund when due.
- `GET /api/host/dashboard` and `GET /api/host/wallet` — host revenue and balance views.
- `POST /api/host/payouts` — request a payout, subject to release policy and provider corridor.
- `POST /api/webhooks/payments/:provider` — signed, idempotent provider event intake.
- `GET/PUT /api/admin/finance/settings` — commission, trial, payout schedule, refund policy options and provider capabilities.
- `GET /api/admin/finance/payouts` and `POST /api/admin/finance/payouts/:id/decision` — admin review and release.

## Delivery sequence

1. Database and immutable financial model (this first implementation slice).
2. Host trial entitlement and paid meetup create/edit/list UI.
3. Booking lifecycle foundation: pending ticket reservation and capacity checks implemented; attendee booking history/details and booking UI remain to be built.
4. Daraja STK Push checkout and callback processing, initially in sandbox mode.
5. Host wallet, release scheduler and Kenya-only payouts.
6. Admin finance controls, reconciliation, refunds and audit views.
7. Add further provider adapters only after written approval for the platform's legal entity and each host payout country.

## Launch gates

- Safaricom approval of the exact marketplace funds flow: STK Push collection, settlement to the business shortcode, refunds/reversals, and the chosen host payout mechanism (including B2C if paying M-PESA wallets). Daraja does not provide global card acceptance; any international card requirement needs a separate approved provider.
- Kenyan legal/accounting review of marketplace funds flow, consumer cancellation rights, tax and any licensing/holding-funds implications.
- Daraja sandbox tests for STK Push, callback correlation, duplicate callbacks, timeouts, reversals/refunds and reconciliation.
- No live payout or paid meetup launch until the provider and compliance gates are approved.
