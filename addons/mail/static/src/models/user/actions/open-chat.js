/** @odoo-module alias=mail.models.User.actions.openChat **/

import action from 'mail.action.define';

/**
 * Opens a chat between this user and the current user and returns it.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'User/openChat',
    id: 'mail.models.User.actions.openChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {User} user
     * @param {Object} [options] forwarded to @see `Thread/open`
     * @returns {Thread|undefined}
     */
    async func(
        { env },
        user,
        options,
    ) {
        const chat = await env.services.action.dispatch(
            'Record/doAsync',
            user,
            () => env.services.action.dispatch(
                'User/getChat',
                user,
            ),
        );
        if (!chat) {
            return;
        }
        await env.services.action.dispatch(
            'Record/doAsync',
            user,
            () => env.services.action.dispatch(
                'Thread/open',
                chat,
                options,
            ),
        );
        return chat;
    },
});
