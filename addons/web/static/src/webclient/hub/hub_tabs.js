import { Component, signal, t, useProps } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { Transition } from "@web/core/transition";
import { useService } from "@web/core/utils/hooks";
import { useSortable } from "@web/core/utils/sortable_owl";

export class HubTabs extends Component {
    static template = "web.HubTabs";
    static components = { Dropdown, DropdownItem, Transition };
    props = useProps({
        hub: t.any(),
    });
    ui = useService("ui");
    root = signal.ref();

    setup() {
        this.items = this.props.hub.items;
        useSortable({
            ref: this.root,
            elements: ".o_hub_tab",
            cursor: "move",
            delay: 200,
            tolerance: 10,
            onWillStartDrag: ({ element, addClass }) => addClass(element, "o_hub_tab_dragged"),
            onDrop: (params) => this.onTabDrop(params),
        });
    }

    getPinnedItems() {
        const items = this.items();
        return this.props.hub
            .pinnedItemKeys()
            .map((key) => items.find((item) => item.key === key))
            .filter(Boolean);
    }

    /**
     * Move the dropped tab after ``previous`` (or first), and save that order.
     * Keys of removed items are dropped from the pins along the way.
     */
    onTabDrop({ element, previous }) {
        const itemKey = element.dataset.key;
        const pinnedItemKeys = this.getPinnedItems()
            .map((item) => item.key)
            .filter((key) => key !== itemKey);
        const index = previous ? pinnedItemKeys.indexOf(previous.dataset.key) + 1 : 0;
        pinnedItemKeys.splice(index, 0, itemKey);
        this.props.hub.saveSetting({ pinned_item_keys: pinnedItemKeys });
    }

    isPinned(item) {
        return this.props.hub.pinnedItemKeys().includes(item.key);
    }

    /**
     * Pin ``item`` as the last tab, or unpin it if it is pinned.
     */
    togglePin(item) {
        const pinnedItemKeys = this.props.hub.pinnedItemKeys().filter((key) => key !== item.key);
        if (!this.isPinned(item)) {
            pinnedItemKeys.push(item.key);
        }
        this.props.hub.saveSetting({ pinned_item_keys: pinnedItemKeys });
    }

    openHubItem(item, newWindow) {
        this.props.hub.openItem(item, { newWindow });
    }
}
