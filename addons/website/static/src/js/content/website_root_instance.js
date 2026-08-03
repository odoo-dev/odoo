/** @odoo-module alias=root.widget */

import { createPublicRoot } from "@web/legacy/js/public/public_root";
import lazyloader from "@web/legacy/js/public/lazyloader";
import { WebsiteRoot } from "./website_root";

const prom = createPublicRoot(WebsiteRoot).then(async (rootInstance) => {
    if (window.frameElement) {
        // TEMP repro diagnostic, revert before commit
        console.log(`TEMP repro: PUBLIC-ROOT-READY dispatch t=${performance.now().toFixed(1)}`);
        window.dispatchEvent(new CustomEvent("PUBLIC-ROOT-READY", { detail: { rootInstance } }));
    }
    return rootInstance;
});
lazyloader.registerPageReadinessDelay(prom);
export default prom;
