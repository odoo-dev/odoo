/** @odoo-module alias=mail.models.Chatter.actions.toggleActivityBoxVisibility **/

import action from 'mail.action.define';

export default action({
    name: 'Chatter/toggleActivityBoxVisibility',
    id: 'mail.models.Chatter.actions.toggleActivityBoxVisibility',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Chatter} chatter
     */
    func(
        { ctx, env },
        chatter,
    ) {
        env.services.action.dispatch(
            'Record/update',
            chatter,
            { isActivityBoxVisible: !chatter.isActivityBoxVisible(ctx) },
        );
    },
});
