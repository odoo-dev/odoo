/** @odoo-module alias=mail.models.Messaging.fields.initializer **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'initializer',
    id: 'mail.models.Messaging.fields.initializer',
    global: true,
    target: 'MessagingInitializer',
    inverse: 'messaging',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {MessagingInitializer}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
