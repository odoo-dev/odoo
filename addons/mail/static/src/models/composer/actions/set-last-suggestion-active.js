/** @odoo-module alias=mail.models.Composer.actions.setLastSuggestionActive **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/setLastSuggestionActive',
    id: 'mail.models.Composer.actions.setLastSuggestionActive',
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
        if (composer[composer.extraSuggestedRecordsListName(ctx)](ctx).length === 0) {
            if (composer[composer.mainSuggestedRecordsListName(ctx)](ctx).length === 0) {
                return;
            }
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.activeSuggestedRecordName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer[
                                composer.mainSuggestedRecordsListName(ctx)
                            ](ctx)[
                                composer[
                                    composer.mainSuggestedRecordsListName(ctx)
                                ](ctx).length - 1
                            ],
                        ),
                },
            );
            return;
        }
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                [composer.activeSuggestedRecordName(ctx)]:
                    env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        composer[
                            composer.extraSuggestedRecordsListName(ctx)
                        ](ctx)[
                            composer[
                                composer.extraSuggestedRecordsListName(ctx)
                            ](ctx).length - 1
                        ],
                    ),
            },
        );
    },
});
