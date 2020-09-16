/** @odoo-module alias=mail.models.Composer.actions.setPreviousSuggestionActive **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/setPreviousSuggestionActive',
    id: 'mail.models.Composer.actions.setPreviousSuggestionActive',
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
        const fullList = composer.extraSuggestedRecordsListName(ctx)
            ? composer[
                    composer.mainSuggestedRecordsListName(ctx)
                ](ctx).concat(
                    composer[composer.extraSuggestedRecordsListName(ctx)](ctx)
                )
            : composer[composer.mainSuggestedRecordsListName(ctx)];
        if (fullList.length === 0) {
            return;
        }
        const activeElementIndex = fullList.findIndex(
            suggestion => suggestion === composer[
                composer.activeSuggestedRecordName(ctx)
            ](ctx)
        );
        if (activeElementIndex === -1) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.activeSuggestedRecordName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            fullList[0],
                        )
                },
            );
        } else if (activeElementIndex !== 0) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    [composer.activeSuggestedRecordName(ctx)]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            fullList[activeElementIndex - 1]
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
                            fullList[fullList.length - 1]
                        ),
                },
            );
        }
    },
});
