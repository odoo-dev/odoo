/** @odoo-module alias=sms.modelAddons.NotificationGroup.openCancelAction **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'NotificationGroup/openCancelAction',
    id: 'sms.modelAddons.NotificationGroup.actionAddons.openCancelAction',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {NotificationGroup} notificationGroup
     */
    func(
        { ctx, env, original },
        notificationGroup,
    ) {
        if (notificationGroup.type(ctx) !== 'sms') {
            return original(...arguments);
        }
        env.bus.trigger('do-action', {
            action: 'sms.sms_cancel_action',
            options: {
                additional_context: {
                    default_model: notificationGroup.resModel(ctx),
                    unread_counter: notificationGroup.notifications(ctx).length,
                },
            },
        });
    },
});
