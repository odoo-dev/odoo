/**
 * This is a mini framework designed to make it easy to describe the dynamic
 * content of a "interaction".
 */

let owl = null;
let Markup = null;

export class Colibri {
    constructor(app, I, el, env) {
        this.app = app;
        this.update = null;
        this.dynamicAttrs = [];
        this.tOuts = [];
        this.handlers = [];
        this.cleanups = [];
        this.classMap = new Map();
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
                    this.update();
                }
                interaction.start();
            },
        );
    }

    scheduleUpdate() {
        this.app.schedule(this);
    }

    addDomListener(nodes, event, fn, options) {
        const handler = (ev) => {
            fn.call(this.interaction, ev);
            this.scheduleUpdate();
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
            const before = this.classMap.get(el) || new Set();
            const after = new Set(value.trim().split(" "));
            // add new class
            for (let cl of after) {
                if (!before.has(cl)) {
                    el.classList.add(cl);
                }
            }
            // remove old class
            for (let cl of before) {
                if (!after.has(cl)) {
                    el.classList.remove(cl);
                }
            }
            this.classMap.set(el, after);
        } else {
            el.setAttribute(attr, value);
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
                this.addDomListener(nodes, ev, value);
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

        this.update = () => {
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
        };
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
        this.classMap.clear();
        this.interaction.destroy();
        this.interaction.isDestroyed = true;
    }
}

export class ColibriApp {
    frame = null;
    queue = new Set(); // interactions to update next frame

    constructor(env) {
        this.env = env;
    }

    attachTo(el, I) {
        const colibri = new Colibri(this, I, el, this.env);
        return colibri;
    }

    schedule(colibri) {
        this.queue.add(colibri);
        if (!this.frame) {
            this.frame = requestAnimationFrame(() => {
                this.flush();
                this.frame = null;
            });
        }
    }

    flush() {
        for (let colibri of this.queue) {
            if (!colibri.interaction.isDestroyed) {
                // if update fn is not set => interaction is not yet started
                // this is not a problem
                colibri.update?.();
            }
        }
        this.queue.clear();
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
