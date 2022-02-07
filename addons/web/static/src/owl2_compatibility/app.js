(function () {
    const App = owl.App;

    // templates' code is shared between multiple instances of Apps
    // This is useful primarly for the OWL2 to Legacy compatibility layer
    // It is also useful for tests.
    // The downside of this is that the compilation is done once with the compiling app's
    // translate function and attributes.
    const sharedTemplates = {};
    const stopPromises = [];
    const schedulers = new Set();

    function hookIntoScheduler(scheduler) {
        const { stop: originalStop } = scheduler;
        scheduler.stop = function stop() {
            const wasRunning = this.isRunning;
            originalStop.call(this);
            if (wasRunning) {
                while (stopPromises.length) {
                    stopPromises.pop().resolve();
                }
            }
        };
    }

    owl.App = class extends App {
        constructor(_, config) {
            if (!config.test) {
                const missingKeys = ["dev", "translateFn", "translatableAttributes"].filter(
                    (key) => !(key in config)
                );
                if (missingKeys.length) {
                    throw new Error(
                        `Attempted to create an App without some required key(s) (${missingKeys.join(
                            ", "
                        )})`
                    );
                }
            }
            super(...arguments);
            this.setup();
            hookIntoScheduler(this.scheduler);
            schedulers.add(this.scheduler);
        }
        destroy() {
            schedulers.delete(this.scheduler);
            super.destroy();
        }
        _compileTemplate(name) {
            if (!(name in sharedTemplates)) {
                sharedTemplates[name] = super._compileTemplate(...arguments);
            }
            return sharedTemplates[name];
        }
        setup() {}
    };
    owl.App.sharedTemplates = sharedTemplates;
    owl.App.validateTarget = () => {};
    /**
     * Returns a promise resolved the next time OWL stops rendering.
     *
     * @param {function} func function which, when called, is
     *   expected to trigger OWL render(s).
     * @param {number} [timeoutDelay=5000] in ms
     * @returns {Promise}
     */
    owl.App.afterNextRender = async function afterNextRender(func, timeoutDelay = 5000) {
        // Define the potential errors outside of the promise to get a proper
        // trace if they happen.
        const startError = new Error("Timeout: the render didn't start.");
        const stopError = new Error("Timeout: the render didn't stop.");
        // Set up the timeout to reject if no render happens.
        let timeoutNoRender;
        const timeoutProm = new Promise((resolve, reject) => {
            timeoutNoRender = setTimeout(() => {
                let error = startError;
                if ([...schedulers].some(({ isRunning }) => isRunning)) {
                    error = stopError;
                }
                console.error(error);
                reject(error);
            }, timeoutDelay);
        });
        // Set up the promise to resolve if a render happens.
        let resolve;
        const prom = new Promise((res) => {
            resolve = res;
        });
        prom.resolve = resolve;
        stopPromises.push(prom);
        // Start the function expected to trigger a render after the promise
        // has been registered to not miss any potential render.
        const funcRes = func();
        // Make them race (first to resolve/reject wins).
        await Promise.race([prom, timeoutProm]);
        clearTimeout(timeoutNoRender);
        // Wait the end of the function to ensure all potential effects are
        // taken into account during the following verification step.
        await funcRes;
        // Wait one more frame to make sure no new render has been queued.
        await new Promise(function (resolve) {
            setTimeout(() => window.requestAnimationFrame(() => resolve()));
        });
        if ([...schedulers].some(({ isRunning }) => isRunning)) {
            await afterNextRender(() => {}, timeoutDelay);
        }
    };
})();
