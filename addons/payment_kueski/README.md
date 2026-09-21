# Kueski Pay

## Technical details

API: Kueski Pay API Enterprise version `2` (shared by Kueski on onboarding, not public)

This module integrates Kueski Pay using the generic payment with redirection flow based on form
submission provided by the `payment` module. Requests are signed with the merchant's RSA private
key, generated from the provider form; the public key shown there must be sent to Kueski.

The webhook notifications are not signed. The payment intent is fetched from Kueski on every
notification and redirection, and only the fetched data are trusted. The webhook URL
(`/payment/kueski/webhook`) must be given to Kueski to be registered on the merchant account.

## Supported features

- Payment with redirection flow
- Webhook notifications

## Not implemented features

- Manual capture
- Refunds

## Module history

- `20.1`
  - The first version of the module is merged.
