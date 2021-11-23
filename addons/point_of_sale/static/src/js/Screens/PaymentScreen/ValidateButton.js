odoo.define('point_of_sale.ValidateButton', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ValidateButton extends PosComponent {
        get _order() {
            return this.props.order;
        }
    }
    ValidateButton.template = 'point_of_sale.ValidateButton';

    Registries.Component.add(ValidateButton);

    return ValidateButton;
});
