import { Component, plugin, props, useEffect, xml } from "@odoo/owl";
import { PopoverPlugin } from "@web_core/popover/popover_plugin";

class MenuPopover extends Component {
    static template = "web_core.MenuPopover";
}

export class Menu extends Component {
    static template = xml``;

    controls = props({
        anchor: Function,
        isOpen: Function,
    });

    content = props(["slots"]);

    popover = plugin(PopoverPlugin).createPopover(this.controls.anchor, {
        component: MenuPopover,
        props: {
            slots: this.content.slots,
        },
    });

    setup() {
        useEffect(() => {
            if (this.controls.isOpen()) {
                this.popover.open();
            } else {
                this.popover.close();
            }
        });
    }
}

export class MenuItem extends Component {
    static template = "web_core.MenuItem";

    props = props({
        isActive: { type: Boolean, optional: true, defaultValue: false },
        onSelected: Function,
    });
}
