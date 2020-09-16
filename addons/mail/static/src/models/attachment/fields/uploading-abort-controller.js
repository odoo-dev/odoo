/** @odoo-module alias=mail.models.Attachment.fields.uploadingAbortController **/

import attr from 'mail.model.field.attr.define';

/**
 * Abort Controller linked to the uploading process of this attachment.
 * Useful in order to cancel the in-progress uploading of this attachment.
 */
export default attr({
    name: 'uploadingAbortController',
    id: 'mail.models.Attachment.fields.uploadingAbortController',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Attachment} param0.record
     * @returns {AbortController|undefined}
     */
     compute({ ctx, env, record }) {
        if (record.isUploading(ctx)) {
            if (!record.uploadingAbortController(ctx)) {
                const abortController = new window.AbortController();
                abortController.signal.onabort = () => {
                    env.services.model.messagingBus.trigger(
                        'o-attachment-upload-abort',
                        { record },
                    );
                };
                return abortController;
            }
            return record.uploadingAbortController(ctx);
        }
        return undefined;
    },
});
