/** @odoo-module alias=mail.models.SuggestedRecipientInfo.fields.email **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines the email of `this`. It serves as visual clue when
 * displaying `this`, and also serves as default partner email when
 * creating a new partner from `this`.
 */
export default attr({
    name: 'email',
    id: 'mail.models.SuggestedRecipientInfo.fields.email',
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
                record.partner(ctx).email(ctx)
            ) ||
            record.email(ctx)
        );
    },
});
