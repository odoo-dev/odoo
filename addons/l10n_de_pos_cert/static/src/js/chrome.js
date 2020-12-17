odoo.define('l10n_de_pos_cert.chrome', function (require) {
    'use strict';

    const widgets = require('point_of_sale.chrome');
    const core = require('web.core');
    const _t = core._t;

    widgets.Chrome.include({
        showFiskalyErrorPopup(error, message) {
            if (error.status === 0) {
                const title = _t('No internet');
                const body = message.noInternet;
                this.gui.show_popup('error', { title, body });
            } else if (error.status === 401 && error.source === 'authenticate') {
                this._showUnauthorizedPopup();
            } else if ((error.status === 400 && error.responseJSON.message.includes('tss_id')) ||
                (error.status === 404 && error.responseJSON.code === 'E_TSS_NOT_FOUND')) {
                this._showBadRequestPopup('TSS ID');
            } else if ((error.status === 400 && error.responseJSON.message.includes('client_id')) ||
                (error.status === 400 && error.responseJSON.code === 'E_CLIENT_NOT_FOUND')) {
                // the api is actually sending an 400 error for a "Not found" error
                this._showBadRequestPopup('Client ID');
            } else {
                const title = _t('Unknown error');
                const body = message.unknown;
                this.gui.show_popup('error', { title, body });
            }
        },
        _showUnauthorizedPopup() {
            const title = _t('Unauthorized error to Fiskaly');
            const body = _t(
                'It seems that your Fiskaly API key and/or secret are incorrect. Update them in your company settings.'
            );
            this.gui.show_popup('error', { title, body });
        },
        _showBadRequestPopup(data) {
            const title = _t('Bad request');
            const body = _.str.sprintf(_t('Your %s is incorrect. Update it in your PoS settings'), data);
            this.gui.show_popup('error', { title, body });
        },
    });

});