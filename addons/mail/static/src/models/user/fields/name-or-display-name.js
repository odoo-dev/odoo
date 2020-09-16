/** @odoo-module alias=mail.models.User.fields.nameOrDisplayName **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'nameOrDisplayName',
    id: 'mail.models.User.fields.nameOrDisplayName',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {User} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, record }) {
        return (
            (
                record.partner(ctx) &&
                record.partner(ctx).nameOrDisplayName(ctx)
            ) ||
            record.displayName(ctx)
        );
    },
});
