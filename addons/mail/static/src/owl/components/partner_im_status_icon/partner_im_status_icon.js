odoo.define('mail.component.PartnerImStatusIcon', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;

class PartnerImStatusIcon extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeProps = useStore((state, props) => {
            return {
                partner: state.partners[props.partnerLocalId],
            };
        });
    }
}

PartnerImStatusIcon.template = 'mail.component.PartnerImStatusIcon';

return PartnerImStatusIcon;

});
