/** @odoo-module alias=mail.models.Attachment.fields.composers **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'composers',
    id: 'mail.models.Attachment.fields.composers',
    global: true,
    target: 'Composer',
    inverse: 'attachments',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Attachment} param0.record
     * @returns {Composer[]}
     */
    compute({ ctx, env, record }) {
        if (record.isUploading(ctx)) {
            return;
        }
        const relatedUploadingAttachment = env.services.action.dispatch(
            'Attachment/find',
            att => (
                att.filename(ctx) === record.filename(ctx) &&
                att.isUploading(ctx)
            ),
        );
        if (relatedUploadingAttachment) {
            const composers = relatedUploadingAttachment.composers(ctx);
            env.services.action.dispatch(
                'Record/delete',
                relatedUploadingAttachment,
            );
            return env.services.action.dispatch(
                'RecordFieldCommand/replace',
                composers,
            );
        }
        return;
    },
});
