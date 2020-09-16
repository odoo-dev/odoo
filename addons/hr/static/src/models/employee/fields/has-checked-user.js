/** @odoo-module alias=hr.models.Employee.fields.hasCheckedUser **/

import attr from 'mail.model.field.attr.define';

/**
 * Whether an attempt was already made to fetch the user corresponding
 * to this employee. This prevents doing the same RPC multiple times.
 */
export default attr({
    name: 'hasCheckedUser',
    id: 'hr.models.Employee.fields.hasCheckedUser',
    global: true,
    default: false,
});
