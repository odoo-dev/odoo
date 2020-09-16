/** @odoo-module alias=mail.models.Thread.actions.unregisterOtherMemberTypingMember **/

import action from 'mail.action.define';

/**
 * Called to unregister an other member partner that is no longer typing
 * something.
 */
export default action({
    name: 'Thread/unregisterOtherMemberTypingMember',
    id: 'mail.models.Thread.actions.unregisterOtherMemberTypingMember',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {Partner} partner
     */
    func(
        { ctx, env },
        thread,
        partner,
    ) {
        thread._otherMembersLongTypingTimers.get(partner).clear();
        thread._otherMembersLongTypingTimers.delete(partner);
        const newOrderedTypingMemberLocalIds =
            thread.orderedTypingMemberLocalIds(ctx)
                .filter(localId => localId !== partner.localId);
        env.services.action.dispatch(
            'Record/update',
            thread,
            {
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                    partner,
                ),
            },
        );
    },
});
