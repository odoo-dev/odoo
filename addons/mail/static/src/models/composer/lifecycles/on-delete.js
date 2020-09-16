/** @odoo-module alias=mail.models.Composer.lifecycles.onDelete **/

import lifecycle from 'mail.model.lifecycle.define';

export default lifecycle({
    name: 'onDelete',
    id: 'mail.models.Composer.lifecycles.onDelete',
    global: true,
    /**
     * @param {Object} param0
     * @param {Composer} param0.record
     */
    func({ record }) {
        record._nextMentionRpcFunction = undefined;
    },
});
