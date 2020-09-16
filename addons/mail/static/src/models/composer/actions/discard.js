/** @odoo-module alias=mail.models.Composer.actions.discard **/

import action from 'mail.action.define';

/**
 * Hides the composer, which only makes sense if the composer is
 * currently used as a Discuss Inbox reply composer.
 */
export default action({
    name: 'Composer/discard',
    id: 'mail.models.Composer.actions.discard',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     */
    func(
        { ctx, env },
        composer,
    ) {
        if (composer.discussAsReplying(ctx)) {
            env.services.action.dispatch(
                'Discuss/clearReplyingToMessage',
                composer.discussAsReplying(ctx),
            );
        }
    },
});
