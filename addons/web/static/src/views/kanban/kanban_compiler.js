/** @odoo-module **/

import {
    combineAttributes,
    createElement,
    extractAttributes,
    toStringExpression,
} from "@web/core/utils/xml";
import { append, ViewCompiler } from "@web/views/view_compiler";
import { KANBAN_BOX_ATTRIBUTE } from "./kanban_arch_parser";

const INTERP_REGEXP = /\{\{.*?\}\}|#\{.*?\}/g;

const ACTION_TYPES = ["action", "object"];
const SPECIAL_TYPES = [...ACTION_TYPES, "edit", "open", "delete", "url", "set_cover"];

function isValidCard(el) {
    return el.tagName !== "t" || el.hasAttribute("t-component");
}

export class KanbanCompiler extends ViewCompiler {
    setup() {
        this.ctx.readonly = "read_only_mode";
        this.compilers.unshift(
            { selector: `[t-name='${KANBAN_BOX_ATTRIBUTE}']`, fn: this.compileCard },
            { selector: ".oe_kanban_colorpicker", fn: this.compileColorPicker },
            { selector: ".dropdown,.o_kanban_manage_button_section", fn: this.compileDropdown },
            {
                selector: ".dropdown-toggle,.o_kanban_manage_toggle_button",
                fn: this.compileDropdownButton,
            },
            { selector: ".dropdown-menu", fn: this.compileDropdownMenu }
        );
        this.dropdown = createElement("Dropdown", {
            position: toStringExpression("bottom-end"),
        });
        this.dropdownInserted = false;
    }

    /**
     * @override
     */
    compileButton(el, params) {
        /**
         * WOWL FIXME
         * For some reason, buttons in some arch have a data-something instead of just a normal attribute.
         * The new system only uses normal attributes.
         * This is an ugly small compatibility trick to fix this.
         */
        if (el.hasAttribute("data-type")) {
            for (const { name, value } of el.attributes) {
                el.setAttribute(name.replace(/^data-/, ""), value);
            }
        }

        const type = el.getAttribute("type");
        if (!SPECIAL_TYPES.includes(type)) {
            // Not a supported action type.
            return super.compileButton(el, params);
        }

        combineAttributes(el, "class", [
            "oe_kanban_action",
            `oe_kanban_action_${el.tagName.toLowerCase()}`,
        ]);

        if (ACTION_TYPES.includes(type)) {
            if (!el.hasAttribute("debounce")) {
                // action buttons are debounced in kanban records
                el.setAttribute("debounce", 300);
            }
            return super.compileButton(el, params);
        }

        const nodeParams = extractAttributes(el, ["type"]);
        if (type === "set_cover") {
            const { "data-field": fieldName, "auto-open": autoOpen } = extractAttributes(el, [
                "data-field",
                "auto-open",
            ]);
            Object.assign(nodeParams, { fieldName, autoOpen });
        }
        const strParams = Object.keys(nodeParams)
            .map((k) => `${k}:"${nodeParams[k]}"`)
            .join(",");
        el.setAttribute("t-on-click", `() => this.triggerAction({${strParams}})`);

        return el;
    }

    compileCard(el, params) {
        const rawCard = this.compileGenericNode(el, params);
        const cards = isValidCard(rawCard) ? [rawCard] : rawCard.childNodes;

        for (const card of cards) {
            card.setAttribute("t-att-tabindex", `props.record.model.useSampleModel ? -1 : 0`);
            card.setAttribute("role", `article`);
            card.setAttribute("t-att-data-id", `props.canResequence and props.record.id`);
            card.setAttribute("t-on-click", `onGlobalClick`);

            combineAttributes(card, "t-att-class", "getRecordClasses()", "+' '+");
        }

        return createElement("t", cards);
    }

    compileColorPicker() {
        return createElement("t", { "t-call": "web.KanbanColorPicker" });
    }

    compileDropdown(el, params) {
        const classes = el.className
            .split(/\s+/)
            .filter((cls) => cls && cls !== "dropdown")
            .join(" ");
        const shouldInsert = !this.dropdownInserted;
        this.dropdownInserted = true;

        combineAttributes(this.dropdown, "class", toStringExpression(classes), "+' '+");

        for (const child of el.childNodes) {
            append(this.dropdown, this.compileNode(child, params));
        }

        return shouldInsert && this.dropdown;
    }

    compileDropdownButton(el, params) {
        const classes = ["btn", el.getAttribute("class")].filter(Boolean).join(" ");
        const togglerSlot = createElement("t", { "t-set-slot": "toggler" });
        const shouldInsert = !this.dropdownInserted;
        this.dropdownInserted = true;

        combineAttributes(this.dropdown, "togglerClass", toStringExpression(classes), "+' '+");

        for (const child of el.childNodes) {
            append(togglerSlot, this.compileNode(child, params));
        }
        append(this.dropdown, togglerSlot);

        return shouldInsert && this.dropdown;
    }

    compileDropdownMenu(el, params) {
        const cls = el.getAttribute("class") || "";
        const shouldInsert = !this.dropdownInserted;
        this.dropdownInserted = true;

        combineAttributes(this.dropdown, "menuClass", toStringExpression(cls), "+' '+");

        for (const child of el.childNodes) {
            append(this.dropdown, this.compileNode(child, params));
        }

        return shouldInsert && this.dropdown;
    }

    /**
     * @override
     */
    compileField(el, params) {
        let compiled;
        if (!el.hasAttribute("widget")) {
            // fields without a specified widget are rendered as simple spans in kanban records
            compiled = createElement("span");
            compiled.setAttribute("t-esc", `record["${el.getAttribute("name")}"].value`);
        } else {
            compiled = super.compileField(el, params);
        }
        const { bold, display } = extractAttributes(el, ["bold", "display"]);
        const classNames = [];
        if (display === "right") {
            classNames.push("float-right");
        } else if (display === "full") {
            classNames.push("o_text_block");
        }
        if (bold) {
            classNames.push("o_text_bold");
        }
        if (classNames.length > 0) {
            compiled.setAttribute("class", `'${classNames.join(" ")}'`);
        }
        const attrs = {};
        for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
        }
        if (el.hasAttribute("widget")) {
            const attrsParts = Object.entries(attrs).map(([key, value]) => {
                if (key.startsWith("t-attf-")) {
                    key = key.substr(7);
                    value = value.replace(
                        INTERP_REGEXP,
                        (s) => "${" + s.slice(2, s[0] === "{" ? -2 : -1) + "}"
                    );
                    value = toStringExpression(value);
                } else if (key.startsWith("t-att-")) {
                    key = key.substr(6);
                    value = `"" + (${value})`;
                } else if (key.startsWith("t-att")) {
                    throw new Error("t-att on <field> nodes is not supported");
                } else if (!key.startsWith("t-")) {
                    value = toStringExpression(value);
                }
                return `'${key}':${value}`;
            });
            compiled.setAttribute("attrs", `{${attrsParts.join(",")}}`);
        }
        for (const attr in attrs) {
            if (attr.startsWith("t") && !attr.startsWith("t-att")) {
                compiled.setAttribute(attr, attrs[attr]);
            }
        }
        return compiled;
    }

    /**
     * Override to replace t-call attribute values by the key of the corresponding
     * sub template.
     *
     * @override
     */
    compileGenericNode(el, params) {
        if (el.tagName === "t" && el.getAttribute("t-call")) {
            const templateKey = params.subTemplateKeys[el.getAttribute("t-call")];
            if (templateKey) {
                el.setAttribute("t-call", templateKey);
            }
        }
        return super.compileGenericNode(...arguments);
    }
}
