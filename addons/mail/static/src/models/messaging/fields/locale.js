/** @odoo-module alias=mail.models.Messaging.fields.locale **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'locale',
    id: 'mail.models.Messaging.fields.locale',
    global: true,
    target: 'Locale',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {Locale}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
