/** @odoo-module alias=mail.models.Record.actions._flush **/

import action from 'mail.action.define';

/**
 * Terminates an update cycle by executing its pending operations: execute
 * computed fields, execute life-cycle hooks, update rev numbers.
 */
export default action({
    name: 'Record/_flush',
    id: 'mail.models.Record.actions._flush',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     */
    func(
        { env },
    ) {
        /**
         * 1. Process fields to compute.
         */
        /**
         * 2. Invoke created hook on newly created records.
         */
        /**
         * 3. Notify observers of their changed observees.
         */
        env.store.state.rev++;
    },
});
