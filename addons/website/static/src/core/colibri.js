/**
 * This is a mini framework designed to make it easy to describe the dynamic
 * content of a "interaction".
 */

let owl = null;
let Markup = null;

export class Colibri {
    constructor(I, el, env) {
        this.el = el;
        this.I = I;
        this.update = null;
        this.dynamicAttrs = [];
        this.tOuts = [];
        this.handlers = [];
        this.cleanups = [];
        this.startProm = null;
        const interaction = new I(el, env, this);
        this.interaction = interaction;
        interaction.setup();
        this.startProm = (interaction.willStart() || Promise.resolve()).then(
            () => {
                if (interaction.isDestroyed) {
                    return;
                }
                const content = interaction.dynamicContent;
                if (content) {
                    this.processContent(content);
                    this.updateContent();
                } else if (I.dynamicContent) {
                    throw new Error(`The dynamic content object should be defined on the instance, not on the class (${I.name})`);
                }
                interaction.start();
            },
        );
    }

    addListener(nodes, event, fn, options) {
        const handler = (ev) => {
            fn.call(this.interaction, ev);
            this.updateContent();
        };
        for (const node of nodes) {
            node.addEventListener(event, handler, options);
            this.handlers.push([node, event, handler, options]);
        }
    }

    applyTOut(el, value) {
        if (!Markup) {
            owl = odoo.loader.modules.get("@odoo/owl");
            if (owl) {
                Markup = owl.markup("").constructor;
            }
        }
        if (Markup && value instanceof Markup) {
            el.innerHTML = value;
        } else {
            el.textContent = value;
        }
        return this.markup;
    }

    applyAttr(el, attr, value) {
        if (attr === "class") {
            if (typeof value !== "object") {
                throw new Error("t-att-class directive expects an object");
            }
            for (const cl in value) {
                for (const c of cl.trim().split(" ")) {
                    el.classList.toggle(c, value[cl]);
                }
            }
        } else {
            if (value) {
                el.setAttribute(attr, value);
            } else {
                el.removeAttribute(attr);
            }
        }
    }

    processContent(content) {
        const interaction = this.interaction;

        const el = interaction.el;
        const nodes = {};
        const SPECIALS = {
            _root: el,
            _body: document.body,
            _modal: el.closest(".modal"),
            _window: window,
            _document: document,
        };

        const getNodes = (sel) => {
            if (sel in SPECIALS) {
                const elem = SPECIALS[sel];
                return elem ? [elem] : [];
            }
            if (!(sel in nodes)) {
                nodes[sel] = el.querySelectorAll(sel);
            }
            return nodes[sel];
        };

        for (const [sel, directive, value] of generateEntries(content)) {
            const nodes = getNodes(sel);
            if (directive.startsWith("t-on-")) {
                const ev = directive.slice(5);
                this.addListener(nodes, ev, value);
            } else if (directive.startsWith("t-att-")) {
                const attr = directive.slice(6);
                const initialValues = new Map();
                for (const node of nodes) {
                    const attrValue = node.getAttribute(attr);
                    initialValues.set(node, attrValue);
                }
                this.dynamicAttrs.push([nodes, attr, value, initialValues]);
            } else if (directive === "t-out") {
                this.tOuts.push([nodes, value]);
            } else {
                const suffix = directive.startsWith("t-")
                    ? ""
                    : " (should start with t-)";
                throw new Error(`Invalid directive: '${directive}'${suffix}`);
            }
        }

    }

    updateContent() {
        const interaction = this.interaction;
        for (const [nodes, attr, fn] of this.dynamicAttrs) {
            for (const node of nodes) {
                const value = fn.call(interaction, node);
                this.applyAttr(node, attr, value);
            }
        }
        for (const [nodes, fn] of this.tOuts) {
            for (const node of nodes) {
                this.applyTOut(node, fn.call(interaction, node));
            }
        }
    }

    destroy() {
        // restore t-att to their initial values
        for (const dynAttrs of this.dynamicAttrs) {
            const [nodes, attr, _, initialValues] = dynAttrs;
            for (const node of nodes) {
                const initialValue = initialValues.get(node);
                if (initialValue) {
                    node.setAttribute(attr, initialValue);
                } else {
                    node.removeAttribute(attr);
                }
            }
        }

        for (const cleanup of this.cleanups.reverse()) {
            cleanup();
        }
        this.cleanups = [];
        for (const [el, ev, fn, options] of this.handlers) {
            el.removeEventListener(ev, fn, options);
        }
        this.handlers = [];
        this.interaction.destroy();
        this.interaction.isDestroyed = true;
    }
}

function* generateEntries(content) {
    for (const key in content) {
        const value = content[key];
        if (typeof value === "object") {
            for (const directive in value) {
                yield [key, directive, value[directive]];
            }
        } else {
            const [selector, directive] = key.split(":");
            yield [selector, directive, value];
        }
    }
}
