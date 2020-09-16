/** @odoo-module alias=mail.models.Discuss.actions.handleAddChannelAutocompleteSelect **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/handleAddChannelAutocompleteSelect',
    id: 'mail.models.Discuss.actions.handleAddChannelAutocompleteSelect',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    async func(
        { ctx, env },
        discuss,
        ev,
        ui,
    ) {
        const name = discuss.addingChannelValue(ctx);
        env.services.action.dispatch(
            'Discuss/clearIsAddingItem',
            discuss,
        );
        if (ui.item.special) {
            const channel = await env.services.action.dispatch(
                'Record/doAsync',
                discuss,
                () => env.services.action.dispatch(
                    'Thread/performRpcCreateChannel',
                    {
                        name,
                        privacy: ui.item.special,
                    },
                ),
            );
            env.services.action.dispatch(
                'Thread/open',
                channel,
            );
        } else {
            const channel = await env.services.action.dispatch(
                'Record/doAsync',
                discuss,
                () => env.services.action.dispatch(
                    'Thread/performRpcJoinChannel',
                    { channelId: ui.item.id },
                ),
            );
            env.services.action.dispatch(
                'Thread/open',
                channel,
            );
        }
    },
});
