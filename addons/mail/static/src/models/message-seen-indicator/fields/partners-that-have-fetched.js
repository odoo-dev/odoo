/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.partnersThatHaveFetched **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'partnersThatHaveFetched',
    id: 'mail.models.MessageSeenIndicator.fields.partnersThatHaveFetched',
    global: true,
    target: 'Partner',
    /**
     * Manually called as not always called when necessary
     * @see MessageSeenIndicator/computeFetchedValues
     * @see MessageSeenIndicator/computeSeenValues
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessageSeenIndicator} param0.record
     * @returns {Partner[]}
     */
    compute({ ctx, env, record }) {
        if (
            !record.message(ctx) ||
            !record.thread(ctx) ||
            !record.thread(ctx).partnerSeenInfos(ctx)
        ) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        const otherPartnersThatHaveFetched = record.thread(ctx).partnerSeenInfos(ctx)
            .filter(
                partnerSeenInfo => (
                    /**
                     * Relation may not be set yet immediately
                     * @see ThreadPartnerSeenInfo:partnerId field
                     * FIXME task-2278551
                     */
                    partnerSeenInfo.partner(ctx) &&
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
            )
            .map(partnerSeenInfo => partnerSeenInfo.partner(ctx));
        if (otherPartnersThatHaveFetched.length === 0) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            otherPartnersThatHaveFetched,
        );
    },
});
