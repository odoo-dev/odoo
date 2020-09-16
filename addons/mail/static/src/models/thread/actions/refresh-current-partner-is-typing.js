/** @odoo-module alias=mail.models.Thread.actions.refreshCurrentPartnerIsTyping **/

import action from 'mail.action.define';

/**
 * Refresh the typing status of the current partner.
 */
export default action({
    name: 'Thread/refreshCurrentPartnerIsTyping',
    id: 'mail.models.Thread.actions.refreshCurrentPartnerIsTyping',
    global: true,
    /**
     * @param {Object} _
     * @param {Thread} thread
     */
    func(
        _,
        thread,
    ) {
        thread._currentPartnerInactiveTypingTimer.reset();
    },
});
