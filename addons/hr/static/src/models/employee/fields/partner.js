/** @odoo-module alias=hr.models.Employee.fields.partner **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Partner related to this employee.
 */
export default one2one({
    name: 'partner',
    id: 'hr.models.Employee.fields.partner',
    global: true,
    target: 'Partner',
    inverse: 'employee',
    related: 'user.partner',
});
