/** @odoo-module alias=mail.models.Thread.fields.mainCache **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'mainCache',
    id: 'mail.models.Thread.fields.mainCache',
    global: true,
    target: 'ThreadCache',
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {ThreadCache}
     */
    compute({ env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            env.services.action.dispatch(
                'Thread/cache',
                record,
            ),
        );
    },
});
