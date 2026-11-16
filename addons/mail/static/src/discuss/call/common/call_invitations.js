import { CallInvitation } from "@mail/discuss/call/common/call_invitation";

import { Component, usePlugin } from "@odoo/owl";

import { OverlayPlugin } from "@web/core/overlay/overlay_plugin";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class CallInvitations extends Component {
    static components = { CallInvitation };
    static template = "discuss.CallInvitations";

    setup() {
        super.setup();
        this.rtc = useService("discuss.rtc");
        this.store = useService("mail.store");
    }
}

export const callInvitationsService = {
    dependencies: ["discuss.rtc", "mail.store"],
    start(env, services) {
        const overlay = usePlugin(OverlayPlugin);
        /** @type {import("models").Store} */
        const store = services["mail.store"];
        store.onChange(
            () => [store.ringingChannels.length > 0],
            (hasRingingChannels) => {
                if (hasRingingChannels) {
                    return overlay.add(CallInvitations, {});
                }
            }
        );
    },
};
registry.category("services").add("discuss.call_invitations", callInvitationsService);
