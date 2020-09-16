/** @odoo-module alias=mail.models.Record.actions.delete **/

import action from 'mail.action.define';

/**
 * Delete the record. After this operation, it's as if this record never
 * existed. Note that relation are removed, which may delete more relations
 * if some of them are causal.
 */
export default action({
    name: 'Record/delete',
    id: 'mail.models.Record.actions.delete',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Record} record
     */
    func(
        { env },
        record,
    ) {
        record.willDelete();
        const data = {};
        for (const field of record.fields) {
            if (
                env.services.action.dispatch(
                    'RecordField/isRelational',
                    field,
                )
            ) {
                data[field.name] = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            }
        }
        env.services.action.dispatch(
            'Record/update',
            record,
            data,
        );
    },
});
