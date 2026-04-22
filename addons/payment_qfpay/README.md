# QFPay

## Technical details

API: QFPay OpenAPI version `v1`

Integration guide: [QFPay Payment Element](https://sdk.qfapi.com/integration/online-shop/checkout-integration/payment-element)

This module integrates QFPay using a direct payment flow based on the QFPay Element SDK.

When a payment method is selected, the frontend loads the QFPay SDK dynamically and stores the
provider environment values required to initialize the checkout session.

When the payment is submitted, a server-to-server API call is made to create a payment intent on
QFPay's side.

Because QFPay requires its wallet element to be rendered outside the HTML form, the SDK renders the
wallet picker inside an Odoo dialog before confirming the payment. The return URL then triggers a
transaction query to reconcile the final status if the transaction is not already finalized.

Webhook notifications are supported and their authenticity is verified with the `X-QF-SIGN`
signature header before the transaction is processed.

The provider requires an `App Code` and an `App Key`.

## Supported features

- Direct payment flow
- Webhook notifications
- Multiple payment methods:
  - Alipay
  - Alipay HK
  - WeChat Pay
  - UnionPay
  - FPS
  - PayMe
  - Card payments (Visa, Mastercard, JCB, UnionPay)
  - Multi-currency support for `HKD`, `CNY`, `USD`, `AED`, `EUR`, `IDR`, `JPY`, `MMK`, `MYR`, `SGD`, `THB`, `CAD`, and `AUD`

## Not implemented features

- Tokenization
- Manual capture
- Refunds
- Express checkout

## Module history

- `20.0`
  - The first version of the module is merged. odoo/odoo#262954

## Testing instructions

Set the provider to test mode and configure the QFPay test credentials (`App Code` and `App Key`).

Use the payment methods available in the QFPay test environment to complete the checkout and
verify both the return and webhook flows.

Note that QFPay provides three environments: `sandbox`, `live testing`, and `production`.

Because `sandbox` is severely limited in terms of available payment methods, the module is
configured to target the `live testing` environment when the provider is in `test` mode.

However, transactions created in `live testing` must be refunded manually and promptly from the
QFPay dashboard to prevent settlement.

For more information, see the [QFPay Payment Element](https://sdk.qfapi.com/integration/online-shop/checkout-integration/payment-element).
