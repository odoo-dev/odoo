/** @odoo-module alias=mail.models.Thread.actions.promptAddChannelFollower **/

import action from 'mail.action.define';

/**
 * Open a dialog to add channels as followers.
 */
export default action({
    name: 'Thread/promptAddChannelFollower',
    id: 'mail.models.Thread.actions.promptAddChannelFollower',
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
            { mail_invite_follower_channel_only: true },
        );
    },
});
