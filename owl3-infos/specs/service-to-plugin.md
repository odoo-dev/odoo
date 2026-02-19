# Spec: Convert an Odoo Service to an Owl 3 Plugin

## Goal

Convert one Odoo service (registered via `registry.category("services").add("name", descriptor)`) into an Owl 3 `Plugin` class. The resulting plugin must:
1. Be a class extending `Plugin` (from `@odoo/owl`)
2. Have `static id = "<service_name>"` matching the original registry key
3. Expose the same public API (methods/properties) that `start()` used to return
4. Be registered in the plugin registry instead of the service registry

## Background: How services work today

A service is a plain object registered like this:

```js
import { registry } from "@web/core/registry";

export const fooService = {
    dependencies: ["bar", "baz"],          // optional, other service names
    async: ["someAsyncMethod"],            // optional, list of async method names
    start(env, { bar, baz }) {
        // init logic...
        return { someMethod, someAsyncMethod };  // the "service value"
    },
};
registry.category("services").add("foo", fooService);
```

- `dependencies`: string array of other service names. They are resolved and injected as the second arg to `start()`.
- `async`: string array of method names (or `true` for a service that IS a function). Used by `useService()` to wrap those methods with `_protectMethod` — a wrapper that returns a never-resolving promise if the consuming component is destroyed.
- `start(env, deps)`: called once at app startup. `env` is the Odoo env (`{ bus, services, debug, isSmall }`). Returns the service value stored in `env.services[name]`.
- Components consume via `useService("name")` which reads from `env.services`.

## Background: How Owl 3 plugins work

```js
import { Plugin, plugin, onWillDestroy } from "@odoo/owl";

class FooPlugin extends Plugin {
    static id = "foo";           // defaults to class name, but set it explicitly
    bar = plugin(BarPlugin);     // dependency injection — auto-starts BarPlugin if needed
    baz = plugin(BazPlugin);

    setup() {
        // init logic (like start() body)
        // can use hooks: onWillDestroy(), useListener(), useEffect()
    }

    someMethod() { ... }
    async someAsyncMethod() { ... }
}
```

