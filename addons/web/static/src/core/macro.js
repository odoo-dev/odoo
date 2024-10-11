import { browser } from "@web/core/browser/browser";
import { isVisible } from "@web/core/utils/ui";
import { debounce } from "@web/core/utils/timing";

/**
 * @typedef MacroStep
 * @property {string} [trigger]
 * - An action returning a "truthy" value means that the step isn't successful.
 * - Current step index won't be incremented.
 * @property {string | (el: Element, step: MacroStep) => undefined | string} [action]
 * @property {*} [*] - any payload to the step.
 *
 * @typedef MacroDescriptor
 * @property {() => Element | undefined} trigger
 * @property {() => {}} action
 */

export const ACTION_HELPERS = {
    click(el, _step) {
        el.dispatchEvent(new MouseEvent("mouseover"));
        el.dispatchEvent(new MouseEvent("mouseenter"));
        el.dispatchEvent(new MouseEvent("mousedown"));
        el.dispatchEvent(new MouseEvent("mouseup"));
        el.click();
        el.dispatchEvent(new MouseEvent("mouseout"));
        el.dispatchEvent(new MouseEvent("mouseleave"));
    },
    text(el, step) {
        // simulate an input (probably need to add keydown/keyup events)
        this.click(el, step);
        el.value = step.value;
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        el.dispatchEvent(new InputEvent("change", { bubbles: true }));
    },
};

class TimeoutError extends Error {}

class Macro {
    constructor(descr) {
        this.name = descr.name || "anonymous";
        this.timeoutDuration = descr.timeout || 0;
        this.timeout = null;
        this.currentIndex = 0;
        this.checkDelay = descr.checkDelay || 0;
        this.isComplete = false;
        this.steps = descr.steps;
        this.stepEl = new Array(this.steps.length).fill(false);
        this.onStep = descr.onStep || (() => {});
        this.onError = descr.onError;
        this.onTimeout = descr.onTimeout;
        this.debounceAdvance = debounce(() => this.advance(), 50);
        this.macroMutationObserver = new MacroMutationObserver(() => {
            if (!this.stepEl[this.currentIndex]) {
                this.debounceAdvance();
            }
        });
    }

    async advance() {
        if (this.isComplete) {
            return;
        }
        const [proceedToAction, el] = this.checkTrigger();
        if (proceedToAction) {
            this.stepEl[this.currentIndex] = el;
            this.safeCall(this.onStep, el);
            const actionResult = await this.performAction(el);
            if (!actionResult) {
                // If falsy action result, it means the action worked properly.
                // So we can proceed to the next step.
                this.currentIndex++;
                if (this.currentIndex === this.steps.length) {
                    this.isComplete = true;
                    browser.clearTimeout(this.timeout);
                } else {
                    this.setTimer();
                    if (this.currentStep.trigger) {
                        await this.debounceAdvance();
                    } else {
                        await this.advance();
                    }
                }
            }
        }
    }

    get currentStep() {
        return this.steps[this.currentIndex];
    }

    /**
     * Find the trigger and assess whether it can continue on performing the actions.
     * @param {{ trigger: string | () => Element | null }} param0
     * @returns {[proceedToAction: boolean; el: Element | undefined]}
     */
    checkTrigger() {
        const trigger = this.currentStep.trigger;
        let el;

        if (!trigger) {
            return [true, el];
        }

        if (typeof trigger === "function") {
            el = this.safeCall(trigger);
        } else if (typeof trigger === "string") {
            const triggerEl = document.querySelector(trigger);
            el = isVisible(triggerEl) && triggerEl;
        } else {
            throw new Error(`Trigger can only be string or function.`);
        }

        if (el) {
            return [true, el];
        } else {
            return [false, el];
        }
    }

    /**
     * Calls the `step.action` expecting no return to be successful.
     * @param {Element} el
     * @param {Step} step
     */
    async performAction(el) {
        const action = this.currentStep.action;
        let actionResult;
        if (action in ACTION_HELPERS) {
            actionResult = ACTION_HELPERS[action](el, this.currentStep);
        } else if (typeof action === "function") {
            actionResult = await this.safeCall(action, el);
        }
        return actionResult;
    }

    safeCall(fn, ...args) {
        if (this.isComplete) {
            return;
        }
        try {
            return fn(...args, this.currentStep);
        } catch (e) {
            this.handleError(e);
        }
    }

