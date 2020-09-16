/** @odoo-module alias=hr.models.Employee **/

import model from 'mail.model.define';

export default model({
    name: 'Employee',
    id: 'hr.models.Employee',
    global: true,
    actions: [
        'hr.models.Employee.actions.checkIsUser',
        'hr.models.Employee.actions.convertData',
        'hr.models.Employee.actions.getChat',
        'hr.models.Employee.actions.openChat',
        'hr.models.Employee.actions.openProfile',
        'hr.models.Employee.actions.performRpcRead',
        'hr.models.Employee.actions.performRpcSearchRead',
    ],
    fields: [
        'hr.models.Employee.fields.hasCheckedUser',
        'hr.models.Employee.fields.id',
        'hr.models.Employee.fields.partner',
        'hr.models.Employee.fields.user',
    ],
});
