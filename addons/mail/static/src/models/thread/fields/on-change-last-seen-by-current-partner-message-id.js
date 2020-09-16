/** @odoo-module alias=mail.models.Thread.fields.onChangeLastSeenByCurrentPartnerMessageId **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'onChangeLastSeenByCurrentPartnerMessageId',
    id: 'mail.models.Thread.fields.onChangeLastSeenByCurrentPartnerMessageId',
    global: true,
    dependencies: [
        'lastSeenByCurrentPartnerMessageId',
    ],
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     */
    compute({ env, record }) {
        env.services.model.messagingBus.trigger(
            'o-thread-last-seen-by-current-partner-message-id-changed',
            { thread: record },
        );
    },
});
