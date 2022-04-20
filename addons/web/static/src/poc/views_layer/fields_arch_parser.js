/** @odoo-module **/

import { Domain } from "@web/core/domain";
import { evaluateExpr } from "@web/core/py_js/py";
import { registry } from "@web/core/registry";
import { XMLParser } from "@web/core/utils/xml";

const fieldsArchParserRegistry = registry.category("fieldsArchParser");

export class FieldsArchParser extends XMLParser {
    parse(arch, fieldsInfo) {
        let id = 0;
        const fields = {};

        this.visitXML(arch, (node) => {
            if (node.tagName === "field") {
                const info = this.parseField(node, fieldsInfo);
                fields[`${info.name}_${++id}`] = info;
            }
        });

        return fields;
    }

    parseField(node, fieldsInfo) {
        const rawAttrs = {};
        for (const attr of node.attributes) {
            rawAttrs[attr.name] = attr.value;
        }

        const info = fieldsInfo[rawAttrs.name];
        const type = rawAttrs.widget || info.type;

        /** @type {any} */
        const attrs = {
            ...rawAttrs,
            options: evaluateExpr(rawAttrs.options || "{}"),
        };

        const modifiers = {
            invisible: rawAttrs.invisible && new Domain(rawAttrs.invisible),
            readonly: rawAttrs.readonly && new Domain(rawAttrs.readonly),
            required: rawAttrs.required && new Domain(rawAttrs.required),
        };

        let props = {};
        if (fieldsArchParserRegistry.contains(type)) {
            const parse = fieldsArchParserRegistry.get(type);
            props = parse(attrs, node);
        }

        return {
            name: attrs.name,
            type,
            string: attrs.string,
            rawAttrs,
            attrs,
            modifiers,
            props,
        };
    }
}
