/** @odoo-module alias=mail.models.Discuss.fields.isReplyingToMessage **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isReplyingToMessage',
    id: 'mail.models.Discuss.fields.isReplyingToMessage',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Discuss} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return !!record.replyingToMessage(ctx);
    },
});
