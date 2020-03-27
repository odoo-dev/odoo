odoo.define('mail.messaging.component.PartnerImStatusIcon', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useGetters } = owl.hooks;

class PartnerImStatusIcon extends Component {

    /**
     * @override
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

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Partner}
     */
    get partner() {
        return this.storeProps.partner;
    }

}

Object.assign(PartnerImStatusIcon, {
    props: {
        partnerLocalId: String,
    },
    template: 'mail.messaging.component.PartnerImStatusIcon',
});

return PartnerImStatusIcon;

});
