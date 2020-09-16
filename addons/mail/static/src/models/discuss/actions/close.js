/** @odoo-module alias=mail.models.Discuss.actions.close **/

import action from 'mail.action.define';

/**
 * Close the discuss app. Should reset its internal state.
 */
export default action({
    name: 'Discuss/close',
    id: 'mail.models.Discuss.actions.close',
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
            { isOpen: false },
        );
    },
});
