/** @odoo-module alias=mail.models.Attachment.fields.extension **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'extension',
    id: 'mail.models.Attachment.fields.extension',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Attachment} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, env, record }) {
        const extension = (
            record.filename(ctx) &&
            record.filename(ctx).split('.').pop()
        );
        if (extension) {
            return extension;
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/clear',
        );
    },
});
