/** @odoo-module alias=mail.models.Messaging.fields.dialogManager **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'dialogManager',
    id: 'mail.models.Messaging.fields.dialogManager',
    global: true,
    target: 'DialogManager',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {DialogManager}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
