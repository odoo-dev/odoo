/** @odoo-module alias=mail.models.Message.actions.markMessagesAsRead **/

import action from 'mail.action.define';

/**
 * Mark provided messages as read. Messages that have been marked as
 * read are acknowledged by server with response as longpolling
 * notification of following format:
 *
 * [[dbname, 'res.partner', partnerId], { type: 'mark_as_read' }]
 *
 * @see `MessagingNotificationHandler/_handleNotificationPartnerMarkAsRead()`
 */
export default action({
    name: 'Message/markMessagesAsRead',
    id: 'mail.models.Message.actions.markMessagesAsRead',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message[]} messages
     */
    async func(
        { ctx, env },
        messages,
    ) {
        await env.services.rpc({
            model: 'mail.message',
            method: 'set_message_done',
            args: [messages.map(message => message.id(ctx))],
        });
    },
});
