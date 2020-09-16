/** @odoo-module alias=mail.models.Thread.actions.unregisterCurrentPartnerIsTyping **/

import action from 'mail.action.define';

/**
 * Called when current partner has explicitly stopped inserting some
 * input in composer. Useful to notify current partner has currently
 * stopped typing something in the composer of this thread to all other
 * members.
 */
export default action({
    name: 'Thread/unregisterCurrentPartnerIsTyping',
    id: 'mail.models.Thread.actions.unregisterCurrentPartnerIsTyping',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {Object} [param2={}]
     * @param {boolean} [param2.immediateNotify=false] if set, is typing
     *   status of current partner is immediately notified and doesn't
     *   consume throttling at all.
     */
    async func(
        { ctx, env },
        thread,
        { immediateNotify = false } = {},
    ) {
        // Handling of typing timers.
        thread._currentPartnerInactiveTypingTimer.clear();
        thread._currentPartnerLongTypingTimer.clear();
        // Manage typing member relation.
        const currentPartner = env.services.model.messaging.currentPartner(ctx);
        const newOrderedTypingMemberLocalIds =
            thread.orderedTypingMemberLocalIds(ctx)
                .filter(localId => localId !== currentPartner.localId);
        env.services.action.dispatch(
            'Record/update',
            thread,
            {
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                    currentPartner,
                ),
            },
        );
        // Notify typing status to other members.
        if (immediateNotify) {
            thread._throttleNotifyCurrentPartnerTypingStatus.clear();
        }
        await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => thread._throttleNotifyCurrentPartnerTypingStatus(
                { isTyping: false },
            ),
        );
    },
});
