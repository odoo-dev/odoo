/** @odoo-module alias=hr.modelAddons.User.fields.employee **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Employee related to this user.
 */
export default one2one({
    name: 'employee',
    id: 'hr.modelAddons.User.fields.employee',
    global: true,
    target: 'Employee',
    inverse: 'user',
});
