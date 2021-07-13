/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import { PartnerImStatusIcon } from '@mail/components/partner_im_status_icon/partner_im_status_icon';

const { Component } = owl;

const components = { PartnerImStatusIcon };

export class ChannelMemberList extends Component {

    /**
     * @override
     */
    setup() {
        useShouldUpdateBasedOnProps();
        useModels();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread}
     */
    get channel() {
        return this.env.models['mail.thread'].get(this.props.channelLocalId);
    }

}

Object.assign(ChannelMemberList, {
    components,
    props: {
        channelLocalId: String,
    },
    template: 'mail.ChannelMemberList',
});
