/** @odoo-module alias=hr.models.Employee.fields.user **/

import one2one from 'mail.model.field.one2one.define';

/**
 * User related to this employee.
 */
export default one2one({
    name: 'user',
    id: 'hr.models.Employee.fields.user',
    global: true,
    target: 'User',
    inverse: 'employee',
});
