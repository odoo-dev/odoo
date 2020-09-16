/** @odoo-module alias=mail.models.Attachment.fields.displayName **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'displayName',
    id: 'mail.models.Attachment.fields.displayName',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Attachment} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, env, record }) {
        const displayName = (
            record.name(ctx) ||
            record.filename(ctx)
        );
        if (displayName) {
            return displayName;
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/clear',
        );
    },
});
