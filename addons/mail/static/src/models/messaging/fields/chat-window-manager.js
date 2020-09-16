/** @odoo-module alias=mail.models.Messaging.fields.chatWindowManager **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'chatWindowManager',
    id: 'mail.models.Messaging.fields.chatWindowManager',
    global: true,
    target: 'ChatWindowManager',
    inverse: 'messaging',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {ChatWindowManager}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
