/** @odoo-module alias=mail.models.Activity.fields.isCurrentPartnerAssignee **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isCurrentPartnerAssignee',
    id: 'mail.models.Activity.fields.isCurrentPartnerAssignee',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Activity} param0.record
     * @returns {boolean}
     */
     compute({ ctx, record }) {
        if (!record.assignee(ctx)) {
            return false;
        }
        if (!record.messaging(ctx)) {
            return false;
        }
        if (!record.messaging(ctx).currentPartner(ctx)) {
            return false;
        }
        if (!record.assignee(ctx).partner(ctx)) {
            return false;
        }
        return (
            record.assignee(ctx).partner(ctx) ===
            record.messaging(ctx).currentPartner(ctx)
        );
    },
});
