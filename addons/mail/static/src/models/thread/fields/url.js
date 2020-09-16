/** @odoo-module alias=mail.models.Thread.fields.url **/

import attr from 'mail.model.field.attr.define';

/**
 * URL to access to the conversation.
 */
export default attr({
    name: 'url',
    id: 'mail.models.Thread.fields.url',
    global: true,
    default: '',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {string}
     */
    compute({ ctx, env, record }) {
        const baseHref = env.session.url('/web');
        if (record.model(ctx) === 'mail.channel') {
            return `${
                baseHref
            }#action=mail.action_discuss&active_id=${
                record.model(ctx)
            }_${record.id(ctx)}`;
        }
        return `${
            baseHref
        }#model=${record.model(ctx)}&id=${record.id(ctx)}`;
    },
});
