odoo.define('mail.component.PartnerImStatusIcon', function () {
'use strict';

const { Component } = owl;
const { useGetters, useStore } = owl.hooks;

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
                partner: this.storeGetters.getStoreObject({
                    storeKey: 'partners',
                    localId: props.partnerLocalId,
                    keys: ['localId', 'im_status'],
                }),
            };
        });
    }
}

PartnerImStatusIcon.template = 'mail.component.PartnerImStatusIcon';

return PartnerImStatusIcon;

});
