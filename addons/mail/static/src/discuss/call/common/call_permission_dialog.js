import { Component } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

export class CallPermissionDialog extends Component {
    static components = { Dialog };
    static props = {
        permissionType: {
            type: String,
            validate: (s) => ["camera", "microphone"].includes(s),
        },
    };
    static template = "discuss.CallPermissionDialog";

    setup() {
        this.rtc = useService("discuss.rtc");
    }

    async onClickUseMicrophone() {
        if (await this.rtc.askForPermission({ audio: true })) {
            await this.rtc.unmute();
        }
        this.props.close();
    }

    async onClickUseCamera() {
        if (await this.rtc.askForPermission({ video: true })) {
            await this.rtc.toggleVideo("camera", { force: true, refreshStream: true });
        }
        this.props.close();
    }

    async onClickUseMicAndCamera() {
        if (await this.rtc.askForPermission({ audio: true, video: true })) {
            await Promise.all([this.rtc.mute(), this.rtc.toggleVideo("camera", { force: true })]);
        }
        this.props.close();
    }

    get primaryActionText() {
        return this.props.permissionType === "camera" ? _t("Use Camera") : _t("Use Microphone");
    }

    get permissionPrompt() {
        if (this.props.permissionType === "microphone") {
            return _t("Do you want people to hear you in the meeting?");
        }
        return _t("Do you want people to see you in the meeting?");
    }

    get permissionNote() {
        return _t("You can still turn off your %s anytime.", this.props.permissionType);
    }
}
