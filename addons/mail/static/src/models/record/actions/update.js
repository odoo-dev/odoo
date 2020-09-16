/** @odoo-module alias=mail.models.Record.actions.update **/

import action from 'mail.action.define';

/**
 * Process an update on provided record with provided data. Updating
 * a record consists of applying direct updates first (i.e. explicit
 * ones from `data`) and then indirect ones (i.e. compute/related fields
 * and "after updates").
 */
export default action({
    name: 'Record/update',
    id: 'mail.models.Record.actions.update',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Record} record
     * @param {Object} data
     * @param {Object} [options]
     */
    func(
        { env },
        record,
        data,
        options,
    ) {
        this.depth++;
        for (const fieldName of Object.keys(data)) {
            if (data[fieldName] === undefined) {
                continue;
            }
            const newVal = data[fieldName];
            const field = record.field(fieldName);
            env.services.action.dispatch(
                'RecordField/set',
                field,
                newVal,
                options,
            );
        }
        this.depth--;
        if (this.depth === 0) {
            env.services.action.dispatch(
                'Record/_flush',
            );
        }
    },
});
