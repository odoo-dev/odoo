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
            const channelOrderedOfflineMembers = channel ? channel.orderedOfflineMembers : [];
            const channelOrderedOnlineMembers = channel ? channel.orderedOnlineMembers : [];
            return {
                channel,
                channelOrderedOfflineMembers: channelOrderedOfflineMembers.map(member => {
                    return {
                        avatarUrl: member.avatarUrl,
                        imStatus: member.im_status,
                        nameOrDisplayName: member.nameOrDisplayName,
                    };
                }),
                channelOrderedOnlineMembers: channelOrderedOnlineMembers.map(member => {
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
                channelOrderedOfflineMembers: 2, // list + data object
                channelOrderedOnlineMembers: 2, // list + data object
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
