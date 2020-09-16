/** @odoo-module alias=mail.models.Composer.actions._updateSuggestedCannedResponses **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/_updateSuggestedCannedResponses',
    id: 'mail.models.Composer.actions._updateSuggestedCannedResponses',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     * @param {string} mentionKeyword
     */
    func(
        { ctx, env },
        composer,
        mentionKeyword,
    ) {
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                suggestedCannedResponses:
                    env.services.action.dispatch(
                        'RecordFieldCommand/replace',
                        env.services.model.messaging.cannedResponses(ctx).filter(
                            cannedResponse => (
                                cannedResponse.source(ctx) &&
                                cannedResponse.source(ctx).includes(mentionKeyword)
                            ),
                        ),
                    ),
            },
        );
        if (composer.suggestedCannedResponses(ctx)[0]) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedCannedResponse:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer.suggestedCannedResponses(ctx)[0],
                        ),
                    hasToScrollToActiveSuggestion: true,
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedCannedResponse:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                        ),
                },
            );
        }
    },
});
