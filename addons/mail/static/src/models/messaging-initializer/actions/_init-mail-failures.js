/** @odoo-module alias=mail.models.MessagingInitializer.actions._initMailFailures **/

import action from 'mail.action.define';
import executeGracefully from 'mail.utils.executeGracefully';

export default action({
    name: 'MessagingInitializer/_initMailFailures',
    id: 'mail.models.MessagingInitializer.actions._initMailFailures',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object} mailFailuresData
     */
    async func(
        { ctx, env },
        messagingInitializer,
        mailFailuresData
    ) {
        await executeGracefully(
            mailFailuresData.map(
                () => {
                    const message = env.services.action.dispatch(
                        'Message/insert',
                        messageData => env.services.action.dispatch(
                            'Message/convertData',
                            messageData,
                        ),
                    );
                    // implicit: failures are sent by the server at initialization
                    // only if the current partner is author of the message
                    if (
                        !message.author(ctx) &&
                        messagingInitializer.messaging(ctx).currentPartner(ctx)
                    ) {
                        env.services.action.dispatch(
                            'Record/update',
                            message,
                            {
                                author: env.services.action.dispatch(
                                    'RecordFieldCommand/link',
                                    messagingInitializer.messaging(ctx).currentPartner(ctx),
                                ),
                            },
                        );
                    }
                },
            ),
        );
        env.services.action.dispatch(
            'NotificationGroupManager/computeGroups',
            messagingInitializer.messaging(ctx).notificationGroupManager(ctx),
        );
        // manually force recompute of counter (after computing the groups)
        env.services.action.dispatch(
            'Record/update',
            messagingInitializer.messaging(ctx).messagingMenu(ctx),
        );
    },
});