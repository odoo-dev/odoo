/* @odoo-module */

import { Component } from "@odoo/owl";
import { useRtc } from "@mail/new/rtc/rtc_hook";
import { _t } from "@web/core/l10n/translation";

export class CallActionList extends Component {
    static props = ["thread"];
    static template = "mail.call_action_list_view";

    setup() {
        this.rtc = useRtc();
    }
    get isOfActiveCall() {
        return Boolean(this.props.thread.id === this.rtc?.channel?.id);
    }
    get isSmall() {
        /*
        return Boolean(
            this.callView && this.callView.threadView.compact && !this.callView.isFullScreen
        );
        */
        return false;
    }
    get isMobileDevice() {
        return false; // TODO
    }
    get isDebug() {
        return false; // TODO
    }
    get callButtonTitle() {
        if (this.props.thread?.rtc) {
            return _t("Disconnect");
        } else {
            return _t("Join Call");
        }
    }
    get cameraButtonTitle() {
        if (this.rtc.sendUserVideo) {
            return _t("Stop camera");
        } else {
            return _t("Turn camera on");
        }
    }
    get headphoneButtonTitle() {
        if (this.rtc?.currentRtcSession.isDeaf) {
            return _t("Undeafen");
        } else {
            return _t("Deafen");
        }
    }
    get microphoneButtonTitle() {
        if (this.rtc?.currentRtcSession.isMute) {
            return _t("Unmute");
        } else {
            return _t("Mute");
        }
    }
    get screenSharingButtonTitle() {
        if (this.rtc.sendDisplay) {
            return _t("Stop screen sharing");
        } else {
            return _t("Share screen");
        }
    }
    // discuss refactor: TODO get data from parent of parent somehow.
    get callView() {
        return {
            isFullScreen: false,
            activateFullScreen: () => {},
            deactivateFullScreen: () => {},
        };
    }
    /**
     * @param {MouseEvent} ev
     */
    onClickCamera(ev) {
        this.rtc.toggleUserVideo();
    }
    /**
     * @param {MouseEvent} ev
     */
    async onClickDeafen(ev) {
        if (this.rtc.currentRtcSession.isDeaf) {
            this.rtc.undeafen();
        } else {
            this.rtc.deafen();
        }
    }
    /**
     * @param {MouseEvent} ev
     */
    onClickMicrophone(ev) {
        if (this.rtc.currentRtcSession.isMute) {
            if (this.rtc.currentRtcSession.isSelfMuted) {
                this.rtc.unmute();
            }
            if (this.rtc.currentRtcSession.isDeaf) {
                this.rtc.undeafen();
            }
        } else {
            this.rtc.mute();
        }
    }
    /**
     * @param {MouseEvent} ev
     */
    onClickMore(ev) {
        this.showMore = !this.showMore; // TODO (was only holding the show logs feature anyways)
    }
    /**
     * @param {MouseEvent} ev
     */
    async onClickRejectCall(ev) {
        if (this.rtc.hasPendingRtcRequest) {
            return;
        }
        await this.rtc.leaveCall(this.props.thread.id);
    }
    /**
     * @param {MouseEvent} ev
     */
    onClickScreen(ev) {
        this.rtc.toggleScreenShare();
    }
    /**
     * @param {MouseEvent} ev
     */
    async onClickToggleAudioCall(ev) {
        if (this.rtc.hasPendingRtcRequest) {
            return;
        }
        await this.rtc.toggleCall(this.props.thread.id);
    }
    /**
     * @param {MouseEvent} ev
     */
    async onClickToggleVideoCall(ev) {
        if (this.rtc.hasPendingRtcRequest) {
            return;
        }
        await this.rtc.toggleCall(this.props.thread.id, {
            startWithVideo: true,
        });
    }
}
