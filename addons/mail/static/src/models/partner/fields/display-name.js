/** @odoo-module alias=mail.models.Partner.fields.displayName **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'displayName',
    id: 'mail.models.Partner.fields.displayName',
    global: true,
    default: "",
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Partner} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, record }) {
        return (
            record.displayName(ctx) ||
            (
                record.user(ctx) &&
                record.user(ctx).displayName(ctx)
            )
        );
    },
});
