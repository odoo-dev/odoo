// @odoo-module ignore

//-----------------------------------------------------------------------------
// Odoo Web Boostrap Code
//-----------------------------------------------------------------------------

(function () {
    "use strict";

    if (globalThis.odoo?.loader) {
        // Allows for duplicate calls to `module_loader`: only the first one is
        // executed.
        return;
    }

    /**
     * @param {() => void} callback
     */
    function domReady(callback) {
        if (document.readyState === "complete") {
            callback();
        } else {
            document.addEventListener("DOMContentLoaded", callback);
        }
    }

    /**
     * @param {string} heading
     * @param {string[]} names
     */
    function list(heading, names) {
        const frag = document.createDocumentFragment();
        if (!names || !names.length) {
            return frag;
        }
        frag.textContent = heading;
        const ul = document.createElement("ul");
        for (const el of names) {
            const li = document.createElement("li");
            li.textContent = el;
            ul.append(li);
        }
        frag.appendChild(ul);
        return frag;
    }

    class ModuleLoader {
        /**
         * Mapping [name => { deps, fn }]
         * @type {Map<string, OdooModuleFactory>}
         */
        factories = new Map();
        /**
         * Names of modules waiting to be started
         * @type {Set<string>}
         */
        jobs = new Set();
        /**
         * Names of failed modules
         * @type {Set<string>}
         */
        failed = new Set();
        /**
         * Mapping [name => value]
         * @type {Map<string, OdooModule>}
         */
        modules = new Map();

        bus = new EventTarget();

        /** @type {Promise<void> | null} */
        checkErrorProm = null;

        /** @type {OdooModuleDefineFn} */
        define(name, deps, factory, lazy = false) {
            if (typeof name !== "string") {
                throw new Error(`Module name should be a string, got: ${name}`);
            }
            if (!Array.isArray(deps) || deps.some((dep) => typeof dep !== "string")) {
                throw new Error(`Module dependencies should be an array of strings, got: ${deps}`);
            }
            if (typeof factory !== "function") {
                throw new Error(`Module factory should be a function, got: ${factory}`);
            }
            if (this.factories.has(name)) {
                return; // Ignore duplicate modules
            }
            this.factories.set(name, {
                deps,
                fn: factory,
                ignoreMissingDeps: globalThis.__odooIgnoreMissingDependencies || lazy,
            });
            if (!lazy) {
                this.addJob(name);
                this.checkErrorProm ||= Promise.resolve().then(() => {
                    this.checkAndReportErrors();
                    this.checkErrorProm = null;
                });
            }
        }

        /**
         * @param {string} name
         */
        addJob(name) {
            this.jobs.add(name);
            this.startModules();
        }

        findJob() {
            for (const job of this.jobs) {
                if (this.factories.get(job).deps.every((dep) => this.modules.has(dep))) {
                    return job;
                }
            }
            return null;
        }

        startModules() {
            let job;
            while ((job = this.findJob())) {
                this.startModule(job);
            }
        }

        /**
         * @param {string} name
         * @returns {OdooModule}
         */
        startModule(name) {
            const require = (dependency) => this.modules.get(dependency);
            this.jobs.delete(name);
            const factory = this.factories.get(name);
            /** @type {OdooModule | null} */
            let value = null;
            try {
                value = factory.fn(require);
            } catch (error) {
                this.failed.add(name);
                throw new Error(`Error while loading "${name}":\n${error}`);
            }
            this.modules.set(name, value);
            this.bus.dispatchEvent(
                new CustomEvent("module-started", { detail: { moduleName: name, module: value } })
            );
            return value;
        }

        findErrors() {
            // cycle detection
            const dependencyGraph = new Map();
            for (const job of this.jobs) {
                dependencyGraph.set(job, this.factories.get(job).deps);
            }
            function visitJobs(jobs, visited = new Set()) {
                for (const job of jobs) {
                    const result = visitJob(job, visited);
                    if (result) {
                        return result;
                    }
                }
                return null;
            }

            function visitJob(job, visited) {
                if (visited.has(job)) {
                    const jobs = [...visited, job];
                    const index = jobs.indexOf(job);
                    return jobs
                        .slice(index)
                        .map((j) => `"${j}"`)
                        .join(" => ");
                }
                const deps = dependencyGraph.get(job);
                return deps ? visitJobs(deps, new Set(visited).add(job)) : null;
            }

            // missing dependencies
            const missing = new Set();
            for (const job of this.jobs) {
                const factory = this.factories.get(job);
                if (factory.ignoreMissingDeps) {
                    continue;
                }
                for (const dep of factory.deps) {
                    if (!this.factories.has(dep)) {
                        missing.add(dep);
                    }
                }
            }

            return {
                failed: [...this.failed],
                cycle: visitJobs(this.jobs),
                missing: [...missing],
                unloaded: [...this.jobs].filter((j) => !this.factories.get(j).ignoreMissingDeps),
            };
        }

        async checkAndReportErrors() {
            const { failed, cycle, missing, unloaded } = this.findErrors();
            if (!failed.length && !unloaded.length) {
                return;
            }

            domReady(() => {
                // Empty body
                document.body.innerHTML = "";

                const container = document.createElement("div");
                container.className =
                    "o_module_error position-fixed w-100 h-100 d-flex align-items-center flex-column bg-white overflow-auto modal";
                container.style.zIndex = "10000";
                const alert = document.createElement("div");
                alert.className = "alert alert-danger o_error_detail fw-bold m-auto";
                container.appendChild(alert);
                alert.appendChild(
                    list(
                        "The following modules failed to load because of an error, you may find more information in the devtools console:",
                        failed
                    )
                );
                alert.appendChild(
                    list(
                        "The following modules could not be loaded because they form a dependency cycle:",
                        cycle && [cycle]
                    )
                );
                alert.appendChild(
                    list(
                        "The following modules are needed by other modules but have not been defined, they may not be present in the correct asset bundle:",
                        missing
                    )
                );
                alert.appendChild(
                    list(
                        "The following modules could not be loaded because they have unmet dependencies, this is a secondary error which is likely caused by one of the above problems:",
                        unloaded
                    )
                );
                document.body.appendChild(container);
            });
        }
    }

    const odoo = (globalThis.odoo ||= {});
    if (odoo.debug && !new URLSearchParams(location.search).has("debug")) {
        // remove debug mode if not explicitely set in url
        odoo.debug = "";
    }

    const loader = new ModuleLoader();
    odoo.define = loader.define.bind(loader);
    odoo.loader = loader;
})();
