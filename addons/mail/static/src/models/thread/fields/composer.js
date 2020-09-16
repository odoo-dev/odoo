/** @odoo-module alias=mail.models.Thread.fields.composer **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'composer',
    id: 'mail.models.Thread.fields.composer',
    global: true,
    target: 'Composer',
    inverse: 'thread',
    isCausal: true,
    readonly: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {Composer}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
