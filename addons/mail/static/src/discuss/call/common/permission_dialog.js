import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class PermissionDialog extends Component {
    static props = {
        close: Function,
        onClose: { type: Function, optional: true },
        onPrimaryAction: Function,
        onSecondaryAction: Function,
        permissionType: {
            type: String,
            validate: (s) => ["camera", "microphone", "microphone-test"].includes(s),
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

    async close() {
        await this.props.onClose?.();
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
        if (this.props.permissionType === "microphone-test") {
            return _t("Do you want to test your microphone's voice sensitivity?");
        }
        return _t(
            "Do you want people to %s you in the meeting?",
            this.props.permissionType === "microphone" ? _t("hear") : _t("see")
        );
    }

    get permissionNote() {
        const type = this.props.permissionType.includes("microphone")
            ? "microphone"
            : this.props.permissionType;
        return _t("You can still turn off your %s anytime.", type);
    }
}
