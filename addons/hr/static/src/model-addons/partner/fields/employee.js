/** @odoo-module alias=hr.modelAddons.Partner.fields.employee **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Employee related to this partner. It is computed through
 * the inverse relation and should be considered read-only.
 */
export default one2one({
    name: 'employee',
    id: 'hr.modelAddons.Partner.fields.employee',
    global: true,
    target: 'Employee',
    inverse: 'partner',
});
