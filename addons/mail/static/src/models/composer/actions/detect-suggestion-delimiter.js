/** @odoo-module alias=mail.models.Composer.actions.detectSuggestionDelimiter **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/detectSuggestionDelimiter',
    id: 'mail.models.Composer.actions.detectSuggestionDelimiter',
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
        if (
            composer.textInputCursorStart(ctx) !==
            composer.textInputCursorEnd(ctx)
        ) {
            return;
        }
        const lastInputChar = composer.textInputContent(ctx).substring(
            composer.textInputCursorStart(ctx) - 1,
            composer.textInputCursorStart(ctx)
        );
        const suggestionDelimiters = ['@', ':', '#', '/'];
        if (
            suggestionDelimiters.includes(lastInputChar) &&
            !composer.hasSuggestions(ctx)
        ) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                { suggestionDelimiter: lastInputChar },
            );
        }
        const mentionKeyword = env.services.action.dispatch(
            'Composer/_validateMentionKeyword',
            composer,
            false,
        );
        if (mentionKeyword !== false) {
            switch (composer.suggestionDelimiter(ctx)) {
                case '@':
                    env.services.action.dispatch(
                        'Record/update',
                        composer,
                        {
                            activeSuggestedRecordName: 'activeSuggestedPartner',
                            extraSuggestedRecordsListName: 'extraSuggestedPartners',
                            mainSuggestedRecordsListName: 'mainSuggestedPartners',
                            suggestionModelName: 'Partner',
                        },
                    );
                    env.services.action.dispatch(
                        'Composer/_executeOrQueueFunction',
                        composer,
                        () => env.services.action.dispatch(
                            'Composer/_updateSuggestedPartners',
                            composer,
                            mentionKeyword,
                        ),
                    );
                    break;
                case ':':
                    env.services.action.dispatch(
                        'Record/update',
                        composer,
                        {
                            activeSuggestedRecordName: 'activeSuggestedCannedResponse',
                            mainSuggestedRecordsListName: 'suggestedCannedResponses',
                            suggestionModelName: 'CannedResponse',
                        },
                    );
                    env.services.action.dispatch(
                        'Composer/_executeOrQueueFunction',
                        composer,
                        () => env.services.action.dispatch(
                            'Composer/_updateSuggestedCannedResponses',
                            composer,
                            mentionKeyword,
                        ),
                    );
                    break;
                case '/':
                    env.services.action.dispatch(
                        'Record/update',
                        composer,
                        {
                            activeSuggestedRecordName: 'activeSuggestedChannelCommand',
                            mainSuggestedRecordsListName: 'suggestedChannelCommands',
                            suggestionModelName: 'ChannelCommand',
                        },
                    );
                    env.services.action.dispatch(
                        'Composer/_executeOrQueueFunction',
                        composer,
                        () => env.services.action.dispatch(
                            'Composer/_updateSuggestedChannelCommands',
                            composer,
                            mentionKeyword,
                        ),
                    );
                    break;
                case '#':
                    env.services.action.dispatch(
                        'Record/update',
                        composer,
                        {
                            activeSuggestedRecordName: 'activeSuggestedChannel',
                            mainSuggestedRecordsListName: 'suggestedChannels',
                            suggestionModelName: 'Thread',
                        },
                    );
                    env.services.action.dispatch(
                        'Composer/_executeOrQueueFunction',
                        composer,
                        () => env.services.action.dispatch(
                            'Composer/_updateSuggestedChannels',
                            composer,
                            mentionKeyword,
                        ),
                    );
                    break;
            }
        } else {
            env.services.action.dispatch(
                'Composer/closeSuggestions',
                composer,
            );
        }
    },
});
