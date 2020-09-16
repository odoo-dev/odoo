/** @odoo-module alias=mail.models.Messaging.fields.device **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'device',
    id: 'mail.models.Messaging.fields.device',
    global: true,
    target: 'Device',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {Device}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
