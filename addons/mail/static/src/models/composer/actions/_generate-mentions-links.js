/** @odoo-module alias=mail.models.Composer.actions._generateMentionsLinks **/

import action from 'mail.action.define';

/**
 * Generates the html link related to the mentioned partner
 */
export default action({
    name: 'Composer/_generateMentionsLinks',
    id: 'mail.models.Composer.actions._generateMentionsLinks',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     * @param {string} body
     * @returns {string}
     */
    func(
        { ctx, env },
        composer,
        body,
    ) {
        // List of mention data to insert in the body.
        // Useful to do the final replace after parsing to avoid using the
        // same tag twice if two different mentions have the same name.
        const mentions = [];
        for (const partner of composer.mentionedPartners(ctx)) {
            const placeholder = `@-mention-partner-${partner.id(ctx)}`;
            const text = `@${owl.utils.escape(partner.name(ctx))}`;
            mentions.push({
                class: 'o_mail_redirect',
                id: partner.id(ctx),
                model: 'res.partner',
                placeholder,
                text,
            });
            body = body.replace(text, placeholder);
        }
        for (const channel of composer.mentionedChannels(ctx)) {
            const placeholder = `#-mention-channel-${channel.id(ctx)}`;
            const text = `#${owl.utils.escape(channel.name(ctx))}`;
            mentions.push({
                class: 'o_channel_redirect',
                id: channel.id(ctx),
                model: 'mail.channel',
                placeholder,
                text,
            });
            body = body.replace(text, placeholder);
        }
        const baseHREF = env.session.url('/web');
        for (const mention of mentions) {
            const href = `href='${baseHREF}#model=${mention.model}&id=${mention.id}'`;
            const attClass = `class='${mention.class}'`;
            const dataOeId = `data-oe-id='${mention.id}'`;
            const dataOeModel = `data-oe-model='${mention.model}'`;
            const target = `target='_blank'`;
            const link = `<a ${href} ${attClass} ${dataOeId} ${dataOeModel} ${target}>${mention.text}</a>`;
            body = body.replace(mention.placeholder, link);
        }
        return body;
    },
});
