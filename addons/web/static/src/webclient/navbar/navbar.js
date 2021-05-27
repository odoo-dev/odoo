/** @odoo-module **/

import { Dropdown } from "../../core/dropdown/dropdown";
import { DropdownItem } from "../../core/dropdown/dropdown_item";
import { useService } from "../../core/service_hook";
import { useEffect } from "../../core/effect_hook";
import { registry } from "../../core/registry";
import { debounce } from "../../core/utils/timing";

const { Component, hooks } = owl;
const { useExternalListener } = hooks;
const systrayRegistry = registry.category("systray");

export class MenuDropdown extends Dropdown {
    setup() {
        super.setup();
        useEffect(() => {
            if (this.props.xmlid) {
                const toggler = this.el.querySelector("button.o_dropdown_toggler");
                toggler.dataset.menuXmlid = this.props.xmlid;
            }
        }, () => []);
    }
}
MenuDropdown.props.xmlid = {
    type: String,
    optional: true,
};

export class MenuItem extends DropdownItem {
    setup() {
        super.setup();
        useEffect(() => {
            if (this.props.payload.xmlid) {
                this.el.dataset.menuXmlid = this.props.payload.xmlid;
            }
        }, () => []);
    }
}

export class NavBar extends Component {
    setup() {
        this.currentAppSectionsExtra = [];
        this.actionService = useService("action");
        this.menuService = useService("menu");
        const debouncedAdapt = debounce(this.adapt.bind(this), 250);
        useExternalListener(window, "resize", debouncedAdapt);
    }

    mounted() {
        this.adapt();
        const renderAndAdapt = async () => {
            await this.render();
            await this.adapt();
        };
        systrayRegistry.on("UPDATE", this, renderAndAdapt);
        this.env.bus.on("MENUS:APP-CHANGED", this, renderAndAdapt);
    }

    willUnmount() {
        systrayRegistry.off("UPDATE", this);
        this.env.bus.off("MENUS:APP-CHANGED", this);
    }

    get currentApp() {
        return this.menuService.getCurrentApp();
    }

    get currentAppSections() {
        return (
            (this.currentApp && this.menuService.getMenuAsTree(this.currentApp.id).childrenTree) ||
            []
        );
    }

    get systrayItems() {
        return systrayRegistry
            .getAll()
            .filter((Item) => ("isDisplayed" in Item ? Item.isDisplayed(this.env) : true))
            .reverse();
    }

    /**
     * Adapt will check the available width for the app sections to get displayed.
     * If not enough space is available, it will replace by a "more" menu
     * the least amount of app sections needed trying to fit the width.
     *
     * NB: To compute the widths of the actual app sections, a render needs to be done upfront.
     *     By the end of this method another render may occur depending on the adaptation result.
     */
    async adapt() {
        if (!this.el) {
            // currently, the promise returned by 'render' is resolved at the end of
            // the rendering even if the component has been destroyed meanwhile, so we
            // may get here and have this.el unset
            return;
        }

        // ------- Initialize -------
        // Check actual "more" dropdown state
        const moreDropdown = this.el.querySelector(".o_menu_sections_more");
        const initialAppSectionsExtra = this.currentAppSectionsExtra;
        const firstInitialAppSectionExtra = [...initialAppSectionsExtra].shift();
        const initialAppId = firstInitialAppSectionExtra && firstInitialAppSectionExtra.appID;

        // Restore (needed to get offset widths)
        const sections = [
            ...this.el.querySelectorAll(".o_menu_sections > *:not(.o_menu_sections_more)"),
        ];
        sections.forEach((s) => s.classList.remove("d-none"));
        this.currentAppSectionsExtra = [];
        moreDropdown.classList.add("d-none");

        // ------- Check overflowing sections -------
        const sectionsMenu = this.el.querySelector(".o_menu_sections");
        const sectionsAvailableWidth = sectionsMenu.offsetWidth;
        const sectionsTotalWidth = sections.reduce((sum, s) => sum + s.offsetWidth, 0);
        if (sectionsAvailableWidth < sectionsTotalWidth) {
            // Sections are overflowing, show "more" menu
            moreDropdown.classList.remove("d-none");
            let width = moreDropdown.offsetWidth;
            for (const section of sections) {
                if (sectionsAvailableWidth < width + section.offsetWidth) {
                    // Last sections are overflowing
                    const overflowingSections = sections.slice(sections.indexOf(section));
                    overflowingSections.forEach((s) => {
                        // Hide from normal menu
                        s.classList.add("d-none");
                        // Show inside "more" menu
                        const sectionId = s
                            .querySelector("[data-section]")
                            .getAttribute("data-section");
                        const currentAppSection = this.currentAppSections.find(
                            (appSection) => appSection.id.toString() === sectionId
                        );
                        this.currentAppSectionsExtra.push(currentAppSection);
                    });
                    break;
                }
                width += section.offsetWidth;
            }
        }

        // ------- Final rendering -------
        const firstCurrentAppSectionExtra = [...this.currentAppSectionsExtra].shift();
        const currentAppId = firstCurrentAppSectionExtra && firstCurrentAppSectionExtra.appID;
        if (
            initialAppSectionsExtra.length === this.currentAppSectionsExtra.length &&
            initialAppId === currentAppId
        ) {
            // Do not render if more menu items stayed the same.
            return;
        }
        return this.render();
    }

    onNavBarDropdownItemSelection(ev) {
        const { payload: menu } = ev.detail;
        if (menu) {
            this.menuService.selectMenu(menu);
        }
    }
}
NavBar.template = "web.NavBar";
NavBar.components = { MenuDropdown, MenuItem };
