/** @odoo-module alias=mail.models.Message.actions.refreshDateFromNow **/

import action from 'mail.action.define';

/**
 * Refreshes the value of `dateFromNow` field to the "current now".
 */
export default action({
    name: 'Message/refreshDateFromNow',
    id: 'mail.models.Message.actions.refreshDateFromNow',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Message} message
     */
    func(
        { env },
        message,
    ) {
        env.services.action.dispatch(
            'Record/update',
            message,
            {
                dateFromNow: env.services.action.dispatch(
                    'Message/_computeDateFromNow',
                    message,
                ),
            },
        );
    },
});
