/** @odoo-module alias=mail.models.Messaging.fields.messagingMenu **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'messagingMenu',
    id: 'mail.models.Messaging.fields.messagingMenu',
    global: true,
    target: 'MessagingMenu',
    inverse: 'messaging',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {MessagingMenu}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
