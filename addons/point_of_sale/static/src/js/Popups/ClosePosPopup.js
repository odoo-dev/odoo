odoo.define('point_of_sale.ClosePosPopup', function(require) {
    'use strict';

    const { useState } = owl;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
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
                await this.rpc({
                    model: 'pos.session',
                    method: 'close_session_from_ui',
                    args: [this.env.pos.pos_session.id],
                });
                window.location = '/web#action=point_of_sale.action_client_pos_menu';
            } catch (error) {
                if (error instanceof ConnectionLostError) {
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
