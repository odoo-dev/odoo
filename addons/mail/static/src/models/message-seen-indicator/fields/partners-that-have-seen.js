/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.partnersThatHaveSeen **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'partnersThatHaveSeen',
    id: 'mail.models.MessageSeenIndicator.fields.partnersThatHaveSeen',
    global: true,
    target: 'Partner',
    /**
     * Manually called as not always called when necessary
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
        const otherPartnersThatHaveSeen = record.thread(ctx).partnerSeenInfos(ctx)
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
                    partnerSeenInfo.lastSeenMessage(ctx) &&
                    (
                        partnerSeenInfo.lastSeenMessage(ctx).id(ctx) >=
                        record.message(ctx).id(ctx)
                    )
                ),
            )
            .map(partnerSeenInfo => partnerSeenInfo.partner(ctx));
        if (otherPartnersThatHaveSeen.length === 0) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            otherPartnersThatHaveSeen,
        );
    },
});
