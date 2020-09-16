/** @odoo-module alias=hr.viewFields.Many2OneAvatarEmployeeMixin **/

const { Component } = owl;

const Many2OneAvatarEmployeeMixin = {
    supportedModels: ['hr.employee', 'hr.employee.public'],

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     */
    async _onAvatarClicked(ev) {
        ev.stopPropagation(); // in list view, prevent from opening the record
        const env = Component.env;
        await env.services.action.dispatch(
            'Messaging/openChat',
            env.services.model.messaging,
            { employeeId: this.value.res_id },
        );
    },
};

export default Many2OneAvatarEmployeeMixin;
