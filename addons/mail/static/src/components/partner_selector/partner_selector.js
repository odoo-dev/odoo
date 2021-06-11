/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import SelectablePartnersList from '@mail/components/selectable_partners_list/selectable_partners_list';

const components = { SelectablePartnersList };

const { Component } = owl;

class PartnerSelector extends Component {

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

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _close() {
        this.trigger('o-popover-close');
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    async _onClickCreateGroupChat(ev) {
        await this.invitePartnerList.onClickCreateGroupChat(ev);
        this._close();
    }

    /**
     * @private
     * @param {Event} ev
     */
    async _onClickInviteGroupChat(ev) {
        await this.invitePartnerList.onClickInviteGroupChat(ev);
        this._close();
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onInputSearch(ev) {
        this.invitePartnerList.onInputSearch(ev);
    }

}

Object.assign(PartnerSelector, {
    components,
    props: {
        invitePartnerListLocalId: {
            type: String,
        },
    },
    template: 'mail.PartnerSelector',
});

export default PartnerSelector;
