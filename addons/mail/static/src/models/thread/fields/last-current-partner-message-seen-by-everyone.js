/** @odoo-module alias=mail.models.Thread.fields.lastCurrentPartnerMessageSeenByEveryone **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'lastCurrentPartnerMessageSeenByEveryone',
    id: 'mail.models.Thread.fields.lastCurrentPartnerMessageSeenByEveryone',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Message}
     */
    compute({ ctx, env, record }) {
        if (!record.messaging(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        if (!record.messaging(ctx).currentPartner(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        const otherPartnerSeenInfos =
            record.partnerSeenInfos(ctx).filter(
                partnerSeenInfo => (
                    partnerSeenInfo.partner(ctx) !==
                    record.messaging(ctx).currentPartner(ctx)
                ),
            );
        if (otherPartnerSeenInfos.length === 0) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        const otherPartnersLastSeenMessageIds =
            otherPartnerSeenInfos.map(
                partnerSeenInfo => (
                    partnerSeenInfo.lastSeenMessage(ctx)
                    ? partnerSeenInfo.lastSeenMessage(ctx).id(ctx)
                    : 0
                ),
            );
        if (otherPartnersLastSeenMessageIds.length === 0) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        const lastMessageSeenByAllId = Math.min(
            ...otherPartnersLastSeenMessageIds,
        );
        const currentPartnerOrderedSeenMessages =
            record.orderedNonTransientMessages(ctx).filter(
                message => (
                    (
                        message.author(ctx) ===
                        record.messaging(ctx).currentPartner(ctx)
                    ) &&
                    message.id(ctx) <= lastMessageSeenByAllId
                ),
            );
        if (
            !currentPartnerOrderedSeenMessages ||
            currentPartnerOrderedSeenMessages.length === 0
        ) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            currentPartnerOrderedSeenMessages.slice().pop(),
        );
    },
});
