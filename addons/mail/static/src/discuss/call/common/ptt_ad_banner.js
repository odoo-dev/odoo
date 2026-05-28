import { useState } from "@web/owl2/utils";
import { Component } from "@odoo/owl";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { useService } from "@web/core/utils/hooks";

export class PttAdBanner extends Component {
    static template = "discuss.pttAdBanner";
    static props = {};
    static LOCAL_STORAGE_KEY = "ptt_ad_banner_discarded";

    setup() {
        super.setup();
        this.pttExtService = useService("discuss.ptt_extension");
        this.store = useService("mail.store");
        this.state = useState({
            wasDiscarded: localStorage.getItem(PttAdBanner.LOCAL_STORAGE_KEY),
        });
    }

    onClickClose() {
        localStorage.setItem(PttAdBanner.LOCAL_STORAGE_KEY, true);
        this.state.wasDiscarded = true;
    }

    get isVisible() {
        return (
            !this.pttExtService.isEnabled &&
            this.store.settings.usePushToTalk &&
            !isMobileOS() &&
            !this.state.wasDiscarded
        );
    }
}
