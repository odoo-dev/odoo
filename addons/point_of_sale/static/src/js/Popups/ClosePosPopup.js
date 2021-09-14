odoo.define('point_of_sale.ClosePosPopup', function(require) {
    'use strict';

    const { useState } = owl;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const { identifyError } = require('point_of_sale.utils');
    const { ConnectionLostError } = require('@web/core/network/rpc_service')


    class ClosePosPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({'closeSession': false, 'openBackEnd': false});
            this.action = {'openBackEnd': this._closePos.bind(this), 'closeSession': this._closeSession.bind(this)}
        }
        onClick(action) {
            if (!this.state[action]) {
                this.state[action] = true;
                this.state[action] = setTimeout(() => {
                    this.state[action] = false;
                }, 2000)
            } else {
                this.action[action]();
            }
        }
        _closePos() {
            this.trigger('close-pos');
        }
        async _closeSession() {
            try {
                let successful, reason;
                // TODO TRJ - TO remove - This is just an example.
                [successful, reason] = await this.rpc({
                    model: 'pos.session',
                    method: 'post_closing_cash_details',
                    args: [[this.env.pos.pos_session.id], null, [[20.0, 5]]],
                })
                if (!successful) {
                    await this.showPopup('ErrorPopup', { title: 'Error', body: reason });
                    return;
                }
                [successful, reason] = await this.rpc({
                    model: 'pos.session',
                    method: 'close_session_from_ui',
                    args: [this.env.pos.pos_session.id],
                });
                if (!successful) {
                    await this.showPopup('ErrorPopup', { title: 'Error', body: reason });
                }
                window.location = '/web#action=point_of_sale.action_client_pos_menu';
            } catch (error) {
                const iError = identifyError(error);
                if (iError instanceof ConnectionLostError) {
                    await this.showPopup('ErrorPopup', {
                        title: this.env._t('Network Error'),
                        body: this.env._t('Cannot close the session when offline.'),
                    });
                } else {
                    throw error;
                }
            }
        }
    }

    ClosePosPopup.template = 'ClosePosPopup';
    Registries.Component.add(ClosePosPopup);

    return ClosePosPopup;
});
