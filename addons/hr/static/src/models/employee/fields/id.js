/** @odoo-module alias=hr.models.Employee.fields.id **/

import attr from 'mail.model.field.attr.define';

/**
 * Unique identifier for this employee.
 */
export default attr({
    name: 'id',
    id: 'hr.models.Employee.fields.id',
    global: true,
    isId: true,
});
