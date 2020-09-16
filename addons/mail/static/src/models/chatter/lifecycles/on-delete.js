/** @odoo-module alias=mail.models.Chatter.lifecycles.onDelete **/

import lifecycle from 'mail.model.lifecycle.define';

export default lifecycle({
    name: 'onDelete',
    id: 'mail.models.Chatter.lifecycles.onDelete',
    global: true,
    /**
     * @param {Object} param0
     * @param {Object} param0.env
     * @param {Object} param0.record
     */
    func({ env, record }) {
        env.services.action.dispatch(
            'Chatter/_stopAttachmentsLoading',
            record,
        );
    },
});
