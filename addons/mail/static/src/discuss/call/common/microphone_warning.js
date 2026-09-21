import { Component, useProps, types as t } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class MicrophoneWarning extends Component {
    static template = "discuss.MicrophoneWarning";
    static components = {};

    props = useProps({ close: t.function() });

    setup() {
        super.setup();
        this.rtc = useService("discuss.rtc");
    }

    onClickClose() {
        if (this.rtc.showMicrophonePermissionWarning) {
            this.rtc.isMicrophonePermissionWarningDismissed = true;
        }
        this.props.close();
    }

    onClickUnmute() {
        this.props.close();
        return this.rtc.toggleMicrophone();
    }

    onClickDismissForever() {
        this.rtc.isMicrophoneMuteWarningDismissed = true;
        this.props.close();
    }
}
