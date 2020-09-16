/** @odoo-module alias=mail.models.ThreadCache.fields.lastMessage **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'lastMessage',
    id: 'mail.models.ThreadCache.fields.lastMessage',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message|undefined}
     */
    compute({ ctx, env, record }) {
        const {
            length: l,
            [l - 1]: lastMessage,
        } = record.orderedMessages(ctx);
        if (!lastMessage) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            lastMessage,
        );
    },
});
