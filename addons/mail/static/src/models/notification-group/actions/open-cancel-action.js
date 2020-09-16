/** @odoo-module alias=mail.models.NotificationGroup.actions.openCancelAction **/

import action from 'mail.action.define';

/**
 * Opens the view that allows to cancel all notifications of the group.
 */
export default action({
    name: 'NotificationGroup/openCancelAction',
    id: 'mail.models.NotificationGroup.actions.openCancelAction',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {NotificationGroup} notificationGroup
     */
    func(
        { ctx, env },
        notificationGroup,
    ) {
        if (notificationGroup.type(ctx) !== 'email') {
            return;
        }
        env.bus.trigger('do-action', {
            action: 'mail.mail_resend_cancel_action',
            options: {
                additional_context: {
                    default_model: notificationGroup.resModel(ctx),
                    unread_counter: notificationGroup.notifications(ctx).length,
                },
            },
        });
    },
});
