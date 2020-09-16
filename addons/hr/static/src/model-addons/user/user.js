/** @odoo-module alias=hr.modelAddons.User **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'User',
    id: 'hr.modelAddons.User',
    global: true,
    fields: [
        'hr.modelAddons.User.fields.employee',
    ],
});
