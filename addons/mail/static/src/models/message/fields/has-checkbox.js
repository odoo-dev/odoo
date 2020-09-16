/** @odoo-module alias=mail.models.Message.fields.hasCheckbox **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasCheckbox',
    id: 'mail.models.Message.fields.hasCheckbox',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Message} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return record.isModeratedByCurrentPartner(ctx);
    },
});
