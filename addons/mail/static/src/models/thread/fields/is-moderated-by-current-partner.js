/** @odoo-module alias=mail.models.Thread.fields.isModeratedByCurrentPartner **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isModeratedByCurrentPartner',
    id: 'mail.models.Thread.fields.isModeratedByCurrentPartner',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {boolean}
     */
    compute({ ctx, env, record }) {
        if (!record.messaging(ctx)) {
            return false;
        }
        if (!record.messaging(ctx).currentPartner(ctx)) {
            return false;
        }
        return record.moderators(ctx).includes(
            env.services.model.messaging.currentPartner(ctx),
        );
    },
});