    setTimer() {
        if (this.timeoutDuration) {
            browser.clearTimeout(this.timeout);
            this.timeout = browser.setTimeout(() => {
                if (this.onTimeout) {
                    const index = this.currentIndex;
                    const step = this.steps[index];
                    this.safeCall(this.onTimeout, step, index);
                } else {
                    const error = new TimeoutError("Step timeout");
                    this.handleError(error);
                }
            }, this.timeoutDuration);
        }
    }

    start(target) {
        this.setTimer();
        this.macroMutationObserver.observe(target);
        this.advance();
    }

    handleError(error) {
        // mark the macro as complete, so it can be cleaned up from the
        // engine
        this.isComplete = true;
        browser.clearTimeout(this.timeout);
        if (this.onError) {
            const index = this.currentIndex;
            const step = this.steps[index];
            this.onError(error, step, index);
        } else {
            console.error(error);
        }
    }
}

export class MacroEngine {
    constructor(params = {}) {
        this.isRunning = false;
        this.target = params.target || document.body;
        this.macros = new Set();
    }

    async activate(descr, exclusive = false) {
        if (this.exclusive) {
            return;
        }
        this.exclusive = exclusive;
        // micro task tick to make sure we add the macro in a new call stack,
        // so we are guaranteed that we are not iterating on the current macros
        await Promise.resolve();
        const macro = new Macro(descr);
        if (exclusive) {
            this.macros = new Set([macro]);
        } else {
            this.macros.add(macro);
        }
        this.start();
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
        }
        this.advanceMacros();
    }

    stop() {
        if (this.isRunning) {
            this.isRunning = false;
            this.macroMutationObserver.disconnect();
        }
    }

    async advanceMacros() {
        await Promise.all([...this.macros].map((macro) => macro.start(this.target)));
        for (const macro of this.macros) {
            if (macro.isComplete) {
                this.macros.delete(macro);
            }
        }
        if (this.macros.size === 0) {
            this.stop();
        }
    }
}

export class MacroMutationObserver {
    observerOptions = {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
    };
    constructor(callback) {
        this.callback = callback;
        this.observer = new MutationObserver((mutationList, observer) => {
            callback();
            mutationList.forEach((mutationRecord) =>
                Array.from(mutationRecord.addedNodes).forEach((node) => {
                    let iframes = [];
                    if (String(node.tagName).toLowerCase() === "iframe") {
                        iframes = [node];
                    } else if (node instanceof HTMLElement) {
                        iframes = Array.from(node.querySelectorAll("iframe"));
                    }
                    iframes.forEach((iframeEl) =>
                        this.observeIframe(iframeEl, observer, () => callback())
                    );
                    this.findAllShadowRoots(node).forEach((shadowRoot) =>
                        observer.observe(shadowRoot, this.observerOptions)
                    );
                })
            );
        });
    }
    disconnect() {
        this.observer.disconnect();
    }
    findAllShadowRoots(node, shadowRoots = []) {
        if (node.shadowRoot) {
            shadowRoots.push(node.shadowRoot);
            this.findAllShadowRoots(node.shadowRoot, shadowRoots);
        }
        node.childNodes.forEach((child) => {
            this.findAllShadowRoots(child, shadowRoots);
        });
        return shadowRoots;
    }
    observe(target) {
        this.observer.observe(target, this.observerOptions);
        //When iframes already exist at "this.target" initialization
        target
            .querySelectorAll("iframe")
            .forEach((el) => this.observeIframe(el, this.observer, () => this.callback()));
        //When shadowDom already exist at "this.target" initialization
        this.findAllShadowRoots(target).forEach((shadowRoot) => {
            this.observer.observe(shadowRoot, this.observerOptions);
        });
    }
    observeIframe(iframeEl, observer, callback) {
        const observerOptions = {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
        };
        const observeIframeContent = () => {
            if (iframeEl.contentDocument) {
                iframeEl.contentDocument.addEventListener("load", (event) => {
                    callback();
                    observer.observe(event.target, observerOptions);
                });
                if (!iframeEl.src || iframeEl.contentDocument.readyState === "complete") {
                    callback();
                    observer.observe(iframeEl.contentDocument, observerOptions);
                }
            }
        };
        observeIframeContent();
        iframeEl.addEventListener("load", observeIframeContent);
    }
}
