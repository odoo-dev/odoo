/** @odoo-module alias=mail.models.Country.fields.flagUrl **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'flagUrl',
    id: 'mail.models.Country.fields.flagUrl',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Country} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, env, record }) {
        if (!record.code(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        return `/base/static/img/country_flags/${
            record.code(ctx)
        }.png`;
    },
});
