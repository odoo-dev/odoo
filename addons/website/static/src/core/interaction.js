import { debounce, throttleForAnimation } from "@web/core/utils/timing";
import { SKIP_IMPLICIT_UPDATE } from "./colibri"

/**
 * This is the base class to describe interactions. The Interaction class
 * provides a good integration with the web framework (env/services), a well
 * specified lifecycle, some dynamic content, and a few helper functions
 * designed to accomplish common tasks, such as adding dom listener or waiting for
 * some task to complete.
 * 
 * Note that even though interactions are not destroyed in the standard workflow
 * (a user visiting the website), there are still some cases where it happens:
 * for example, when someone switch the website in "edit" mode. This means that
 * interactions should gracefully clean up after themselves.
 */

export class Interaction {
    /**
     * This static property describes the set of html element targeted by this
     * interaction. An instance will be created for each match when the website
     * framework is initialized.
     */
    static selector = "";

    /**
     * The dynamic content of an interaction is an object describing the set of
     * "dynamic elements" managed by the framework: event handlers, dynamic
     * attributes, dynamic content, sub components.
     * 
     * Its syntax looks like the following:
     * dynamicContent = {
     *      ".some-selector:t-on-click": (ev) => this.onClick(ev),
     *      ".some-other-selector:t-att-class": () => ({ "some-class": true})
     * }
     *
     * A selector is either a standard css selector, or a special keyword
     * (_body, _root, _document, _window or _modal)
     * 
     * Accepted directives includes: t-on-, t-att-, t-out and t-component
     * 
     * Note that this is not owl! It is similar, to make it easy to learn, but
     * it is different, the syntax and semantics are somewhat different. 
     */
    dynamicContent = {};

    /**
     * The constructor is not supposed to be defined in a subclass. Use setup
     * instead
     */
    constructor(el, env, metadata) {
        this.__colibri__ = metadata;
        this.isDestroyed = false;
        this.el = el;
        this.env = env;
        this.services = env.services;
    }

    // -------------------------------------------------------------------------
    // lifecycle methods
    // -------------------------------------------------------------------------

    /**
     * This is the standard constructor method. This is the proper place to
     * initialize everything needed by the interaction. The el element is
     * available and can be used. Services are ready and available as well.
     */
    setup() {}

    /**
     * If the interaction needs some asynchronous work to be ready, it should
     * be done here. The website framework will wait for this method to complete
     * before applying the dynamic content (event handlers, ...)
     */
    async willStart() {}

    /**
     * The start function when we need to execute some code after the interaction
     * is ready. It is the equivalent to the "mounted" owl lifecycle hook. At
     * this point, event handlers have been attached.
     */
    start() {}

    /**
     * All side effects done should be cleaned up here. Note that like all
     * other lifecycle methods, it is not necessary to call the super.destroy
     * method (unless you inherit from a concrete subclass)
     */
    destroy() {}

    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------

    /**
     * This method applies the dynamic content description to the dom. So, if
     * a dynamic attribute has been defined with a t-att-, it will be done
     * synchronously by this method. Note that updateContent is already being
     * called after each event handler, and by most other helpers, so in practice,
     * it is not common to need to call it.
     */
    updateContent() {
        this.__colibri__.updateContent();
    }

    /**
     * Safely execute a function returning a promise. The returned promise will
     * only be resolved if the interaction has not been destroyed, and will also
     * call updateContent after the calling code has acted.
     */
    waitFor(fn) {
        return new Promise(async (resolve) => {
            const result = await fn.call(this);
            if (!this.isDestroyed) {
                resolve(result);
                this.updateContent();
            }
        });
    }

    /**
     * Wait for a specific timeout, then execute the given function (unless the
     * interaction has been destroyed). The dynamic content is then applied.
     */
    waitForTimeout(fn, delay) {
        return setTimeout(() => {
            if (!this.isDestroyed) {
                fn.call(this);
                this.updateContent();
            }
        }, delay);
    }

    /**
     * Debounces a function and makes sure it is cancelled upon destroy.
     */
    debounced(fn, delay) {
        const debouncedFn = debounce(() => {
            fn.call(this);
            this.updateContent();
        }, delay);
        this.registerCleanup(() => {
            debouncedFn.cancel();
        });
        return () => { debouncedFn(); return SKIP_IMPLICIT_UPDATE; };
    }

    /**
     * Throttles a function for animation and makes sure it is cancelled upon destroy.
     */
    throttledForAnimation(fn) {
        const throttledFn = throttleForAnimation(() => {
            fn.call(this);
            this.updateContent();
        });
        this.registerCleanup(() => {
            throttledFn.cancel();
        });
        return () => { throttledFn(); return SKIP_IMPLICIT_UPDATE; };
    }

    /**
     * Add a listener to the target. Whenever the listener is executed, the
     * dynamic content will be applied. Also, the listener will automatically be
     * cleaned up when the interaction is destroyed
     * 
     * @param {HTMLElement | string} target an element or a selector
     * @param {string} event 
     * @param {Function} fn 
     * @param {Object} [options]
     */
    addListener(target, event, fn, options) {
        const nodes =
            typeof target === "string"
                ? this.el.querySelectorAll(target)
                : [target];
        this.__colibri__.addListener(nodes, event, fn, options);
    }

    /**
     * Insert an node at a specific location. The inserted node will be removed
     * when the interaction is destroyed.
     *
     * @param { HTMLElement } el
     * @param { HTMLElement } [locationEl] the target
     * @param { string } [position]
     */
    insert(el, locationEl = this.el, position = "beforeend") {
        locationEl.insertAdjacentElement(position, el);
        this.registerCleanup(() => {
            el.remove();
        });
    }

    /**
     * Register a function that will be executed when the interaction is
     * destroyed. It is sometimes useful, so we can explicitely add the cleanup
     * at the location where the side effect is created.
     *
     * @param {Function} fn 
     */
    registerCleanup(fn) {
        this.__colibri__.cleanups.push(fn);
    }

    mountComponent(el, C) {
        this.__colibri__.mountComponent([el], C);
    }
}
