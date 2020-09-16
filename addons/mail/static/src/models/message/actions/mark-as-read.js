/** @odoo-module alias=mail.models.Message.actions.markAsRead **/

import action from 'mail.action.define';

/**
 * Mark this message as read, so that it no longer appears in current
 * partner Inbox.
 */
export default action({
    name: 'Message/markAsRead',
    id: 'mail.models.Message.actions.markAsRead',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} message
     */
    async func(
        { ctx, env },
        message,
    ) {
        await env.services.action.dispatch(
            'Record/doAsync',
            message,
            () => env.services.rpc({
                model: 'mail.message',
                method: 'set_message_done',
                args: [[message.id(ctx)]],
            }),
        );
    },
});
