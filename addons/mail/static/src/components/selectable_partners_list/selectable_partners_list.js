/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import SelectablePartner from '@mail/components/selectable_partner/selectable_partner';

const components = { SelectablePartner };
const { Component } = owl;

class SelectablePartnersList extends Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore(props => {
            const invitePartnerList = this.env.models['mail.selectable_partners_list'].get(this.props.invitePartnerListLocalId);
            return {
                invitePartnerList: invitePartnerList.__state,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    get invitePartnerList() {
        return this.env.models['mail.selectable_partners_list'].get(this.props.invitePartnerListLocalId);
    }

}

Object.assign(SelectablePartnersList, {
    components,
    props: {
        invitePartnerListLocalId: {
            type: String,
        },
    },
    template: 'mail.SelectablePartnersList',
});

export default SelectablePartnersList;
