/** @odoo-module alias=mail.models.Messaging.fields.discuss **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'discuss',
    id: 'mail.models.Messaging.fields.discuss',
    global: true,
    target: 'Discuss',
    inverse: 'messaging',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0
     * @returns {Discuss}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
