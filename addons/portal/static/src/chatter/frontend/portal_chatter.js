import { Chatter } from "@mail/chatter/web_portal/chatter";

import { OverlayContainer } from "@web/core/overlay/overlay_container";
import { Component, xml, useSubEnv } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class PortalChatter extends Component {
    static template = xml`
        <Chatter threadId="props.resId" threadModel="props.resModel" composer="props.composer" twoColumns="props.twoColumns" has_activities="false"/>
        <div class="position-fixed" style="z-index:1030"><OverlayContainer overlays="overlayService.overlays"/></div>
    `;
    static components = { Chatter, OverlayContainer };
    static props = [
        "resId",
        "resModel",
        "portalSecurity",
        "composer",
        "twoColumns",
        "displayRating",
    ];

    setup() {
        useSubEnv({
            displayRating: this.props.displayRating,
            portalSecurity: this.props.portalSecurity,
        });
        this.overlayService = useService("overlay");
    }
}
