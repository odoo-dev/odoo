# Payfast

## Technical details

API: [Payfast Custom Integration](https://developers.payfast.co.za/docs) (checkout and ITN)
and [Payfast API](https://developers.payfast.co.za/api) (refunds and subscriptions)

This module integrates Payfast using the generic payment with redirection flow based on form
submission provided by the `payment` module.

Payfast exposes two distinct integrations: the classic form-based checkout/ITN flow, signed with
a fixed field order and `merchant_id`/`merchant_key`; and a separate JSON-based account-level API
used for refunds and for charging tokenized (recurring) payments, authenticated with its own
header-based signature scheme (`merchant-id`/`version`/`timestamp`/`signature`, fields sorted
alphabetically). Both signatures rely on the same passphrase, which is required for tokenized
payments.

## Supported features

- Payment with redirection flow
- Webhook notifications (ITN)
- Tokenization with payment
- Full and partial refunds

## Module history

- `19.0`
  - The first version of the module is merged.

## Testing instructions

https://developers.payfast.co.za/docs#sandbox


Notes:
- The Instant Transaction Notification (ITN) requires a publicly reachable `notify_url`; when
  testing locally, expose the server with a tunnel (e.g. ngrok) and set `web.base.url` to the
  tunnel's HTTPS address before starting a payment.
- Refunds are not available in Sandbox mode; they can only be tested with live credentials.
- Tokenized (recurring) charges *are* testable in Sandbox: complete a payment with the "Save my
  payment details" checkbox ticked, then trigger a charge on the resulting token.
