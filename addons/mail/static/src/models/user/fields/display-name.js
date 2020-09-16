/** @odoo-module alias=mail.models.User.fields.displayName **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'displayName',
    id: 'mail.models.User.fields.displayName',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {User} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, record }) {
        return (
            record.displayName(ctx) ||
            (
                record.partner(ctx) &&
                record.partner(ctx).displayName(ctx)
            )
        );
    },
});
