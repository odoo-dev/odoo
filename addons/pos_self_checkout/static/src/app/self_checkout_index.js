import { Component } from "@odoo/owl";
import { MainComponentsContainer } from "@web/core/main_components_container";
import { useSelf } from "@pos_self/app/services/self_service";
import { Router } from "@pos_self/app/router";
import { LandingPage } from "@pos_self/app/pages/landing_page/landing_page";
import { ScanningPage } from "@pos_self_checkout/app/pages/scanning_page/scanning_page";
import { LoadingOverlay } from "@pos_self/app/components/loading_overlay/loading_overlay";
import { hasTouch } from "@web/core/browser/feature_detection";
import { init as initDebugFormatters } from "@point_of_sale/app/utils/debug-formatter";
import { useBarcodeReader } from "@point_of_sale/app/hooks/barcode_reader_hook";

export class selfCheckoutIndex extends Component {
    static template = "pos_self_checkout.selfCheckoutIndex";
    static props = [];
    static components = {
        Router,
        LandingPage,
        ScanningPage,
        LoadingOverlay,
        MainComponentsContainer,
    };

    setup() {
        this.selfOrder = useSelf();
        window.posmodel = this.selfOrder;

        // Disable cursor on touch devices (required on IoT Box Kiosk)
        if (hasTouch()) {
            document.body.classList.add("touch-device");
        }

        if (this.env.debug) {
            initDebugFormatters();
        }

        // Add barcode reader support for product scanning
        useBarcodeReader({
            product: this.selfOrder._barcodeProductAction.bind(this.selfOrder),
        });
    }
    get selfIsReady() {
        return this.selfOrder.models["product.product"].length > 0;
    }
}
