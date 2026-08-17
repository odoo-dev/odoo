import { registry } from "@web/core/registry";
import { SIZES } from "@web/core/ui/ui_service";
import {
    append,
    combineAttributes,
    createElement,
    createTextNode,
    getTag,
} from "@web/core/utils/xml";
import { toStringExpression } from "@web/views/utils";
import {
    copyAttributes,
    getModifier,
    isComponentNode,
    isTextNode,
    makeSeparator,
} from "@web/views/view_compiler";
import { ViewCompiler } from "../view_compiler";
import { exprToBoolean } from "@web/core/utils/strings";

const compilersRegistry = registry.category("form_compilers");

function appendAttf(el, attr, string) {
    const attrKey = `t-attf-${attr}`;
    const attrVal = el.getAttribute(attrKey);
    el.setAttribute(attrKey, appendToExpr(attrVal, string));
}

function appendToExpr(expr, string) {
    const re = /{{.*}}/;
    const oldString = re.exec(expr);
    return oldString ? `${oldString} {{${string} }}` : `{{${string} }}`;
}

/**
 * @param {Record<string, any>} obj
 * @returns {string}
 */
export function objectToString(obj) {
    return `{${Object.entries(obj)
        .map((t) => t.join(":"))
        .join(",")}}`;
}

export class FormCompiler extends ViewCompiler {
    setup() {
        this.encounteredFields = {};
        /** @type {Record<string, Element[]>} */
        this.labels = {};
        this.noteBookId = 0;
        this.compilers.push(
            ...compilersRegistry.getAll(),
            { selector: "div[name='button_box']", fn: this.compileButtonBox },
            { selector: "footer", fn: this.compileFooter },
            { selector: "form", fn: this.compileForm, doNotCopyAttributes: true },
            { selector: "group", fn: this.compileGroup },
            { selector: "header", fn: this.compileHeader },
            { selector: "label", fn: this.compileLabel, doNotCopyAttributes: true },
            { selector: "notebook", fn: this.compileNotebook },
            { selector: "setting", fn: this.compileSetting },
            { selector: "separator", fn: this.compileSeparator },
            { selector: "sheet", fn: this.compileSheet }
        );
    }

    compile(key, params = {}) {
        const compiled = super.compile(...arguments);
        if (!params.isSubView) {
            compiled.children[0].setAttribute("t-ref", "__comp__.rootRef");
        }
        return compiled;
    }

    createLabelFromField(fieldId, fieldName, fieldString, label, params) {
        let labelText = label.textContent || fieldString;
        if (label.hasAttribute("data-no-label")) {
            labelText = toStringExpression("");
        } else {
            labelText = labelText
                ? toStringExpression(labelText)
                : `__comp__.props.record.fields['${fieldName}'].string`;
        }
        const formLabel = createElement("FormLabel", {
            id: `'${fieldId}'`,
            fieldName: `'${fieldName}'`,
            record: `__comp__.props.record`,
            fieldInfo: `__comp__.props.archInfo.fieldNodes['${fieldId}']`,
            className: `"${label.className}"`,
            string: labelText,
        });
        const condition = label.getAttribute("t-if");
        if (condition) {
            formLabel.setAttribute("t-if", condition);
        }
        return formLabel;
    }

    /**
     * Labels the fields that are displayed as a box on small screens without
     * belonging to a group, as the arch seldom labels them.
     *
     * @param {Element} arch a form arch node
     */
    addImplicitLabels(arch) {
        // an "o_outlined" element is displayed as a box, and so is the element
        // holding the field of a title (usually a heading)
        for (const box of arch.querySelectorAll(".o_outlined, .oe_title > *")) {
            if (this.addImplicitLabel(box)) {
                box.classList.add("o_outlined");
            }
        }
    }

    /**
     * Adds a <label/> to the field of an element displayed as a box on small
     * screens (@see form_controller_m3.scss), unless the arch labels it itself.
     * Such a label defaults to the name of the field, is drawn over the border of
     * the box and is only displayed in that layout.
     *
     * @param {Element} box
     * @returns {boolean} whether the box holds a field
     */
    addImplicitLabel(box) {
        if (box.closest("group")) {
            return false; // the cells of a group are labelled by "compileInnerGroup"
        }
        const fieldNode = getTag(box, true) === "field" ? box : box.querySelector("field");
        if (!fieldNode) {
            return false;
        }
        if (!this.hasArchLabel(fieldNode)) {
            const label = createElement("label", {
                for: fieldNode.getAttribute("id") || fieldNode.getAttribute("name"),
                class: "o_label_implicit d-md-none",
            });
            const invisible = box.getAttribute("invisible");
            if (invisible) {
                label.setAttribute("invisible", invisible); // hidden along with its box
            }
            box.before(label);
        }
        return true;
    }

