/** @odoo-module alias=mail.models.NotificationGroup.actions.openDocuments **/

import action from 'mail.action.define';

/**
 * Opens the view that displays either the single record of the group or
 * all the records in the group.
 */
export default action({
    name: 'NotificationGroup/openDocuments',
    id: 'mail.models.NotificationGroup.actions.openDocuments',
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
        if (notificationGroup.thread(ctx)) {
            env.services.action.dispatch(
                'Thread/open',
                notificationGroup.thread(ctx),
            );
        } else {
            env.services.action.dispatch(
                'NotificationGroup/_openDocuments',
                notificationGroup,
            );
        }
    },
});
