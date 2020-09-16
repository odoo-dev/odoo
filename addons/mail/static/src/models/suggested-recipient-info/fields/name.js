/** @odoo-module alias=mail.models.SuggestedRecipientInfo.fields.name **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines the name of `this`. It serves as visual clue when
 * displaying `this`, and also serves as default partner name when
 * creating a new partner from `this`.
 */
export default attr({
    name: 'name',
    id: 'mail.models.SuggestedRecipientInfo.fields.name',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {SuggestedRecipientInfo} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        return (
            (
                record.partner(ctx) &&
                record.partner(ctx).nameOrDisplayName(ctx)
            ) ||
            record.name(ctx)
        );
    },
});
