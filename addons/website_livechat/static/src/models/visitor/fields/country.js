/** @odoo-module alias=website_livechat.models.Visitor.fields.country **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Country of the visitor.
 */
export default many2one({
    name: 'country',
    id: 'website_livechat.models.Visitor.fields.country',
    global: true,
    target: 'Country',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Visitor} param0.record
     * @returns {Country}
     */
    compute({ ctx, env, record }) {
        if (
            record.partner(ctx) &&
            record.partner(ctx).country(ctx)
        ) {
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                record.partner(ctx).country(ctx),
            );
        }
        if (record.country(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                record.country(ctx),
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
        );
    },
});
