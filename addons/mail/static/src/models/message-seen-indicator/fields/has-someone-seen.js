/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.hasSomeoneSeen **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasSomeoneSeen',
    id: 'mail.models.MessageSeenIndicator.fields.hasSomeoneSeen',
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
            !record.thread(ctx).partnerSeenInfos(ctx)
        ) {
            return false;
        }
        const otherPartnerSeenInfosSeen =
            record
                .thread(ctx)
                .partnerSeenInfos(ctx)
                .filter(
                    partnerSeenInfo => (
                        (
                            partnerSeenInfo.partner(ctx) !==
                            record.message(ctx).author(ctx)
                        ) &&
                        partnerSeenInfo.lastSeenMessage(ctx) &&
                        (
                            partnerSeenInfo.lastSeenMessage(ctx).id(ctx) >=
                            record.message(ctx).id(ctx)
                        )
                    ),
                );
        return otherPartnerSeenInfosSeen.length > 0;
    },
});
