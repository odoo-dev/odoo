/**
 * This is a mini framework designed to make it easy to describe the dynamic
 * content of a "interaction".
 */

let owl = null;
let Markup = null;

export class Colibri {
    constructor(app, I, el, env) {
        this.app = app;
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
        for (let node of nodes) {
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
            for (let cl in value) {
                for (let c of cl.trim().split(" ")) {
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
            _window: window,
            _document: document,
        };

        const getNodes = (sel) => {
            if (sel in SPECIALS) {
                return [SPECIALS[sel]];
            }
            if (!(sel in nodes)) {
                nodes[sel] = el.querySelectorAll(sel);
            }
            return nodes[sel];
        };

        for (let [sel, directive, value] of generateEntries(content)) {
            const nodes = getNodes(sel);
            if (directive.startsWith("t-on-")) {
                const ev = directive.slice(5);
                this.addListener(nodes, ev, value);
            } else if (directive.startsWith("t-att-")) {
                const attr = directive.slice(6);
                this.dynamicAttrs.push([nodes, attr, value]);
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
        for (let [nodes, attr, fn] of this.dynamicAttrs) {
            for (let node of nodes) {
                const value = fn.call(interaction, node);
                this.applyAttr(node, attr, value);
            }
        }
        for (let [nodes, fn] of this.tOuts) {
            for (let node of nodes) {
                this.applyTOut(node, fn.call(interaction, node));
            }
        }
    }

    destroy() {
        for (let cleanup of this.cleanups.reverse()) {
            cleanup();
        }
        this.cleanups = [];
        for (let [el, ev, fn, options] of this.handlers) {
            el.removeEventListener(ev, fn, options);
        }
        this.handlers = [];
        this.interaction.destroy();
        this.interaction.isDestroyed = true;
    }
}

export class ColibriApp {

    constructor(env) {
        this.env = env;
    }

    attachTo(el, I) {
        const colibri = new Colibri(this, I, el, this.env);
        return colibri;
    }

}

function* generateEntries(content) {
    for (let key in content) {
        const value = content[key];
        if (typeof value === "object") {
            for (let directive in value) {
                yield [key, directive, value[directive]];
            }
        } else {
            const [selector, directive] = key.split(":");
            yield [selector, directive, value];
        }
    }
}
