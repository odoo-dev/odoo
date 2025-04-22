// @odoo-module ignore

/**
 * -----------------------------------------------------------------------------
 * Odoo Web Boostrap Code
 * -----------------------------------------------------------------------------
 *
 * This file defines the bootstrap mechanism for Odoo's JavaScript module
 * system. It introduces a `ModuleLoader` class that manages the lifecycle of
 * JavaScript modules, handling their registration, dependency resolution, and
 * initialization. 
 * 
 * The loader attaches to the global `odoo` object and provides a `define`
 * method for declaring modules. Errors such as missing modules or dependency
 * cycles are logged, and a banner is shown in debug mode for visibility.
 * -----------------------------------------------------------------------------
 */

(function (odoo) {
    if (odoo.loader) {
        // Allows for duplicate calls to `module_loader`: only the first one is
        // executed.
        return;
    }

    class ModuleLoader {

        _bus = new EventTarget();
        _checkErrorProm = null;
        _factories = new Map();
        _failed = new Set();
        _jobs = new Set();
        _modules = new Map();

        /**
         * Define a new module with its dependencies and initialization function.
         *
         * @param {string} name - Unique name of the module.
         * @param {string[]} deps - Names of modules this one depends on.
         * @param {function} factory - Function to initialize the module.
         * @param {boolean} [lazy=false] - If true, load the module lazily.
         */
        define(name, deps, factory, lazy = false) {
            if (typeof name !== "string") {
                throw new Error(`Module name should be a string, got: ${String(name)}`);
            }
            if (!Array.isArray(deps)) {
                throw new Error(
                    `Module dependencies should be a list of strings, got: ${String(deps)}`
                );
            }
            if (typeof factory !== "function") {
                throw new Error(`Module factory should be a function, got: ${String(factory)}`);
            }
            if (this._factories.has(name)) {
                return; // Ignore duplicate modules
            }
            this._factories.set(name, {
                deps,
                fn: factory,
                ignoreMissingDeps: globalThis.__odooIgnoreMissingDependencies,
            });
            if (!lazy) {
                this._addJob(name);
                this._checkErrorProm ||= Promise.resolve().then(() => {
                    this._checkErrorProm = null;
                    this._reportErrors(this._findErrors());
                });
            }
        }

        /** @type {OdooModuleLoader["startModules"]} */
        startModules() {
            let job;
            while ((job = this._findJob())) {
                this._startModule(job);
            }
        }
        
        /**
         * @param {string} name 
         */
        _addJob(name) {
            this._jobs.add(name);
            this.startModules();
        }

        /**
         * @param {string[]} moduleNames 
         * @returns {any[]}
         */
        _findErrors(moduleNames) {
            /**
             * @param {Iterable<string>} currentModuleNames
             * @param {Set<string>} visited
             * @returns {string | null}
             */
            const findCycle = (currentModuleNames, visited) => {
                for (const name of currentModuleNames || []) {
                    if (visited.has(name)) {
                        const cycleModuleNames = [...visited, name];
                        return cycleModuleNames
                            .slice(cycleModuleNames.indexOf(name))
                            .map((j) => `"${j}"`)
                            .join(" => ");
                    }
                    const cycle = findCycle(dependencyGraph[name], new Set(visited).add(name));
                    if (cycle) {
                        return cycle;
                    }
                }
                return null;
            };

            moduleNames ||= this._jobs;

            /** @type {Record<string, Iterable<string>>} */
            const dependencyGraph = Object.create(null);
            /** @type {Set<string>} */
            const missing = new Set();
            /** @type {Set<string>} */
            const unloaded = new Set();

            for (const moduleName of moduleNames) {
                const { deps, ignoreMissingDeps } = this._factories.get(moduleName);

                dependencyGraph[moduleName] = deps;

                if (ignoreMissingDeps) {
                    continue;
                }

                unloaded.add(moduleName);
                for (const dep of deps) {
                    if (!this._factories.has(dep)) {
                        missing.add(dep);
                    }
                }
            }

            const cycle = findCycle(moduleNames, new Set());
            const errors = {};
            if (cycle) {
                errors.cycle = cycle;
            }
            if (this._failed.size) {
                errors.failed = this._failed;
            }
            if (missing.size) {
                errors.missing = missing;
            }
            if (unloaded.size) {
                errors.unloaded = unloaded;
            }
            return errors;
        }

        _findJob() {
            for (const job of this._jobs) {
                if (this._factories.get(job).deps.every((dep) => this._modules.has(dep))) {
                    return job;
                }
            }
            return null;
        }

        /** @type {OdooModuleLoader["reportErrors"]} */
        async _reportErrors(errors) {
            if (!Object.keys(errors).length) {
                return;
            }

            if (errors.failed) {
                console.error("The following modules failed to load because of an error:", [
                    ...errors.failed,
                ]);
            }
            if (errors.missing) {
                console.error(
                    "The following modules are needed by other modules but have not been defined, they may not be present in the correct asset bundle:",
                    [...errors.missing]
                );
            }
            if (errors.cycle) {
                console.error(
                    "The following modules could not be loaded because they form a dependency cycle:",
                    errors.cycle
                );
            }
            if (errors.unloaded) {
                console.error(
                    "The following modules could not be loaded because they have unmet dependencies, this is a secondary error which is likely caused by one of the above problems:",
                    [...errors.unloaded]
                );
            }

            const document = globalThis.document;
            if (document.readyState === "loading") {
                await new Promise((resolve) =>
                    document.addEventListener("DOMContentLoaded", resolve)
                );
            }

            const debug = new URLSearchParams(location.search).get("debug");
            if (debug && debug !== "0") {
                const style = document.createElement("style");
                style.className = "o_module_error_banner";
                style.textContent = `
                    body::before {
                        font-weight: bold;
                        content: "An error occurred while loading javascript modules, you may find more information in the devtools console";
                        position: fixed;
                        left: 0;
                        bottom: 0;
                        z-index: 100000000000;
                        background-color: #C00;
                        color: #DDD;
                    }
                `;
                document.head.appendChild(style);
            }
        }

        /** @type {OdooModuleLoader["startModule"]} */
        _startModule(name) {
            /** @type {(dependency: string) => OdooModule} */
            const require = (dependency) => this._modules.get(dependency);
            this._jobs.delete(name);
            const factory = this._factories.get(name);
            /** @type {OdooModule | null} */
            let module = null;
            try {
                module = factory.fn(require);
            } catch (error) {
                this._failed.add(name);
                throw new Error(`Error while loading "${name}":\n${error}`);
            }
            this._modules.set(name, module);
            this._bus.dispatchEvent(
                new CustomEvent("module-started", {
                    detail: { moduleName: name, module },
                })
            );
            return module;
        }
    }

    if (odoo.debug && !new URLSearchParams(location.search).has("debug")) {
        // remove debug mode if not explicitely set in url
        odoo.debug = "";
    }

    const loader = new ModuleLoader();
    odoo.define = loader.define.bind(loader);
    odoo.loader = loader;
})((globalThis.odoo ||= {}));
