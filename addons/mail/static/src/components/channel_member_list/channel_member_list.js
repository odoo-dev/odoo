/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import PartnerImStatusIcon from '@mail/components/partner_im_status_icon/partner_im_status_icon';

const { Component } = owl;

const components = { PartnerImStatusIcon };

export class ChannelMemberList extends Component {

    /**
     * @override
     */
    setup() {
        useShouldUpdateBasedOnProps();
        useStore(props => {
            const channel = this.env.models['mail.thread'].get(props.channelLocalId);
            const channelMembers = channel ? channel.members : [];
            return {
                channel,
                channelMembers: channelMembers.map(member => {
                    return {
                        avatarUrl: member.avatarUrl,
                        imStatus: member.im_status,
                        nameOrDisplayName: member.nameOrDisplayName,
                    };
                }),
                isMobile: this.env.messaging.device.isMobile,
            };
        }, {
            compareDepth: {
                channelMembers: 2, // list + data object
            },
        });
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
