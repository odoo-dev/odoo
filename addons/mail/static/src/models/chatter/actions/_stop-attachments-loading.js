/** @odoo-module alias=mail.models.Chatter.actions._stopAttachmentsLoading **/

import action from 'mail.action.define';

export default action({
    name: 'Chatter/_stopAttachmentsLoading',
    id: 'mail.models.Chatter.actions._stopAttachmentsLoading',
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
        env.browser.clearTimeout(chatter._attachmentsLoaderTimeout);
        chatter._attachmentsLoaderTimeout = null;
        env.services.action.dispatch(
            'Record/update',
            chatter,
            { isShowingAttachmentsLoading: false },
        );
        chatter._isPreparingAttachmentsLoading = false;
    },
});
