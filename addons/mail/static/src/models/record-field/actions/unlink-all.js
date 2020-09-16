/** @odoo-module alias=mail.models.RecordField.actions.unlinkAll **/

import action from 'mail.action.define';

export default action({
    name: 'RecordField/unlinkAll',
    id: 'mail.model.RecordField.actions.unlinkAll',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Object} [options]
     */
    func(
        { env },
        field,
        options,
    ) {
        return env.services.action.dispatch(
            'RecordField/unlink',
            field.value,
            options,
        );
    },
});
