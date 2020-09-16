/** @odoo-module alias=mail.models.Composer.actions._updateSuggestedChannels **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/_updateSuggestedChannels',
    id: 'mail.models.Composer.actions._updateSuggestedChannels',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     * @param {string} mentionKeyword
     */
    async func(
        { ctx, env },
        composer,
        mentionKeyword,
    ) {
        const mentions = await env.services.action.dispatch(
            'Record/doAsync',
            composer,
            () => env.services.rpc(
                {
                    model: 'mail.channel',
                    method: 'get_mention_suggestions',
                    kwargs: {
                        limit: 8,
                        search: mentionKeyword,
                    },
                },
                { shadow: true },
            ),
        );
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                suggestedChannels: env.services.action.dispatch(
                    'RecordFieldCommand/insertAndReplace',
                    mentions.map(
                        data => {
                            const threadData = env.services.action.dispatch(
                                'Thread/convertData',
                                data,
                            );
                            return {
                                model: 'mail.channel',
                                ...threadData,
                            };
                        },
                    ),
                ),
            },
        );

        if (composer.suggestedChannels(ctx)[0]) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedChannel:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer.suggestedChannels(ctx)[0],
                        ),
                    hasToScrollToActiveSuggestion: true,
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedChannel:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                        ),
                },
            );
        }
    },
});
