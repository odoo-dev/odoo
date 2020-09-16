/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.isMessagePreviousToLastCurrentPartnerMessageSeenByEveryone **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isMessagePreviousToLastCurrentPartnerMessageSeenByEveryone',
    id: 'mail.models.MessageSeenIndicator.fields.isMessagePreviousToLastCurrentPartnerMessageSeenByEveryone',
    global: true,
    default: false,
    /**
     * Manually called as not always called when necessary
     * @see MessageSeenIndicator/computeSeenValues
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {MessageSeenIndicator} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (
            !record.message(ctx) ||
            !record.thread(ctx) ||
            !record.thread(ctx).lastCurrentPartnerMessageSeenByEveryone(ctx)
        ) {
            return false;
        }
        return (
            record.message(ctx).id(ctx) <
            record.thread(ctx).lastCurrentPartnerMessageSeenByEveryone(ctx).id(ctx)
        );
    },
});
