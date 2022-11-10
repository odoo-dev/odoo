/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useRtc } from "@mail/new/rtc/rtc_hook";
import { session } from "@web/session";
import { CallParticipantVideo } from "@mail/new/rtc/call_participant_video";

export class CallParticipantCard extends Component {
    static props = ["rtcSession", "className"];
    static components = { CallParticipantVideo };
    static template = "mail.call_participant_card";

    setup() {
        this.rtc = useRtc();
        this.state = useState({
            rtcSession: this.props.rtcSession,
        });
    }
    get isOfActiveCall() {
        return Boolean(this.state.rtcSession.channelId === this.rtc?.channel?.id);
    }
    get showConnectionState() {
        return Boolean(
            this.isOfActiveCall &&
                !(this.state.rtcSession?.channelMember?.partnerId === session.partner_id) &&
                !["connected", "completed"].includes(this.state.rtcSession.connectionState)
        );
    }
    get name() {
        return this.state.rtcSession?.channelMember?.partner?.name;
    }
    get avatarUrl() {
        return this.state.rtcSession?.channelMember?.partner?.avatarUrl;
    }
    get hasVideo() {
        return Boolean(this.state.rtcSession.videoStream);
    }
    get isMinimized() {
        return this.callView?.isMinimized; // should be in sub env?
    }
    get isTalking() {
        return Boolean(
            this.state.rtcSession &&
                this.state.rtcSession.isTalking &&
                !this.state.rtcSession.isMute
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
