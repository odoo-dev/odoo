import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

const deviceService = {
    async start(env) {
        let deviceUUID = localStorage.getItem("printer_device_uuid");

        if (!deviceUUID) {
            deviceUUID = crypto.randomUUID();
            localStorage.setItem("printer_device_uuid", deviceUUID);
        }

        try {
            await rpc("/printer/client_device/register", {
                device_uuid: deviceUUID,
                display_name: navigator.platform,
            });
        } catch (error) {
            console.warn("Failed to register client device", error);
        }
    },
};

registry.category("services").add("printer_device_service", deviceService);
