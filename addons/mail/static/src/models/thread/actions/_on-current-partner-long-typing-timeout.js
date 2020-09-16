/** @odoo-module alias=mail.models.Thread.actions._onCurrentPartnerLongTypingTimeout **/

import action from 'mail.action.define';

/**
 * Called when current partner has been typing for a very long time.
 * Immediately notify other members that he/she is still typing.
 */
export default action({
    name: 'Thread/_onCurrentPartnerLongTypingTimeout',
    id: 'mail.models.Thread.actions._onCurrentPartnerLongTypingTimeout',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    async func(
        { env },
        thread,
    ) {
        thread._forceNotifyNextCurrentPartnerTypingStatus = true;
        thread._throttleNotifyCurrentPartnerTypingStatus.clear();
        await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => thread._throttleNotifyCurrentPartnerTypingStatus(
                { isTyping: true },
            ),
        );
    },
});
