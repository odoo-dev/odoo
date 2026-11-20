import { Plugin } from "@html_editor/plugin";
import { closestElement, selectElements } from "@html_editor/utils/dom_traversal";
import { uniqueId } from "@web/core/utils/functions";

export class FieldPlugin extends Plugin {
    static id = "field";
    /** @type {import("plugins").BuilderResources} */
    resources = {
        content_not_editable_selectors: "[data-oe-expression]:not([data-oe-field])",
        dropzone_selectors: {
            restrictSelector: "[data-oe-expression], :has([data-oe-expression])",
            // prevent moving out of the current fragment of view
            dropLockWithin: "[data-oe-model='ir.ui.view'][data-oe-field='arch']",
            // prevent moving inside another field
            excludeAncestor:
                "[data-oe-field]:not([data-oe-model='ir.ui.view'][data-oe-field='arch'])",
        },
        properties: [
            {
                predicate: "[data-oe-expression]",
                splittable: false,
            },
            {
                predicate: "[data-oe-expression], :has([data-oe-expression])",
                savableAsCustomSnippet: false,
            },
        ],
        system_attributes: "data-copied-field-nonces",
        clean_for_save_processors: (rootEl) => {
            rootEl.removeAttribute("data-copied-field-nonces");
            for (const el of selectElements(rootEl, "[data-copied-field-nonce]")) {
                el.removeAttribute("data-copied-field-nonce");
            }
            return rootEl;
        },
        clipboard_content_processors: (clonedContents, selection) => {
            const viewEl = closestElement(
                selection.commonAncestorContainer,
                "[data-oe-model='ir.ui.view'][data-oe-field='arch']"
            );
            const fieldEls = clonedContents.querySelectorAll("[data-oe-expression]");
            if (viewEl && fieldEls.length) {
                const id = uniqueId();
                const existing = viewEl.getAttribute("data-copied-field-nonces");
                viewEl.setAttribute(
                    "data-copied-field-nonces",
                    (existing ? existing + " " : "") + id
                );
                for (const fieldEl of fieldEls) {
                    fieldEl.setAttribute("data-copied-field-nonce", id);
                }
            }
            return clonedContents;
        },
        on_content_inserted_handlers: (insertedNodes) => {
            for (const node of insertedNodes) {
                if (
                    node.nodeType === Node.ELEMENT_NODE &&
                    node.hasAttribute("data-oe-expression")
                ) {
                    /** @type {HTMLElement} */
                    const fieldEl = node;
                    const nonce = fieldEl.getAttribute("data-copied-field-nonce");
                    const viewEl =
                        nonce &&
                        fieldEl.closest("[data-oe-model='ir.ui.view'][data-oe-field='arch']");
                    if (
                        viewEl &&
                        (viewEl.getAttribute("data-copied-field-nonces") ?? "")
                            .split(" ")
                            .includes(nonce)
                    ) {
                        const otherEl = [
                            ...viewEl.querySelectorAll(
                                `[data-oe-model="${fieldEl.dataset.oeModel}"][data-oe-id="${fieldEl.dataset.oeId}"][data-oe-field="${fieldEl.dataset.oeField}"][data-oe-type="${fieldEl.dataset.oeType}"][data-oe-expression="${fieldEl.dataset.oeExpression}"]`
                            ),
                        ]
                            .filter(
                                (el) =>
                                    el.dataset.oeContactOptions === fieldEl.dataset.oeContactOptions
                            )
                            .filter((el) => !insertedNodes.includes(el))
                            .at(0);
                        if (otherEl) {
                            fieldEl.replaceChildren(...otherEl.cloneNode(true).childNodes);
                        }
                    } else {
                        fieldEl.removeAttribute("data-copied-field-nonce");
                        fieldEl.removeAttribute("contenteditable");
                        fieldEl
                            .getAttributeNames()
                            .filter((attr) => attr.startsWith("data-oe-"))
                            .forEach((attr) => fieldEl.removeAttribute(attr));
                        fieldEl.classList.remove("o_dirty", "o_savable");
                        // TODO: remove naked spans? if (fieldEl.tagName === "SPAN" && )
                    }
                }
            }
        },
    };
}
