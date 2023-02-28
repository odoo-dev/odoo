/* @odoo-module */

import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { useRtc } from "@mail/new/rtc/rtc_hook";
import { CallContextMenu } from "@mail/new/rtc/call_context_menu";
import { CallParticipantVideo } from "@mail/new/rtc/call_participant_video";
import { useService } from "@web/core/utils/hooks";
import { isEventHandled, markEventHandled } from "@mail/new/utils/misc";
import { usePopover } from "@web/core/popover/popover_hook";

export class CallParticipantCard extends Component {
    static props = ["className", "cardData", "thread", "minimized?"];
    static components = { CallParticipantVideo };
    static template = "mail.call_participant_card";

    closePopover;

    setup() {
        this.contextMenuAnchorRef = useRef("contextMenuAnchor");
        this.popover = usePopover();
        this.rpc = useService("rpc");
        this.rtc = useRtc();
        this.threadService = useService("mail.thread");
        this.user = useService("user");
        this.userSettings = useState(useService("mail.user_settings"));
        onMounted(() => {
            if (!this.rtcSession) {
                return;
            }
            this.rtc.updateVideoDownload(this.rtcSession, {
                viewCountIncrement: 1,
            });
        });
        onWillUnmount(() => {
            if (!this.rtcSession) {
                return;
            }
            this.rtc.updateVideoDownload(this.rtcSession, {
                viewCountIncrement: -1,
            });
        });
    }

    get isContextMenuAvailable() {
        if (!this.rtcSession) {
            return false;
        }
        return this.rtcSession?.id !== this.rtc.state.selfSession?.id;
    }

    get rtcSession() {
        return this.props.cardData.session;
    }

    get channelMember() {
        return this.rtcSession ? this.rtcSession.channelMember : this.props.cardData.member;
    }

    get isOfActiveCall() {
        return Boolean(this.rtcSession && this.rtcSession.channelId === this.rtc.state.channel?.id);
    }

    get showConnectionState() {
        return Boolean(
            this.isOfActiveCall &&
                !(this.rtcSession.channelMember?.persona.id === this.user.partnerId) &&
                !["connected", "completed"].includes(this.rtcSession.connectionState)
        );
    }

    get name() {
        return this.channelMember?.persona.name;
    }

    get hasVideo() {
        return Boolean(this.rtcSession?.videoStream);
    }

    get isTalking() {
        return Boolean(this.rtcSession && this.rtcSession.isTalking && !this.rtcSession.isMute);
    }

    async onClick(ev) {
        if (isEventHandled(ev, "CallParticipantCard.clickVolumeAnchor")) {
            return;
        }
        if (this.rtcSession) {
            const channel = this.rtcSession.channel;
            if (channel.activeRtcSession === this.rtcSession) {
                channel.activeRtcSession = undefined;
            } else {
                channel.activeRtcSession = this.rtcSession;
            }
            return;
        }
        const channelData = await this.rpc("/mail/rtc/channel/cancel_call_invitation", {
            channel_id: this.props.thread.id,
            member_ids: [this.channelMember.id],
        });
        this.threadService.update(this.props.thread, {
            serverData: {
                invitedMembers: channelData.invitedMembers,
            },
        });
    }

    /**
     * @param {Event} ev
     */
    onContextMenu(ev) {
        ev.preventDefault();
        markEventHandled(ev, "CallParticipantCard.clickVolumeAnchor");
        if (this.closePopover) {
            this.closePopover();
            this.closePopover = undefined;
            return;
        }
        if (!this.contextMenuAnchorRef?.el) {
            return;
        }
        this.closePopover = this.popover.add(
            this.contextMenuAnchorRef.el,
            CallContextMenu,
            {
                onChangeVolume: (ev) => {
                    const volume = Number(ev.target.value);
                    this.userSettings.saveVolumeSetting({
                        guestId: this.rtcSession?.guestId,
                        partnerId: this.rtcSession?.partnerId,
                        volume,
                    });
                    this.rtcSession.volume = volume;
                },
                rtcSession: this.rtcSession,
                volume: this.userSettings.getVolume(this.rtcSession),
            },
            {
                onClose: () => (this.closePopover = undefined),
                position: "bottom",
            }
        );
    }
}
