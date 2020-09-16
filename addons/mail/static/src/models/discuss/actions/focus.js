/** @odoo-module alias=mail.models.Discuss.actions.focus **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/focus',
    id: 'mail.models.Discuss.actions.focus',
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
            { isDoFocus: true },
        );
    },
});
