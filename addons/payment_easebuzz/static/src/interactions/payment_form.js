/** @odoo-module **/
/* global Easebuzz */

import { loadJS } from "@web/core/assets";
import { patch } from "@web/core/utils/patch";

import { PaymentForm } from "@payment/interactions/payment_form";

patch(PaymentForm.prototype, {
  // #=== DOM MANIPULATION ===#

  /**
   * Update the payment context to set the flow to 'direct'.
   *
   * @override method from @payment/js/payment_form
   * @private
   * @param {number} providerId - The id of the selected payment option's provider.
   * @param {string} providerCode - The code of the selected payment option's provider.
   * @param {number} paymentOptionId - The id of the selected payment option
   * @param {string} paymentMethodCode - The code of the selected payment method, if any.
   * @param {string} flow - The online payment flow of the selected payment option.
   * @return {void}
   */
  async _prepareInlineForm(
    providerId,
    providerCode,
    paymentOptionId,
    paymentMethodCode,
    flow,
  ) {
    if (providerCode !== "easebuzz") {
      await super._prepareInlineForm(...arguments);
      return;
    }

    // Overwrite the flow of the select payment method.
    this._setPaymentFlow("direct");
  },

  // #=== PAYMENT FLOW ===#

  async _processDirectFlow(
    providerCode,
    paymentOptionId,
    paymentMethodCode,
    processingValues,
  ) {
    if (providerCode !== "easebuzz") {
      await super._processDirectFlow(...arguments);
      return;
    }
    const { access_key, key, txn_env } = processingValues;
    const easebuzzOptions = this._prepareEasebuzzOptions(access_key);
    await loadJS(
      "https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.min.js",
    );
    const easebuzzCheckout = new window.EasebuzzCheckout(key, txn_env);
    easebuzzCheckout.initiatePayment(easebuzzOptions);
  },

  /**
   * Prepare the options to init the Easebuzz SDK Object.
   *
   * @param {string} access_key - Access key
   * @return {object}
   */
  _prepareEasebuzzOptions(access_key) {
    return {
      access_key,
      onResponse: (response) => {
        if (response.status === "userCancelled") {
          window.location.reload();
        } else {
          window.location = "/payment/status";
        }
      },
    };
  },
});
