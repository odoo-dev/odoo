import { App, blockDom, Component, markup } from "@odoo/owl";
import { getTemplate } from "@web/core/templates";
import { _t } from "@web/core/l10n/translation";

export function renderToElement(template, context = {}, options = {}) {
    const el = render(template, context, options).firstElementChild;
    if (el?.nextElementSibling) {
        throw new Error(
            `The rendered template '${template}' contains multiple root ` +
                `nodes that will be ignored using renderToElement, you should ` +
                `consider using renderToFragment or refactoring the template.`
        );
    }
    el?.remove();
    return el;
}

export function renderToFragment(template, context = {}, options = {}) {
    const frag = document.createDocumentFragment();
    for (const el of [...render(template, context, options).children]) {
        frag.appendChild(el);
    }
    return frag;
}

/**
 * renders a template with an (optional) context and outputs it as a string
 *
 * @param {string} template
 * @param {Object} context
 * @returns string: the html of the template
 */
export function renderToString(template, context = {}) {
    return render(template, context).innerHTML;
}
let app;
Object.defineProperty(renderToString, "app", {
    get: () => {
        if (!app) {
            app = new App(Component, {
                name: "renderToString",
                getTemplate,
                translatableAttributes: ["data-tooltip"],
                translateFn: _t,
            });
        }
        return app;
    },
});

function render(template, context = {}, options = {}) {
    const app = renderToString.app;
    const templateFn = app.getTemplate(template); // getTemplate needs document
    const bdom = templateFn(context, {});
    const ownerDocument = options.document || document;
    const div = ownerDocument.createElement("div");
    blockDom.mount(bdom, div);
    return div;
}

/**
 * renders a template with an (optional) context and returns a Markup string,
 * suitable to be inserted in a template with a t-out directive
 *
 * @param {string} template
 * @param {Object} context
 * @returns string: the html of the template, as a markup string
 */
export function renderToMarkup(template, context = {}) {
    return markup(renderToString(template, context));
}
