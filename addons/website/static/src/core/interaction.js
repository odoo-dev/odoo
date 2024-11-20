/**
 * This is the base class to describe interactions. It contains a few helper
 * to accomplish common tasks, such as adding dom listener or waiting for
 * some task to complete
 */
export class Interaction {
    static selector = "";

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
    setup() {}

    async willStart() {}

    start() {}

    destroy() {}

    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------
    waitFor(fn) {
        return new Promise(async (resolve) => {
            const result = await fn();
            if (!this.isDestroyed) {
                resolve(result);
                this.updateContent();
            }
        });
    }

    waitForTimeout(fn, delay) {
        setTimeout(() => {
            if (!this.isDestroyed) {
                fn();
                this.updateContent();
            }
        }, delay);
    }

    updateContent() {
        this.__colibri__.updateContent();
    }

    addListener(target, event, fn, options) {
        const nodes =
            typeof target === "string"
                ? this.el.querySelectorAll(target)
                : [target];
        this.__colibri__.addListener(nodes, event, fn, options);
    }

    registerCleanup(fn) {
        this.__colibri__.cleanups.push(fn);
    }

    mountComponent() {
        // todo
    }
}
