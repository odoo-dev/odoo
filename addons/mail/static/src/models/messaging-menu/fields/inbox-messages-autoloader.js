/** @odoo-module alias=mail.models.MessagingMenu.fields.inboxMessagesAutoloader **/

import attr from 'mail.model.field.attr.define';

/**
 * Dummy field to automatically load messages of inbox when messaging
 * menu is open.
 *
 * Useful because needaction notifications require fetching inbox
 * messages to work.
 */
export default attr({
    name: 'inboxMessagesAutoloader',
    id: 'mail.models.MessagingMenu.fields.inboxMessagesAutoloader',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingMenu} param0.record
     */
    compute({ ctx, env, record }) {
        if (!record.isOpen(ctx)) {
            return;
        }
        const inbox = env.services.model.messaging.inbox(ctx);
        if (!inbox || !inbox.mainCache(ctx)) {
            return;
        }
        // populate some needaction messages on threads.
        env.services.action.dispatch(
            'Record/update',
            inbox.mainCache(ctx),
            { isCacheRefreshRequested: true },
        );
    },
});
