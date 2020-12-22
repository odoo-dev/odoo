odoo.define('l10n_de_pos_cert.screens', function (require) {
    'use strict';
    const screens = require('point_of_sale.screens');
    const core = require('web.core');
    const _t = core._t;

    screens.PaymentScreenWidget.include({
        async finalize_validation() {
            const _super = this._super.bind(this);
            const order = this.pos.get_order();
            // In order to not modify the base code, the second condition is needed for invoicing
            if (this.pos.isCountryGermany() && (!order.is_to_invoice() || order.get_client())) {
                order.clean_empty_paymentlines()
                if (order.isTransactionInactive()) {
                    await order.createTransaction().catch(error => {
                        const message = {
                            'noInternet': _t('Check the internet connection then try to validate the order again'),
                            'unknown': _t('An unknown error has occurred ! Please, contact Odoo.')
                        }
                        this.chrome.showFiskalyErrorPopup(error, message)
                    });
                }
                if (order.isTransactionStarted()) {
                    await order.finishShortTransaction().then(() => {
                        _super();
                    }).catch(error => {
                        const message = {
                            'noInternet': _t(
                                'The transaction has already been sent to Fiskaly. You still need to finish or cancel the transaction. ' +
                                'Check the internet connection then try to validate or cancel the order. ' +
                                'Do not delete your browsing, cookies and cache data in the meantime !'
                            ),
                            'unknown': _t('An unknown error has occurred ! Please, cancel the order by deleting it and contact Odoo.')
                        }
                        this.chrome.showFiskalyErrorPopup(error, message)
                    });
                }
            } else {
                _super();
            }
        }
    })

});