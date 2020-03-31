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
            return {
                partner: this.env.entities.Partner.get(props.partner),
                partnerRoot: this.env.entities.Partner.root,
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
        return this.env.entities.Partner.get(this.props.partner);
    }

}

Object.assign(PartnerImStatusIcon, {
    props: {
        partner: String,
    },
    template: 'mail.messaging.component.PartnerImStatusIcon',
});

return PartnerImStatusIcon;

});
