import { LinkPopover } from "./link_popover";

export class NavbarLinkPopover extends LinkPopover {
    static template = "html_editor.navbarLinkPopover";
    static props = {
        ...LinkPopover.props,
        checkIsWebsiteDesigner: Function,
        onClickEditLink: Function,
        onClickEditMenu: Function,
    };

    /**
     * @override
     */
    onClickEdit() {
        this.props.onClickEditLink(this);
    }

    onClickEditMenu() {
        this.props.onClickEditMenu(this);
    }
}
