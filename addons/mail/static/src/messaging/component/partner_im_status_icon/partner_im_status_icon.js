odoo.define('mail.component.PartnerImStatusIcon', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useGetters } = owl.hooks;

class PartnerImStatusIcon extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                partner: state.partners[props.partnerLocalId],
                // used through isPartnerRoot getter
                partnerRootLocalId: state.partnerRootLocalId,
            };
        });
    }
}

PartnerImStatusIcon.template = 'mail.component.PartnerImStatusIcon';

return PartnerImStatusIcon;

});
