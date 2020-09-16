/** @odoo-module alias=mail.components.PartnerImStatusIcon **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class PartnerImStatusIcon extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        if (!this.hasOpenChat) {
            return;
        }
        this.env.services.action.dispatch('Partner/openChat',
            this.partner,
        );
    }

}

Object.assign(PartnerImStatusIcon, {
    defaultProps: {
        hasBackground: true,
        hasOpenChat: false,
    },
    props: {
        partner: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Partner') {
                    return false;
                }
                return true;
            },
        },
        hasBackground: Boolean,
        /**
         * Determines whether a click on `this` should open a chat with
         * `this.partner`.
         */
        hasOpenChat: Boolean,
    },
    template: 'mail.PartnerImStatusIcon',
});

export default PartnerImStatusIcon;
