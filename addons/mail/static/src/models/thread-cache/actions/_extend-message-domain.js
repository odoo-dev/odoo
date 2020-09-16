/** @odoo-module alias=mail.models.ThreadCache.actions._extendMessageDomain **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadCache/_extendMessageDomain',
    id: 'mail.models.ThreadCache.actions._extendMessageDomain',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} threadCache
     * @param {Array} domain
     * @returns {Array}
     */
    func(
        { ctx, env },
        threadCache,
        domain,
    ) {
        const thread = threadCache.thread(ctx);
        if (thread.model(ctx) === 'mail.channel') {
            return domain.concat(
                [['channel_ids', 'in', [thread.id(ctx)]]],
            );
        } else if (thread === env.services.model.messaging.inbox(ctx)) {
            return domain.concat(
                [['needaction', '=', true]],
            );
        } else if (thread === env.services.model.messaging.starred(ctx)) {
            return domain.concat([
                [
                    'starred_partner_ids',
                    'in',
                    [env.services.model.messaging.currentPartner(ctx).id(ctx)],
                ],
            ]);
        } else if (thread === env.services.model.messaging.history(ctx)) {
            return domain.concat(
                [['needaction', '=', false]],
            );
        } else if (thread === env.services.model.messaging.moderation(ctx)) {
            return domain.concat(
                [['moderation_status', '=', 'pending_moderation']],
            );
        } else {
            // Avoid to load user_notification as these messages are not
            // meant to be shown on chatters.
            return domain.concat(
                [
                    ['message_type', '!=', 'user_notification'],
                    ['model', '=', thread.model(ctx)],
                    ['res_id', '=', thread.id(ctx)],
                ],
            );
        }
    },
});
