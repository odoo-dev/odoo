/** @odoo-module alias=mail.models.User.actions.getChat **/

import action from 'mail.action.define';

/**
 * Gets the chat between this user and the current user.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'User/getChat',
    id: 'mail.models.User.actions.getChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {User} user
     * @returns {Thread|undefined}
     */
    async func(
        { ctx, env },
        user,
    ) {
        if (!user.partner(ctx)) {
            await env.services.action.dispatch(
                'Record/doAsync',
                user,
                () => env.services.action.dispatch(
                    'User/fetchPartner',
                    user,
                ),
            );
        }
        if (!user.partner(ctx)) {
            // This user has been deleted from the server or never existed:
            // - Validity of id is not verified at insert.
            // - There is no bus notification in case of user delete from
            //   another tab or by another user.
            env.services['notification'].notify({
                message: env._t("You can only chat with existing users."),
                type: 'warning',
            });
            return;
        }
        // in other cases a chat would be valid, find it or try to create it
        let chat = env.services.action.dispatch(
            'Thread/find',
            thread => (
                    thread.channelType(ctx) === 'chat' &&
                    thread.correspondent(ctx) === user.partner(ctx) &&
                    thread.model(ctx) === 'mail.channel' &&
                    thread.public(ctx) === 'private'
                ),
            );
        if (!chat ||!chat.isPinned(ctx)) {
            // if chat is not pinned then it has to be pinned client-side
            // and server-side, which is a side effect of following rpc
            chat = await env.services.action.dispatch(
                'Record/doAsync',
                user,
                () => env.services.action.dispatch(
                    'Thread/performRpcCreateChat',
                    { partnerIds: [user.partner(ctx).id(ctx)] },
                ),
            );
        }
        if (!chat) {
            env.services['notification'].notify({
                message: env._t("An unexpected error occurred during the creation of the chat."),
                type: 'warning',
            });
            return;
        }
        return chat;
    },
});
