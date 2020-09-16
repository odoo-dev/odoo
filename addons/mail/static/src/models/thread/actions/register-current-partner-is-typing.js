/** @odoo-module alias=mail.models.Thread.actions.registerCurrentPartnerIsTyping **/

import action from 'mail.action.define';

/**
 * Called when current partner is inserting some input in composer.
 * Useful to notify current partner is currently typing something in the
 * composer of this thread to all other members.
 */
export default action({
    name: 'Thread/registerCurrentPartnerIsTyping',
    id: 'mail.models.Thread.actions.registerCurrentPartnerIsTyping',
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
        // Handling of typing timers.
        thread._currentPartnerInactiveTypingTimer.start();
        thread._currentPartnerLongTypingTimer.start();
        // Manage typing member relation.
        const currentPartner = env.services.model.messaging.currentPartner(ctx);
        const newOrderedTypingMemberLocalIds =
            thread.orderedTypingMemberLocalIds(ctx)
                .filter(localId => localId !== currentPartner.localId);
        newOrderedTypingMemberLocalIds.push(currentPartner.localId);
        env.services.action.dispatch(
            'Record/update',
            thread,
            {
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    currentPartner,
                ),
            },
        );
        // Notify typing status to other members.
        await thread._throttleNotifyCurrentPartnerTypingStatus(
            { isTyping: true },
        );
    },
});
