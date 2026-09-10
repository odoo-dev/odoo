import { registry } from "@web/core/registry";

import { Component, xml } from "@odoo/owl";

/**
 * Dev shortcut to the gray-shades test page, /designer_tools.
 *
 * Deliberately lined up with the developer tools menu: same display condition
 * -- `odoo.debug`, which is what DebugModePlugin reads -- and sequence 101
 * against 100, which puts it immediately to its left (the systray renders the
 * registry by decreasing sequence).
 */
class DesignerToolsSystrayItem extends Component {
    static template = xml`
        <a class="o_nav_entry d-none d-md-flex align-items-center"
           href="/designer_tools" target="_blank"
           title="Open designer tools" aria-label="Open designer tools">
            <i class="oi" data-icon="palette" role="img"/>
        </a>`;
}

registry.category("systray").add(
    "web.designer_tools",
    {
        Component: DesignerToolsSystrayItem,
        isDisplayed: () => Boolean(odoo.debug),
    },
    { sequence: 101 }
);
