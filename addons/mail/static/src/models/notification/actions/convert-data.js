/** @odoo-module alias=mail.models.Notification.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'Notification/convertData',
    id: 'mail.models.Notification.actions.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} data
     * @return {Object}
     */
    func(
        { env },
        data,
    ) {
        const data2 = {};
        if ('failure_type' in data) {
            data2.failureType = data.failure_type;
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('notification_status' in data) {
            data2.status = data.notification_status;
        }
        if ('notification_type' in data) {
            data2.type = data.notification_type;
        }
        if ('res_partner_id' in data) {
            if (!data.res_partner_id) {
                data2.partner = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                data2.partner = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        displayName: data.res_partner_id[1],
                        id: data.res_partner_id[0],
                    },
                );
            }
        }
        return data2;
    },
});
