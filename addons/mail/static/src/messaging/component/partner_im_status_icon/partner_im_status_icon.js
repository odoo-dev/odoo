odoo.define('mail.messaging.component.PartnerImStatusIcon', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class PartnerImStatusIcon extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const partner = this.env.entities.Partner.get(props.partnerLocalId);
            return {
                partner: partner ? partner.__state : undefined,
                partnerRoot: this.env.messaging.partnerRoot
                    ? this.env.messaging.partnerRoot.__state
                    : undefined,
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
        return this.env.entities.Partner.get(this.props.partnerLocalId);
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
