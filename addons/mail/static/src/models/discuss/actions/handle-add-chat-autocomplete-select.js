/** @odoo-module alias=mail.models.Discuss.actions.handleAddChatAutocompleteSelect **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/handleAddChatAutocompleteSelect',
    id: 'mail.models.Discuss.actions.handleAddChatAutocompleteSelect',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    func(
        { env },
        discuss,
        ev,
        ui,
    ) {
        env.services.action.dispatch(
            'Messaging/openChat',
            { partnerId: ui.item.id },
        );
        env.services.action.dispatch(
            'Discuss/clearIsAddingItem',
            discuss,
        );
    },
});
