/** @odoo-module alias=snailmail.modelAddons.NotificationGroup.actionAddons.openCancelAction **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'NotificationGroup/openCancelAction',
    id: 'snailmail.modelAddons.NotificationGroup.actionAddons.openCancelAction',
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
        if (notificationGroup.type(ctx) !== 'snail') {
            return original(...arguments);
        }
        env.bus.trigger('do-action', {
            action: 'snailmail.snailmail_letter_cancel_action',
            options: {
                additional_context: {
                    default_model: notificationGroup.resModel(ctx),
                    unread_counter: notificationGroup.notifications(ctx).length,
                },
            },
        });
    },
});
