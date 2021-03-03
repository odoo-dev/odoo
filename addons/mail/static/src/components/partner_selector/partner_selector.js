odoo.define('mail/static/src/components/partner_selector/partner_selector.js', function (require) {
'use strict';

const components = {
    SelectablePartnersList: require('mail/static/src/components/selectable_partners_list/selectable_partners_list.js'),
};
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');
const { Component } = owl;
const { useRef } = owl.hooks;
const { useState } = owl.hooks;

class PartnerSelector extends Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        useStore(
            (...args) => this._useStoreSelector(...args),
        );

        this.inputRef = useRef('search-input');
        this.state = useState({ searchInput: "" });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    patched() {
        const coucou = "";
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _onKeyUp() {
        this.state.searchInput = this.inputRef.el.value;
    }

    /**
     * @private
     * @param {Object} props
     * @returns {Object}
     */
    _useStoreSelector(props) {
        return {
            inputSearch: this.inputRef ? this.inputRef.el.value : "",
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------


}

Object.assign(PartnerSelector, {
    components,
    defaultProps: {

    },
    props: {

    },
    template: 'mail.PartnerSelector',
});

return PartnerSelector;

});
