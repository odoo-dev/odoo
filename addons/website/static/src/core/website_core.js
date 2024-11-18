import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { Interaction } from "./interaction";
import { ColibriApp } from "./colibri";
import { getTemplate } from "@web/core/templates";
import { PairSet } from "./utils";

/**
 * Website Core
 *
 * This service handles the core interactions for the website codebase.
 * It will replace public root, publicroot instance, and all that stuff
 *
 * We have 2 kinds of interactions:
 * - simple interactions (subclasses of Interaction)
 * - components
 *
 * The Interaction class is designed to be a simple class that provides access
 * to the framework (env and services), and a minimalist declarative framework
 * that allows manipulating dom, attaching event handlers and updating it
 * properly. It does not depend on owl.
 *
 * The Component kind of interaction is used for more complicated interface needs.
 * It provides full access to Owl features, but is rendered browser side.
 *
 */

const activeElementRegistry = registry.category("website.active_elements");


class WebsiteCore {
    constructor(env) {
        this.el = document.querySelector("#wrapwrap");
        this.isActive = false;
        // relation el <--> Interaction
        this.activeInteractions = new PairSet();
        this.env = env;
        this.interactions = [];
        this.roots = [];
        this.colibriApp = new ColibriApp(this.env);
        this.owlApp = null;
        this.proms = [];
    }

    async _mountComponent(el, C) {
        if (!this.owlApp) {
            const { App } = odoo.loader.modules.get("@odoo/owl");
            const appConfig = {
                name: "Odoo Website",
                getTemplate,
                env: this.env,
                dev: this.env.debug,
                translateFn: _t,
                warnIfNoStaticProps: this.env.debug,
                translatableAttributes: ["data-tooltip"],
            };
            this.owlApp = new App(null, appConfig);
        }
        const root = this.owlApp.createRoot(C, { props: null, env: this.env });
        this.roots.push(Object.assign(root, {el, C}));
        const compElem = document.createElement("owl-component");
        compElem.setAttribute("contenteditable", "false");
        compElem.dataset.oeProtected = "true";
        el.appendChild(compElem);
        return root.mount(compElem);
    }

    startInteractions(el = this.el) {
        const proms = [];
        for (const [name, I] of activeElementRegistry.getEntries()) {
            if (el.matches(I.selector)) {
                // console.log("starting", name);
                this._startInteraction(el, I, proms);
            } else {
                for (let _el of el.querySelectorAll(I.selector)) {
                    // console.log("starting", name);
                    this._startInteraction(_el, I, proms);
                }
            }
        }
        if (el === this.el) {
            this.isActive = true;
        }
        const prom = Promise.all(proms);
        this.proms.push(prom);
        return prom;
    }

    _startInteraction(el, I, proms) {
        if (this.activeInteractions.has(el, I)) {
            return;
        }
        this.activeInteractions.add(el, I);
        if (I.prototype instanceof Interaction) {
            const interaction = this.colibriApp.attachTo(el, I);
            this.interactions.push(interaction);
            proms.push(interaction.startProm);
        } else {
            proms.push(this._mountComponent(el, I));
        }
    }

    stopInteractions(el = this.el) {
        const interactions = [];
        for (let interaction of this.interactions) {
            if (el === interaction.el || el.contains(interaction.el)) {
                interaction.destroy();
                this.activeInteractions.delete(interaction.el, interaction.I);
            } else {
                interactions.push(interaction);
            }
        }
        this.interactions = interactions;
        const roots = [];
        for (let root of this.roots) {
            if (el === root.el || el.contains(root.el)) {
                root.destroy();
                this.activeInteractions.delete(root.el, root.C);
            } else {
                roots.push(root)
            }
        }
        this.roots = roots;;
        if (el === this.el) {
            this.isActive = false;
        }
    }

    /**
     * @returns { Promise } returns a promise that is resolved when all current
     * interactions are started. Note that it does not take into account possible
     * future interactions.
     */
    get isReady() {
        const proms = this.proms.slice();
        return Promise.all(proms);
    }
}

registry.category("services").add("website_core", {
    dependencies: ["localization"],
    async start(env) {
        const websiteCore = new WebsiteCore(env);
        activeElementRegistry.addEventListener("UPDATE", async (ev) => {
            if (websiteCore.isActive) {
                const { operation, key: name, value: I } = ev.detail;
                if (operation !== "delete") {
                    websiteCore._startInteraction(name, I);
                }
            }
        });
        websiteCore.proms.push(
            env.isReady.then(() => websiteCore.startInteractions()),
        );
        return websiteCore;
    },
});
