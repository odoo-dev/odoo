/** @odoo-module alias=mail.models.Attachment.actions.remove **/

import action from 'mail.action.define';

export default action({
    name: 'Attachment/remove',
    id: 'mail.models.Attachment.actions.remove',
    global: true,
    /**
     * Remove this attachment globally.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Attachment} attachment
     */
    async func(
        { ctx, env },
        attachment,
    ) {
        if (attachment.isUnlinkPending(ctx)) {
            return;
        }
        if (!attachment.isUploading(ctx)) {
            env.services.action.dispatch(
                'Record/update',
                attachment,
                { isUnlinkPending: true },
            );
            try {
                await env.services.action.dispatch(
                    'Record/doAsync',
                    attachment,
                    () => env.services.rpc({
                        model: 'ir.attachment',
                        method: 'unlink',
                        args: [attachment.id(ctx)],
                    }, { shadow: true }),
                );
            } finally {
                env.services.action.dispatch(
                    'Record/update',
                    attachment,
                    { isUnlinkPending: false },
                );
            }
        } else if (attachment.uploadingAbortController(ctx)) {
            attachment.uploadingAbortController(ctx).abort();
        }
        env.services.action.dispatch(
            'Record/delete',
            attachment,
        );
    },
});
