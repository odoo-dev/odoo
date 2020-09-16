/** @odoo-module alias=mail.models.AttachmentViewer.actions.close **/

import action from 'mail.action.define';

export default action({
    name: 'AttachmentViewer/close',
    id: 'mail.models.AttachmentViewer.actions.close',
    global: true,
    /**
     * Close the attachment viewer by closing its linked dialog.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {AttachmentViewer} attachmentViewer
     */
    func(
        { ctx, env },
        attachmentViewer,
    ) {
        const dialog = env.services.action.dispatch(
            'Dialog/find',
            dialog => dialog.record(ctx) === attachmentViewer,
        );
        if (dialog) {
            env.services.action.dispatch(
                'Record/delete',
                dialog,
            );
        }
    },
});
