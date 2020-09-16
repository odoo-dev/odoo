/** @odoo-module alias=mail.models.Partner.fields.nameOrDisplayName **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'nameOrDisplayName',
    id: 'mail.models.Partner.fields.nameOrDisplayName',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Partner} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, record }) {
        return (
            record.name(ctx) ||
            record.displayName(ctx)
        );
    },
});
