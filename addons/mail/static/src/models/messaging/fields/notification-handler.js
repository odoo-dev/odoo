/** @odoo-module alias=mail.models.Messaging.fields.notificationHandler **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'notificationHandler',
    id: 'mail.models.Messaging.fields.notificationHandler',
    global: true,
    target: 'MessagingNotificationHandler',
    inverse: 'messaging',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {MessagingNotificationHandler}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
