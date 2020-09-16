/** @odoo-module alias=mail.models.Record.actions.deleteAll **/

import action from 'mail.action.define';

/**
 * Delete all records.
 */
export default action({
    name: 'Record/deleteAll',
    id: 'mail.models.Record.actions.deleteAll',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     */
    func(
        { env },
    ) {
        for (const record of env.records.values()) {
            env.services.action.dispatch(
                'Record/delete',
                record,
            );
        }
    },
});
