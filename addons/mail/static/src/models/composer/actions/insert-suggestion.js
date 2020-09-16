/** @odoo-module alias=mail.models.Composer.actions.insertSuggestion **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/insertSuggestion',
    id: 'mail.models.Composer.actions.insertSuggestion',
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
        const cursorPosition = composer.textInputCursorStart(ctx);
        let textLeft = composer.textInputContent(ctx).substring(
            0,
            composer.textInputContent(ctx).substring(0, cursorPosition).lastIndexOf(
                composer.suggestionDelimiter(ctx),
            ) + 1,
        );
        let textRight = composer.textInputContent(ctx).substring(
            cursorPosition,
            composer.textInputContent(ctx).length,
        );
        if (composer.suggestionDelimiter(ctx) === ':') {
            textLeft = composer.textInputContent(ctx).substring(
                0,
                composer.textInputContent(ctx).substring(0, cursorPosition).lastIndexOf(
                    composer.suggestionDelimiter(ctx),
                ),
            );
            textRight = composer.textInputContent(ctx).substring(
                cursorPosition,
                composer.textInputContent(ctx).length,
            );
        }
        let recordReplacement = "";
        switch (composer.activeSuggestedRecordName(ctx)) {
            case 'activeSuggestedCannedResponse':
                recordReplacement = composer[
                    composer.activeSuggestedRecordName(ctx)
                ](ctx).substitution(ctx);
                break;
            case 'activeSuggestedChannel':
                recordReplacement = composer[
                    composer.activeSuggestedRecordName(ctx)
                ](ctx).name(ctx);
                env.services.action.dispatch(
                    'Record/update',
                    composer,
                    {
                        mentionedChannels:
                            env.services.action.dispatch(
                                'RecordFieldCommand/link',
                                composer[composer.activeSuggestedRecordName(ctx)](ctx),
                            ),
                    },
                );
                break;
            case 'activeSuggestedChannelCommand':
                recordReplacement = composer[
                    composer.activeSuggestedRecordName(ctx)
                ](ctx).name(ctx);
                break;
            case 'activeSuggestedPartner':
                recordReplacement = composer[
                    composer.activeSuggestedRecordName(ctx)
                ](ctx).name(ctx);
                env.services.action.dispatch(
                    'Record/update',
                    composer,
                    {
                        mentionedPartners:
                            env.services.action.dispatch(
                                'RecordFieldCommand/link',
                                composer[composer.activeSuggestedRecordName(ctx)](ctx),
                            ),
                    },
                );
                break;
        }
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                isLastStateChangeProgrammatic: true,
                textInputContent: textLeft + recordReplacement + ' ' + textRight,
                textInputCursorEnd: textLeft.length + recordReplacement.length + 1,
                textInputCursorStart: textLeft.length + recordReplacement.length + 1,
            },
        );
    },
});
