/** @odoo-module alias=mail.models.Composer.actions.focus **/

import action from 'mail.action.define';

/**
 * Focus this composer and remove focus from all others.
 * Focus is a global concern, it makes no sense to have multiple composers focused at the
 * same time.
 */
export default action({
    name: 'Composer/focus',
    id: 'mail.models.Composer.actions.focus',
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
        const allComposers = env.services.action.dispatch(
            'Composer/all',
        );
        for (const otherComposer of allComposers) {
            if (
                otherComposer !== composer &&
                otherComposer.hasFocus(ctx)
            ) {
                env.services.action.dispatch(
                    'Record/update',
                    otherComposer,
                    { hasFocus: false },
                );
            }
        }
        env.services.action.dispatch(
            'Record/update',
            composer,
            { hasFocus: true },
        );
    },
});
