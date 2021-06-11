/** @odoo-module **/

import useStore from '@mail/component_hooks/use_store/use_store';
import PartnerImStatusIcon from '@mail/components/partner_im_status_icon/partner_im_status_icon';

const { useRef } = owl.hooks;
const { Component } = owl;

const components = { PartnerImStatusIcon };

class SelectablePartner extends Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.selectionStatusRef = useRef('selection-status');
        useStore(props => {
            const invitePartnerList = this.env.models['mail.selectable_partners_list'].get(this.props.invitePartnerListLocalId);
            const partner = this.env.models['mail.partner'].get(props.partnerLocalId);
            return {
                invitePartnerList: invitePartnerList.__state,
                partner: partner && partner.__state,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    get invitePartnerList() {
        return this.env.models['mail.selectable_partners_list'].get(this.props.invitePartnerListLocalId);
    }

    get partner() {
        return this.env.models['mail.partner'].get(this.props.partnerLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onClick(ev) {
        this.invitePartnerList.onClickPartner(ev, this.partner);
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onInput(ev) {
        this.invitePartnerList.onInputPartnerCheckbox(ev, this.partner);
    }

}

Object.assign(SelectablePartner, {
    components,
    props: {
        invitePartnerListLocalId: {
            type: String,
        },
        partnerLocalId: {
            type: String,
        }
    },
    template: 'mail.SelectablePartner',
});

export default SelectablePartner;
