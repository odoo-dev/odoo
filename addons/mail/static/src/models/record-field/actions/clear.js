/** @odoo-module alias=mail.models.RecordField.actions.clear **/

import action from 'mail.action.define';

/**
 * Clears the value of this field on the given record. It consists of
 * setting this to its default value. In particular, using `clear` is the
 * only way to write `undefined` on a field, as long as `undefined` is its
 * default value. Relational fields are always unlinked before the default
 * is applied.
 */
export default action({
    name: 'RecordField/clear',
    id: 'mail.model.RecordField.actions.clear',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
    ) {
        let hasChanged = false;
        if (field.type === 'relation') {
            if (
                env.services.action.dispatch(
                    'RecordField/unlinkAll',
                    field,
                )
            ) {
                hasChanged = true;
            }
        }
        if (
            env.services.action.dispatch(
                'RecordField/set',
                field,
                field.default,
            )
        ) {
            hasChanged = true;
        }
        return hasChanged;
    },
});
