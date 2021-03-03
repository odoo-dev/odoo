odoo.define('mail/static/src/components/selectable_partner/selectable_partner.js', function (require) {
'use strict';


const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');
const { Component } = owl;

class SelectablePartner extends Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        useStore(
            (...args) => this._useStoreSelector(...args),
        );
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    get partner() {
        return this.props.partner;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Object} props
     * @returns {Object}
     */
    _useStoreSelector(props) {
        return {
            partner: this.partner,
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

}

Object.assign(SelectablePartner, {
    defaultProps: {

    },
    props: {
        partner: {
            type: Object,
        }
    },
    template: 'mail.SelectablePartner',
});

return SelectablePartner;

});
