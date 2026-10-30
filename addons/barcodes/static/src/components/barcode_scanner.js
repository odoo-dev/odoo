import { _t } from "@web/core/l10n/translation";
import { scanBarcode } from "@web/core/barcode/barcode_dialog";
import { isBarcodeScannerSupported } from "@web/core/barcode/barcode_video_scanner";
import { Component, t, useProps, usePlugin } from "@odoo/owl";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";

export class BarcodeScanner extends Component {
    static template = "barcodes.BarcodeScanner";

    props = useProps({
        onBarcodeScanned: t.function(),
    });

    setup() {
        this.notification = usePlugin(NotificationPlugin);
        this.isBarcodeScannerSupported = isBarcodeScannerSupported();
        this.scanBarcode = () => scanBarcode(this.env, this.facingMode);
    }

    get facingMode() {
        return "environment";
    }

    async openMobileScanner() {
        let error = null;
        let barcode = null;
        try {
            barcode = await this.scanBarcode();
        } catch (err) {
            error = err.message;
        }

        if (barcode) {
            this.props.onBarcodeScanned(barcode);
            if ("vibrate" in window.navigator) {
                window.navigator.vibrate(100);
            }
        } else {
            this.notification.add(error || _t("Please, Scan again!"), {
                type: "warning",
            });
        }
    }
}
