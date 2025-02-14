import { Plugin } from "@html_editor/plugin";
import { isEmptyBlock, isProtected } from "@html_editor/utils/dom_info";
import { removeClass } from "@html_editor/utils/dom";
import { childNodes, closestElement, selectElements } from "@html_editor/utils/dom_traversal";
import { closestBlock } from "../utils/blocks";
import { baseContainerGlobalSelector } from "@html_editor/utils/base_container";

export class HintPlugin extends Plugin {
    static id = "hint";
    static dependencies = ["history", "selection"];
    resources = {
        /** Handlers */
        selectionchange_handlers: this.onSelectionChange.bind(this),
        external_history_step_handlers: () => {
            this.clearHints();
            this.onSelectionChange();
        },
        normalize_handlers: this.normalize.bind(this),
        clean_for_save_handlers: ({ root }) => this.clearHints(root),
        content_updated_handlers: this.onSelectionChange.bind(this),

        system_classes: ["o-we-hint"],
        system_attributes: ["o-we-hint-text"],
        ...(this.config.placeholder && {
            hints: [
                {
                    text: this.config.placeholder,
                    target: (selectionData, editable) => {
                        if (
                            selectionData.documentSelectionIsInEditable ||
                            childNodes(editable).length !== 1
                        ) {
                            return;
                        }
                        const el = editable.firstChild;
                        if (isEmptyBlock(el) && el.matches(baseContainerGlobalSelector)) {
                            return el;
                        }
                    },
                },
            ],
        }),
    };

    setup() {
        this.hintedElements = [];
    }

    makeHint(el, text) {
        this.dispatchTo("make_hint_handlers", el);
        el.setAttribute("o-we-hint-text", text);
        el.classList.add("o-we-hint");
        this.hintedElements.push(el);
    }

    normalize() {
        this.clearHints();
        this.addHints();
    }

    onSelectionChange() {
        this.hintedElements.forEach((el) => this.removeHint(el));
        this.hintedElements = [];
        this.addHints();
    }

    addHints() {
        const selectionData = this.dependencies.selection.getSelectionData();
        const { anchorNode, isCollapsed } = selectionData.editableSelection;
        if (!isCollapsed) {
            return;
        }
        const emptyBlock = closestElement(anchorNode, isEmptyBlock);
        for (const hint of this.getResource("hints")) {
            if (hint.selector) {
                // selector-based hint
                if (emptyBlock?.matches(hint.selector)) {
                    this.makeHint(emptyBlock, hint.text);
                    return;
                }
            } else if (hint.addHints(this.makeHint.bind(this), selectionData)) {
                // custom hint(s)
                return;
            }
        }
    }

    /**
     * @param {HTMLElement} [root]
     */
    updateHints() {
        const selectionData = this.dependencies.selection.getSelectionData();
        const editableSelection = selectionData.editableSelection;
        if (this.hint) {
            const blockEl = closestBlock(editableSelection.anchorNode);
            this.removeHint(this.hint);
            this.removeHint(blockEl);
        }
        if (editableSelection.isCollapsed) {
            for (const hint of this.getResource("hints")) {
                if (hint.selector) {
                    const el = closestBlock(editableSelection.anchorNode);
                    if (el && el.matches(hint.selector) && !isProtected(el) && isEmptyBlock(el)) {
                        this.makeHint(el, hint.text);
                        this.hint = el;
                    }
                } else {
                    const target = hint.target(selectionData, this.editable);
                    // Do not replace an existing empty block hint by a temp hint.
                    if (target && !target.classList.contains("o-we-hint")) {
                        this.makeHint(target, hint.text);
                        this.hint = target;
                        return;
                    }
                }
            }
        }
    }

    removeHint(el) {
        el.removeAttribute("o-we-hint-text");
        removeClass(el, "o-we-hint");
        this.getResource("system_style_properties").forEach((n) => el.style.removeProperty(n));
    }

    clearHints(root = this.editable) {
        for (const elem of selectElements(root, ".o-we-hint")) {
            this.removeHint(elem);
        }
        this.hintedElements = [];
    }
}
