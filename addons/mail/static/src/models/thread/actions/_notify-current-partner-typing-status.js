/** @odoo-module alias=mail.models.Thread.actions._notifyCurrentPartnerTypingStatus **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/_notifyCurrentPartnerTypingStatus',
    id: 'mail.models.Thread.actions._notifyCurrentPartnerTypingStatus',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {Object} param2
     * @param {boolean} param2.isTyping
     */
    async func(
        { ctx, env },
        thread,
        { isTyping },
    ) {
        if (
            thread._forceNotifyNextCurrentPartnerTypingStatus ||
            isTyping !== thread._currentPartnerLastNotifiedIsTyping
        ) {
            if (thread.model(ctx) === 'mail.channel') {
                await env.services.action.dispatch(
                    'Record/doAsync',
                    thread,
                    () => env.services.rpc({
                        model: 'mail.channel',
                        method: 'notify_typing',
                        args: [thread.id(ctx)],
                        kwargs: { is_typing: isTyping },
                    }, { shadow: true }),
                );
            }
            if (isTyping && thread._currentPartnerLongTypingTimer.isRunning) {
                thread._currentPartnerLongTypingTimer.reset();
            }
        }
        thread._forceNotifyNextCurrentPartnerTypingStatus = false;
        thread._currentPartnerLastNotifiedIsTyping = isTyping;
    },
});
