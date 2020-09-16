/** @odoo-module alias=mail.models.Messaging.actions.getChat **/

import action from 'mail.action.define';

/**
 * Open the form view of the record with provided id and model.
 * Gets the chat with the provided person and returns it.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'Messaging/getChat',
    id: 'mail.models.Messaging.actions.getChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {integer} [param1.partnerId]
     * @param {integer} [param1.userId]
     * @returns {Thread|undefined}
     */
    async func(
        { env },
        {
            partnerId,
            userId,
        },
    ) {
        if (userId) {
            const user = env.services.action.dispatch(
                'User/insert',
                { id: userId },
            );
            return env.services.action.dispatch(
                'User/getChat',
                user,
            );
        }
        if (partnerId) {
            const partner = env.services.action.dispatch(
                'Partner/insert',
                { id: partnerId },
            );
            return env.services.action.dispatch(
                'Partner/getChat',
                partner,
            );
        }
    },
});
