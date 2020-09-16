/** @odoo-module alias=mail.models.Chatter.actions.refresh **/

import action from 'mail.action.define';

export default action({
    name: 'Chatter/refresh',
    id: 'mail.models.Chatter.actions.refresh',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Chatter} chatter
     */
    async func(
        { ctx, env },
        chatter,
    ) {
        if (chatter.hasActivities(ctx)) {
            env.services.action.dispatch(
                'Thread/refreshActivities',
                chatter.thread(ctx),
            );
        }
        if (chatter.hasFollowers(ctx)) {
            env.services.action.dispatch(
                'Thread/refreshFollowers',
                chatter.thread(ctx),
            );
            env.services.action.dispatch(
                'Thread/fetchAndUpdateSuggestedRecipients',
                chatter.thread(ctx),
            );
        }
        if (chatter.hasMessageList(ctx)) {
            env.services.action.dispatch(
                'Thread/refresh',
                chatter.thread(ctx),
            );
        }
    },
});
