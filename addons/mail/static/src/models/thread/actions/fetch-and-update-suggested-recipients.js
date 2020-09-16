/** @odoo-module alias=mail.models.Thread.actions.fetchAndUpdateSuggestedRecipients **/

import action from 'mail.action.define';

/**
 * Fetches suggested recipients.
 */
export default action({
    name: 'Thread/fetchAndUpdateSuggestedRecipients',
    id: 'mail.models.Thread.actions.fetchAndUpdateSuggestedRecipients',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    async func(
        { ctx, env },
        thread,
    ) {
        if (thread.isTemporary(ctx)) {
            return;
        }
        return env.services.action.dispatch(
            'Thread/performRpcMailGetSuggestedRecipients',
            {
                model: thread.model(ctx),
                res_ids: [thread.id(ctx)],
            },
        );
    },
});
