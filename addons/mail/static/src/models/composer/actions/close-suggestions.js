/** @odoo-module alias=mail.models.Composer.actions.closeSuggestions **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/closeSuggestions',
    id: 'mail.models.Composer.actions.closeSuggestions',
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
        if (composer.activeSuggestedRecordName(ctx)) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.activeSuggestedRecordName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                        ),
                },
            );
        }
        if (composer.extraSuggestedRecordsListName(ctx)) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.extraSuggestedRecordsListName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlinkAll',
                        ),
                },
            );
        }
        if (composer.mainSuggestedRecordsListName(ctx)) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.mainSuggestedRecordsListName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlinkAll',
                        ),
                },
            );
        }
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                activeSuggestedRecordName: env.services.action.dispatch(
                    'RecordFieldCommand/clear',
                ),
                extraSuggestedRecordsListName: '',
                mainSuggestedRecordsListName: '',
                suggestionDelimiter: '',
            },
        );
    },
});
