/** @odoo-module alias=mail.models.Partner.actions.openChat **/

import action from 'mail.model.define';

/**
 * Opens a chat between the user of this partner and the current user
 * and returns it.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'Partner/openChat',
    id: 'mail.models.Partner.actions.openChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Partner} partner
     * @param {Object} [options] forwarded to @see `Thread/open`
     * @returns {Thread|undefined}
     */
    async func(
        { env },
        partner,
        options,
    ) {
        const chat = await env.services.action.dispatch(
            'Record/doAsync',
            partner,
            () => env.services.action.dispatch(
                'Partner/getChat',
                partner,
            ),
        );
        if (!chat) {
            return;
        }
        await env.services.action.dispatch(
            'Record/doAsync',
            partner,
            () => env.services.action.dispatch(
                'Thread/open',
                chat,
                options,
            ),
        );
        return chat;
    },
});
