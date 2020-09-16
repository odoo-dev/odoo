/** @odoo-module alias=mail.models.Message.fields.isBodyEqualSubtypeDescription **/

import attr from 'mail.model.field.attr.define';
import htmlToTextContentInline from 'mail.utils.htmlToTextContentInline';

/**
 * States whether `body` and `subtype_description` contain similar
 * values.
 *
 * This is necessary to avoid displaying both of them together when they
 * contain duplicate information. This will especially happen with
 * messages that are posted automatically at the creation of a record
 * (messages that serve as tracking messages). They do have hard-coded
 * "record created" body while being assigned a subtype with a
 * description that states the same information.
 *
 * Fixing newer messages is possible by not assigning them a duplicate
 * body content, but the check here is still necessary to handle
 * existing messages.
 *
 * Limitations:
 * - A translated subtype description might not match a non-translatable
 *   body created by a user with a different language.
 * - Their content might be mostly but not exactly the same.
 */
export default attr({
    name: 'isBodyEqualSubtypeDescription',
    id: 'mail.models.Message.fields.isBodyEqualSubtypeDescription',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Message} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (
            !record.body(ctx) ||
            !record.subtypeDescription(ctx)
        ) {
            return false;
        }
        const inlineBody = htmlToTextContentInline(record.body(ctx));
        return (
            inlineBody.toLowerCase() ===
            record.subtypeDescription(ctx).toLowerCase()
        );
    },
});
