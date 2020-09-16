/** @odoo-module alias=mail.models.Messaging.fields.notificationGroupManager **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'notificationGroupManager',
    id: 'mail.models.Messaging.fields.notificationGroupManager',
    global: true,
    target: 'NotificationGroupManager',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
