/** @odoo-module alias=mail.models.Composer.actions.handleCurrentPartnerIsTyping **/

import action from 'mail.action.define';

/**
 * Called when current partner is inserting some input in composer.
 * Useful to notify current partner is currently typing something in the
 * composer of this thread to all other members.
 */
export default action({
    name: 'Composer/handleCurrentPartnerIsTyping',
    id: 'mail.models.Composer.actions.handleCurrentPartnerIsTyping',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     */
    func(
        { ctx, env },
        composer,
    ) {
        if (!composer.thread(ctx)) {
            return;
        }
        if (
            composer.thread(ctx).typingMembers(ctx).includes(
                env.services.model.messaging.currentPartner(ctx),
            )
        ) {
            env.services.action.dispatch(
                'Thread/refreshCurrentPartnerIsTyping',
                composer.thread(ctx),
            );
        } else {
            env.services.action.dispatch(
                'Thread/registerCurrentPartnerIsTyping',
                composer.thread(ctx),
            );
        }
    },
});
