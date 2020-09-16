/** @odoo-module alias=mail.models.Follower.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'Follower/convertData',
    id: 'mail.models.Follower.actions.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} data
     * @returns {Object}
     */
    func(
        { env },
        data,
    ) {
        const data2 = {};
        if ('channel_id' in data) {
            if (!data.channel_id) {
                data2.channel = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                const channelData = {
                    id: data.channel_id,
                    model: 'mail.channel',
                    name: data.name,
                };
                data2.channel = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    channelData,
                );
            }
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('is_active' in data) {
            data2.isActive = data.is_active;
        }
        if ('is_editable' in data) {
            data2.isEditable = data.is_editable;
        }
        if ('partner_id' in data) {
            if (!data.partner_id) {
                data2.partner = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                const partnerData = {
                    email: data.email,
                    id: data.partner_id,
                    name: data.name,
                };
                data2.partner = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    partnerData,
                );
            }
        }
        return data2;
    },
});
