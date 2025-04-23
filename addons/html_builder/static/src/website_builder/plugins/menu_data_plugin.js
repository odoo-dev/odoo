import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { NavbarLinkPopover } from "@html_editor/main/link/navbar_link_popover";
import { MenuDialog, EditMenuDialog } from "@website/components/dialog/edit_menu";
import { user } from "@web/core/user";
import { withSequence } from "@html_editor/utils/resource";

class MenuDataPlugin extends Plugin {
    static id = "menuDataPlugin";
    static dependencies = ["overlay"];
    resources = {
        popovers: [
            withSequence(10, {
                name: "NavbarLinkPopover",
                class: NavbarLinkPopover,
                instance: null,
                selected: false,
            }),
        ],

        popover_selector_handlers: withSequence(10, this.selectNavbarLinkPopover.bind(this)),
    };

    selectNavbarLinkPopover(props) {
        const isNavbarLinkPopover =
            props.linkElement.closest(".top_menu, o_extra_menu_items, [data-content_menu_id]") &&
            !props.linkElement.closest(
                ".dropdown-toggle, li.o_header_menu_button a, [data-toggle], .o_offcanvas_logo, .o_mega_menu"
            );

        this.getResource("popovers").find((elem) => elem.name === "NavbarLinkPopover").selected =
            isNavbarLinkPopover;

        if (isNavbarLinkPopover) {
            props.checkIsWebsiteDesigner = () => user.hasGroup("website.group_website_designer");
            props.onClickEditLink = (elem) => {
                const menuEl = elem.props.linkElement.querySelector("[data-oe-id]");
                this.services.dialog.add(MenuDialog, {
                    name: menuEl.textContent,
                    url: menuEl.parentElement.attributes["href"].nodeValue,
                    save: (name, url) => {
                        const websiteId = this.services.website.currentWebsite.id;
                        const data = {
                            id: parseInt(menuEl.attributes["data-oe-id"].nodeValue),
                            name,
                            url,
                        };
                        return this.services.orm
                            .call("website.menu", "save", [websiteId, { data: [data] }])
                            .then(function () {
                                menuEl.parentElement.attributes["href"].nodeValue = url;
                                menuEl.textContent = name;
                            });
                    },
                });
            };
            props.onClickEditMenu = (elem) => {
                const contentMenu = elem.props.linkElement.querySelector("[data-oe-id]");
                const rootID = contentMenu ? parseInt(contentMenu.dataset.oeId, 10) : undefined;
                this.services.dialog.add(EditMenuDialog, {
                    params: [rootID],
                    save: () => {
                        this.config.reloadEditor({ url: this.document.URL });
                    },
                });
            };
        }
    }
}

registry.category("website-plugins").add(MenuDataPlugin.id, MenuDataPlugin);
