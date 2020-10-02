(function (owl, QUnit$1) {
    'use strict';

    /**
     * Registry
     *
     * The Registry class is basically just a mapping from a string key to an object.
     * It is really not much more than an object. It is however useful for the
     * following reasons:
     *
     * 1. it let us react and execute code when someone add something to the registry
     *   (for example, the FunctionRegistry subclass this for this purpose)
     * 2. it throws an error when the get operation fails
     * 3. it provides a chained API to add items to the registry.
     */
    class Registry {
        constructor() {
            this.content = {};
        }
        /**
         * Add an item to the registry
         *
         * Note that this also returns the registry, so another add method call can
         * be chained
         */
        add(key, value) {
            if (key in this.content) {
                throw new Error(`Cannot add '${key}' in this registry: it already exists`);
            }
            this.content[key] = value;
            return this;
        }
        /**
         * Get an item from the registry
         */
        get(key) {
            if (!(key in this.content)) {
                throw new Error(`Cannot find ${key} in this registry!`);
            }
            return this.content[key];
        }
        /**
         * Get a list of all elements in the registry
         */
        getAll() {
            return Object.values(this.content);
        }
        getEntries() {
            return Object.entries(this.content);
        }
        /**
         * Remove an item from the registry
         */
        remove(key) {
            delete this.content[key];
        }
    }

    // -----------------------------------------------------------------------------
    // Hook, registry and deploy function
    // -----------------------------------------------------------------------------
    function useService(serviceName) {
        const component = owl.Component.current;
        const env = component.env;
        const service = env.services[serviceName];
        if (!service) {
            throw new Error(`Service ${serviceName} is not available`);
        }
        const specialize = env.registries.services.get(serviceName).specialize;
        return specialize ? specialize(component, service) : service;
    }
    async function deployServices(env, registry, odooGlobal) {
        const services = env.services;
        const toBeDeployed = new Set(registry.getAll());
        // deploy as many services in parallel as possible
        function deploy() {
            let service = null;
            const proms = [];
            while ((service = findNext())) {
                let name = service.name;
                toBeDeployed.delete(service);
                const value = service.deploy(env, odooGlobal);
                if (value instanceof Promise) {
                    proms.push(value.then((val) => {
                        services[name] = val;
                        return deploy();
                    }));
                }
                else {
                    services[service.name] = value;
                }
            }
            return Promise.all(proms);
        }
        await deploy();
        if (toBeDeployed.size) {
            throw new Error("Some services could not be deployed");
        }
        function findNext() {
            for (let s of toBeDeployed) {
                if (s.dependencies) {
                    if (s.dependencies.every((d) => d in services)) {
                        return s;
                    }
                }
                else {
                    return s;
                }
            }
            return null;
        }
    }

    async function makeEnv(templates, registries, browser, odooGlobal) {
        const qweb = new owl.QWeb();
        qweb.addTemplates(templates);
        const env = {
            browser,
            qweb,
            bus: new owl.core.EventBus(),
            registries,
            services: {},
        };
        await deployServices(env, registries.services, odooGlobal);
        return env;
    }

    async function mount(C, params) {
        C.env = params.env;
        const component = new C(null);
        await component.mount(params.target, { position: "first-child" });
        return component;
    }
    async function makeTestEnv(params = {}) {
        let registries = {
            services: params.services || new Registry(),
            Components: params.Components || new Registry(),
        };
        const browser = (params.browser || {});
        const env = await makeEnv(templates, registries, browser);
        return env;
    }
    function getFixture() {
        if (QUnit.config.debug) {
            return document.body;
        }
        else {
            return document.querySelector("#qunit-fixture");
        }
    }
    async function nextTick() {
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        await new Promise((resolve) => setTimeout(resolve));
    }
    function makeDeferred() {
        let resolve;
        let prom = new Promise((_r) => {
            resolve = _r;
        });
        prom.resolve = resolve;
        return prom;
    }
    function click(el, selector) {
        let target = el;
        if (selector) {
            const els = el.querySelectorAll(selector);
            if (els.length === 0) {
                throw new Error(`Found no element to click on (selector: ${selector})`);
            }
            if (els.length > 1) {
                throw new Error(`Found ${els.length} elements to click on, instead of 1 (selector: ${selector})`);
            }
            target = els[0];
        }
        const ev = new MouseEvent("click");
        target.dispatchEvent(ev);
        return nextTick();
    }
    // -----------------------------------------------------------------------------
    // Mock Services
    // -----------------------------------------------------------------------------
    function makeFakeUserService() {
        return {
            name: "user",
            deploy() {
                const context = { lang: "en_us", tz: "Europe/Brussels", uid: 2, allowed_company_ids: [1] };
                return {
                    context,
                    userId: 2,
                    userName: "admin",
                    isAdmin: true,
                    partnerId: 3,
                    allowed_companies: [[1, "YourCompany"]],
                    current_company: [1, "YourCompany"],
                    lang: "en_us",
                    tz: "Europe/Brussels",
                };
            },
        };
    }
    function makeFakeMenusService(menuData) {
        const _menuData = menuData || {
            root: { id: "root", children: [1], name: "root" },
            1: { id: 1, children: [], name: "App0" },
        };
        return {
            name: "menus",
            deploy() {
                const menusService = {
                    getMenu(menuId) {
                        return _menuData[menuId];
                    },
                    getApps() {
                        return this.getMenu("root").children.map((mid) => this.getMenu(mid));
                    },
                    getAll() {
                        return Object.values(_menuData);
                    },
                    getMenuAsTree(menuId) {
                        const menu = this.getMenu(menuId);
                        if (!menu.childrenTree) {
                            menu.childrenTree = menu.children.map((mid) => this.getMenuAsTree(mid));
                        }
                        return menu;
                    },
                };
                return menusService;
            },
        };
    }
    function createMockedFetch(params) {
        const mockFetch = (route) => {
            if (route.includes("load_menus")) {
                return {};
            }
            return "";
        };
        const fetch = (...args) => {
            let res = params && params.mockFetch ? params.mockFetch(...args) : undefined;
            if (res === undefined || res === null) {
                res = mockFetch(...args);
            }
            return Array.isArray(res) ? res : [res];
        };
        return (input) => {
            const route = typeof input === "string" ? input : input.url;
            const res = fetch(route);
            const blob = new Blob(res.map((r) => JSON.stringify(r)), { type: "application/json" });
            return Promise.resolve(new Response(blob, { status: 200 }));
        };
    }
    // -----------------------------------------------------------------------------
    // Private (should not be called from any test)
    // -----------------------------------------------------------------------------
    let templates;
    function setTemplates(xml) {
        templates = xml;
    }

    // -----------------------------------------------------------------------------
    // QUnit config
    // -----------------------------------------------------------------------------
    QUnit$1.config.autostart = false;
    QUnit$1.config.testTimeout = 1 * 60 * 1000;
    // -----------------------------------------------------------------------------
    // QUnit assert
    // -----------------------------------------------------------------------------
    /**
     * Checks that the target element contains exactly n matches for the selector.
     *
     * Example: assert.containsN(document.body, '.modal', 0)
     *
     * @param {HTMLElement} el
     * @param {string} selector
     * @param {number} n
     * @param {string} [msg]
     */
    function containsN(el, selector, n, msg) {
        msg = msg || `Selector '${selector}' should have exactly ${n} matches inside the target`;
        const matches = el.querySelectorAll(selector);
        QUnit$1.assert.strictEqual(matches.length, n, msg);
    }
    /**
     * Checks that the target element contains exactly 0 match for the selector.
     *
     * @param {HTMLElement} el
     * @param {string} selector
     * @param {string} [msg]
     */
    function containsNone(el, selector, msg) {
        containsN(el, selector, 0, msg);
    }
    /**
     * Checks that the target element contains exactly 1 match for the selector.
     *
     * @param {HTMLElement} el
     * @param {string} selector
     * @param {string} [msg]
     */
    function containsOnce(el, selector, msg) {
        containsN(el, selector, 1, msg);
    }
    /**
     * Helper function, to check if a given element has (or has not) classnames.
     *
     * @private
     * @param {HTMLElement} el
     * @param {string} classNames
     * @param {boolean} shouldHaveClass
     * @param {string} [msg]
     */
    function _checkClass(el, classNames, shouldHaveClass, msg) {
        msg = msg || `target should ${shouldHaveClass ? "have" : "not have"} classnames ${classNames}`;
        const isFalse = classNames.split(" ").some((cls) => {
            const hasClass = el.classList.contains(cls);
            return shouldHaveClass ? !hasClass : hasClass;
        });
        QUnit$1.assert.ok(!isFalse, msg);
    }
    /**
     * Checks that the target element has the given classnames.
     *
     * @param {HTMLElement} el
     * @param {string} classNames
     * @param {string} [msg]
     */
    function hasClass(el, classNames, msg) {
        _checkClass(el, classNames, true, msg);
    }
    /**
     * Checks that the target element does not have the given classnames.
     *
     * @param {HTMLElement} el
     * @param {string} classNames
     * @param {string} [msg]
     */
    function doesNotHaveClass(el, classNames, msg) {
        _checkClass(el, classNames, false, msg);
    }
    QUnit$1.assert.containsN = containsN;
    QUnit$1.assert.containsNone = containsNone;
    QUnit$1.assert.containsOnce = containsOnce;
    QUnit$1.assert.doesNotHaveClass = doesNotHaveClass;
    QUnit$1.assert.hasClass = hasClass;
    const QUnitCopy = QUnit$1; // to remove rollup warnings
    QUnitCopy.debug = (name, cb) => {
        QUnit$1.config.debug = true;
        QUnit$1.only(name, cb);
    };
    // -----------------------------------------------------------------------------
    // QUnit logs
    // -----------------------------------------------------------------------------
    /**
     * If we want to log several errors, we have to log all of them at once, as
     * browser_js is closed as soon as an error is logged.
     */
    const errorMessages = [];
    QUnit$1.done(async (result) => {
        if (result.failed) {
            errorMessages.push(`${result.failed} / ${result.total} tests failed.`);
        }
        if (!result.failed) {
            console.log("test successful");
        }
        else {
            console.error(errorMessages.join("\n"));
        }
    });
    /**
     * This logs various data in the console, which will be available in the log
     * .txt file generated by the runbot.
     */
    QUnit$1.log((result) => {
        if (result.result) {
            return;
        }
        let info = '"QUnit test failed: "'; // + result.module + ' > ' + result.name + '"';
        info += ' [message: "' + result.message + '"';
        if (result.actual !== null) {
            info += ', actual: "' + result.actual + '"';
        }
        if (result.expected !== null) {
            info += ', expected: "' + result.expected + '"';
        }
        info += "]";
        errorMessages.push(info);
    });

    class Action extends owl.Component {
    }
    Action.template = "wowl.Action";

    let target;
    let env;
    QUnit$1.module("Action", {
        async beforeEach() {
            target = getFixture();
            env = await makeTestEnv();
        },
    });
    QUnit$1.test("can be rendered", async (assert) => {
        assert.expect(1);
        await mount(Action, { env, target });
        assert.strictEqual(target.innerText, "Hello Action");
    });

    class NavBar extends owl.Component {
        constructor() {
            super(...arguments);
            this.menuRepo = useService("menus");
        }
    }
    NavBar.template = "wowl.NavBar";

    const loadMenusUrl = `/wowl/load_menus`;
    async function fetchLoadMenus(env, url) {
        const res = await env.browser.fetch(url);
        if (!res.ok) {
            throw new Error("Error while fetching menus");
        }
        return res.json();
    }
    async function makeMenus(env, loadMenusHash) {
        const menusData = await fetchLoadMenus(env, `${loadMenusUrl}/${loadMenusHash}`);
        const menuService = {
            getAll() {
                return Object.values(menusData);
            },
            getApps() {
                return this.getMenu("root").children.map((mid) => this.getMenu(mid));
            },
            getMenu(menuID) {
                return menusData[menuID];
            },
            getMenuAsTree(menuID) {
                const menu = this.getMenu(menuID);
                if (!menu.childrenTree) {
                    menu.childrenTree = menu.children.map((mid) => this.getMenuAsTree(mid));
                }
                return menu;
            },
        };
        return menuService;
    }
    const menusService = {
        name: "menus",
        async deploy(env, odooGlobal) {
            const cacheHashes = ((odooGlobal ? odooGlobal.session_info.cache_hashes : {}) || {});
            const loadMenusHash = cacheHashes.load_menus || new Date().getTime().toString();
            delete cacheHashes.load_menus;
            return makeMenus(env, loadMenusHash);
        },
    };

    let target$1;
    let env$1;
    let menus;
    let services;
    let browser;
    QUnit$1.module("Navbar", {
        async beforeEach() {
            services = new Registry();
            services.add(menusService.name, menusService);
            menus = {
                root: { id: "root", children: [1], name: "root" },
                1: { id: 1, children: [], name: "App0" },
            };
            target$1 = getFixture();
            browser = {
                fetch: createMockedFetch({
                    mockFetch(route) {
                        if (route.includes("load_menus")) {
                            return menus;
                        }
                    },
                }),
            };
            env$1 = await makeTestEnv({ browser, services });
        },
    });
    QUnit$1.test("can be rendered", async (assert) => {
        assert.expect(1);
        const navbar = await mount(NavBar, { env: env$1, target: target$1 });
        assert.containsOnce(navbar.el, '.o_menu_apps a[role="menuitem"]', "1 app present");
    });

    class Notification extends owl.Component {
        constructor() {
            super(...arguments);
            this.notificationService = useService("notifications");
        }
        get icon() {
            switch (this.props.type) {
                case "danger":
                    return "fa-exclamation";
                case "warning":
                    return "fa-lightbulb-o";
                case "success":
                    return "fa-check";
                case "info":
                    return "fa-info";
                default:
                    return this.props.icon;
            }
        }
        get className() {
            let className;
            switch (this.props.type) {
                case "danger":
                    className = "bg-danger";
                    break;
                case "warning":
                    className = "bg-warning";
                    break;
                case "success":
                    className = "bg-success";
                    break;
                case "info":
                    className = "bg-info";
                    break;
            }
            return className ? `${className} ${this.props.className}` : this.props.className;
        }
    }
    Notification.template = "wowl.Notification";
    Notification.props = {
        id: { type: Number },
        message: { type: String },
        title: { type: String, optional: true },
        type: {
            type: String,
            optional: true,
            validate: (t) => ["warning", "danger", "success", "info"].includes(t),
        },
        className: { type: String, optional: true },
        icon: { type: String, optional: true },
        buttons: {
            type: Array,
            element: {
                type: Object,
                shape: {
                    name: { type: String },
                    icon: { type: String, optional: true },
                    primary: { type: Boolean, optional: true },
                },
            },
        },
    };
    Notification.defaultProps = {
        buttons: [],
        className: "",
        type: "warning",
    };

    const AUTOCLOSE_DELAY = 4000;
    class NotificationManager extends owl.Component {
        constructor() {
            super(...arguments);
            this.notifications = [];
            this.env.bus.on("NOTIFICATIONS_CHANGE", this, (notifications) => {
                this.notifications = notifications;
                this.render();
            });
        }
    }
    NotificationManager.template = owl.tags.xml `
    <div class="o_notification_manager">
        <t t-foreach="notifications" t-as="notification" t-key="notification.id">
            <NotificationComponent t-props="notification"/>
        </t>
    </div>`;
    NotificationManager.components = { NotificationComponent: Notification };
    const notificationService = {
        name: "notifications",
        deploy(env) {
            let notifId = 0;
            let notifications = [];
            function close(id) {
                const index = notifications.findIndex((n) => n.id === id);
                if (index > -1) {
                    notifications.splice(index, 1);
                    env.bus.trigger("NOTIFICATIONS_CHANGE", notifications);
                }
            }
            function create(message, options) {
                const notif = Object.assign({}, options, {
                    id: ++notifId,
                    message,
                });
                notifications.push(notif);
                env.bus.trigger("NOTIFICATIONS_CHANGE", notifications);
                if (!notif.sticky) {
                    env.browser.setTimeout(() => close(notif.id), AUTOCLOSE_DELAY);
                }
                return notif.id;
            }
            return { close, create };
        },
    };

    let target$2;
    let browser$1;
    let services$1;
    QUnit$1.module("Notifications", {
        async beforeEach() {
            target$2 = getFixture();
            services$1 = new Registry();
            services$1.add(notificationService.name, notificationService);
            browser$1 = { setTimeout: () => 1 };
        },
    });
    QUnit$1.test("can display a basic notification", async (assert) => {
        assert.expect(4);
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        env.bus.on("NOTIFICATIONS_CHANGE", null, (notifs) => {
            assert.strictEqual(notifs.length, 1);
        });
        notifications.create("I'm a basic notification");
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        const notif = target$2.querySelector(".o_notification");
        assert.strictEqual(notif.innerText, "I'm a basic notification");
        assert.hasClass(notif, "bg-warning");
    });
    QUnit$1.test("can display a notification of type danger", async (assert) => {
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        notifications.create("I'm a danger notification", { type: "danger" });
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        const notif = target$2.querySelector(".o_notification");
        assert.strictEqual(notif.innerText, "I'm a danger notification");
        assert.hasClass(notif, "bg-danger");
    });
    QUnit$1.test("can display a danger notification with a title", async (assert) => {
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        notifications.create("I'm a danger notification", { title: "Some title", type: "danger" });
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        const notif = target$2.querySelector(".o_notification");
        assert.strictEqual(notif.querySelector(".toast-header").innerText, "Some title");
        assert.strictEqual(notif.querySelector(".toast-body").innerText, "I'm a danger notification");
        assert.hasClass(notif, "bg-danger");
        assert.hasClass(notif.querySelector(".o_notification_icon"), "fa-exclamation");
    });
    QUnit$1.test("notifications aren't sticky by default", async (assert) => {
        let timeoutCB;
        browser$1.setTimeout = (cb) => {
            timeoutCB = cb;
            return 1;
        };
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        notifications.create("I'm a notification");
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        timeoutCB(); // should close the notification
        await nextTick();
        assert.containsNone(target$2, ".o_notification");
    });
    QUnit$1.test("can display a sticky notification", async (assert) => {
        browser$1.setTimeout = () => {
            throw new Error("Should not register a callback for sticky notifications");
        };
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        notifications.create("I'm a sticky notification", { sticky: true });
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
    });
    QUnit$1.test("can close sticky notification", async (assert) => {
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        let id = notifications.create("I'm a sticky notification", { sticky: true });
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        // close programmatically
        notifications.close(id);
        await nextTick();
        assert.containsNone(target$2, ".o_notification");
        id = notifications.create("I'm a sticky notification", { sticky: true });
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        // close by clicking on the close icon
        await click(target$2, ".o_notification .o_notification_close");
        assert.containsNone(target$2, ".o_notification");
    });
    QUnit$1.test("can close a non-sticky notification", async (assert) => {
        let timeoutCB;
        browser$1.setTimeout = (cb) => {
            timeoutCB = cb;
            return 1;
        };
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        const id = notifications.create("I'm a sticky notification");
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        // close the notification
        notifications.close(id);
        await nextTick();
        assert.containsNone(target$2, ".o_notification");
        // simulate end of timeout, which should try to close the notification as well
        timeoutCB();
        await nextTick();
        assert.containsNone(target$2, ".o_notification");
    });
    QUnit$1.test("close a non-sticky notification while another one remains", async (assert) => {
        let timeoutCB;
        browser$1.setTimeout = (cb) => {
            timeoutCB = cb;
            return 1;
        };
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        await mount(NotificationManager, { env, target: target$2 });
        const id1 = notifications.create("I'm a non-sticky notification");
        const id2 = notifications.create("I'm a sticky notification", { sticky: true });
        await nextTick();
        assert.containsN(target$2, ".o_notification", 2);
        // close the non sticky notification
        notifications.close(id1);
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        // simulate end of timeout, which should try to close notification 1 as well
        timeoutCB();
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
        // close the non sticky notification
        notifications.close(id2);
        await nextTick();
        assert.containsNone(target$2, ".o_notification");
    });
    QUnit$1.test("notification coming when NotificationManager not mounted yet", async (assert) => {
        const env = await makeTestEnv({ browser: browser$1, services: services$1 });
        const notifications = env.services.notifications;
        mount(NotificationManager, { env, target: target$2 });
        notifications.create("I'm a non-sticky notification");
        await nextTick();
        assert.containsOnce(target$2, ".o_notification");
    });

    function parseString(str) {
        const parts = str.split("&");
        const result = {};
        for (let part of parts) {
            const [key, value] = part.split("=");
            result[key] = value || "";
        }
        return result;
    }
    function parseHash(hash) {
        return hash === "#" || hash === "" ? {} : parseString(hash.slice(1));
    }
    function parseSearchQuery(search) {
        return search === "" ? {} : parseString(search.slice(1));
    }
    function toString(query) {
        return Object.entries(query)
            .map(([k, v]) => (v ? `${k}=${v}` : k))
            .join("&");
    }
    function routeToUrl(route) {
        const search = toString(route.search);
        const hash = toString(route.hash);
        return route.pathname + (search ? "?" + search : "") + (hash ? "#" + hash : "");
    }

    QUnit$1.module("Router");
    QUnit$1.test("can parse an empty hash", (assert) => {
        assert.deepEqual(parseHash(""), {});
    });
    QUnit$1.test("can parse an single hash", (assert) => {
        assert.deepEqual(parseHash("#"), {});
    });
    QUnit$1.test("can parse a hash with a single key/value pair", (assert) => {
        const hash = "#action=114";
        assert.deepEqual(parseHash(hash), { action: "114" });
    });
    QUnit$1.test("can parse a hash with 2 key/value pairs", (assert) => {
        const hash = "#action=114&active_id=mail.box_inbox";
        assert.deepEqual(parseHash(hash), { action: "114", active_id: "mail.box_inbox" });
    });
    QUnit$1.test("a missing value is encoded as an empty string", (assert) => {
        const hash = "#action";
        assert.deepEqual(parseHash(hash), { action: "" });
    });
    QUnit$1.test("can parse a realistic hash", (assert) => {
        const hash = "#action=114&active_id=mail.box_inbox&cids=1&menu_id=91";
        const expected = {
            action: "114",
            active_id: "mail.box_inbox",
            cids: "1",
            menu_id: "91",
        };
        assert.deepEqual(parseHash(hash), expected);
    });
    QUnit$1.test("can parse an empty search", (assert) => {
        assert.deepEqual(parseSearchQuery(""), {});
    });
    QUnit$1.test("can parse an simple search with no value", (assert) => {
        assert.deepEqual(parseSearchQuery("?a"), { a: "" });
    });
    QUnit$1.test("can parse an simple search with a value", (assert) => {
        assert.deepEqual(parseSearchQuery("?a=1"), { a: "1" });
    });
    QUnit$1.test("can parse an search with 2 key/value pairs", (assert) => {
        assert.deepEqual(parseSearchQuery("?a=1&b=2"), { a: "1", b: "2" });
    });
    QUnit$1.test("routeToUrl", (assert) => {
        const route = { pathname: "/asf", search: {}, hash: {} };
        assert.strictEqual(routeToUrl(route), "/asf");
        route.search = { a: "11" };
        assert.strictEqual(routeToUrl(route), "/asf?a=11");
        route.hash = { b: "2", c: "" };
        assert.strictEqual(routeToUrl(route), "/asf?a=11#b=2&c");
    });

    // -----------------------------------------------------------------------------
    // Main RPC method
    // -----------------------------------------------------------------------------
    function computeParams(query, env) {
        const userContext = env.services["user"].context;
        let params;
        if ("route" in query) {
            // call a controller
            params = query.params || {};
            params.context = userContext;
        }
        else {
            // call a model
            params = { model: query.model, method: query.method };
            let context = userContext;
            params.args = query.args || [];
            params.kwargs = { context };
            if (query.kwargs) {
                Object.assign(params.kwargs, query.kwargs);
            }
            if (query.kwargs && query.kwargs.context) {
                params.kwargs.context = Object.assign({}, userContext, query.kwargs.context);
            }
        }
        return params;
    }
    function jsonrpc(query, env) {
        const bus = env.bus;
        const XHR = env.browser.XMLHttpRequest;
        const data = {
            id: Math.floor(Math.random() * 1000 * 1000 * 1000),
            jsonrpc: "2.0",
            method: "call",
            params: computeParams(query, env),
        };
        let url;
        if ("route" in query) {
            url = query.route;
        }
        else {
            url = `/web/dataset/call_kw/${query.model}/${query.method}`;
        }
        return new Promise((resolve, reject) => {
            const request = new XHR();
            // handle success
            request.addEventListener("load", (data) => {
                const response = JSON.parse(request.response);
                if ("error" in response) {
                    // Odoo returns error like this, in a error field instead of properly
                    // using http error codes...
                    const error = {
                        type: "server",
                        message: response.error.message,
                        code: response.error.code,
                        data_debug: response.error.data.debug,
                        data_message: response.error.data.message,
                    };
                    bus.trigger("RPC_ERROR", error);
                    reject(error);
                }
                resolve(response.result);
            });
            // handle failure
            request.addEventListener("error", () => {
                const error = {
                    type: "network",
                };
                bus.trigger("RPC_ERROR", error);
                reject(error);
            });
            // configure and send request
            request.open("POST", url);
            request.setRequestHeader("Content-Type", "application/json");
            request.send(JSON.stringify(data));
        });
    }
    // -----------------------------------------------------------------------------
    // RPC service
    // -----------------------------------------------------------------------------
    const rpcService = {
        dependencies: ["user"],
        name: "rpc",
        deploy(env) {
            return async function (query) {
                return await jsonrpc(query, env);
            };
        },
        specialize(component, rpc) {
            return async function (query) {
                if (component.__owl__.isDestroyed) {
                    throw new Error("A destroyed component should never initiate a RPC");
                }
                const result = await rpc(query);
                if (this instanceof owl.Component && this.__owl__.isDestroyed) {
                    return new Promise(() => { });
                }
                return result;
            };
        },
    };

    const { xml } = owl.tags;
    // -----------------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------------
    function createMockXHR(response, sendCb, def) {
        let MockXHR = function () {
            return {
                _loadListener: null,
                url: "",
                addEventListener(type, listener) {
                    if (type === "load") {
                        this._loadListener = listener;
                    }
                },
                open(method, url) {
                    this.url = url;
                },
                setRequestHeader() { },
                async send(data) {
                    if (sendCb) {
                        sendCb.call(this, JSON.parse(data));
                    }
                    if (def) {
                        await def;
                    }
                    this._loadListener();
                },
                response: JSON.stringify(response || ""),
            };
        };
        return MockXHR;
    }
    async function testRPC(query) {
        let url = "";
        let request;
        let MockXHR = createMockXHR({ test: true }, function (data) {
            request = data;
            url = this.url;
        });
        const env = await makeTestEnv({
            services: serviceRegistry,
            browser: { XMLHttpRequest: MockXHR },
        });
        await env.services.rpc(query);
        return { url, request };
    }
    // -----------------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------------
    let serviceRegistry;
    QUnit$1.module("RPC", {
        beforeEach() {
            serviceRegistry = new Registry();
            serviceRegistry.add("user", makeFakeUserService());
            serviceRegistry.add("rpc", rpcService);
        },
    });
    QUnit$1.test("can perform a simple rpc", async (assert) => {
        assert.expect(4);
        let MockXHR = createMockXHR({ result: { action_id: 123 } }, (request) => {
            assert.strictEqual(request.jsonrpc, "2.0");
            assert.strictEqual(request.method, "call");
            assert.ok(typeof request.id === "number");
        });
        const env = await makeTestEnv({
            services: serviceRegistry,
            browser: { XMLHttpRequest: MockXHR },
        });
        const result = await env.services.rpc({ route: "/test/" });
        assert.deepEqual(result, { action_id: 123 });
    });
    QUnit$1.test("trigger an error on bus when response has 'error' key", async (assert) => {
        assert.expect(2);
        const error = {
            message: "message",
            code: 12,
            data: {
                debug: "data_debug",
                message: "data_message",
            },
        };
        let MockXHR = createMockXHR({ error });
        const env = await makeTestEnv({
            services: serviceRegistry,
            browser: { XMLHttpRequest: MockXHR },
        });
        env.bus.on("RPC_ERROR", null, (payload) => {
            assert.deepEqual(payload, {
                code: 12,
                data_debug: "data_debug",
                data_message: "data_message",
                message: "message",
                type: "server",
            });
        });
        try {
            await env.services.rpc({ route: "/test/" });
        }
        catch (e) {
            assert.ok(true);
        }
    });
    QUnit$1.test("add user context to every (route) request", async (assert) => {
        assert.expect(2);
        let MockXHR = createMockXHR({ result: { some: "request" } }, (data) => {
            assert.deepEqual(data.params.context, {
                allowed_company_ids: [1],
                lang: "en_us",
                tz: "Europe/Brussels",
                uid: 2,
            });
        });
        const env = await makeTestEnv({
            services: serviceRegistry,
            browser: { XMLHttpRequest: MockXHR },
        });
        const result = await env.services.rpc({ route: "/test/" });
        assert.deepEqual(result, { some: "request" });
    });
    QUnit$1.test("rpc with simple routes", async (assert) => {
        const info1 = await testRPC({ route: "/my/route" });
        assert.strictEqual(info1.url, "/my/route");
        const info2 = await testRPC({ route: "/my/route", params: { hey: "there", model: "test" } });
        assert.deepEqual(info2.request.params, {
            context: {
                allowed_company_ids: [1],
                lang: "en_us",
                tz: "Europe/Brussels",
                uid: 2,
            },
            hey: "there",
            model: "test",
        });
    });
    QUnit$1.test("basic rpc with context", async (assert) => {
        const info = await testRPC({ model: "partner", method: "test", kwargs: { context: { a: 1 } } });
        assert.deepEqual(info.request.params.kwargs.context, {
            allowed_company_ids: [1],
            lang: "en_us",
            tz: "Europe/Brussels",
            uid: 2,
            a: 1,
        });
    });
    QUnit$1.test("basic rpc (method of model)", async (assert) => {
        const info = await testRPC({ model: "partner", method: "test", kwargs: { context: { a: 1 } } });
        assert.strictEqual(info.url, "/web/dataset/call_kw/partner/test");
        assert.strictEqual(info.request.params.model, "partner");
        assert.strictEqual(info.request.params.method, "test");
    });
    QUnit$1.test("rpc with args and kwargs", async (assert) => {
        const info = await testRPC({
            model: "partner",
            method: "test",
            args: ["arg1", 2],
            kwargs: { k: 78 },
        });
        assert.strictEqual(info.url, "/web/dataset/call_kw/partner/test");
        assert.strictEqual(info.request.params.args[0], "arg1");
        assert.strictEqual(info.request.params.args[1], 2);
        assert.strictEqual(info.request.params.kwargs.k, 78);
    });
    QUnit$1.test("rpc coming from destroyed components are left pending", async (assert) => {
        class MyComponent extends owl.Component {
            constructor() {
                super(...arguments);
                this.rpc = useService("rpc");
            }
        }
        MyComponent.template = xml `<div/>`;
        const def = makeDeferred();
        let MockXHR = createMockXHR({ result: "1" }, () => { }, def);
        const env = await makeTestEnv({
            services: serviceRegistry,
            browser: { XMLHttpRequest: MockXHR },
        });
        const component = await mount(MyComponent, { env, target: getFixture() });
        let isResolved = false;
        let isFailed = false;
        component
            .rpc({ route: "/my/route" })
            .then(() => {
            isResolved = true;
        })
            .catch(() => {
            isFailed = true;
        });
        assert.strictEqual(isResolved, false);
        assert.strictEqual(isFailed, false);
        component.destroy();
        def.resolve();
        await nextTick();
        assert.strictEqual(isResolved, false);
        assert.strictEqual(isFailed, false);
    });
    QUnit$1.test("rpc initiated from destroyed components throw exception", async (assert) => {
        assert.expect(1);
        class MyComponent extends owl.Component {
            constructor() {
                super(...arguments);
                this.rpc = useService("rpc");
            }
        }
        MyComponent.template = xml `<div/>`;
        const env = await makeTestEnv({
            services: serviceRegistry,
        });
        const component = await mount(MyComponent, { env, target: getFixture() });
        component.destroy();
        try {
            await component.rpc({ route: "/my/route" });
        }
        catch (e) {
            assert.strictEqual(e.message, "A destroyed component should never initiate a RPC");
        }
    });

    let registry;
    let env$2;
    QUnit$1.module("deployServices", {
        beforeEach() {
            registry = new Registry();
            env$2 = { services: {} };
        },
    });
    QUnit$1.test("can deploy a service", async (assert) => {
        registry.add("test", {
            name: "test",
            deploy() {
                return 17;
            },
        });
        await deployServices(env$2, registry);
        assert.strictEqual(env$2.services.test, 17);
    });
    QUnit$1.test("can deploy an asynchronous service", async (assert) => {
        const def = makeDeferred();
        registry.add("test", {
            name: "test",
            deploy() {
                return def;
            },
        });
        deployServices(env$2, registry);
        assert.strictEqual(env$2.services.test, undefined);
        def.resolve(15);
        await Promise.resolve();
        assert.strictEqual(env$2.services.test, 15);
    });
    QUnit$1.test("can deploy two sequentially dependant asynchronous services", async (assert) => {
        const def1 = makeDeferred();
        const def2 = makeDeferred();
        registry.add("test2", {
            dependencies: ["test1"],
            name: "test2",
            deploy() {
                assert.step("test2");
                return def2;
            },
        });
        registry.add("test1", {
            name: "test1",
            deploy() {
                assert.step("test1");
                return def1;
            },
        });
        registry.add("test3", {
            dependencies: ["test2"],
            name: "test3",
            deploy() {
                assert.step("test3");
            },
        });
        deployServices(env$2, registry);
        await nextTick();
        assert.verifySteps(["test1"]);
        def2.resolve();
        await nextTick();
        assert.verifySteps([]);
        def1.resolve();
        await nextTick();
        assert.verifySteps(["test2", "test3"]);
    });
    QUnit$1.test("can deploy two independant asynchronous services in parallel", async (assert) => {
        const def1 = makeDeferred();
        const def2 = makeDeferred();
        registry.add("test1", {
            name: "test1",
            deploy() {
                assert.step("test1");
                return def1;
            },
        });
        registry.add("test2", {
            name: "test2",
            deploy() {
                assert.step("test2");
                return def2;
            },
        });
        registry.add("test3", {
            dependencies: ["test1", "test2"],
            name: "test3",
            deploy() {
                assert.step("test3");
            },
        });
        deployServices(env$2, registry);
        await nextTick();
        assert.verifySteps(["test1", "test2"]);
        def1.resolve();
        await nextTick();
        assert.verifySteps([]);
        def2.resolve();
        await nextTick();
        assert.verifySteps(["test3"]);
    });
    QUnit$1.test("can deploy a service with a dependency", async (assert) => {
        registry.add("aang", {
            dependencies: ["appa"],
            name: "aang",
            deploy() {
                assert.step("aang");
            },
        });
        registry.add("appa", {
            name: "appa",
            deploy() {
                assert.step("appa");
            },
        });
        await deployServices(env$2, registry);
        assert.verifySteps(["appa", "aang"]);
    });
    QUnit$1.test("throw an error if missing dependency", async (assert) => {
        assert.expect(1);
        registry.add("aang", {
            dependencies: ["appa"],
            name: "aang",
            deploy() {
                assert.step("aang");
            },
        });
        try {
            await deployServices(env$2, registry);
        }
        catch (e) {
            assert.ok(true);
        }
    });

    // import { useService } from "../../services";
    class WebClient extends owl.Component {
        constructor() {
            super(...arguments);
            this.Components = this.env.registries.Components.getEntries();
            // notificationService = useService("notifications");
            // rpc = useService("rpc");
            // async willStart() {
            //   const data = await this.rpc({ model: "sale.order", method: "read", args: [[7], ["state", "partner_id"]]});
            //   console.log(data)
            // }
        }
    }
    WebClient.components = { Action, NavBar };
    WebClient.template = "wowl.WebClient";

    const { xml: xml$1 } = owl.tags;
    let target$3;
    let env$3;
    let services$2;
    QUnit$1.module("Web Client", {
        async beforeEach() {
            target$3 = getFixture();
            services$2 = new Registry();
            services$2.add("user", makeFakeUserService());
            services$2.add("menus", makeFakeMenusService());
            env$3 = await makeTestEnv({ services: services$2 });
        },
    });
    QUnit$1.test("can be rendered", async (assert) => {
        assert.expect(1);
        await mount(WebClient, { env: env$3, target: target$3 });
        assert.strictEqual(target$3.innerText, "Hello WebClient\nHello Action");
    });
    QUnit$1.test("can render a main component", async (assert) => {
        assert.expect(1);
        class MyComponent extends owl.Component {
        }
        MyComponent.template = xml$1 `<span class="chocolate">MyComponent</span>`;
        const componentRegistry = new Registry();
        componentRegistry.add("mycomponent", MyComponent);
        env$3 = await makeTestEnv({ Components: componentRegistry, services: services$2 });
        await mount(WebClient, { env: env$3, target: target$3 });
        assert.ok(target$3.querySelector(".chocolate"));
    });

    const { whenReady, loadFile } = owl.utils;
    (async () => {
        const templatesUrl = `/wowl/templates/${new Date().getTime()}`;
        const templates = await loadFile(templatesUrl);
        setTemplates(templates);
        await whenReady();
        QUnit.start();
    })();

}(owl, QUnit));
