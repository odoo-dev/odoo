import { BaseOptionComponent, useDomState } from "@html_builder/core/utils";
import { BorderConfigurator } from "@html_builder/plugins/border_configurator_option";
import { ShadowOption } from "@html_builder/plugins/shadow_option";
import { onWillStart } from "@odoo/owl";
import { Deferred } from "@web/core/utils/concurrency";

export class HeaderBorderOption extends BaseOptionComponent {
    static template = "website.HeaderBorderOption";
    static props = {};
    static components = { BorderConfigurator, ShadowOption };

    setup() {
        onWillStart(() => {
            const def = new Deferred();
            console.log("HeaderBorderOption setup");

            setTimeout(() => {
                def.resolve();
            }, 2000);
            console.log("HeaderBorderOption setup end");
            return def;
        });
        super.setup();
        this.domState = useDomState((editingElement) => ({
            withRoundCorner: !editingElement.classList.contains("o_header_force_no_radius"),
        }));
    }
}
