/** @odoo-module alias=mail.models.MailTemplate.actions.send **/

import action from 'mail.action.define';

export default action({
    name: 'MailTemplate/send',
    id: 'mail.models.MailTemplate.actions.send',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MailTemplate} mailTemplate
     * @param {Activity} activity
     */
    async func(
        { ctx, env },
        mailTemplate,
        activity,
    ) {
        await env.services.action.dispatch(
            'Record/doAsync',
            mailTemplate,
            () => env.services.rpc({
                model: activity.thread(ctx).model(ctx),
                method: 'activity_send_mail',
                args: [
                    [activity.thread(ctx).id(ctx)],
                    mailTemplate.id(ctx)
                ],
            }),
        );
        env.services.action.dispatch(
            'Thread/refresh',
            activity.thread(ctx),
        );
    },
});
