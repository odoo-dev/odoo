/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.hasSomeoneFetched **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasSomeoneFetched',
    id: 'mail.models.MessageSeenIndicator.fields.hasSomeoneFetched',
    global: true,
    default: false,
    /**
     * Manually called as not always called when necessary
     * @see MessageSeenIndicator/computeFetchedValues
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
        const otherPartnerSeenInfosFetched =
            record
                .thread(ctx)
                .partnerSeenInfos(ctx)
                .filter(
                    partnerSeenInfo => (
                            (
                                partnerSeenInfo.partner(ctx) !==
                                record.message(ctx).author(ctx)
                            ) &&
                            partnerSeenInfo.lastFetchedMessage(ctx) &&
                            (
                                partnerSeenInfo.lastFetchedMessage(ctx).id(ctx) >=
                                record.message(ctx).id(ctx)
                            )
                        ),
                );
        return otherPartnerSeenInfosFetched.length > 0;
    },
});
