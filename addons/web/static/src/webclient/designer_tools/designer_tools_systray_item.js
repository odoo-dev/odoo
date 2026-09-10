import { browser } from "@web/core/browser/browser";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

import { Component, xml } from "@odoo/owl";

/**
 * The designer tools, gathered in the systray the way o_debug_manager gathers
 * the developer ones.
 *
 * Entries come from the "designer" registry rather than from a list here: the
 * icon browser is served by html_editor, which owns the Material Symbols
 * metadata, and web cannot depend on html_editor. So each addon contributes
 * the entries for the pages it serves, and this menu knows none of them.
 *
 * Deliberately lined up with the developer tools menu: same display condition
 * -- `odoo.debug`, which is what DebugModePlugin reads -- and sequence 101
 * against 100, which puts it immediately to its left (the systray renders the
 * registry by decreasing sequence).
 */
const designerRegistry = registry.category("designer");

class DesignerToolsMenu extends Component {
    static components = { Dropdown, DropdownItem };
    static template = xml`
        <div class="o_designer_manager">
            <Dropdown position="'bottom-end'">
                <button class="o_nav_entry o-dropdown--narrow d-none d-md-flex align-items-center"
                        title="Open designer tools" aria-label="Open designer tools">
                    <i class="oi" data-icon="palette" role="img"/>
                </button>
                <t t-set-slot="content">
                    <DropdownItem t-foreach="this.items" t-as="item" t-key="item.href"
                        onSelected="() => this.open(item.href)"
                        attrs="{ href: item.href, target: '_blank' }">
                        <t t-out="item.description"/>
                    </DropdownItem>
                </t>
            </Dropdown>
        </div>`;

    get items() {
        return designerRegistry.getAll();
    }

    /**
     * DropdownItem cancels the native navigation of an item carrying an href
     * (see its onClick), so the href is there for the middle click and the
     * status bar only -- opening is on us, as runUnitTestsItem does too.
     */
    open(href) {
        browser.open(href);
    }
}

registry.category("systray").add(
    "web.designer_tools",
    {
        Component: DesignerToolsMenu,
        isDisplayed: () => Boolean(odoo.debug),
    },
    { sequence: 101 }
);

designerRegistry.add(
    "web.grayShades",
    {
        description: _t("Gray shades"),
        href: "/designer_tools",
    },
    { sequence: 10 }
);
