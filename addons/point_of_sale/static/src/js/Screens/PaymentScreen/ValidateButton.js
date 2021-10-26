odoo.define('point_of_sale.ValidateButton', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const { useState } = require("@point_of_sale/js/createAtom");

    class ValidateButton extends PosComponent {
        setup() {
            this._order = useState(this.props.order);
        }
    }
    ValidateButton.template = 'point_of_sale.ValidateButton';

    Registries.Component.add(ValidateButton);

    return ValidateButton;
});
