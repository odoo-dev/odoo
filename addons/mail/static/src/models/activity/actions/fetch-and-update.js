/** @odoo-module alias=mail.models.Activity.actions.fetchAndUpdate **/

import action from 'mail.action.define';

export default action({
    name: 'Activity/fetchAndUpdate',
    id: 'mail.models.Activity.actions.fetchAndUpdate',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Activity} activity
     * @param {Object} param2
     * @param {Attachment[]} [param2.attachments=[]]
     * @param {string|boolean} [param2.feedback=false]
     */
    async func(
        { ctx, env },
        activity,
        {
            attachments = [],
            feedback = false,
        },
    ) {
        const attachmentIds = attachments.map(
            attachment => attachment.id(ctx),
        );
        await env.services.action.dispatch(
            'Record/doAsync',
            activity,
            () => env.services.rpc({
                model: 'mail.activity',
                method: 'action_feedback',
                args: [[activity.id(ctx)]],
                kwargs: {
                    attachment_ids: attachmentIds,
                    feedback,
                },
            }),
        );
        env.services.action.dispatch(
            'Thread/refresh',
            activity.thread(ctx),
        );
        env.services.action.dispatch(
            'Record/delete',
            activity,
        );
    },
});
