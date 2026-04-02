/* global Carousel */

import { useRef } from "@web/owl2/utils";
import { Component, onMounted, onWillStart, onWillUnmount } from "@odoo/owl";
import { useSelf } from "@pos_self/app/services/self_service";
import { useService } from "@web/core/utils/hooks";
import { LanguagePopup } from "@pos_self/app/components/language_popup/language_popup";
import { session } from "@web/session";

export class LandingPage extends Component {
    static template = "pos_self.LandingPage";
    static props = {};

    setup() {
        this.selfOrder = useSelf();
        this.router = useService("router");
        this.dialog = useService("dialog");
        this.carouselRef = useRef("carousel");
        this.activeSelected = false;
        this.carouselInterval = null;

        onWillStart(() => {
            this.onWillStart();
            this.selfOrder.rpcLoading = false;
        });

        onMounted(() => {
            if (this.selfOrder.config._self_ordering_image_home_ids.length > 1) {
                // used to init carousel after components mount / unmount
                const carousel = new Carousel(this.carouselRef.el);

                // prevent traceback when no image is set
                this.carouselInterval = setInterval(
                    () => {
                        carousel.next();
                    },
                    session.test_mode ? 100 : 5000
                );
            }
        });

        onWillUnmount(() => {
            clearInterval(this.carouselInterval);
        });
    }

    // Override by children modules
    onWillStart() {}
    start() {}

    get currentLanguage() {
        return this.selfOrder.currentLanguage;
    }

    get languages() {
        return this.selfOrder.config.self_ordering_available_language_ids;
    }

    get activeImage() {
        if (!this.activeSelected) {
            this.activeSelected = true;
            return "active";
        }
        return "";
    }

    get draftOrder() {
        return this.selfOrder.models["pos.order"].filter(
            (o) => o.access_token && o.state === "draft"
        );
    }

    openLanguages() {
        this.dialog.add(LanguagePopup);
    }
}
