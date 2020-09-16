/** @odoo-module alias=mail.models.Partner.fields.avatarUrl **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'avatarUrl',
    id: 'mail.models.Partner.fields.avatarUrl',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Partner} param0.record
     * @returns {string}
     */
    compute({ ctx, env, record }) {
        if (record === env.services.model.messaging.partnerRoot(ctx)) {
            return '/mail/static/src/img/odoobot.png';
        }
        return `/web/image/res.partner/${record.id(ctx)}/image_128`;
    },
});
