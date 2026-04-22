/** @odoo-module **/

/* global QFpay */

import { _t } from '@web/core/l10n/translation';
import { loadJS } from '@web/core/assets';
import { patch } from '@web/core/utils/patch';
import { Component, onMounted, xml } from '@odoo/owl';
import { Dialog } from '@web/core/dialog/dialog';
import { PaymentForm } from '@payment/interactions/payment_form';

// QFPay requires its wallet element to be rendered outside any <form> element (per QFPay SDK docs).
// To work around this constraint, the wallet UI is rendered inside an Odoo dialog component instead of inline,
// where the payment form wraps all content.
class QFPayWalletDialog extends Component {
    static components = { Dialog };
    static template = xml`
        <Dialog title="props.title" size="md">
            <div id="o_qfpay_wallet_dialog_container"/>
        </Dialog>
    `;
    static props = { close: Function, title: String, onMounted: Function };

    setup() {
        onMounted(() => this.props.onMounted());
    }
}

patch(PaymentForm.prototype, {
    /**
     * Override of `payment` to initialize QFPay interaction state.
     *
     * @override method from @payment/interactions/payment_form
     * @return {void}
     */
    setup() {
        super.setup();
        this.qfpayTrackedListeners = [];
        this.qfpayInlineValues = {};
        this.qfpayDialogRemove = null;
    },

    /**
     * Override of `payment` to reset the QFPay SDK state when the payment option changes.
     *
     * @override method from @payment/interactions/payment_form
     * @return {void}
     */
    _collapseInlineForms() {
        this._qfpayCleanup();
        return super._collapseInlineForms(...arguments);
    },

    // === DOM MANIPULATION ===

    /**
     * Override of `payment` to load the QFPay SDK and set the flow to 'direct'.
     *
     * @override method from @payment/interactions/payment_form
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the selected payment option.
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'qfpay')
            return super._prepareInlineForm(...arguments);

        this._setPaymentFlow('direct');

        const radio = document.querySelector('input[name="o_payment_radio"]:checked');
        const inlineContext = radio ? this._getInlineForm(radio)?.querySelector('.o_qfpay_inline_context') : null;

        try {
            this.qfpayInlineValues = JSON.parse(inlineContext.dataset.qfpayInlineFormValues);
            await this.waitFor(loadJS(this.qfpayInlineValues.sdk_url));
        } catch {
            this._displayErrorDialog(_t("Payment Unavailable"), _t("Could not load the QFPay payment SDK. Please refresh and try again."));
            this._enableButton();
        }
    },

    // === PAYMENT FLOW ===

    /**
     * Override of `payment` to render the QFPay wallet in a dialog and trigger payment.
     *
     * @override method from @payment/interactions/payment_form
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {object} processingValues - The processing values of the transaction.
     * @return {void}
     */
    async _processDirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'qfpay')
            return super._processDirectFlow(...arguments);

        const { payment_intent, out_trade_no, txamt, txcurrcd, return_url } = processingValues;

        try {
            const { sdk_env: env, sdk_region: region, picker_payment_type } = this.qfpayInlineValues;
            const qfpay = QFpay.config({ region, env, sessionId: payment_intent });
            const elements = qfpay.element({ theme: 'default' });

            await new Promise((resolve, reject) => {
                this.qfpayDialogRemove = this.services.dialog.add(QFPayWalletDialog, {
                    title: _t("Complete Your Payment"),
                    onMounted: () => {
                        this._qfpayWrapListeners(() => {
                            try {
                                qfpay.payment().walletPay({
                                    paysource: 'payment_element_checkout',
                                    out_trade_no, txamt, txcurrcd,
                                    support_pay_type: [picker_payment_type],
                                }, payment_intent);

                                elements.createWallet({ selector: '#o_qfpay_wallet_dialog_container' });

                                qfpay.confirmWalletPayment({ return_url }).then(resolve).catch(reject);
                            } catch (e) {
                                reject(e);
                            }
                        });
                    },
                }, { onClose: () => this.qfpayDialogRemove = null });
            });
            this._qfpayCleanup();
        } catch (error) {
            this._displayErrorDialog(_t("Payment Error"), error.message || _t("An unexpected error occurred during payment."));
            this._qfpayCleanup({ enableButton: true });
        }
    },

    // === HELPERS ===

    /**
     * Wrap a callback to intercept and track any `message` event listeners added by the QFPay SDK.
     *
     * The tracked listeners are stored so they can be removed during cleanup, since the SDK does
     * not expose a teardown API.
     *
     * @private
     * @param {Function} callback - The callback during which listener registration is intercepted.
     * @return {void}
     */
    _qfpayWrapListeners(callback) {
        const origAddEvent = window.addEventListener.bind(window);
        window.addEventListener = (type, listener, options) => {
            if (type === 'message') this.qfpayTrackedListeners.push({ listener, options });
            return origAddEvent(type, listener, options);
        };
        try {
            callback();
        } finally {
            window.addEventListener = origAddEvent;
        }
    },

    /**
     * Remove tracked SDK listeners, close the wallet dialog, and optionally re-enable the button.
     *
     * @private
     * @param {object} [options] - Optional cleanup options.
     * @param {boolean} [options.enableButton=false] - Whether to re-enable the submit button.
     * @return {void}
     */
    _qfpayCleanup({ enableButton = false } = {}) {
        return;
        this.qfpayTrackedListeners.forEach(({ listener, options }) => {
            window.removeEventListener('message', listener, options);
        });
        this.qfpayTrackedListeners = [];

        if (this.qfpayDialogRemove) {
            this.qfpayDialogRemove();
            this.qfpayDialogRemove = null;
        }

        if (enableButton)
            this._enableButton();
    },
});
