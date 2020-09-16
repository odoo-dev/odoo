/** @odoo-module alias=mail.models.User.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'User/convertData',
    id: 'mail.models.User.actions.convertData',
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
        if ('partner_id' in data) {
            if (!data.partner_id) {
                data2.partner = env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            } else {
                const partnerNameGet = data['partner_id'];
                const partnerData = {
                    displayName: partnerNameGet[1],
                    id: partnerNameGet[0],
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
