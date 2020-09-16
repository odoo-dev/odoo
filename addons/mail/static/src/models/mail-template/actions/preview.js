/** @odoo-module alias=mail.models.MailTemplate.actions.preview **/

import action from 'mail.action.define';

export default action({
    name: 'MailTemplate/preview',
    id: 'mail.models.MailTemplate.actions.preview',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MailTemplate} mailTemplate
     * @param {Activity} activity
     */
    func(
        { ctx, env },
        mailTemplate,
        activity,
    ) {
        const action = {
            name: env._t("Compose Email"),
            type: 'ir.actions.act_window',
            res_model: 'mail.compose.message',
            views: [[false, 'form']],
            target: 'new',
            context: {
                default_model: activity.thread(ctx).model(ctx),
                default_res_id: activity.thread(ctx).id(ctx),
                default_template_id: mailTemplate.id(ctx),
                default_use_template: true,
                force_email: true,
            },
        };
        env.bus.trigger('do-action', {
            action,
            options: {
                on_close: () => env.services.action.dispatch(
                    'Thread/refresh',
                    activity.thread(ctx),
                ),
            },
        });
    },
});
