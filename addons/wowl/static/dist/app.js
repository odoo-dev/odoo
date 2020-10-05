(function (owl) {
    'use strict';

    class Action extends owl.Component {
    }
    Action.template = "wowl.Action";

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

    class NavBar extends owl.Component {
        constructor() {
            super(...arguments);
            this.menuRepo = useService("menus");
            this.showDropdownMenu = false;
            this.toggleDropdownMenu = () => { this.showDropdownMenu = !this.showDropdownMenu; };
        }
    }
    NavBar.template = "wowl.NavBar";

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
    function getRoute() {
        const { pathname, search, hash } = window.location;
        const searchQuery = parseSearchQuery(search);
        const hashQuery = parseHash(hash);
        return { pathname, search: searchQuery, hash: hashQuery };
    }
    function makeRouter(env) {
        let bus = env.bus;
        let current = getRoute();
        window.addEventListener("hashchange", () => {
            current = getRoute();
            bus.trigger("ROUTE_CHANGE");
        });
        return {
            get current() {
                return current;
            },
            pushState(hash, replace = false) {
                if (!replace) {
                    hash = Object.assign({}, current.hash, hash);
                }
                const route = Object.assign({}, current, { hash });
                const url = location.origin + routeToUrl(route);
                if (url !== window.location.href) {
                    window.history.pushState({}, url, url);
                }
                current = getRoute();
            },
        };
    }
    const routerService = {
        name: "router",
        deploy(env) {
            return makeRouter(env);
        },
    };

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

    const userService = {
        name: "user",
        deploy() {
            const info = odoo.session_info;
            const { user_context, username, is_admin, partner_id, user_companies } = info;
            let context = {
                lang: user_context.lang,
                tz: user_context.tz,
                uid: info.uid,
                allowed_company_ids: user_companies.allowed_companies.map(([id]) => id),
            };
            return {
                context: context,
                get userId() {
                    return context.uid;
                },
                userName: username,
                isAdmin: is_admin,
                partnerId: partner_id,
                allowed_companies: user_companies.allowed_companies,
                current_company: user_companies.current_company,
                get lang() {
                    return context.lang;
                },
                get tz() {
                    return context.tz;
                },
            };
        },
    };

    const crashManagerService = {
        name: "crashmanager",
        async deploy(env) {
            const console = env.browser.console;
            env.bus.on("RPC_ERROR", null, (error) => {
                console.error(error);
            });
        },
    };

    // Services
    //
    // Services registered in this registry will be deployed in the env. A component
    // can then call the hook 'useService' in init with the name of the service it
    // needs.
    const serviceRegistry = new Registry();
    const services = [
        menusService,
        crashManagerService,
        notificationService,
        routerService,
        rpcService,
        userService,
    ];
    for (let service of services) {
        serviceRegistry.add(service.name, service);
    }
    // Main Components
    //
    // Components registered in this registry will be rendered inside the root node
    // of the webclient.
    const mainComponentRegistry = new Registry();
    mainComponentRegistry.add("NotificationManager", NotificationManager);
    const registries = {
        Components: mainComponentRegistry,
        services: serviceRegistry,
    };

    const { whenReady, loadFile } = owl.utils;
    (async () => {
        // load templates
        const templatesUrl = `/wowl/templates/${odoo.session_info.qweb}`;
        const templates = await loadFile(templatesUrl);
        // prepare browser object
        const c = new owl.Component();
        const baseEnv = c.env;
        const browser = Object.assign({}, baseEnv.browser, {
            XMLHttpRequest: window.XMLHttpRequest,
            console: window.console,
        });
        // setup environment
        const env = await makeEnv(templates, registries, browser, odoo);
        owl.Component.env = env;
        // start web client
        const root = new WebClient();
        await whenReady();
        await root.mount(document.body);
        // DEBUG. Remove this someday
        window.root = root;
    })();

}(owl));
