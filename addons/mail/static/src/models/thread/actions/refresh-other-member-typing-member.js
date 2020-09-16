/** @odoo-module alias=mail.models.Thread.actions.refreshOtherMemberTypingMember **/

import action from 'mail.action.define';

/**
 * Called to refresh a registered other member partner that is typing
 * something.
 */
export default action({
    name: 'Thread/refreshOtherMemberTypingMember',
    id: 'mail.models.Thread.actions.refreshOtherMemberTypingMember',
    global: true,
    /**
     * @param {Object} _
     * @param {Thread} thread
     * @param {Partner} partner
     */
    func(
        _,
        thread,
        partner,
    ) {
        thread._otherMembersLongTypingTimers.get(partner).reset();
    },
});
