/** @odoo-module alias=mail.models.Thread.fields.lastNonTransientMessage **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Last non-transient message.
 */
export default many2one({
    name: 'lastNonTransientMessage',
    id: 'mail.models.Thread.fields.lastNonTransientMessage',
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
        const {
            length: l,
            [l - 1]: lastMessage,
        } = record.orderedNonTransientMessages(ctx);
        if (lastMessage) {
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                lastMessage,
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
        );
    },
});
