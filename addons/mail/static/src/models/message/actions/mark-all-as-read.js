/** @odoo-module alias=mail.models.Message.actions.markAllAsRead **/

import action from 'mail.action.define';

/**
 * Mark all messages of current user with given domain as read.
 */
export default action({
    name: 'Message/markAllAsRead',
    id: 'mail.models.Message.actions.markAllAsRead',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Array[]} domain
     */
    async func(
        { env },
        domain,
    ) {
        await env.services.rpc({
            model: 'mail.message',
            method: 'mark_all_as_read',
            kwargs: { domain },
        });
    },
});
