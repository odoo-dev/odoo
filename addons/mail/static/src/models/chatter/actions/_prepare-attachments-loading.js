/** @odoo-module alias=mail.models.Chatter.actions._prepareAttachmentsLoading **/

import action from 'mail.action.define';

export default action({
    name: 'Chatter/_prepareAttachmentsLoading',
    id: 'mail.models.Chatter.actions._prepareAttachmentsLoading',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Chatter} chatter
     */
    func(
        { env },
        chatter,
    ) {
        chatter._isPreparingAttachmentsLoading = true;
        chatter._attachmentsLoaderTimeout = env.browser.setTimeout(
            () => {
                env.services.action.dispatch(
                    'Record/update',
                    chatter,
                    { isShowingAttachmentsLoading: true },
                );
                chatter._isPreparingAttachmentsLoading = false;
            },
            env.loadingBaseDelayDuration,
        );
    },
});
