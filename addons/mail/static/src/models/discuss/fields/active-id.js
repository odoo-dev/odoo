/** @odoo-module alias=mail.models.Discuss.fields.activeId **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'activeId',
    id: 'mail.models.Discuss.fields.activeId',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, env, record }) {
        if (!record.thread(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        return env.services.action.dispatch(
            'Discuss/threadToActiveId',
            record,
            record.thread(ctx),
        );
    },
});
