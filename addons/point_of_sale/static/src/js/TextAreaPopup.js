odoo.define('point_of_sale.TextAreaPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const { Chrome } = require('point_of_sale.chrome');
    const { AbstractAwaitablePopup } = require('point_of_sale.AbstractAwaitablePopup');

    // formerly TextAreaPopupWidget
    // IMPROVEMENT: This code is very similar to TextInputPopup.
    //      Combining them would reduce the code.
    class TextAreaPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ inputValue: '' });
            this.inputRef = useRef('input');
        }
        mounted() {
            this.inputRef.el.focus();
        }
        getPayload() {
            return this.state.inputValue;
        }
    }
    TextAreaPopup.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Chrome.addComponents([TextAreaPopup]);

    return { TextAreaPopup };
});
