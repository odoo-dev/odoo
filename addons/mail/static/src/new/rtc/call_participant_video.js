/* @odoo-module */

import { Component, useRef } from "@odoo/owl";
import { useRtc } from "@mail/new/rtc/rtc_hook";
import { useUpdate } from "@mail/component_hooks/use_update";

export class CallParticipantVideo extends Component {
    static props = ["session"];
    static template = "mail.call_participant_video";

    setup() {
        this.rtc = useRtc();
        this.root = useRef("root");
        useUpdate({ func: () => this._update() });
    }

    _update() {
        if (!this.root.el) {
            return;
        }
        if (!this.props.session || !this.props.session.videoStream) {
            this.root.el.srcObject = undefined;
        } else {
            this.root.el.srcObject = this.props.session.videoStream;
        }
        this.root.el.load();
    }

    async onVideoLoadedMetaData(ev) {
        try {
            await ev.target.play();
        } catch (error) {
            if (typeof error === "object" && error.name === "NotAllowedError") {
                // Ignored as some browsers may reject play() calls that do not
                // originate from a user input.
                return;
            }
            throw error;
        }
    }
}
