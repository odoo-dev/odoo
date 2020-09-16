/** @odoo-module alias=mail.models.Thread.actions._onOtherMemberLongTypingTimeout **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/_onOtherMemberLongTypingTimeout',
    id: 'mail.models.Thread.actions._onOtherMemberLongTypingTimeout',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {Partner} partner
     */
    async func(
        { ctx, env },
        thread,
        partner,
    ) {
        if (!thread.typingMembers(ctx).includes(partner)) {
            thread._otherMembersLongTypingTimers.delete(partner);
            return;
        }
        env.services.action.dispatch(
            'Thread/unregisterOtherMemberTypingMember',
            thread,
            partner,
        );
    },
});
