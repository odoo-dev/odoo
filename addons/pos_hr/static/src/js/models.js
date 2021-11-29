odoo.define('pos_hr.employees', function (require) {
    "use strict";

var models = require('point_of_sale.models');
const Registries = require('point_of_sale.Registries');

models.load_models([{
    model:  'hr.employee',
    loaded: function(self, employees) {
        if (self.config.module_pos_hr) {
            self.employees = employees;
            self.employee_by_id = {};
            self.employees.forEach(function(employee) {
                self.employee_by_id[employee.id] = employee;
                var hasUser = self.users.some(function(user) {
                    if (user.id === employee.user_id[0]) {
                        employee.role = user.role;
                        return true;
                    }
                    return false;
                });
                if (!hasUser) {
                    employee.role = 'cashier';
                }
            });
        }
    }
}]);

Registries.PosModelRegistry.extend(models.PosGlobalState, (PosGlobalState) => {

class PosHrPosModel extends PosGlobalState {
    after_load_server_data() {
        var self = this;
        var employee_ids = _.map(self.employees, function(employee){return employee.id;});
        var records = self.rpc({
            model: 'hr.employee',
            method: 'get_barcodes_and_pin_hashed',
            args: [employee_ids],
        });
        return records.then(function (employee_data) {
            self.employees.forEach(function (employee) {
                var data = _.findWhere(employee_data, {'id': employee.id});
                if (data !== undefined){
                    employee.barcode = data.barcode;
                    employee.pin = data.pin;
                }
            });
        }).then(async () => {
            await super.after_load_server_data(...arguments);
            this.hasLoggedIn = !this.config.module_pos_hr;
        });
    }
    set_cashier(employee) {
        super.set_cashier(...arguments);
        const selectedOrder = this.get_order();
        if (selectedOrder && !selectedOrder.get_orderlines().length) {
            // Order without lines can be considered to be un-owned by any employee.
            // We set the employee on that order to the currently set employee.
            selectedOrder.employee = employee;
        }
    }
}

return PosHrPosModel;
});

Registries.PosModelRegistry.extend(models.Order, (Order) => {

class PosHrOrder extends Order {
    constructor(obj, options) {
        super(...arguments);
        if (!options.json) {
            this.employee = this.pos.get_cashier();
        }
    }
    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        if (this.pos.config.module_pos_hr) {
            this.employee = this.pos.employee_by_id[json.employee_id];
        }
    }
    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        if (this.pos.config.module_pos_hr) {
            json.employee_id = this.employee ? this.employee.id : false;
        }
        return json;
    }
}

return PosHrOrder;
});

});
