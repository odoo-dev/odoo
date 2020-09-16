/** @odoo-module alias=mail.models.Thread.actions.promptAddPartnerFollower **/

import action from 'mail.action.define';

/**
 * Open a dialog to add partners as followers.
 */
export default action({
    name: 'Thread/promptAddPartnerFollower',
    id: 'mail.models.Thread.actions.promptAddPartnerFollower',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    func(
        { env },
        thread,
    ) {
        env.services.action.dispatch(
            'Thread/_promptAddFollower',
            thread,
            { mail_invite_follower_channel_only: false },
        );
    },
});
