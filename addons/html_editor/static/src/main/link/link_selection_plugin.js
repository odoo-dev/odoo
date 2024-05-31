import { Plugin } from "@html_editor/plugin";
import { closestElement, descendants } from "@html_editor/utils/dom_traversal";
import { removeClass } from "@html_editor/utils/dom";
import { isBlock } from "@html_editor/utils/blocks";
import { prepareUpdate } from "@html_editor/utils/dom_state";
import { leftPos } from "@html_editor/utils/position";

/*
    This plugin solves selection issues around links (allowing the cursor at the
    inner and outer edges of links).

    Every link receives 4 zero-width non-breaking spaces (unicode FEFF
    characters, hereafter referred to as ZWNBSP):
    - one before the link
    - one as the link's first child
    - one as the link's last child
    - one after the link
    like so: `//ZWNBSP//<a>//ZWNBSP//label//ZWNBSP//</a>//ZWNBSP`.

    A visual indication ( `o_link_in_selection` class) is added to a link when
    the selection is contained within it.

    This is not applied in the following cases:

    - in a navbar (since its links are managed via the snippets system, not
    via pure edition) and, similarly, in .nav-link links
    - in links that have content more complex than simple text
    - on non-editable links or links that are not within the editable area
 */
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
            case "NORMALIZE":
                this.normalize(payload.root || this.editable);
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

        // Remove all FEFF within a `prepareUpdate` to make sure to make <br>
        // nodes visible if needed.
        for (const node of descendants(root)) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.includes("\uFEFF")) {
                // @todo: isn't rightPos needed as well?
                const restore = prepareUpdate(...leftPos(node));
                node.textContent = node.textContent.replaceAll("\uFEFF", "");
                restore(); // Make sure to make <br>s visible if needed.
            }
        }
    }

    /**
     * Take a link and pad it with non-break zero-width spaces to ensure that it
     * is always possible to place the cursor at its inner and outer edges.
     *
     * @param {HTMLElement} editable
     * @param {HTMLAnchorElement} link
     */
    padLinkWithZws(link) {
        if (!this.isLinkEligibleForZwnbsp(link)) {
            // Only add the ZWNBSP for simple (possibly styled) text links, and
            // never in a nav.
            return;
        }
        if (!link.textContent.startsWith("\uFEFF")) {
            link.prepend(this.document.createTextNode("\uFEFF"));
        }
        if (!link.textContent.endsWith("\uFEFF")) {
            link.append(this.document.createTextNode("\uFEFF"));
        }
        if (!(link.previousSibling && link.previousSibling.textContent.endsWith("\uFEFF"))) {
            link.before(this.document.createTextNode("\uFEFF"));
        }
        if (!(link.nextSibling && link.nextSibling.textContent.startsWith("\uFEFF"))) {
            link.after(this.document.createTextNode("\uFEFF"));
        }
    }

    normalize(root) {
        // @todo review the need for "root" parameter
        depthFirstPreOrderTraversal(root, (node) => this.updateZWNBSPs(node, root));
    }

    // @todo: ZWNBSPs are not removed in the case it is in the middle of link
    updateZWNBSPs(node, root) {
        if (node.nodeName === "A") {
            // Ensure links have ZWNBSPs so the selection can be set at their edges.
            this.padLinkWithZws(node);
        } else if (
            node.nodeType === Node.TEXT_NODE &&
            node.textContent.includes("\uFEFF") &&
            !closestElement(node, "a") &&
            // @todo review the need for "root" parameter
            // This apparently depends on the selection state. Should it?
            // Does it have to do with preserving cursor (avoid messing the selection)?
            !(
                closestElement(root, "[contenteditable=true]") &&
                this.shared.getTraversedNodes().includes(node)
            )
        ) {
            // Remove link ZWNBSP not in selection.
            const startsWithLegitZws =
                node.textContent.startsWith("\uFEFF") &&
                node.previousSibling &&
                node.previousSibling.nodeName === "A";
            const endsWithLegitZws =
                node.textContent.endsWith("\uFEFF") &&
                node.nextSibling &&
                node.nextSibling.nodeName === "A";
            let newText = node.textContent.replace(/\uFEFF/g, "");
            if (startsWithLegitZws) {
                newText = "\uFEFF" + newText;
            }
            if (endsWithLegitZws) {
                newText = newText + "\uFEFF";
            }
            if (newText !== node.textContent) {
                // We replace the text node with a new text node with the
                // update text rather than just changing the text content of
                // the node because these two methods create different
                // mutations and at least the tour system breaks if all we
                // send here is a text content change.
                const newTextNode = this.document.createTextNode(newText);
                node.before(newTextNode);
                node.remove();
                node = newTextNode;
            }
        }
    }
}

// @todo move this elsewhere, consider unifying with list's applyToTree
/**
 * @param {Node} root
 * @param {Function} callback
 */
function depthFirstPreOrderTraversal(root, callback) {
    callback(root);
    // Frozen childNodes list
    const childNodes = [...root.childNodes];
    for (const child of childNodes) {
        depthFirstPreOrderTraversal(child, callback);
    }
}

/*
TODO:
- handle insertion of a link eligible for ZWNBSP (age's commit ajusts selection
    in the insert command)
*/
