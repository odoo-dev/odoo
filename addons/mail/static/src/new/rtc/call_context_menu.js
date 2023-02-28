/* @odoo-module */

import { Component, onMounted, onWillUnmount } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { sprintf } from "@web/core/utils/strings";
import { _t } from "@web/core/l10n/translation";

const PROTOCOLS_TEXT = { host: "HOST", srflx: "STUN", prflx: "STUN", relay: "TURN" };

export class CallContextMenu extends Component {
    static props = ["onChangeVolume", "rtcSession", "volume", "close?"];
    static template = "mail.call_context_menu";

    updateStatsTimeout;

    setup() {
        onMounted(() => {
            if (!this.env.debug) {
                return;
            }
            this.props.rtcSession.updateStats();
            this.updateStatsTimeout = browser.setInterval(
                () => this.props.rtcSession.updateStats(),
                3000
            );
        });
        onWillUnmount(() => browser.clearInterval(this.updateStatsTimeout));
    }

    get inboundConnectionTypeText() {
        if (!this.props.rtcSession.remoteCandidateType) {
            return _t("no connection");
        }
        return sprintf(_t("%(candidateType)s (%(protocol)s)"), {
            candidateType: this.props.rtcSession.remoteCandidateType,
            protocol: PROTOCOLS_TEXT[this.props.rtcSession.remoteCandidateType],
        });
    }

    get outboundConnectionTypeText() {
        if (!this.props.rtcSession.localCandidateType) {
            return _t("no connection");
        }
        return sprintf(_t("%(candidateType)s (%(protocol)s)"), {
            candidateType: this.props.rtcSession.localCandidateType,
            protocol: PROTOCOLS_TEXT[this.props.rtcSession.localCandidateType],
        });
    }
}
