/** @odoo-module alias=mail.models.Thread.fields.messageAfterNewMessageSeparator **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines the message before which the "new message" separator must
 * be positioned, if any.
 */
export default many2one({
    name: 'messageAfterNewMessageSeparator',
    id: 'mail.models.Thread.fields.messageAfterNewMessageSeparator',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Message|undefined}
     */
    compute({ ctx, env, record }) {
        if (record.model(ctx) !== 'mail.channel') {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        if (record.localMessageUnreadCounter(ctx) === 0) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        const index = record.orderedMessages(ctx).findIndex(
            message => (
                message.id(ctx) ===
                record.lastSeenByCurrentPartnerMessageId(ctx)
            ),
        );
        if (index === -1) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        const message = record.orderedMessages(ctx)[index + 1];
        if (!message) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            message,
        );
    },
});
