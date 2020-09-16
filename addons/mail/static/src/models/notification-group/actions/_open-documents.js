/** @odoo-module alias=mail.models.NotificationGroup.actions._openDocuments **/

import action from 'mail.action.define';

/**
 * Opens the view that displays all the records of the group.
 */
export default action({
    name: 'NotificationGroup/_openDocuments',
    id: 'mail.models.NotificationGroup.actions._openDocuments',
    global: true,
    /**
     * @private
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
            action: {
                domain: [['message_has_error', '=', true]],
                name: env._t("Mail Failures"),
                res_model: notificationGroup.resModel(ctx),
                target: 'current',
                type: 'ir.actions.act_window',
                view_mode: 'kanban,list,form',
                views: [
                    [false, 'kanban'],
                    [false, 'list'],
                    [false, 'form'],
                ],
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
