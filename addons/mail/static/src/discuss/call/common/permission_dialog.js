import { Component } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";

export class PermissionDialog extends Component {
    static props = {
        close: Function,
        onPrimaryAction: Function,
        onSecondaryAction: Function,
        permissionType: {
            type: String,
            validate: (s) => ["camera", "microphone"].includes(s),
        },
    };
    static template = "discuss.PermissionDialog";

    async onClickPrimary() {
        await this.props.onPrimaryAction();
        this.props.close();
    }
    async onClickSecondary() {
        await this.props.onSecondaryAction();
        this.props.close();
    }

    get primaryActionText() {
        return this.props.permissionType === "camera" ? _t("Use Camera") : _t("Use Microphone");
    }

    get secondaryActionText() {
        switch (this.props.permissionType) {
            case "camera":
                return _t("Join without camera");
            case "microphone":
                return _t("Use Microphone and Camera");
            default:
                return _t("Skip");
        }
    }

    get permissionPrompt() {
        return _t(
            "Do you want people to %s you in the meeting?",
            this.props.permissionType === "microphone" ? _t("hear") : _t("see")
        );
    }

    get permissionNote() {
        return _t("You can still turn off your %s anytime.", this.props.permissionType);
    }
}
