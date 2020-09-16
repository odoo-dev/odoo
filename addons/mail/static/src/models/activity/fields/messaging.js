/** @odoo-module alias=mail.models.Activity.fields.messaging **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'messaging',
    id: 'mail.models.Activity.fields.messaging',
    global: true,
    target: 'Messaging',
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {Messaging}
     */
     compute({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            env.services.model.messaging,
        );
    },
});
