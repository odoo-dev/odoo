/** @odoo-module alias=mail.models.Chatter.actions.focus **/

import action from 'mail.action.define';

export default action({
    name: 'Chatter/focus',
    id: 'mail.models.Chatter.actions.focus',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Chatter} chatter
     */
    func(
        { env },
        chatter,
    ) {
        env.services.action.dispatch(
            'Record/update',
            chatter,
            { isDoFocus: true },
        );
    },
});
