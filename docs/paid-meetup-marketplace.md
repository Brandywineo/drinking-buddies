# Paid meetups and host marketplace

## Confirmed launch rules

- Free meetups remain available to eligible hosts.
- Paid meetups require a host membership in `trialing` or `active` state.
- Host membership starts with one configurable free trial. Trial length and monthly/annual prices are controlled by platform settings.
- Attendee checkout is Kenya-only M-PESA through Safaricom Daraja STK Push.
- Host payouts are Kenya-only M-PESA wallet transfers through Daraja B2C to the host's verified account phone number.
- Host earnings become available 24 hours after the meetup ends (or three hours after its start when no end time is supplied).
- Every host payout requires admin approval.
- Refunds prefer a Daraja reversal of the original STK transaction, where the Safaricom shortcode and permissions support it. Refunds are admin-reviewed.
- The first launch does not include international card payments or bank-account payouts.
- All live money movement remains disabled. Sandbox is the only supported execution mode in this implementation.

## Payment and settlement model

1. An attendee creates a pending booking. Price, commission and refund policy are snapshotted on the booking.
2. The attendee starts checkout with the same M-PESA number verified on their account.
3. The server creates an STK Push and stores the Daraja checkout identifiers.
4. The booking remains pending until the Daraja callback is correlated with the stored checkout request and a server-to-server STK query reports success. The callback amount, receipt and payer phone must match the payment record.
5. A successful, on-time payment confirms the booking and credits the host's pending wallet balance with the snapshotted host net. Duplicate callbacks cannot credit the same booking twice.
6. The release worker moves host earnings from pending to available 24 hours after the meetup ends. Ledger idempotency prevents duplicate releases.
7. The host requests a payout to their verified Kenyan M-PESA number. The requested amount is moved from available to reserved and requires an admin decision.
8. After approval, Daraja B2C is initiated. The payout is only marked paid after a matching successful result callback with the expected amount, receipt and destination. Failed payouts release the reservation; uncertain submissions remain reserved for reconciliation.

A late successful STK payment after a booking reservation has expired is recorded for manual reconciliation and is not automatically confirmed or credited to the host. The platform must resolve the attendee's money before any capacity conflict is treated as complete.

## Refund model

- The booking stores a snapshot of the host's refund cutoff and percentage.
- Attendees may request cancellation before the meetup starts.
- Eligible refunds enter an admin review queue.
- Before initiating a reversal, the system reserves the host's proportional share from pending/available wallet balances.
- A successful Daraja reversal marks the booking refunded and debits the host share. A failed reversal releases the host reserve.
- If the original M-PESA receipt is missing, the refund remains a manual reconciliation case.
- Reversal credentials, receiver party and identifier type must be configured from Safaricom's approved shortcode setup. Do not guess these values.

## Daraja configuration

Server-side environment variables only. Never expose these values through `VITE_*` variables.

### STK Push

- `MPESA_ENV=sandbox`
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `MPESA_CALLBACK_URL` — public HTTPS URL for `POST /api/webhooks/daraja`

### B2C payouts

- `MPESA_B2C_INITIATOR_NAME`
- `MPESA_B2C_SECURITY_CREDENTIAL` — Safaricom-encrypted initiator credential
- `MPESA_B2C_RESULT_URL` — public HTTPS URL for `POST /api/webhooks/daraja/b2c`
- `MPESA_B2C_TIMEOUT_URL` — public HTTPS timeout callback URL

### Reversals

- `MPESA_REVERSAL_INITIATOR_NAME`
- `MPESA_REVERSAL_SECURITY_CREDENTIAL`
- `MPESA_REVERSAL_RECEIVER_PARTY`
- `MPESA_REVERSAL_IDENTIFIER_TYPE`
- `MPESA_REVERSAL_RESULT_URL` — public HTTPS URL for `POST /api/webhooks/daraja/reversal`
- `MPESA_REVERSAL_TIMEOUT_URL` — public HTTPS timeout callback URL

### Admin access

- `ADMIN_EMAILS` — comma-separated normalized email allowlist for finance administration.

Never commit actual credentials. Obtain the correct initiator, security credential, shortcode, callback registration and transaction permissions from Safaricom. Daraja callback endpoints must be public HTTPS endpoints. Callback data is correlated against stored request identifiers and transaction values; do not treat a client redirect as proof of payment.

## Implemented API surface

- `POST /api/meetups/:meetupId/bookings` — idempotent paid-ticket reservation.
- `POST /api/bookings/:bookingId/checkout` — Daraja STK Push.
- `GET /api/bookings/:bookingId/payment` — attendee payment status.
- `POST /api/webhooks/daraja` — STK callback and payment settlement.
- `POST /api/bookings/:bookingId/cancel` — attendee cancellation and eligible refund request.
- `GET /api/bookings/:bookingId/refund` — attendee refund status.
- `POST /api/host/subscription/checkout` — host membership STK checkout.
- `GET /api/host/wallet` — host wallet, ledger and payout history.
- `GET/POST /api/host/payouts` — payout history and payout request.
- `POST /api/webhooks/daraja/b2c` — B2C payout result callback.
- `POST /api/webhooks/daraja/reversal` — reversal result callback.
- `GET/PUT /api/admin/finance/settings` — commission, minimum payout, release hours and membership pricing.
- `GET /api/admin/finance/payouts` and `POST /api/admin/finance/payouts/:payoutId/decision` — admin payout queue and approval/rejection.
- `GET /api/admin/finance/refunds` and `POST /api/admin/finance/refunds/:refundId/decision` — admin refund queue and decision.

Admin API access is restricted by the `ADMIN_EMAILS` environment allowlist plus an authenticated session. No client-supplied admin flag is trusted.

## Background workers

Run `bun run marketplace:release` on a recurring schedule (recommended every 15 minutes). It:
- releases eligible host earnings after the configured delay;
- expires ended host membership periods;
- queues one renewal reminder during the final three days of a host membership period.

Run `bun run email:worker` continuously to deliver queued email notifications, including host membership renewal reminders.

## Important operational limitations

- Daraja-only checkout is M-PESA, not global Visa/Mastercard acceptance.
- Daraja B2C pays supported M-PESA wallet destinations; it is not a bank-transfer integration.
- Safaricom must approve the marketplace collection, holding, reversal and B2C disbursement use case and the exact shortcode permissions before live launch.
- Sandbox credentials and callback URLs must be configured before end-to-end provider tests can run.
- Production mode is intentionally blocked in checkout, B2C and reversal services.
- Finance settings and APIs exist; the production admin finance UI, automated reconciliation dashboard and operational alerts still need completion.
