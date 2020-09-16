/** @odoo-module alias=hr.modelAddons.Partner.fields.hasCheckedEmployee **/

import attr from 'mail.model.field.attr.define';

/**
 * Whether an attempt was already made to fetch the employee corresponding
 * to this partner. This prevents doing the same RPC multiple times.
 */
export default attr({
    name: 'hasCheckedEmployee',
    id: 'hr.modelAddons.Partner.fields.hasCheckedEmployee',
    global: true,
    default: false,
});
