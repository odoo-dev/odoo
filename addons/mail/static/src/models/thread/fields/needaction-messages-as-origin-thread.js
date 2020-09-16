/** @odoo-module alias=mail.models.Thread.fields.needactionMessagesAsOriginThread **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'needactionMessagesAsOriginThread',
    id: 'mail.models.Thread.fields.needactionMessagesAsOriginThread',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Message[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.messagesAsOriginThread(ctx).filter(
                message => message.isNeedaction(ctx),
            ),
        );
    },
});