Key differences from services:
- `plugin(Dep)` replaces `dependencies: ["dep"]`. It's a call in the class body or `setup()`. It returns the plugin instance directly. If the dependency isn't started yet (and we're in a plugin context), it auto-starts it.
- `setup()` replaces `start()`. It does NOT return anything. The plugin instance itself IS the public API.
- There is no `env` parameter. If you need `env.bus`, import a bus plugin or use the compatibility bridge (see below).
- Plugins are registered as global plugins at mount time: `mount(Root, target, { plugins: [FooPlugin, ...] })`, NOT through `registry.category("services")`.

## Where to register the new plugin

There is a plugin registry at `addons/web/static/src/core/plugin_registry.js`:

```js
import { registry } from "@web/core/registry";
export const pluginRegistry = registry.category("plugins");
```

Register your plugin there instead of in the services registry:

```js
pluginRegistry.add("foo", FooPlugin);
```

The app startup code reads from this registry and passes all plugins to the Owl App.

## Step-by-step conversion procedure

### Step 1: Read the service file

Identify:
- **Service name**: the first arg to `registry.category("services").add("name", ...)`
- **Dependencies**: the `dependencies` array (if any)
- **Async methods**: the `async` array (if any)
- **start() body**: the init logic
- **Return value**: the methods/properties returned by `start()`
- **env usage**: any use of `env.bus`, `env.services`, `env.debug`, etc.
- **Closures**: local variables in `start()` that are captured by returned methods

### Step 2: Create the plugin class

**File naming**: Rename `foo_service.js` → `foo_plugin.js` in the same directory.

**Class structure**:

```js
import { Plugin, plugin, onWillDestroy } from "@odoo/owl";
// import dependency plugins (not services)

export class FooPlugin extends Plugin {
    static id = "foo";  // MUST match the original service registry key

    // Dependencies: one line per dependency
    bar = plugin(BarPlugin);

    // Local state: move closure variables from start() to instance properties
    cache = {};
    nextId = 0;

    setup() {
        // Move init logic from start() here
        // Use onWillDestroy() for cleanup (replaces manual teardown)
    }

    // Move returned methods to instance methods
    someMethod() {
        // "this" is the plugin instance
        // Access dependencies via this.bar, this.baz
        // Access local state via this.cache, this.nextId
    }
}
```

### Step 3: Handle each pattern

#### 3a. Dependencies

```js
// BEFORE
dependencies: ["overlay"],
start(env, { overlay }) {
    overlay.add(...);
}

// AFTER
import { OverlayPlugin } from "../overlay/overlay_plugin";

export class DialogPlugin extends Plugin {
    static id = "dialog";
    overlay = plugin(OverlayPlugin);

    setup() {
        this.overlay.add(...);
    }
}
```

If the dependency has NOT been converted to a plugin yet, use the service compat bridge:

```js
import { servicePlugin } from "@web/core/utils/service_plugin";

export class DialogPlugin extends Plugin {
    static id = "dialog";
    overlay = plugin(servicePlugin("overlay"));  // wraps legacy service as a plugin
}
```

#### 3b. Closure variables → instance properties

```js
// BEFORE
start(env) {
    let nextId = 0;
    const stack = [];
    function add() { nextId++; stack.push(...); }
    return { add };
}

// AFTER
export class FooPlugin extends Plugin {
    nextId = 0;
    stack = [];

    add() {
        this.nextId++;
        this.stack.push(...);
    }
}
```

#### 3c. `env.bus` usage

```js
// BEFORE
start(env) {
    env.bus.addEventListener("ACTION_MANAGER:UPDATE", clearCache);
}

// AFTER (use the global env bus)
import { useBus } from "@web/core/utils/hooks";

setup() {
    useBus(this.env.bus, "ACTION_MANAGER:UPDATE", () => this.clearCache());
}
```

Note: `this.env` is available on Plugin instances via the compatibility layer that patches it onto the Plugin prototype. It provides access to the legacy `env` object (`{ bus, services, debug }`).

#### 3d. `async` methods

The `async` property on services tells `useService()` to wrap methods with `_protectMethod()` (which prevents promise resolution if the consuming component is destroyed). For now, we keep this behavior via a static property:

```js
// BEFORE
async: ["loadDisplayNames"],

// AFTER — no change needed, useService compat bridge reads this
export class NamePlugin extends Plugin {
    static id = "name";
    // useService("name") still wraps loadDisplayNames automatically
    async loadDisplayNames() { ... }
}
```

No special handling is needed — the `useService()` compatibility bridge already handles async protection for plugins.

#### 3e. Reactive state (service returns `reactive({...})`)

```js
// BEFORE
start() {
    const notifications = reactive({});
    return { add };
}

// AFTER — keep reactive/proxy for now (owl3 compat layer maps reactive → proxy)
setup() {
    this.notifications = reactive({});
}
```

When we do the full owl3 migration later, `reactive` will become `proxy` or `signal`. For now, keep using `reactive`.

#### 3f. Service that returns a single function

```js
// BEFORE
start() { return function doThing() { ... }; }

// AFTER
export class FooPlugin extends Plugin {
    static id = "foo";
    call(...args) { /* the function body */ }
}
```

Note: `useService("foo")` for a function-service returns the function directly. The compat bridge will need to handle this (return `plugin.call.bind(plugin)`).

#### 3g. Service uses `this` (the service descriptor object)

Some services reference `this` in `start()` to access other properties on the descriptor (e.g., `this.notificationContainer`). Move those to static or instance properties:

```js
// BEFORE
export const notificationService = {
    notificationContainer: NotificationContainer,
    start() {
        registry.category("main_components").add(this.notificationContainer.name, ...);
    }
};

// AFTER
export class NotificationPlugin extends Plugin {
    static id = "notification";
    static notificationContainer = NotificationContainer;

    setup() {
        registry.category("main_components").add(
            NotificationPlugin.notificationContainer.name, ...
        );
    }
}
```

### Step 4: Update registration

```js
// REMOVE this line:
registry.category("services").add("foo", fooService);

// ADD this line:
import { pluginRegistry } from "@web/core/plugin_registry";
pluginRegistry.add("foo", FooPlugin);
```

### Step 5: Update imports in consuming files

**DO NOT update `useService()` consumers yet.** The compatibility bridge ensures `useService("foo")` automatically finds the plugin by its `static id`. Consumers will be migrated separately in a later phase.

Only update files that directly import the service descriptor object:

```js
// BEFORE
import { fooService } from "./foo_service";

// AFTER
import { FooPlugin } from "./foo_plugin";
```

### Step 6: Update tests

If tests import the service descriptor or mock it via `makeFakeService`, update them to use the plugin class. Tests that use `useService("foo")` should continue working without changes.

## Complete example: http service

### Before (`http_service.js`):

```js
import { browser } from "@web/core/browser/browser";
import { registry } from "../registry";

function checkResponseStatus(response) { ... }

export async function get(route, readMethod = "json") { ... }
export async function post(route, params = {}, readMethod = "json") { ... }

export const httpService = {
    start() {
        return { get, post };
    },
};

registry.category("services").add("http", httpService);
```

### After (`http_plugin.js`):

```js
import { Plugin } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { pluginRegistry } from "@web/core/plugin_registry";

function checkResponseStatus(response) { ... }

export class HttpPlugin extends Plugin {
    static id = "http";

    async get(route, readMethod = "json") {
        const response = await browser.fetch(route, { method: "GET" });
        checkResponseStatus(response);
        return response[readMethod]();
    }

    async post(route, params = {}, readMethod = "json") {
        let formData = params;
        if (!(formData instanceof FormData)) {
            formData = new FormData();
            for (const key in params) {
                const value = params[key];
                if (Array.isArray(value) && value.length) {
                    for (const val of value) {
                        formData.append(key, val);
                    }
                } else {
                    formData.append(key, value);
                }
            }
        }
        const response = await browser.fetch(route, { body: formData, method: "POST" });
        checkResponseStatus(response);
        if (readMethod === "url") {
            return response.url;
        }
        return response[readMethod]();
    }
}

pluginRegistry.add("http", HttpPlugin);
```

Note: the standalone `get` and `post` functions are kept as module exports for backward compatibility if they're imported directly elsewhere. The plugin methods delegate to them or inline them.

## Complete example: dialog service (with dependency)

### Before (`dialog_service.js`):

```js
export const dialogService = {
    dependencies: ["overlay"],
    start(env, { overlay }) {
        const stack = [];
        let nextId = 0;
        const deactivate = () => { for (const subEnv of stack) subEnv.isActive = false; };
        const add = (dialogClass, props, options = {}) => { ... overlay.add(...) ... };
        function closeAll(params) { ... }
        return { add, closeAll };
    },
};
registry.category("services").add("dialog", dialogService);
```

### After (`dialog_plugin.js`):

```js
import { Plugin, plugin } from "@odoo/owl";
import { markRaw, reactive } from "@odoo/owl";
import { OverlayPlugin } from "../overlay/overlay_plugin";
import { pluginRegistry } from "@web/core/plugin_registry";

class DialogWrapper extends Component { ... }  // unchanged

export class DialogPlugin extends Plugin {
    static id = "dialog";
    overlay = plugin(OverlayPlugin);
    stack = [];
    nextId = 0;

    deactivate() {
        for (const subEnv of this.stack) {
            subEnv.isActive = false;
        }
    }

    add(dialogClass, props, options = {}) {
        const id = this.nextId++;
        const close = (params) => remove(params);
        const subEnv = reactive({ id, close, isActive: true });

        this.deactivate();
        this.stack.push(subEnv);
        document.body.classList.add("modal-open");
        let isBeingClosed = false;

        const scrollOrigin = { top: window.scrollY, left: window.scrollX };
        subEnv.scrollToOrigin = () => {
            if (!this.stack.length) {
                window.scrollTo(scrollOrigin);
            }
        };

        const remove = this.overlay.add(
            DialogWrapper,
            { subComponent: dialogClass, subProps: markRaw({ ...props, close }), subEnv },
            {
                onRemove: async (closeParams) => {
                    if (isBeingClosed) return;
                    isBeingClosed = true;
                    await options.onClose?.(closeParams);
                    this.stack.splice(this.stack.findIndex((d) => d.id === id), 1);
                    this.deactivate();
                    if (this.stack.length) {
                        this.stack.at(-1).isActive = true;
                    } else {
                        document.body.classList.remove("modal-open");
                    }
                },
                rootId: options.context?.root?.el?.getRootNode()?.host?.id,
            }
        );
        return remove;
    }

    closeAll(params) {
        for (const dialog of [...this.stack].reverse()) {
            dialog.close(params);
        }
    }
}

pluginRegistry.add("dialog", DialogPlugin);
```

## Checklist

For each service conversion:

- [ ] `static id` matches the original `registry.category("services").add("name", ...)` key exactly
- [ ] All `dependencies` are converted to `plugin(DepPlugin)` calls (or `servicePlugin("dep")` for unconverted deps)
- [ ] All closure variables from `start()` are moved to instance properties
- [ ] All returned methods are instance methods
- [ ] `env.bus` usage is handled via `this.env.bus` or `useBus()`
- [ ] Registration changed from service registry to plugin registry
- [ ] Old service registration line is removed
- [ ] File renamed from `*_service.js` to `*_plugin.js`
- [ ] Standalone function exports (if any) kept for backward compat
- [ ] No `useService()` consumer files are modified (compat bridge handles them)
