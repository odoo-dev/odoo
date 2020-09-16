/** @odoo-module alias=mail.models.MessagingInitializer.actions._initMailboxes **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingInitializer/_initMailboxes',
    id: 'mail.models.MessagingInitializer.actions._initMailboxes',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object} param2
     * @param {Object[]} [param2.moderation_channel_ids=[]]
     * @param {integer} param2.moderation_counter
     * @param {integer} param2.needaction_inbox_counter
     * @param {integer} param2.starred_counter
     */
    func(
        { ctx, env },
        messagingInitializer,
        {
            moderation_channel_ids,
            moderation_counter,
            needaction_inbox_counter,
            starred_counter,
        },
    ) {
        env.services.action.dispatch(
            'Record/update',
            env.services.model.messaging.inbox(ctx),
            { counter: needaction_inbox_counter },
        );
        env.services.action.dispatch(
            'Record/update',
            env.services.model.messaging.starred(ctx),
            { counter: starred_counter },
        );
        if (moderation_channel_ids.length > 0) {
            env.services.action.dispatch(
                'Record/update',
                messagingInitializer.messaging(ctx).moderation(ctx),
                {
                    counter: moderation_counter,
                    isServerPinned: true,
                },
            );
        }
    },
});