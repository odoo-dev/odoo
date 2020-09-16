/** @odoo-module alias=mail.models.Composer.actions._reset **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/_reset',
    id: 'mail.models.Composer.actions._reset',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Composer} composer
     */
    func(
        { env },
        composer,
    ) {
        env.services.action.dispatch(
            'Composer/closeSuggestions',
            composer,
        );
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                attachments: env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                ),
                isLastStateChangeProgrammatic: true,
                mentionedChannels: env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                ),
                mentionedPartners: env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                ),
                subjectContent: "",
                textInputContent: '',
                textInputCursorEnd: 0,
                textInputCursorStart: 0,
            },
        );
    },
});
