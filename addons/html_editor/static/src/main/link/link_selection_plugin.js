import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { removeClass } from "@html_editor/utils/dom";
import { isBlock } from "@html_editor/utils/blocks";

export class LinkSelectionPlugin extends Plugin {
    static name = "link_selection";
    static dependencies = ["selection"];
    static resources = (p) => ({
        history_rendering_classes: ["o_link_in_selection"],
        onSelectionChange: p.handleSelectionChange.bind(p),
    });

    handleCommand(command, payload) {
        switch (command) {
            case "CLEAN":
                this.clean(payload.root);
                break;
        }
    }

    // Apply the o_link_in_selection class if the selection is in a single
    // link, remove it otherwise.
    handleSelectionChange(selection) {
        const { anchorNode, focusNode } = selection;
        const [anchorLink, focusLink] = [anchorNode, focusNode].map((node) =>
            closestElement(node, "a:not(.btn)")
        );
        const singleLinkInSelection = anchorLink === focusLink && anchorLink;

        if (singleLinkInSelection && this.isLinkEligibleForZwnbsp(singleLinkInSelection)) {
            singleLinkInSelection.classList.add("o_link_in_selection");
        }

        for (const link of this.editable.querySelectorAll(".o_link_in_selection")) {
            if (link !== singleLinkInSelection) {
                removeClass(link, "o_link_in_selection");
            }
        }
    }

    isLinkEligibleForZwnbsp(link) {
        return (
            link.isContentEditable &&
            this.editable.contains(link) &&
            !(
                [link, ...link.querySelectorAll("*")].some(
                    (el) => el.nodeName === "IMG" || isBlock(el)
                ) || link.matches("nav a, a.nav-link")
            )
        );
    }

    clean(root) {
        for (const link of root.querySelectorAll(".o_link_in_selection")) {
            removeClass(link, "o_link_in_selection");
        }
    }
}
