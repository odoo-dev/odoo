/** @odoo-module alias=mail.components.MailTemplate **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class MailTemplate extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickPreview(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.env.services.action.dispatch('MailTemplate/preview',
            this.mailTemplate,
            this.activity,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickSend(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.env.services.action.dispatch('MailTemplate/send',
            this.mailTemplate,
            this.activity,
        );
    }

}

Object.assign(MailTemplate, {
    props: {
        activity: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Activity') {
                    return false;
                }
                return true;
            },
        },
        mailTemplate: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'MailTemplate') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.MailTemplate',
});

export default MailTemplate;