    /**
     * The root of the view a given arch node belongs to. A nested view (e.g. the
     * list of an x2many field) is always defined inside a <field/>, whose content
     * is compiled apart: its nodes don't take part in the view holding the field.
     *
     * @param {Element} node
     * @returns {Element|Document}
     */
    getArchViewRoot(node) {
        return node.parentElement?.closest("field") || node.getRootNode();
    }

    /**
     * Whether the arch defines a <label/> targeting the given field node. In that
     * case, no default label must be generated for it.
     *
     * @param {Element} fieldNode
     * @returns {boolean}
     */
    hasArchLabel(fieldNode) {
        const forAttr = fieldNode.getAttribute("id") || fieldNode.getAttribute("name");
        const viewRoot = this.getArchViewRoot(fieldNode);
        // a label of a nested view doesn't label the fields of this one, even
        // though it may target the same field name
        return [...viewRoot.querySelectorAll(`label[for='${forAttr}']`)].some(
            (label) => this.getArchViewRoot(label) === viewRoot
        );
    }

    /**
     * Props of the FormLabel of a field, defaulting to the name of that field.
     *
     * @param {Element} fieldNode a field arch node
     * @returns {Record<string, string>|null} null if no label can be generated
     */
    getFieldLabelProps(fieldNode) {
        const fieldId = fieldNode.getAttribute("field_id");
        const fieldName = fieldNode.getAttribute("name");
        if (!fieldId || !fieldName) {
            return null;
        }
        const string = fieldNode.getAttribute("string");
        return {
            id: `'${fieldId}'`,
            fieldName: `'${fieldName}'`,
            record: `__comp__.props.record`,
            string:
                string === null
                    ? `__comp__.props.record.fields.${fieldName}.string`
                    : toStringExpression(string),
            fieldInfo: `__comp__.props.archInfo.fieldNodes['${fieldId}']`,
        };
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

    //-----------------------------------------------------------------------------
    // Compilers
    //-----------------------------------------------------------------------------

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileButtonBox(el, params) {
        if (!el.children.length) {
            return this.compileGenericNode(el, params);
        }

        el.classList.remove("oe_button_box");
        const buttonBox = createElement("ButtonBox");
        buttonBox.setAttribute("t-if", "!__comp__.env.inDialog");
        let slotId = 0;
        let hasContent = false;
        for (const child of el.children) {
            const invisible = getModifier(child, "invisible");
            if (!params.compileInvisibleNodes && (invisible === "True" || invisible === "1")) {
                continue;
            }
            hasContent = true;
            let isVisibleExpr;
            if (!invisible || invisible === "False" || invisible === "0") {
                isVisibleExpr = "true";
            } else if (invisible === "True" || invisible === "1") {
                isVisibleExpr = "false";
            } else {
                isVisibleExpr = `!__comp__.evaluateBooleanExpr(${JSON.stringify(
                    invisible
                )},__comp__.props.record.evalContextWithVirtualIds)`;
            }
            const mainSlot = createElement("t", {
                "t-set-slot": `slot_${slotId++}`,
                isVisible: isVisibleExpr,
            });
            if (child.tagName === "button" || child.children.tagName === "button") {
                child.classList.add(
                    "oe_stat_button",
                    "btn",
                    "btn-outline-secondary",
                    "flex-grow-1",
                    "flex-lg-grow-0"
                );
            }
            if (child.tagName === "field") {
                child.classList.add("d-inline-block", "mb-0", "z-0");
            }
            append(mainSlot, this.compileNode(child, params, false));
            append(buttonBox, mainSlot);
        }

        return hasContent ? buttonBox : "";
    }

    compileButton(el, params) {
        return super.compileButton(el, params);
    }

    /**
     * @override
     */
    compileField(el, params) {
        const field = super.compileField(el, params);

        const fieldName = el.getAttribute("name");
        params.notebookPageFields?.push(fieldName);
        const fieldString = el.getAttribute("string");
        const fieldId = el.getAttribute("field_id");
        const labelsForAttr = el.getAttribute("id") || fieldName;
        const labels = this.getLabels(labelsForAttr);
        const dynamicLabel = (label) => {
            const formLabel = this.createLabelFromField(fieldId, fieldName, fieldString, label, {
                ...params,
                currentFieldArchNode: el,
            });
            if (formLabel) {
                label.replaceWith(formLabel);
            } else {
                label.remove();
            }
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
        this.addImplicitLabels(el);
        let sheetNode = null;
        for (const sheet of el.querySelectorAll("sheet")) {
            if (sheet.closest("form") === el) {
                sheetNode = sheet;
                break;
            }
        }
        const displayClasses = sheetNode
            ? `d-flex d-print-block {{ __comp__.uiService.size < ${SIZES.XXL} ? "flex-column" : "flex-nowrap h-100" }}`
            : "d-block";
        const stateClasses =
            "{{ __comp__.props.record.dirty ? 'o_form_dirty' : !__comp__.props.record.isNew ? 'o_form_saved' : '' }}";
        const form = createElement("div", {
            class: "o_form_renderer",
            "t-att-class": "__comp__.props.class",
            "t-attf-class": `{{__comp__.props.record.isInEdition ? 'o_form_editable' : 'o_form_readonly'}} ${displayClasses} ${stateClasses}`,
        });
        if (!sheetNode) {
            for (const child of el.childNodes) {
                // ButtonBox are already compiled for the control panel and should not
                // be recompiled for the renderer of the view
                if (child.attributes?.name?.value !== "button_box") {
                    append(form, this.compileNode(child, params));
                }
            }
            form.classList.add("o_form_nosheet");
        } else {
            let compiledList = [];
            for (const child of el.childNodes) {
                const compiled = this.compileNode(child, params);
                if (getTag(child, true) === "sheet") {
                    append(form, compiled);
                    compiled.prepend(...compiledList);
                    compiledList = [];
                } else if (compiled) {
                    compiledList.push(compiled);
                }
            }
            append(form, compiledList);
        }
        return form;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileFooter(el, params) {
        const footer = createElement("t");
        const replace = el.getAttribute("replace");
        if (replace && !exprToBoolean(replace)) {
            footer.append(
                createElement("t", {
                    "t-call": "web.DefaultButtonsSlot",
                    "t-call-context": "{ __owl__: __comp__.__owl__ }",
                })
            );
        }
        copyAttributes(el, footer);
        for (const child of el.childNodes) {
            const compiled = this.compileNode(child, params);
            if (compiled) {
                footer.append(compiled);
            }
        }
        return footer;
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
            if (!params.compileInvisibleNodes && (invisible === "True" || invisible === "1")) {
                continue;
            }

            const mainSlot = createElement("t", {
                "t-set-slot": `item_${slotId++}`,
                type: "'item'",
                sequence: sequence++,
                "t-slot-scope": "scope",
            });
            let itemSpan = parseInt(child.getAttribute("colspan") || "1", 10);
            let noBox = false;

            if (forceNewline) {
                mainSlot.setAttribute("newline", true);
                forceNewline = false;
            }

            if (getTag(child, true) === "separator") {
                itemSpan = parseInt(formGroup.getAttribute("maxCols") || 2, 10);
                noBox = true;
            }

            if (child.matches("div[class='clearfix']:empty")) {
                itemSpan = parseInt(formGroup.getAttribute("maxCols") || 2, 10);
            }

            let slotContent;
            if (getTag(child, true) === "field") {
                const addLabel = child.hasAttribute("nolabel")
                    ? !exprToBoolean(child.getAttribute("nolabel"))
                    : true;
                slotContent = this.compileNode(child, { ...params, currentSlot: mainSlot }, false);
                // On small screens, a field is displayed inside a box whose label is drawn
                // over its border: it thus always needs a label. When the arch asks for
                // none (and doesn't provide one itself), an implicit label is added: it is
                // only displayed in that layout and takes no space in the grid.
                const implicit = !addLabel && !this.hasArchLabel(child);
                const props = addLabel || implicit ? this.getFieldLabelProps(child) : null;
                if (slotContent && props && !isOuterGroup && !isTextNode(slotContent)) {
                    if (implicit) {
                        mainSlot.setAttribute("implicitLabel", "true");
                    } else {
                        itemSpan = itemSpan === 1 ? itemSpan + 1 : itemSpan;
                    }
                    mainSlot.setAttribute("props", objectToString(props));
                    mainSlot.setAttribute("Component", "__comp__.constructor.components.FormLabel");
                    mainSlot.setAttribute("subType", "'item_component'");
                }
            } else {
                // TODO: When every apps will be revamp, we could remove the condition using 'o_td_label' in favor of 'o_wrap_label'
                if (
                    child.classList.contains("o_wrap_label") ||
                    child.classList.contains("o_td_label") ||
                    getTag(child, true) === "label"
                ) {
                    mainSlot.setAttribute("subType", "'label'");
                    child.classList.remove("o_wrap_label");
                }
                slotContent = this.compileNode(child, { ...params, currentSlot: mainSlot }, false);
            }

            if (slotContent && !isTextNode(slotContent)) {
                let isVisibleExpr;
                if (!invisible || invisible === "False" || invisible === "0") {
                    isVisibleExpr = "true";
                } else if (invisible === "True" || invisible === "1") {
                    isVisibleExpr = "false";
                } else {
                    isVisibleExpr = `!__comp__.evaluateBooleanExpr(${JSON.stringify(
                        invisible
                    )},__comp__.props.record.evalContextWithVirtualIds)`;
                }
                mainSlot.setAttribute("isVisible", isVisibleExpr);
                if (itemSpan > 0) {
                    mainSlot.setAttribute("itemSpan", `${itemSpan}`);
                }
                if (noBox) {
                    mainSlot.setAttribute("noBox", "true");
                }

                const groupClassExpr = `scope && scope.className`;
                if (isComponentNode(slotContent)) {
                    if (getTag(slotContent) === "FormLabel") {
                        mainSlot.prepend(
                            createElement("t", {
                                "t-set": "addClass",
                                "t-value": groupClassExpr,
                            })
                        );
                        combineAttributes(
                            slotContent,
                            "className",
                            `(addClass ? " " + addClass : "")`,
                            `+`
                        );
                    } else if (getTag(child, true) !== "button") {
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
        const statusBar = createElement("div", {
            "t-att-class": "{ 'shadow-sm': __comp__.state.isStatusbarStickyPinned }",
        });
        statusBar.className = "o_form_statusbar d-flex justify-content-between py-2";
        const buttons = [];
        const others = [];
        for (const child of el.childNodes) {
            const compiled = this.compileNode(child, params);
            if (!compiled || isTextNode(compiled)) {
                continue;
            }
            if (getTag(child, true) === "field" && !child.classList.contains("btn")) {
                compiled.setAttribute("showTooltip", true);
                others.push(compiled);
            } else {
                if (compiled.tagName === "ViewButton") {
                    compiled.setAttribute("defaultRank", "'btn-secondary'");
                }
                buttons.push(compiled);
            }
        }
        let slotId = 0;
        const statusBarButtons = createElement("StatusBarButtons");
        for (const button of buttons) {
            const slot = createElement("t", {
                "t-set-slot": `button_${slotId++}`,
                isVisible: button.getAttribute("t-if") || true,
            });
            append(slot, button);
            append(statusBarButtons, slot);
        }
        append(statusBar, statusBarButtons);
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
            copyAttributes(el, label);
            const string = el.getAttribute("string");
            if (string) {
                append(label, createTextNode(string));
            } else if (string === "") {
                label.setAttribute("data-no-label", "true");
            }
            if (this.encounteredFields[forAttr]) {
                label = this.encounteredFields[forAttr](label);
            } else {
                this.pushLabel(forAttr, label);
            }
            return label;
        }
        const res = this.compileGenericNode(el, params);
        copyAttributes(el, res);
        return res;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileNotebook(el, params) {
        const noteBookId = this.noteBookId++;
        const noteBook = createElement("Notebook");

        if (el.hasAttribute("class")) {
            noteBook.setAttribute("className", toStringExpression(el.getAttribute("class")));
            el.removeAttribute("class");
        }

        noteBook.setAttribute(
            "defaultPage",
            `__comp__.props.record.isNew ? undefined : __comp__.props.activeNotebookPages[${noteBookId}]`
        );
        noteBook.setAttribute(
            "onPageUpdate",
            `(page) => __comp__.props.onNotebookPageChange(${noteBookId}, page)`
        );
        noteBook.setAttribute(
            "onWillActivatePage",
            `(page) => __comp__.onWillChangeNotebookPage?.(${noteBookId}, page)`
        );

        for (const child of el.children) {
            if (getTag(child, true) !== "page") {
                continue;
            }
            const invisible = getModifier(child, "invisible");
            if (!params.compileInvisibleNodes && (invisible === "True" || invisible === "1")) {
                continue;
            }

            const pageSlot = createElement("t");
            append(noteBook, pageSlot);

            const pageId = `page_${this.id++}`;
            const pageTitle = toStringExpression(
                child.getAttribute("string") || child.getAttribute("name") || ""
            );
            const pageNodeName = toStringExpression(child.getAttribute("name") || "");

            pageSlot.setAttribute("t-set-slot", pageId);
            pageSlot.setAttribute("title", pageTitle);
            pageSlot.setAttribute("name", pageNodeName);
            if (child.className) {
                pageSlot.setAttribute("className", `"${child.className}"`);
            }

            if (child.getAttribute("autofocus") === "autofocus") {
                noteBook.setAttribute(
                    "defaultPage",
                    `__comp__.props.record.isNew ? "${pageId}" : (__comp__.props.activeNotebookPages[${noteBookId}] || "${pageId}")`
                );
            }

            let isVisibleExpr;
            if (!invisible || invisible === "False" || invisible === "0") {
                isVisibleExpr = "true";
            } else if (invisible === "True" || invisible === "1") {
                isVisibleExpr = "false";
            } else {
                isVisibleExpr = `!__comp__.evaluateBooleanExpr(${JSON.stringify(
                    invisible
                )},__comp__.props.record.evalContextWithVirtualIds)`;
            }
            pageSlot.setAttribute("isVisible", isVisibleExpr);

            params.notebookPageFields = [];
            for (const contents of child.children) {
                append(pageSlot, this.compileNode(contents, { ...params, currentSlot: pageSlot }));
            }
            pageSlot.setAttribute("fieldNames", `${JSON.stringify(params.notebookPageFields)}`);
        }

        return noteBook;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileSetting(el, params) {
        const setting = createElement(params.componentName || "Setting", {
            info: toStringExpression(el.getAttribute("info") || ""),
            title: toStringExpression(el.getAttribute("title") || ""),
            help: toStringExpression(el.getAttribute("help") || ""),
            companyDependent: el.getAttribute("company_dependent") === "1" || "false",
            documentation: toStringExpression(el.getAttribute("documentation") || ""),
            record: `__comp__.props.record`,
        });
        if (el.getAttribute("id")) {
            setting.setAttribute("id", toStringExpression(el.getAttribute("id")));
        }
        let string = toStringExpression(el.getAttribute("string") || "");
        let addLabel = true;
        Array.from(el.children).forEach((child, index) => {
            if (getTag(child, true) === "field" && index === 0) {
                const fieldSlot = createElement("t", { "t-set-slot": "fieldSlot" });
                const field = this.compileNode(child, params);
                if (field) {
                    append(fieldSlot, field);
                    setting.setAttribute("fieldInfo", field.getAttribute("fieldInfo"));
                    addLabel = child.hasAttribute("nolabel")
                        ? !exprToBoolean(child.getAttribute("nolabel"))
                        : true;
                    const fieldName = child.getAttribute("name");
                    string = child.hasAttribute("string")
                        ? toStringExpression(child.getAttribute("string"))
                        : string;
                    setting.setAttribute("fieldName", toStringExpression(fieldName));
                    setting.setAttribute(
                        "fieldId",
                        toStringExpression(child.getAttribute("field_id"))
                    );
                }
                append(setting, fieldSlot);
            } else {
                append(setting, this.compileNode(child, params));
            }
        });
        setting.setAttribute("string", string);
        setting.setAttribute("addLabel", addLabel);
        return setting;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileSeparator(el, params = {}) {
        const separator = makeSeparator(el.getAttribute("string"));
        copyAttributes(el, separator);
        return this.applyInvisible(getModifier(el, "invisible"), separator, params);
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileSheet(el, params) {
        const sheetBG = createElement("div", {
            "t-on-scroll": "__comp__.onScrollThrottled",
        });
        sheetBG.className = "o_form_sheet_bg";

        const sheetFG = createElement("div");
        sheetFG.className = "o_form_sheet position-relative";

        append(sheetBG, sheetFG);
        for (const child of el.childNodes) {
            const compiled = this.compileNode(child, params);
            if (!compiled) {
                continue;
            }
            if (compiled.nodeName === "ButtonBox") {
                // in form views with a sheet, the button box is moved to the
                // control panel, and in dialogs, there's no button box
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
