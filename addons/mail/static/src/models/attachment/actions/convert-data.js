/** @odoo-module alias=mail.models.Attachment.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'Attachment/convertData',
    id: 'mail.models.Attachment.actions.convertData',
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
        if ('filename' in data) {
            data2.filename = data.filename;
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('mimetype' in data) {
            data2.mimetype = data.mimetype;
        }
        if ('name' in data) {
            data2.name = data.name;
        }
        // relation
        if ('res_id' in data && 'res_model' in data) {
            data2.originThread = env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: data.res_id,
                    model: data.res_model,
                },
            );
        }
        return data2;
    },
});
