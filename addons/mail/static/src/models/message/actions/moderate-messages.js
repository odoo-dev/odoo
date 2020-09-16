/** @odoo-module alias=mail.models.Message.actions.moderateMessages **/

import action from 'mail.action.define';

/**
 * Applies the moderation `decision` on the provided messages.
 */
export default action({
    name: 'Message/moderateMessages',
    id: 'mail.models.Message.actions.moderateMessages',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message[]} messages
     * @param {string} decision: 'accept', 'allow', ban', 'discard', or 'reject'
     * @param {Object|undefined} [kwargs] optional data to pass on
     *  message moderation. This is provided when rejecting the messages
     *  for which title and comment give reason(s) for reject.
     * @param {string} [kwargs.title]
     * @param {string} [kwargs.comment]
     */
    async func(
        { ctx, env },
        messages,
        decision,
        kwargs,
    ) {
        const messageIds = messages.map(message => message.id(ctx));
        await env.services.rpc({
            model: 'mail.message',
            method: 'moderate',
            args: [messageIds, decision],
            kwargs: kwargs,
        });
    },
});
