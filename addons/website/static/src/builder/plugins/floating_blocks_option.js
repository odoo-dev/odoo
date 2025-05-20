import { BaseOptionComponent, useDomState } from "@html_builder/core/utils";
import { BorderConfigurator } from "@html_builder/plugins/border_configurator_option";
import { AddElementOption } from "@website/builder/plugins/layout_option/add_element_option";
import { isMobileView } from "@html_builder/utils/utils";
import { renderToElement } from "@web/core/utils/render";

export class FloatingBlocksOption extends BaseOptionComponent {
    static template = "website.FloatingBlocksOption";
    static props = {};
    setup() {
        super.setup();
        // The "No card" message must be injected on start and *before* the
        // removal of the last block, otherwise the snippet could be
        // automatically removed by the editor during edition.
        const el = this.env.getEditingElement().querySelector(".s_floating_blocks_wrapper");
        if (!el.querySelector(".s_floating_blocks_alert_empty")) {
            const alertEl = renderToElement("website.s_floating_blocks.alert.empty");
            el.appendChild(alertEl);
        }
    }
}

export class FloatingBlocksBlockOption extends BaseOptionComponent {
    static template = "website.FloatingBlocksBlockOption";
    static components = {
        BorderConfigurator,
        AddElementOption,
    };
    static props = {};
    setup() {
        super.setup();
    }
}

export class FloatingBlocksBlockMobileOption extends BaseOptionComponent {
    static template = "website.FloatingBlocksBlockMobileOption";
    static components = {};
    static props = {};
    setup() {
        super.setup();
        this.state = useDomState((editingElement) => ({
            isMobileView: isMobileView(editingElement),
        }));
    }
}
