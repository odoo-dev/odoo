/** @odoo-module alias=mail.models.Thread.fields.lastSeenByCurrentPartnerMessageId **/

import attr from 'mail.model.field.attr.define';

/**
 * Last seen message id of the channel by current partner.
 *
 * If there is a pending seen message id change, it is immediately applied
 * on the interface to avoid a feeling of unresponsiveness. Otherwise the
 * last known message id of the server is used.
 *
 * Also, it needs to be kept as an id because it's considered like a "date" and could stay
 * even if corresponding message is deleted. It is basically used to know which
 * messages are before or after it.
 */
export default attr({
    name: 'lastSeenByCurrentPartnerMessageId',
    id: 'mail.models.Thread.fields.lastSeenByCurrentPartnerMessageId',
    global: true,
    default: 0,
    /**
     * Adjusts the last seen message received from the server to consider
     * the following messages also as read if they are either transient
     * messages or messages from the current partner.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {integer}
     */
    compute({ ctx, env, record }) {
        const firstMessage = record.orderedMessages(ctx)[0];
        if (
            firstMessage &&
            record.lastSeenByCurrentPartnerMessageId(ctx) &&
            record.lastSeenByCurrentPartnerMessageId(ctx) < firstMessage.id(ctx)
        ) {
            // no deduction can be made if there is a gap
            return record.lastSeenByCurrentPartnerMessageId(ctx);
        }
        let lastSeenByCurrentPartnerMessageId = record.lastSeenByCurrentPartnerMessageId(ctx);
        for (const message of record.orderedMessages(ctx)) {
            if (message.id(ctx) <= record.lastSeenByCurrentPartnerMessageId(ctx)) {
                continue;
            }
            if (
                message.author(ctx) === env.services.model.messaging.currentPartner(ctx) ||
                message.isTransient(ctx)
            ) {
                lastSeenByCurrentPartnerMessageId = message.id(ctx);
                continue;
            }
            return lastSeenByCurrentPartnerMessageId;
        }
        return lastSeenByCurrentPartnerMessageId;
    },
});
