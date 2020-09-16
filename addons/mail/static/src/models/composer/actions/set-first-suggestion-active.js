/** @odoo-module alias=mail.models.Composer.actions.setFirstSuggestionActive **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/setFirstSuggestionActive',
    id: 'mail.models.Composer.actions.setFirstSuggestionActive',
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
            !composer[
                composer.mainSuggestedRecordsListName(ctx)
            ](ctx)[0]
        ) {
            if (
                !composer[
                    composer.extraSuggestedRecordsListName(ctx)
                ](ctx)[0]
            ) {
                return;
            }
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.activeSuggestedRecordName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer[composer.extraSuggestedRecordsListName(ctx)](ctx)[0],
                        ),
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.activeSuggestedRecordName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer[composer.mainSuggestedRecordsListName(ctx)](ctx)[0],
                        ),
                },
            );
        }
    },
});
