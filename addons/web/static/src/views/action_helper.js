import { Component, markup, t, useProps } from "@odoo/owl";
import { getTemplate } from "@web/core/templates";
import { createElementWithContent } from "@web/core/utils/html";
import { renderToElement } from "@web/core/utils/render";

const PICTO_TAG = "picto";
const PICTO_TEMPLATE_PREFIX = "web.picto.";

/**
 * @param {string} name
 * @param {string} [className]
 * @returns {HTMLElement|null} the illustration, or null if there is no such one
 */
function renderPicto(name, className = "") {
    const template = PICTO_TEMPLATE_PREFIX + name;
    if (!getTemplate(template)) {
        console.warn(`Unknown pictogram "${name}"`);
        return null;
    }
    return renderToElement(template, { class: className });
}

/**
 * Resolves the `<picto name="…"/>` elements of a "no content" help into their
 * `web.picto.*` illustration:
 *
 *      <picto name="poof"/>
 *      <p>Create a Contact in your address book</p>
 *
 * An extra `class` is forwarded to the rendered svg. Helps without any
 * `<picto/>` get no illustration.
 *
 * @param {string | ReturnType<markup>} help html of the help
 * @returns {ReturnType<markup>}
 */
export function renderPictos(help) {
    const root = createElementWithContent("div", help);
    for (const picto of root.querySelectorAll(PICTO_TAG)) {
        const name = picto.getAttribute("name");
        const el = name && renderPicto(name, picto.getAttribute("class") || "");
        // browsers do not treat `<picto/>` as void, so a help built in code has
        // the rest of itself parsed as the element's content: keep it
        picto.replaceWith(...(el ? [el] : []), ...picto.childNodes);
    }
    // markup: `help` is markup (or has been escaped as text), and the
    // pictogram templates are part of the code base
    return markup(root.innerHTML);
}

export class ActionHelper extends Component {
    static template = "web.ActionHelper";
    props = useProps({
        noContentHelp: t.string().optional(),
    });

    get showDefaultHelper() {
        return !this.props.noContentHelp;
    }

    get help() {
        return renderPictos(this.props.noContentHelp);
    }
}
