/** @odoo-module alias=mail.models.Composer.actions.openFullComposer **/

import action from 'mail.action.define';
import escapeAndCompactTextContent from 'mail.utils.escapeAndCompactTextContent';

/**
 * Open the full composer modal.
 */
export default action({
    name: 'Composer/openFullComposer',
    id: 'mail.models.Composer.actions.openFullComposer',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     */
    async func(
        { ctx, env },
        composer,
    ) {
        const attachmentIds = composer.attachments(ctx).map(
            attachment => attachment.id(ctx),
        );
        const context = {
            default_attachment_ids: attachmentIds,
            default_body: escapeAndCompactTextContent(composer.textInputContent(ctx)),
            default_is_log: composer.isLog(ctx),
            default_model: composer.thread(ctx).model(ctx),
            default_partner_ids: composer.recipients(ctx).map(
                partner => partner.id(ctx),
            ),
            default_res_id: composer.thread(ctx).id(ctx),
            mail_post_autofollow: true,
        };
        const action = {
            type: 'ir.actions.act_window',
            res_model: 'mail.compose.message',
            view_mode: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: context,
        };
        const options = {
            on_close: () => {
                if (
                    !env.services.action.dispatch(
                        'Record/exists',
                        composer.localId,
                    )
                ) {
                    return;
                }
                env.services.action.dispatch(
                    'Composer/_reset',
                    composer,
                );
                env.services.action.dispatch(
                    'Thread/loadNewMessages',
                    composer.thread(ctx),
                );
            },
        };
        await env.bus.trigger(
            'do-action',
            { action, options },
        );
    },
});
