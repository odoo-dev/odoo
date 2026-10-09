import { append, createElement } from "@web/core/utils/xml";
import { ViewCompiler } from "@web/views/view_compiler";

/**
 * Compiles the arch of a help view (the content displayed when a view has no
 * record) into an owl template. Supported features:
 *  - regular html
 *  - `invisible` attributes, evaluated against the action context (no record)
 *  - <button>/<a> with type "object" or "action" (compiled into ViewButtons,
 *    executed on an empty recordset)
 *  - <widget name="..."/> (from the "view_widgets" registry, without record)
 *  - <action_help/>, to insert the action's help (after `get_empty_list_help`)
 *
 * Groups are applied server-side, as for any view.
 */
export class HelpCompiler extends ViewCompiler {
    setup() {
        this.compilers.push(
            { selector: "help", fn: this.compileHelp, doNotCopyAttributes: true },
            { selector: "action_help", fn: this.compileActionHelp, doNotCopyAttributes: true }
        );
    }

    compileHelp(el, params) {
        const compiled = createElement("t");
        for (const child of el.childNodes) {
            append(compiled, this.compileNode(child, params));
        }
        return compiled;
    }

    compileActionHelp() {
        const compiled = createElement("t");
        compiled.setAttribute("t-out", "__comp__.props.noContentHelp");
        return compiled;
    }

    compileWidget(el) {
        const widget = createElement("HelpWidget", {
            widgetInfo: `__comp__.helpArchInfo.widgetNodes['${el.getAttribute("widget_id")}']`,
        });
        if (el.hasAttribute("class")) {
            widget.setAttribute("className", `'${el.getAttribute("class")}'`);
        }
        return widget;
    }
}
