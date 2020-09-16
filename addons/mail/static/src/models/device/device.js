/** @odoo-module alias=mail.models.Device **/

import model from 'mail.model.define';

export default model({
    name: 'Device',
    id: 'mail.models.Device',
    global: true,
    actions: [
        'mail.models.Device.actions._refresh',
        'mail.models.Device.actions.start',
        'mail.models.Device.actions.stop',
    ],
    fields: [
        'mail.models.Device.fields.globalWindowInnerHeight',
        'mail.models.Device.fields.globalWindowInnerWidth',
        'mail.models.Device.fields.isMobile',
    ],
});
