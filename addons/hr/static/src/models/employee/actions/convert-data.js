/** @odoo-module alias=hr.models.Employee.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'Employee/convertData',
    id: 'hr.models.Employee.actions.convertData',
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
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('user_id' in data) {
            data2.hasCheckedUser = true;
            if (!data.user_id) {
                data2.user = env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            } else {
                const partnerNameGet = data.user_partner_id;
                const partnerData = {
                    displayName: partnerNameGet[1],
                    id: partnerNameGet[0],
                };
                const userNameGet = data.user_id;
                const userData = {
                    displayName: userNameGet[1],
                    id: userNameGet[0],
                    partner: env.services.action.dispatch(
                        'RecordFieldCommand/insert',
                        partnerData,
                    ),
                };
                data2.user = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    userData,
                );
            }
        }
        return data2;
    },
});
