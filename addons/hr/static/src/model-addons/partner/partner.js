/** @odoo-module alias=hr.modelAddons.Partner **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Partner',
    id: 'hr.modelAddons.Partner',
    global: true,
    actionAddons: [
        'hr.modelAddons.Partner.actionAddons.openProfile',
    ],
    actions: [
        'hr.modelAddons.Partner.actions.checkIsEmployee',
    ],
    fields: [
        'hr.modelAddons.Partner.fields.employee',
        'hr.modelAddons.Partner.fields.hasCheckedEmployee',
    ],
});
