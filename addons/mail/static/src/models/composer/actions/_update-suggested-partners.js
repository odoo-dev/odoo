/** @odoo-module alias=mail.models.Composer.actions._updateSuggestedPartners **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/_updateSuggestedPartners',
    id: 'mail.models.Composer.actions._updateSuggestedPartners',
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
                    model: 'res.partner',
                    method: 'get_mention_suggestions',
                    kwargs: {
                        limit: 8,
                        search: mentionKeyword,
                    },
                },
                { shadow: true },
            ),
        );
        const mainSuggestedPartners = mentions[0];
        const extraSuggestedPartners = mentions[1];
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                extraSuggestedPartners: env.services.action.dispatch(
                    'RecordFieldCommand/insertAndReplace',
                    extraSuggestedPartners.map(data =>
                        env.services.action.dispatch(
                            'Partner/convertData',
                            data,
                        ),
                    ),
                ),
                mainSuggestedPartners: env.services.action.dispatch(
                    'RecordFieldCommand/insertAndReplace',
                    mainSuggestedPartners.map(
                        data => env.services.action.dispatch(
                            'Partner/convertData',
                            data,
                        ),
                    ),
                ),
            },
        );

        if (composer.mainSuggestedPartners(ctx)[0]) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedPartner:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer.mainSuggestedPartners(ctx)[0],
                        ),
                    hasToScrollToActiveSuggestion: true,
                },
            );
        } else if (composer.extraSuggestedPartners(ctx)[0]) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedPartner:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer.extraSuggestedPartners(ctx)[0],
                        ),
                    hasToScrollToActiveSuggestion: true,
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedPartner:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                        ),
                },
            );
        }
    },
});
