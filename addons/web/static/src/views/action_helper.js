import { Component, markup, t, useProps } from "@odoo/owl";
import { getTemplate } from "@web/core/templates";
import { memoize } from "@web/core/utils/functions";
import { createElementWithContent } from "@web/core/utils/html";

const PICTO_TAG = "picto";
const DEFAULT_PICTO = "empty_folder";
const DEFAULT_PICTO_MODULE = "web";

/**
 * @param {string} name
 * @param {string} [module] module defining the pictogram, `web` by default
 * @returns {string} the template of the illustration
 */
function pictoTemplate(name, module = DEFAULT_PICTO_MODULE) {
    return `${module}.picto.${name}`;
}

/**
 * Extracts the `<picto name="…"/>` element of a "no content" help, resolved
 * into the `<module>.picto.*` template of its illustration:
 *
 *      <picto name="poof"/>
 *      <picto name="poof" module="sale"/>
 *      <p>Create a Contact in your address book</p>
 *
 * The element is removed from the help, whose illustration is rendered aside
 * from it. `module` defaults to `web`. Helps without any `<picto/>`, or with an
 * unknown one, get no illustration.
 *
 * @param {string | Markup} help html of the help
 * @returns {{picto: string|null, help: Markup}} the template of the
 *      illustration, if there is one, and the help without its `<picto/>`
 */
export function parseHelp(help) {
    const root = createElementWithContent("div", help);
    let picto = null;
    for (const el of root.querySelectorAll(PICTO_TAG)) {
        const name = el.getAttribute("name");
        const module = el.getAttribute("module") || undefined;
        const template = name ? pictoTemplate(name, module) : null;
        if (template && !getTemplate(template)) {
            console.warn(`Unknown pictogram "${template}"`);
        } else {
            picto ??= template;
        }
        // `<picto/>` is not a void element for the html parser: whatever
        // follows it has been parsed as its content and must be moved back out.
        el.replaceWith(...el.childNodes);
    }
    // markup: `help` is markup (or has been escaped as text), and only had
    // some of its elements removed
    return { picto, help: markup(root.innerHTML) };
}

export class ActionHelper extends Component {
    static template = "web.ActionHelper";
    props = useProps({
        noContentHelp: t.string().optional(),
    });

    setup() {
        this.parseHelp = memoize(parseHelp);
    }

    get showDefaultHelper() {
        return !this.props.noContentHelp;
    }

    get picto() {
        return this.showDefaultHelper
            ? pictoTemplate(DEFAULT_PICTO)
            : this.parseHelp(this.props.noContentHelp).picto;
    }

    get help() {
        return this.parseHelp(this.props.noContentHelp).help;
    }
}
