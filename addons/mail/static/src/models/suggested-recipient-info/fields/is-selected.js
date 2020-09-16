/** @odoo-module alias=mail.models.SuggestedRecipientInfo.fields.isSelected **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this` will be added to recipients when posting a
 * new message on `this.thread`.
 */
export default attr({
    name: 'isSelected',
    id: 'mail.models.SuggestedRecipientInfo.fields.isSelected',
    global: true,
    default: true,
    /**
     * Prevents selecting a recipient that does not have a partner.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {SuggestedRecipientInfo} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return record.partner(ctx)
            ? record.isSelected(ctx)
            : false;
    },
});
