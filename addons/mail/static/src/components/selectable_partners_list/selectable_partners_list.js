odoo.define('mail/static/src/components/selectable_partners_list/selectable_partners_list.js', function (require) {
'use strict';

const components = {
    SelectablePartner: require('mail/static/src/components/selectable_partner/selectable_partner.js'),
};
const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');
const { Component } = owl;

class SelectablePartnersList extends Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore(
            (...args) => this._useStoreSelector(...args),
        );
        this.selectablePartners = this.env.models['mail.partner'].all();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    patched() {
        const allOrderedAndPinnedChats = this.env.models['mail.partner']
            .all()
            .sort((c1, c2) => c1.displayName < c2.displayName ? -1 : 1);
        // if (!this.discuss.sidebarQuickSearchValue) {
        //     return allOrderedAndPinnedChats;
        // }
        const qsVal = this.props.inputSearch ? this.props.inputSearch : ""; //this.discuss.sidebarQuickSearchValue.toLowerCase();
        this.selectablePartners = allOrderedAndPinnedChats.filter(chat => {
            const nameVal = chat.nameOrDisplayName.toLowerCase();
            return nameVal.includes(qsVal);
        });
    }

    get partners() {
        return this.selectablePartners;
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
            partners: this.partners,
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------


}

Object.assign(SelectablePartnersList, {
    components,
    defaultProps: {
        inputSearch: "",
    },
    props: {
        inputSearch: {
            type: String,
        }
    },
    template: 'mail.SelectablePartnersList',
});

return SelectablePartnersList;

});
