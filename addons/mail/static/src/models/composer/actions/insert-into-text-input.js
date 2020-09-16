/** @odoo-module alias=mail.models.Composer.actions.insertIntoTextInput **/

import action from 'mail.action.define';

/**
 * Inserts text content in text input based on selection.
 */
export default action({
    name: 'Composer/insertIntoTextInput',
    id: 'mail.models.Composer.actions.insertIntoTextInput',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     * @param {string} content
     */
    func(
        { ctx, env },
        composer,
        content,
    ) {
        const partA = composer.textInputContent(ctx).slice(
            0,
            composer.textInputCursorStart(ctx),
        );
        const partB = composer.textInputContent(ctx).slice(
            composer.textInputCursorEnd(ctx),
            composer.textInputContent(ctx).length,
        );
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                isLastStateChangeProgrammatic: true,
                textInputContent: partA + content + partB,
                textInputCursorStart: (
                    composer.textInputCursorStart(ctx) +
                    content.length
                ),
                textInputCursorEnd: (
                    composer.textInputCursorStart(ctx) +
                    content.length
                ),
            },
        );
    },
});
