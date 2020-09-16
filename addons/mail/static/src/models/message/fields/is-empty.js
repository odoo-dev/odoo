/** @odoo-module alias=mail.models.Message.fields.isEmpty **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the message has to be considered empty or not.
 *
 * An empty message has no text, no attachment and no tracking value.
 */
export default attr({
    name: 'isEmpty',
    id: 'mail.models.Message.fields.isEmpty',
    global: true,
    /**
     * The method does not attempt to cover all possible cases of empty
     * messages, but mostly those that happen with a standard flow. Indeed
     * it is preferable to be defensive and show an empty message sometimes
     * instead of hiding a non-empty message.
     *
     * The main use case for when a message should become empty is for a
     * message posted with only an attachment (no body) and then the
     * attachment is deleted.
     *
     * The main use case for being defensive with the check is when
     * receiving a message that has no textual content but has other
     * meaningful HTML tags (eg. just an <img/>).
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Message} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        const isBodyEmpty = (
            !record.body(ctx) ||
            [
                '',
                '<p></p>',
                '<p><br></p>',
                '<p><br/></p>',
            ].includes(record.body(ctx).replace(/\s/g, ''))
        );
        return (
            isBodyEmpty &&
            record.attachments(ctx).length === 0 &&
            record.trackingValues(ctx).length === 0 &&
            !record.subtypeDescription(ctx)
        );
    },
});
