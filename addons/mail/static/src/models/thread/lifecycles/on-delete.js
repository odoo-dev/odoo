/** @odoo-module alias=mail.models.Thread.lifecycles.onDelete **/

import lifecycle from 'mail.model.lifecycle.define';

export default lifecycle({
    name: 'onDelete',
    id: 'mail.models.Thread.lifecycles.onDelete',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     */
    func({ env, record }) {
        record._currentPartnerInactiveTypingTimer.clear();
        record._currentPartnerLongTypingTimer.clear();
        record._throttleNotifyCurrentPartnerTypingStatus.clear();
        for (const timer of record._otherMembersLongTypingTimers.values()) {
            timer.clear();
        }
        if (record.isTemporary()) {
            for (const message of record.messages()) {
                env.services.action.dispatch(
                    'Record/delete',
                    message,
                );
            }
        }
    },
});
