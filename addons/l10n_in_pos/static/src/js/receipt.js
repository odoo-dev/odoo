odoo.define('l10n_in_pos.receipt', function (require) {
"use strict";

var models = require('point_of_sale.models');
const Registries = require('point_of_sale.Registries');

Registries.PosModelRegistry.extend(models.Orderline, (Orderline) => {

class L10nInOrderline extends Orderline {
    export_for_printing() {
        var line = super.export_for_printing(...arguments);
        line.l10n_in_hsn_code = this.get_product().l10n_in_hsn_code;
        return line;
    }
}

return L10nInOrderline;
});

});
