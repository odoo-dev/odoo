/** @odoo-module alias=mail.models.Thread.fields.allAttachments **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'allAttachments',
    id: 'mail.models.Thread.fields.allAttachments',
    global: true,
    target: 'Attachment',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Attachment[]}
     */
    compute({ ctx, env, record }) {
        const allAttachments =
            [
                ...new Set(
                    record.originThreadAttachments(ctx).concat(
                        record.attachments(ctx),
                    ),
                ),
            ]
            .sort(
                (a1, a2) => {
                    // "uploading" before "uploaded" attachments.
                    if (!a1.isUploading(ctx) && a2.isUploading(ctx)) {
                        return 1;
                    }
                    if (a1.isUploading(ctx) && !a2.isUploading(ctx)) {
                        return -1;
                    }
                    // "most-recent" before "oldest" attachments.
                    return Math.abs(a2.id(ctx)) - Math.abs(a1.id(ctx));
                },
            );
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            allAttachments,
        );
    },
});
