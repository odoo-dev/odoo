/** @odoo-module alias=mail.models.Thread.actions._onCurrentPartnerInactiveTypingTimeout **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/_onCurrentPartnerInactiveTypingTimeout',
    id: 'mail.models.Thread.actions._onCurrentPartnerInactiveTypingTimeout',
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
        await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.action.dispatch(
                'Thread/unregisterCurrentPartnerIsTyping',
                thread,
            )
        );
    },
});
