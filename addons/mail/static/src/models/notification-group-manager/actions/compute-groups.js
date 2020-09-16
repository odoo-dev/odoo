/** @odoo-module alias=mail.models.NotificationGroupManager.actions.computeGroups **/

import action from 'mail.action.define';

export default action({
    name: 'NotificationGroupManager/computeGroups',
    id: 'mail.models.NotificationGroupManager.actions.computeGroups',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {NotificationGroupManager} notificationGroupManager
     */
    func(
        { ctx, env },
        notificationGroupManager,
    ) {
        for (const group of notificationGroupManager.groups(ctx)) {
            env.services.action.dispatch(
                'Record/delete',
                group,
            );
        }
        const groups = [];
        // TODO batch insert, better logic task-2258605
        for (const notification of env.services.model.messaging.currentPartner(ctx).failureNotifications(ctx)) {
            const thread = notification.message(ctx).originThread(ctx);
            // Notifications are grouped by model and notification_type.
            // Except for channel where they are also grouped by id because
            // we want to open the actual channel in discuss or chat window
            // and not its kanban/list/form view.
            const channelId = thread.model(ctx) === 'mail.channel'
                ? thread.id(ctx)
                : null;
            const id = `${thread.model(ctx)}/${channelId}/${notification.type(ctx)}`;
            const group = env.services.action.dispatch(
                'NotificationGroup/insert',
                {
                    id,
                    resModel: thread.model(ctx),
                    resModelName: thread.modelName(ctx),
                    type: notification.type(ctx),
                },
            );
            env.services.action.dispatch(
                'Record/update',
                group,
                {
                    notifications: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        notification,
                    ),
                },
            );
            // keep res_id only if all notifications are for the same record
            // set null if multiple records are present in the group
            let res_id = group.resId(ctx);
            if (group.resId(ctx) === undefined) {
                res_id = thread.id(ctx);
            } else if (group.resId(ctx) !== thread.id(ctx)) {
                res_id = null;
            }
            // keep only the most recent date from all notification messages
            let date = group.date(ctx);
            if (!date) {
                date = notification.message(ctx).date(ctx);
            } else {
                date = moment.max(
                    group.date(ctx),
                    notification.message(ctx).date(ctx),
                );
            }
            env.services.action.dispatch(
                'Record/update',
                group,
                {
                    date,
                    resId: res_id,
                },
            );
            // avoid linking the same group twice when adding a notification
            // to an existing group
            if (!groups.includes(group)) {
                groups.push(group);
            }
        }
        env.services.action.dispatch(
            'Record/update',
            notificationGroupManager,
            {
                groups: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    groups,
                ),
            },
        );
    },
});
