/* @odoo-module */

import { Component, onMounted, onWillUnmount } from "@odoo/owl";
import { useRtc } from "@mail/new/rtc/rtc_hook";
import { CallParticipantVideo } from "@mail/new/rtc/call_participant_video";
import { useService } from "@web/core/utils/hooks";

export class CallParticipantCard extends Component {
    static props = ["session", "className"];
    static components = { CallParticipantVideo };
    static template = "mail.call_participant_card";

    setup() {
        this.rtc = useRtc();
        this.user = useService("user");
        onMounted(() => {
            this.rtc.updateVideoDownload(this.props.session, {
                viewCountIncrement: 1,
            })
        });
        onWillUnmount(() => {
            this.rtc.updateVideoDownload(this.props.session, {
                viewCountIncrement: -1,
            })
        });
    }

    get isOfActiveCall() {
        return Boolean(this.props.session.channelId === this.rtc.state.channel?.id);
    }

    get showConnectionState() {
        return Boolean(
            this.isOfActiveCall &&
                !(this.props.session.channelMember?.partnerId === this.user.partnerId) &&
                !["connected", "completed"].includes(this.props.session.connectionState)
        );
    }

    get name() {
        return this.props.session.channelMember?.partner?.name;
    }

    get avatarUrl() {
        return this.props.session.channelMember?.partner?.avatarUrl;
    }

    get hasVideo() {
        return Boolean(this.props.session.videoStream);
    }

    get isMinimized() {
        return this.callView?.isMinimized; // should be in sub env?
    }

    get isTalking() {
        return Boolean(
            this.props.session && this.props.session.isTalking && !this.props.session.isMute
        );
    }

    onClick() {
        return; // TODO
    }

    onContextMenu() {
        return; // TODO
    }

    onClickVolumeAnchor() {
        return; // TODO
    }
}
