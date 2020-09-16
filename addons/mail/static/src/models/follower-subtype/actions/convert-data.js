/** @odoo-module alias=mail.models.FollowerSubtype.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'FollowerSubtype/convertData',
    id: 'mail.models.FollowerSubtype.actions.convertData',
    global: true,
    /**
     * @param {Object} _
     * @param {Object} data
     * @returns {Object}
     */
    func(
        _,
        data,
    ) {
        const data2 = {};
        if ('default' in data) {
            data2.isDefault = data.default;
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('internal' in data) {
            data2.isInternal = data.internal;
        }
        if ('name' in data) {
            data2.name = data.name;
        }
        if ('parent_model' in data) {
            data2.parentModel = data.parent_model;
        }
        if ('res_model' in data) {
            data2.resModel = data.res_model;
        }
        if ('sequence' in data) {
            data2.sequence = data.sequence;
        }
        return data2;
    },
});
