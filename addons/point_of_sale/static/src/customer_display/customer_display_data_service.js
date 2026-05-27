import { proxy } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { PosWebrtcService } from "@point_of_sale/app/utils/webRTC/pos_webrtc";

export const CustomerDisplayDataService = {
    dependencies: ["bus_service"],
    async start(env, services) {
        return this.setup(...arguments);
    },
    async setup(env, { bus_service }) {
        const data = proxy({});
        const webrtc = new PosWebrtcService(
            env,
            `CUSTOMER-DISPLAY-${session.device_uuid}`,
            session.access_token,
            session.config_id
        );
        webrtc.addListener((payload) => {
            Object.assign(data, payload);
        });
        window.webrtc = webrtc;
        return data;
    },
};

registry.category("services").add("customer_display_data", CustomerDisplayDataService);
