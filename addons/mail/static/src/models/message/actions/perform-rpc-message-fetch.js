/** @odoo-module alias=mail.models.Message.actions.performRpcMessageFetch **/

import action from 'mail.action.define';

/**
 * Performs the `message_fetch` RPC on `mail.message`.
 */
export default action({
    name: 'Message/performRpcMessageFetch',
    id: 'mail.models.Message.actions.performRpcMessageFetch',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Array[]} domain
     * @param {integer} [limit]
     * @param {integer[]} [moderated_channel_ids]
     * @param {Object} [context]
     * @returns {Message[]}
     */
    async 'Message/performRpcMessageFetch'(
        { ctx, env },
        domain,
        limit,
        moderated_channel_ids,
        context,
    ) {
        const messagesData = await env.services.rpc({
            model: 'mail.message',
            method: 'message_fetch',
            kwargs: {
                context,
                domain,
                limit,
                moderated_channel_ids,
            },
        }, { shadow: true });
        const messages = env.services.action.dispatch(
            'Message/insert',
            messagesData.map(
                messageData => env.services.action.dispatch(
                    'Message/convertData',
                    messageData,
                ),
            ),
        );
        // compute seen indicators (if applicable)
        for (const message of messages) {
            for (const thread of message.threads()) {
                if (
                    thread.model() !== 'mail.channel' ||
                    thread.channelType() === 'channel'
                ) {
                    // disabled on non-channel threads and
                    // on `channel` channels for performance reasons
                    continue;
                }
                env.services.action.dispatch(
                    'MessageSeenIndicator/insert',
                    {
                        channelId: thread.id(ctx),
                        messageId: message.id(ctx),
                    },
                );
            }
        }
        return messages;
    },
});
