/** @odoo-module **/

import { extractAttributes } from "@web/core/utils/xml";
import { ViewCompiler } from "@web/views/helpers/view_compiler";

export class KanbanCompiler extends ViewCompiler {
    /**
     * @override
     */
    compileField(el, params) {
        const compiled = super.compileField(el, params);
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
