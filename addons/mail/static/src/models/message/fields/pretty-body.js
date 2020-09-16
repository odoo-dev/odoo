/** @odoo-module alias=mail.models.Message.fields.prettyBody **/

import attr from 'mail.model.field.attr.define';

import addLink from 'mail.utils.addLink';
import emojis from 'mail.utils.emojis';
import parseAndTransform from 'mail.utils.parseAndTransform';

/**
 * This value is meant to be based on field body which is
 * returned by the server (and has been sanitized before stored into db).
 * Do not use this value in a 't-raw' if the message has been created
 * directly from user input and not from server data as it's not escaped.
 */
export default attr({
    name: 'prettyBody',
    id: 'mail.models.Message.fields.prettyBody',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Message} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        let prettyBody;
        for (const emoji of emojis) {
            const { unicode } = emoji;
            const regexp = new RegExp(
                `(?:^|\\s|<[a-z]*>)(${unicode})(?=\\s|$|</[a-z]*>)`,
                "g",
            );
            const originalBody = record.body(ctx);
            prettyBody = record.body(ctx).replace(
                regexp,
                ` <span class="o_mail_emoji">${unicode}</span> `,
            );
            // Idiot-proof limit. If the user had the amazing idea of
            // copy-pasting thousands of emojis, the image rendering can lead
            // to memory overflow errors on some browsers (e.g. Chrome). Set an
            // arbitrary limit to 200 from which we simply don't replace them
            // (anyway, they are already replaced by the unicode counterpart).
            if (_.str.count(prettyBody, 'o_mail_emoji') > 200) {
                prettyBody = originalBody;
            }
        }
        // add anchor tags to urls
        return parseAndTransform(prettyBody, addLink);
    },
});
