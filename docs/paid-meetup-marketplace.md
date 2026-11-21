# Paid meetups and host marketplace — technical plan

## Confirmed product rules

- Free meetups remain available to all eligible hosts.
- Paid meetups require a host subscription in `trialing` or `active` state.
- Host membership starts with an admin-configured free trial. Trial length, paid price, billing interval, and eligibility rules live in platform settings; do not hard-code commercial pricing.
- Booking commission is admin-configurable and snapshotted in basis points on each booking.
- Host payout release is admin-configurable as a percentage schedule. Each schedule can define pre-event and post-event tranches and their release conditions.
- Hosts choose a cancellation/refund policy from admin-approved options. The selected policy is snapshotted on each booking so later policy edits do not rewrite existing bookings.
- Payouts require completed host verification and an eligible provider/country/currency route.
- Wallet balances are backed by an append-only transaction ledger. Balance summary columns are updated in the same database transaction as each ledger entry.
- All amounts use integer minor units and an explicit ISO currency code.

## Payment-provider decision

### Recommended first provider: Paystack, Kenya-first

Paystack supports Kenyan registered businesses and can accept international card payments when international payments are enabled for the merchant account and the business passes Paystack's compliance review. Kenyan businesses can receive USD settlement to a USD bank account domiciled in Kenya. Paystack split payments support marketplace subaccounts and split settlement.

Important limitation: Paystack's Transfers product sends funds from the business balance to bank accounts in the business's country. This is not a global connected-account payout network. Therefore the initial payout corridor should be Kenya-only (verified Kenyan bank account; M-Pesa payout only if Paystack confirms the required payout product and account eligibility). Global attendees can pay from supported card markets, but hosts outside Kenya must not be promised cash-out until another provider/corridor is contracted and implemented.

Adyen for Platforms' published supported account countries do not include Kenya. Stripe Connect cross-border payouts require both the platform and connected accounts to be in supported countries; Stripe's public global availability list does not currently list Kenya as a supported platform country. Neither should be selected as the Kenya legal entity's launch marketplace provider without written provider approval.

Provider documentation:
- https://paystack.com/docs/v2/payments/split-payments
- https://support.paystack.com/en/articles/2130562
- https://support.paystack.com/en/articles/2130690
- https://support.paystack.com/en/articles/2132866
- https://docs.adyen.com/platforms
- https://support.stripe.com/questions/pay-out-to-connected-accounts-in-other-countries
- https://stripe.com/global

## Architecture

1. **Domain layer:** bookings, subscription entitlement, commission snapshots, refund policy snapshots, wallet ledger, payout schedules and reconciliation are provider-neutral.
2. **Provider adapter:** an interface owns checkout initialization, payment verification, refund execution, recipient onboarding, payout initiation and payout status lookup. No route calls a provider SDK directly.
3. **Capability registry:** a provider/country/currency matrix determines whether checkout and payout are enabled. Checkout capability and payout capability are separate; global card acceptance must never imply global host payouts.
4. **Webhook inbox:** persist provider event ID before processing, enforce uniqueness, verify provider signatures against the raw request body, and process idempotently.
5. **Ledger:** immutable double-entry-style financial events with a transactionally maintained wallet summary. Never accept wallet balance or commission amounts from the client.
6. **Payout orchestration:** admin-configured release schedule, risk/refund reserve, host KYC state, country/currency capability and provider settlement status all gate release.

## Planned API

- `POST /api/meetups/:meetupId/bookings` — create a pending paid booking and reserve capacity.
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
3. Booking lifecycle, capacity reservation and attendee booking UI.
4. Paystack checkout and verified webhook handling, initially in test mode.
5. Host wallet, release scheduler and Kenya-only payouts.
6. Admin finance controls, reconciliation, refunds and audit views.
7. Add further provider adapters only after written approval for the platform's legal entity and each host payout country.

## Launch gates

- Written Paystack confirmation of marketplace use case, international card acceptance, settlement currencies, subaccount eligibility, refund/chargeback responsibility and payout corridors.
- Kenyan legal/accounting review of marketplace funds flow, consumer cancellation rights, tax and any licensing/holding-funds implications.
- Provider sandbox and webhook signature tests.
- No live payout or paid meetup launch until the provider and compliance gates are approved.
