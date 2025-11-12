import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { patch } from "@web/core/utils/patch";

patch(Navbar.prototype, {
    async setup() {
        super.setup(...arguments);
        this.state.printerStatus = "disconnected";
        if (this.pos.config.network_printer) {
            await this.checkPrinterStatus();
        }
    },
    async checkLongpolling() {
        const deviceIp = this.pos.config.device_ip;

        if (deviceIp) {
            const url = `https://${deviceIp}`;
            window.open(url, "_blank");
        } else {
            console.warn("No device IP configured in pos.config");
        }
        await this.checkPrinterStatus();
        this.checkPrinterStatus();
    },
    async checkPrinterStatus() {
        const { vendor_id, product_id, device_ip } = this.pos.config;
        const payload = {
            vendor_id,
            product_id,
        };
        try {
            const response = await fetch(`https://${device_ip}/printer/status-usb`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            this.state.printerStatus = result.status === "success" ? "connected" : "disconnected";
        } catch {
            this.state.printerStatus = "disconnected";
        }
    },
});
