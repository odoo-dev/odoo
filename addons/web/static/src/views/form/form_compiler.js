/** @odoo-module **/

import { registry } from "@web/core/registry";
import {
    combineAttributes,
    createElement,
    createTextNode,
    toStringExpression,
    getTag,
} from "@web/core/utils/xml";
import {
    append,
    applyInvisible,
    copyAttributes,
    getModifier,
    isAlwaysInvisible,
    isComponentNode,
    makeSeparator,
} from "@web/views/helpers/view_compiler";
import { ViewCompiler } from "../helpers/view_compiler";

const compilersRegistry = registry.category("form_compilers");

function appendAttf(el, attr, string) {
    const attrKey = `t-attf-${attr}`;
    const attrVal = el.getAttribute(attrKey);
    el.setAttribute(attrKey, appendToExpr(attrVal, string));
}

function appendToExpr(expr, string) {
    const re = /{{.*}}/;
    const oldString = re.exec(expr);
    if (oldString) {
        string = `${oldString} ${string}`;
    }
    return `{{${string} }}`;
}

/**
 * @param {Record<string, any>} obj
 * @returns {string}
 */
function objectToString(obj) {
    return `{${Object.entries(obj)
        .map((t) => t.join(":"))
        .join(",")}}`;
}

export class FormCompiler extends ViewCompiler {
    setup() {
        this.encounteredFields = {};
        /** @type {Record<string, Element[]>} */
        this.labels = {};
        this.compilers = compilersRegistry.getAll();
    }

    compile() {
        const compiled = super.compile(...arguments);
        compiled.children[0].setAttribute("t-ref", "compiled_view_root");
        return compiled;
    }

    createLabelFromField(fieldId, fieldName, fieldString, label, params) {
        const props = {
            id: `'${fieldId}'`,
            fieldName: `'${fieldName}'`,
            record: "record",
            fieldInfo: `fieldNodes['${fieldId}']`,
        };
        let labelText = label.textContent || fieldString;
        labelText = labelText
            ? toStringExpression(labelText)
            : `record.fields['${fieldName}'].string`;
        return createElement("FormLabel", {
            "t-props": objectToString(props),
            string: labelText,
        });
    }

    /**
     * @param {string} fieldName
     * @returns {Element[]}
     */
    getLabels(fieldName) {
        const labels = this.labels[fieldName] || [];
        this.labels[fieldName] = null;
        return labels;
    }

    /**
     * @param {string} fieldName
     * @param {Element} label
     */
    pushLabel(fieldName, label) {
        this.labels[fieldName] = this.labels[fieldName] || [];
        this.labels[fieldName].push(label);
    }

    // ------------------------------------------------------------------------
    // Compilers
    // ------------------------------------------------------------------------

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileButtonBox(el, params) {
        el.classList.remove("oe_button_box");
        const buttonBox = createElement("ButtonBox");
        let slotId = 0;

        for (const child of el.children) {
            const invisible = getModifier(child, "invisible");
            if (isAlwaysInvisible(invisible, params)) {
                continue;
            }
            const mainSlot = createElement("t", {
                "t-set-slot": `slot_${slotId++}`,
                isVisible:
                    invisible !== false ? `!evalDomain(record,${JSON.stringify(invisible)})` : true,
            });
            append(mainSlot, this.compileNode(child, params, false, true));
            append(buttonBox, mainSlot);
        }

        return buttonBox;
    }

