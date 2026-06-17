import { plugin, Plugin } from "@odoo/owl";
import { appTranslateFn } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { services } from "@web/core/services";
import { getTemplate } from "@web/core/templates";
import { useChildEnv } from "@web/owl2/utils";
import { Colibri } from "./colibri";
import { Interaction } from "./interaction";
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

export class PublicInteractionPlugin extends Plugin {
    owlApp = null;
    Interactions = [];
    isActive = false;
    // relation el <--> Interaction
    activeInteractions = new PairSet();
    interactions = [];
    roots = [];
    proms = [];
    registry = null;
    env = useChildEnv();

    setup() {
        this.el = document.querySelector("#wrapwrap") || document.querySelector("body");
        const Interactions = registry.category("public.interactions").getAll();
        this.activate(Interactions);
    }

    /**
     *
     * @param {Interaction[]} Interactions
     * @param {HTMLElement} target - The target element where interactions need
     *                               to be activated.
     */
    activate(Interactions, target) {
        this.Interactions = Interactions;
        const startProm = this.env.isReady.then(() => this.startInteractions(target));
        this.proms.push(startProm);
    }

    prepareRoot(el, C, props, position = "beforeend") {
        if (!this.owlApp) {
            const { App } = odoo.loader.modules.get("@odoo/owl");
            const appConfig = {
                name: "Odoo Website",
                getTemplate,
                env: this.env,
                dev: this.env.debug,
                translateFn: appTranslateFn,
                warnIfNoStaticProps: this.env.debug,
                translatableAttributes: ["data-tooltip"],
            };
            this.owlApp = new App(appConfig);
            this.owlApp.pluginManager = this.env.pluginManager;
        }
        const root = this.owlApp.createRoot(C, { props, env: this.env });
        const rootEl = document.createElement("owl-root");
        rootEl.setAttribute("contenteditable", "false");
        rootEl.dataset.oeProtected = "true";
        rootEl.style.display = "contents";
        el.insertAdjacentElement(position, rootEl);
        return {
            C,
            root,
            el: rootEl,
            mount: () => root.mount(rootEl),
            destroy: () => {
                root.destroy();
                rootEl.remove();
            },
        };
    }

    async _mountComponent(el, C) {
        const root = this.prepareRoot(el, C);
        this.roots.push(root);
        return root.mount();
    }

    startInteractions(el = this.el) {
        if (!el.isConnected) {
            return Promise.resolve();
        }
        const proms = [];
        for (const I of this.Interactions) {
            if (I.selector === "") {
                throw new Error(
                    `The selector should be defined as a static property on the class ${I.name}, not on the instance`
                );
            }
            if (I.dynamicContent) {
                throw new Error(
                    `The dynamic content object should be defined on the instance, not on the class (${I.name})`
                );
            }
            let targets;
            try {
                const isMatch = el.matches(I.selector);
                targets = isMatch
                    ? [el, ...el.querySelectorAll(I.selector)]
                    : el.querySelectorAll(I.selector);
                if (I.selectorHas) {
                    targets = [...targets].filter((el) => !!el.querySelector(I.selectorHas));
                }
                if (I.selectorNotHas) {
                    targets = [...targets].filter((el) => !el.querySelector(I.selectorNotHas));
                }
            } catch {
                const selectorHasError = I.selectorHas ? ` or selectorHas: '${I.selectorHas}'` : "";
                const selectorNotHasError = I.selectorNotHas
                    ? ` or selectorNotHas: '${I.selectorNotHas}'`
                    : "";
                const error = new Error(
                    `Could not start interaction ${I.name} (invalid selector: '${I.selector}'${selectorHasError}${selectorNotHasError})`
                );
                proms.push(Promise.reject(error));
                continue;
            }
            for (const _el of targets) {
                this._startInteraction(_el, I, proms);
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
            try {
                const interaction = new Colibri(this, I, el);
                this.interactions.push(interaction);
                proms.push(interaction.start());
            } catch (e) {
                this.proms.push(Promise.reject(e));
            }
        } else {
            proms.push(this._mountComponent(el, I));
        }
    }

    shouldStop(el, interaction) {
        const { selectorNotHas, selectorHas } = interaction.interaction.constructor;
        if (!interaction.el) {
            return true;
        }
        return (
            el === interaction.el ||
            el.contains(interaction.el) ||
            (selectorHas && !interaction.el.querySelector(selectorHas)) ||
            (selectorNotHas && !!interaction.el.querySelector(selectorNotHas))
        );
    }

    stopInteractions(el = this.el) {
        const interactions = [];
        const errors = [];
        for (const interaction of this.interactions.slice().reverse()) {
            if (this.shouldStop(el, interaction)) {
                try {
                    interaction.destroy();
                } catch (error) {
                    errors.push([interaction.interaction.constructor.name, error]);
                }
                this.activeInteractions.delete(interaction.el, interaction.interaction.constructor);
            } else {
                interactions.push(interaction);
            }
        }
        this.interactions = interactions;
        const roots = [];
        for (const root of this.roots.slice().reverse()) {
            if (el === root.el || el.contains(root.el)) {
                root.destroy();
                this.activeInteractions.delete(root.el, root.C);
            } else {
                roots.push(root);
            }
        }
        this.roots = roots;
        if (el === this.el) {
            this.isActive = false;
        }
        for (const [interaction, error] of errors) {
            throw new Error(`Could not destroy interaction ${interaction}`, error);
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
services.add(PublicInteractionPlugin);

export const publicInteractionService = {
    start() {
        return plugin(PublicInteractionPlugin);
    },
};

registry.category("services").add("public.interactions", publicInteractionService);
