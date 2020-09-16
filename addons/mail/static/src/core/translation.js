/** @odoo-module alias=mail.core.translation **/

import { TranslationDataBase } from 'web.translation';

const { Component } = owl;

TranslationDataBase.include({
    /**
     * @override
     */
    set_bundle() {
        const res = this._super(...arguments);
        if (Component.env.services.model.messaging) {
            // Update messaging locale whenever the translation bundle changes.
            // In particular if messaging is created before the end of the
            // `load_translations` RPC, the default values have to be
            // updated by the received ones.
            this.env.services.action.dispatch(
                'Record/update',
                Component.env.services.model.messaging.$$$locale(),
                {
                    $$$language: this.parameters.code,
                    $$$textDirection: this.parameters.direction,
                },
            );
        }
        return res;
    },
});
