/** @odoo-module alias=mail.models.Thread.actions.markAsSeen **/

import action from 'mail.action.define';

/**
 * Mark the specified conversation as read/seen.
 */
export default action({
    name: 'Thread/markAsSeen',
    id: 'mail.models.Thread.actions.markAsSeen',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {Message} message the message to be considered as last seen
     */
    async func(
        { ctx, env },
        thread,
        message,
    ) {
        if (thread.model(ctx) !== 'mail.channel') {
            return;
        }
        if (
            thread.pendingSeenMessageId(ctx) &&
            message.id(ctx) <= thread.pendingSeenMessageId(ctx)
        ) {
            return;
        }
        if (
            thread.lastSeenByCurrentPartnerMessageId(ctx) &&
            message.id(ctx) <= thread.lastSeenByCurrentPartnerMessageId(ctx)
        ) {
            return;
        }
        env.services.action.dispatch(
            'Record/update',
            thread,
            { pendingSeenMessageId: message.id(ctx) },
        );
        return env.services.action.dispatch(
            'Thread/performRpcChannelSeen',
            {
                ids: [thread.id(ctx)],
                lastMessageId: message.id(ctx),
            },
        );
    },
});
