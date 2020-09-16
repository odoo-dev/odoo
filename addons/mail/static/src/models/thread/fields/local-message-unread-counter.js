/** @odoo-module alias=mail.models.Thread.fields.localMessageUnreadCounter **/

import attr from 'mail.model.field.attr.define';

/**
 * Local value of message unread counter, that means it is based on initial server value and
 * updated with interface updates.
 */
export default attr({
    name: 'localMessageUnreadCounter',
    id: 'mail.models.Thread.fields.localMessageUnreadCounter',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {integer}
     */
    compute({ ctx, env, record }) {
        if (record.model(ctx) !== 'mail.channel') {
            // unread counter only makes sense on channels
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        // By default trust the server up to the last message it used
        // because it's not possible to do better.
        let baseCounter = record.serverMessageUnreadCounter(ctx);
        let countFromId = record.serverLastMessageId(ctx);
        // But if the client knows the last seen message that the server
        // returned (and by assumption all the messages that come after),
        // the counter can be computed fully locally, ignoring potentially
        // obsolete values from the server.
        const firstMessage = record.orderedMessages(ctx)[0];
        if (
            firstMessage &&
            record.lastSeenByCurrentPartnerMessageId(ctx) &&
            record.lastSeenByCurrentPartnerMessageId(ctx) >= firstMessage.id(ctx)
        ) {
            baseCounter = 0;
            countFromId = record.lastSeenByCurrentPartnerMessageId(ctx);
        }
        // Include all the messages that are known locally but the server
        // didn't take into account.
        return record.orderedMessages(ctx).reduce(
            (total, message) => {
                if (message.id(ctx) <= countFromId) {
                    return total;
                }
                return total + 1;
            },
            baseCounter,
        );
    },
});
