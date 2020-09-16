/** @odoo-module alias=snailmail.modelAddons.NotificationGroup.actionAddons._openDocuments **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'NotificationGroup/_openDocuments',
    id: 'snailmail.modelAddons.NotificationGroup.actionAddons._openDocuments',
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
            action: {
                name: env._t("Snailmail Failures"),
                type: 'ir.actions.act_window',
                view_mode: 'kanban,list,form',
                views: [[false, 'kanban'], [false, 'list'], [false, 'form']],
                target: 'current',
                res_model: notificationGroup.resModel(ctx),
                domain: [['message_ids.snailmail_error', '=', true]],
            },
        });
        if (env.services.model.messaging.device(ctx).isMobile(ctx)) {
            // messaging menu has a higher z-index than views so it must
            // be closed to ensure the visibility of the view
            env.services.action.dispatch(
                'MessagingMenu/close',
                env.services.model.messaging.messagingMenu(ctx),
            );
        }
    },
});
