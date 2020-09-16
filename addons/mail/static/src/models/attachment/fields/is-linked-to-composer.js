/** @odoo-module alias=mail.models.Attachment.fields.isLinkedToComposer **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isLinkedToComposer',
    id: 'mail.models.Attachment.fields.isLinkedToComposer',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Attachment} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return record.composers(ctx).length > 0;
    },
});
