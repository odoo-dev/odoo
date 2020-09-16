/** @odoo-module alias=mail.models.Discuss.actions.clearIsAddingItem **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/clearIsAddingItem',
    id: 'mail.models.Discuss.actions.clearIsAddingItem',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     */
    func(
        { env },
        discuss,
    ) {
        env.services.action.dispatch(
            'Record/update',
            discuss,
            {
                addingChannelValue: "",
                isAddingChannel: false,
                isAddingChat: false,
            },
        );
    },
});
