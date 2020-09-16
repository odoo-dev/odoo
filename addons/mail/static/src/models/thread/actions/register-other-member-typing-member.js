/** @odoo-module alias=mail.models.Thread.actions.registerOtherMemberTypingMember **/

import action from 'mail.action.define';
import Timer from 'mail.utils.Timer';

/**
 * Called to register a new other member partner that is typing
 * something.
 */
export default action({
    name: 'Thread/registerOtherMemberTypingMember',
    id: 'mail.models.Thread.actions.registerOtherMemberTypingMember',
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
        partner
    ) {
        const timer = new Timer(
            env,
            () => env.services.action.dispatch(
                'Record/doAsync',
                thread,
                () => env.services.action.dispatch(
                    'Thread/_onOtherMemberLongTypingTimeout',
                    thread,
                    partner,
                ),
            ),
            60 * 1000,
        );
        thread._otherMembersLongTypingTimers.set(partner, timer);
        timer.start();
        const newOrderedTypingMemberLocalIds = thread.orderedTypingMemberLocalIds(ctx)
            .filter(localId => localId !== partner.localId);
        newOrderedTypingMemberLocalIds.push(partner.localId);
        env.services.action.dispatch(
            'Record/update',
            thread,
            {
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    partner,
                ),
            },
        );
    },
});