    /**
     * @param {Element} el
     * @returns {Element}
     */
    compileField(el, params) {
        const field = super.compileField(el, params);

        const fieldName = el.getAttribute("name");
        const fieldString = el.getAttribute("string");
        const fieldId = el.getAttribute("field_id") || fieldName;
        const labelsForAttr = el.getAttribute("id") || fieldId;
        const labels = this.getLabels(labelsForAttr);
        const dynamicLabel = (label) => {
            const formLabel = this.createLabelFromField(
                fieldId,
                fieldName,
                fieldString,
                label,
                params
            );
            label.replaceWith(formLabel);
            return formLabel;
        };
        for (const label of labels) {
            dynamicLabel(label);
        }
        this.encounteredFields[fieldName] = dynamicLabel;
        return field;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileForm(el, params) {
        const form = createElement("div");
        form.setAttribute(
            `t-attf-class`,
            "{{props.record.isInEdition ? 'o_form_editable' : 'o_form_readonly'}}"
        );
        if (params.className) {
            form.setAttribute("t-att-class", params.className);
        }
        let hasSheet = false;
        for (const child of el.childNodes) {
            hasSheet = hasSheet || getTag(child, true) === "sheet";
            append(form, this.compileNode(child, params));
        }
        if (!hasSheet) {
            form.className = "o_form_nosheet";
        }
        return form;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileGenericNode(el, params) {
        if (
            getTag(el, true) === "div" &&
            el.getAttribute("name") === "button_box" &&
            el.children.length
        ) {
            return this.compileButtonBox(el, params);
        }
        return super.compileGenericNode(el, params);
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileGroup(el, params) {
        const isOuterGroup = [...el.children].some((c) => getTag(c, true) === "group");
        const formGroup = createElement(isOuterGroup ? "OuterGroup" : "InnerGroup");

        let slotId = 0;
        let sequence = 0;

        if (el.hasAttribute("col")) {
            formGroup.setAttribute("maxCols", el.getAttribute("col"));
        }

        if (el.hasAttribute("string")) {
            const titleSlot = createElement("t", { "t-set-slot": "title" }, [
                makeSeparator(el.getAttribute("string")),
            ]);
            append(formGroup, titleSlot);
        }

        let forceNewline = false;
        for (const child of el.children) {
            if (getTag(child, true) === "newline") {
                forceNewline = true;
                continue;
            }

            const invisible = getModifier(child, "invisible");
            if (isAlwaysInvisible(invisible, params)) {
                continue;
            }

            const mainSlot = createElement("t", {
                "t-set-slot": `item_${slotId++}`,
                type: "'item'",
                sequence: sequence++,
                "t-slot-scope": "scope",
            });
            let itemSpan = parseInt(child.getAttribute("colspan") || "1", 10);

            if (forceNewline) {
                mainSlot.setAttribute("newline", true);
                forceNewline = false;
            }

            let slotContent;
            if (getTag(child, true) === "field") {
                const addLabel = child.hasAttribute("nolabel")
                    ? child.getAttribute("nolabel") !== "1"
                    : true;
                slotContent = this.compileNode(child, params, false, true);
                if (addLabel && !isOuterGroup) {
                    itemSpan = itemSpan === 1 ? itemSpan + 1 : itemSpan;
                    const fieldName = child.getAttribute("name");
                    const fieldId = slotContent.getAttribute("id") || fieldName;
                    const props = {
                        id: `${fieldId}`,
                        fieldName: `'${fieldName}'`,
                        record: "record",
                        string: child.hasAttribute("string")
                            ? toStringExpression(child.getAttribute("string"))
                            : `record.fields.${fieldName}.string`,
                        fieldInfo: `fieldNodes[${fieldId}]`,
                    };
                    // note: remove this oe_read/edit_only logic when form view
                    // will always be in edit mode
                    if (child.classList.contains("oe_read_only")) {
                        props.className = `'oe_read_only'`;
                    } else if (child.classList.contains("oe_edit_only")) {
                        props.className = `'oe_edit_only'`;
                    }
                    mainSlot.setAttribute("props", objectToString(props));
                    mainSlot.setAttribute("Component", "constructor.components.FormLabel");
                    mainSlot.setAttribute("subType", "'item_component'");
                }
            } else {
                if (child.classList.contains("o_td_label") || getTag(child, true) === "label") {
                    mainSlot.setAttribute("subType", "'label'");
                    child.classList.remove("o_td_label");
                }
                slotContent = this.compileNode(child, params, false, true);
            }

            if (slotContent) {
                if (invisible !== false) {
                    mainSlot.setAttribute(
                        "isVisible",
                        `!evalDomain(record,${JSON.stringify(invisible)})`
                    );
                }
                if (itemSpan > 0) {
                    mainSlot.setAttribute("itemSpan", `${itemSpan}`);
                }

                const groupClassExpr = `scope && scope.className`;
                if (isComponentNode(slotContent)) {
                    if (getTag(child, true) !== "button") {
                        if (slotContent.hasAttribute("class")) {
                            mainSlot.prepend(
                                createElement("t", {
                                    "t-set": "addClass",
                                    "t-value": groupClassExpr,
                                })
                            );
                            combineAttributes(
                                slotContent,
                                "class",
                                `(addClass ? " " + addClass : "")`,
                                `+`
                            );
                        } else {
                            slotContent.setAttribute("class", groupClassExpr);
                        }
                    }
                } else {
                    appendAttf(slotContent, "class", `${groupClassExpr} || ""`);
                }
                append(mainSlot, slotContent);
                append(formGroup, mainSlot);
            }
        }
        return formGroup;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileHeader(el, params) {
        const statusBar = createElement("div");
        statusBar.className = "o_form_statusbar";
        const buttons = [];
        const others = [];
        for (const child of el.childNodes) {
            const compiled = this.compileNode(child, params);
            if (!compiled) {
                continue;
            }
            if (getTag(child, true) === "button") {
                buttons.push(compiled);
            } else {
                if (getTag(child, true) === "field") {
                    compiled.setAttribute("showTooltip", true);
                }
                others.push(compiled);
            }
        }
        if (buttons.length) {
            const divButtons = createElement("div");
            divButtons.className = "o_statusbar_buttons";
            append(divButtons, buttons);
            append(statusBar, divButtons);
        }
        append(statusBar, others);
        return statusBar;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileLabel(el, params) {
        const forAttr = el.getAttribute("for");
        // A label can contain or not the labelable Element it is referring to.
        // If it doesn't, there is no `for=`
        // Otherwise, the targetted element is somewhere else among its nextChildren
        if (forAttr) {
            let label = createElement("label");
            const string = el.getAttribute("string");
            if (string) {
                append(label, createTextNode(string));
            }
            if (this.encounteredFields[forAttr]) {
                label = this.encounteredFields[forAttr](label);
            } else {
                this.pushLabel(forAttr, label);
            }
            return label;
        }
        return this.compileGenericNode(el, params);
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileNotebook(el, params) {
        const noteBook = createElement("Notebook");
        const pageAnchors = [...document.querySelectorAll("[href^=\\#]")]
            .map((a) => CSS.escape(a.getAttribute("href").substring(1)))
            .filter((a) => a.length);
        const noteBookAnchors = {};

        if (el.hasAttribute("class")) {
            noteBook.setAttribute("className", `"${el.getAttribute("class")}"`);
            el.removeAttribute("class");
        }

        for (const child of el.children) {
            if (getTag(child, true) !== "page") {
                continue;
            }
            const invisible = getModifier(child, "invisible");
            if (isAlwaysInvisible(invisible, params)) {
                continue;
            }

            const pageSlot = createElement("t");
            append(noteBook, pageSlot);

            if (el.hasAttribute("name")) {
                noteBook.setAttribute("name", `"${el.getAttribute("name")}"`);
                el.removeAttribute("name");
            }
            
            const pageId = `page_${this.id++}`;
            const pageTitle = toStringExpression(
                child.getAttribute("string") || child.getAttribute("name") || ""
            );
            const pageNodeName = toStringExpression(child.getAttribute("name") || "");

            pageSlot.setAttribute("t-set-slot", pageId);
            pageSlot.setAttribute("title", pageTitle);
            pageSlot.setAttribute("name", pageNodeName);

            if (child.getAttribute("autofocus") === "autofocus") {
                noteBook.setAttribute("defaultPage", `"${pageId}"`);
            }

            for (const anchor of child.querySelectorAll("[href^=\\#]")) {
                const anchorValue = CSS.escape(anchor.getAttribute("href").substring(1));
                if (!anchorValue.length) continue;
                pageAnchors.push(anchorValue);
                noteBookAnchors[anchorValue] = {
                    origin: `'${pageId}'`,
                };
            }

            let isVisible;
            if (invisible === false) {
                isVisible = "true";
            } else {
                isVisible = `!evalDomain(record,${JSON.stringify(invisible)})`;
            }
            pageSlot.setAttribute("isVisible", isVisible);

            for (const contents of child.children) {
                append(pageSlot, this.compileNode(contents, params));
            }
        }

        if (pageAnchors.length) {
            // If anchors from the page are targetting an element
            // present in the notebook, it must be aware of the
            // page that contains the corresponding element
            for (const anchor of pageAnchors) {
                let pageId = 1;
                for (const child of el.children) {
                    if (child.querySelector(`#${anchor}`)) {
                        noteBookAnchors[anchor].target = `'page_${pageId}'`;
                        noteBookAnchors[anchor] = objectToString(noteBookAnchors[anchor]);
                        break;
                    }
                    pageId++;
                }
            }
            noteBook.setAttribute("anchors", objectToString(noteBookAnchors));
        }

        return noteBook;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileSeparator(el, params = {}) {
        const separator = makeSeparator(el.getAttribute("string"));
        copyAttributes(el, separator);
        return applyInvisible(getModifier(el, "invisible"), separator, params);
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileSheet(el, params) {
        const sheetBG = createElement("div");
        sheetBG.className = "o_form_sheet_bg";

        const sheetFG = createElement("div");
        sheetFG.className = "o_form_sheet";

        append(sheetBG, sheetFG);
        for (const child of el.childNodes) {
            const compiled = this.compileNode(child, params);
            if (!compiled) {
                continue;
            }
            if (getTag(child, true) === "field") {
                compiled.setAttribute("showTooltip", true);
            }
            append(sheetFG, compiled);
        }
        return sheetBG;
    }
}
