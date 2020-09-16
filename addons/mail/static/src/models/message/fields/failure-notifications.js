/** @odoo-module alias=mail.models.Message.fields.failureNotifications **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'failureNotifications',
    id: 'mail.models.Message.fields.failureNotifications',
    global: true,
    target: 'Notification',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} param0.record
     * @returns {Notification[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.notifications(ctx).filter(
                notification => ['exception', 'bounce'].includes(
                    notification.status(ctx),
                ),
            ),
        );
    },
});
