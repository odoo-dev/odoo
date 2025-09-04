import { Component } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {Object} Props
 * @property {Object} action
 * @property {Boolean} isSmall
 * @property {Boolean} [isActive]
 * @extends {Component<Props, Env>}
 */
export class CallActionButton extends Component {
    static template = "discuss.CallActionList.button";
    static components = {};
    static props = ["action", "isSmall", "isActive?"];

    setup() {
        this.rtc = useService("discuss.rtc");
    }

    get title() {
        return this.props.action.hotkey
            ? `${this.props.action.name} (${this.props.action.hotkey})`
            : this.props.action.name;
    }

    get isPermissionMissing() {
        switch (this.props.action.id) {
            case "camera-on":
                return this.rtc.state.permissionState.camera !== "granted";
            case "mute":
                return this.rtc.state.permissionState.microphone !== "granted";
            default:
                return false;
        }
    }
}
