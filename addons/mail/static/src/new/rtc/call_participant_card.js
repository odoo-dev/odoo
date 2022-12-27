/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useRtc } from "@mail/new/rtc/rtc_hook";
import { session } from "@web/session";
import { CallParticipantVideo } from "@mail/new/rtc/call_participant_video";

export class CallParticipantCard extends Component {
    static props = ["session", "className"];
    static components = { CallParticipantVideo };
    static template = "mail.call_participant_card";

    setup() {
        this.rtc = useRtc();
        this.state = useState({
            session: this.props.session,
        });
    }

    get isOfActiveCall() {
        return Boolean(this.state.session.channelId === this.rtc.state?.channel?.id);
    }

    get showConnectionState() {
        return Boolean(
            this.isOfActiveCall &&
                !(this.state.session?.channelMember?.partnerId === session.partner_id) &&
                !["connected", "completed"].includes(this.state.session.connectionState)
        );
    }

    get name() {
        return this.state.session?.channelMember?.partner?.name;
    }

    get avatarUrl() {
        return this.state.session?.channelMember?.partner?.avatarUrl;
    }

    get hasVideo() {
        return Boolean(this.state.session.videoStream);
    }

    get isMinimized() {
        return this.callView?.isMinimized; // should be in sub env?
    }

    get isTalking() {
        return Boolean(
            this.state.session && this.state.session.isTalking && !this.state.session.isMute
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
