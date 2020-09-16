/** @odoo-module alias=mail.models.Messaging.actions.openChat **/

import action from 'mail.action.define';

/**
 * Opens a chat with the provided person and returns it.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'Messaging/openChat',
    id: 'mail.models.Messaging.actions.openChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Messaging} messaging
     * @param {Object} person forwarded to @see `Messaging/getChat`
     * @param {Object} [options] forwarded to @see `Thread/open`
     * @returns {Thread|undefined}
     */
    async func(
        { env },
        messaging,
        person,
        options,
    ) {
        const chat = await env.services.action.dispatch(
            'Record/doAsync',
            messaging,
            () => env.services.action.dispatch(
                'Messaging/getChat',
                person,
            ),
        );
        if (!chat) {
            return;
        }
        await env.services.action.dispatch(
            'Record/doAsync',
            messaging,
            () => env.services.action.dispatch(
                'Thread/open',
                chat,
                options,
            ),
        );
        return chat;
    },
});
