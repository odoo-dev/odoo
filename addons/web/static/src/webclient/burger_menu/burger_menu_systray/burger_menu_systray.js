import { registry } from "@web/core/registry";
import { Component, onMounted } from "@odoo/owl";
import { ErrorHandler } from "@web/core/utils/components";
import { useRef } from "@web/owl2/utils";

const systrayRegistry = registry.category("systray");
export class BurgerMenuSystray extends Component {
    static template = "web.BurgerMenuSystray";
    static components = { ErrorHandler };

    setup() {
        super.setup();
        this.root = useRef("root");
        this.excludedBurger = ["burger_menu"];
        onMounted(() => {
            if (this.root.el) {
                for (const child of this.root.el.children) {
                    const node = child.querySelector("[title], [aria-label]");
                    if (node) {
                        // child.classList.add("d-block text-body py-2");
                        node.append(node.title || node.ariaLabel || "");
                    }
                }
            }
        });
    }

    get systrayItems() {
        return systrayRegistry
            .getEntries()
            .map(([key, value]) => ({ key, ...value }))
            .filter((item) => !this.excludedBurger.includes(item.key))
            .filter((item) => ("isDisplayed" in item ? item.isDisplayed(this.env, true) : true))
            .reverse();
    }

    handleItemError(error, item) {
        // remove the faulty component
        item.isDisplayed = () => false;
        Promise.resolve().then(() => {
            throw error;
        });
    }
}
