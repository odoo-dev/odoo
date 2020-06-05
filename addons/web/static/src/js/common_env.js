odoo.define("web.commonEnv", function (require) {
    "use strict";

    /**
     * This file defines the common environment, which contains everything that
     * is needed in the env for both the backend and the frontend (Odoo
     * terminology). This module shouldn't be used as is. It should only be
     * imported by the module defining the final env to use (in the frontend or
     * in the backend). For instance, module 'web.env' imports it, adds stuff to
     * it, and exports the final env that is used by the whole webclient
     * application.
     *
     * There should be as much dependencies as possible in the env object. This
     * will allow an easier testing of components. See [1] for more information
     * on environments.
     *
     * [1] https://github.com/odoo/owl/blob/master/doc/reference/environment.md#content-of-an-environment
     */

    const { jsonRpc } = require("web.ajax");
    const { device, isDebug } = require("web.config");
    const { bus, serviceRegistry } = require("web.core");
    const rpc = require("web.rpc");
    const session = require("web.session");
    const { _t } = require("web.translation");
    const utils = require("web.utils");


    // Build the basic env
    const env = {
        _t,
        bus,
        device,
        isDebug,
        qweb: new owl.QWeb({ translateFn: _t }),
        services: {
            ajaxJsonRPC() {
                return jsonRpc(...arguments);
            },
            getCookie() {
                return utils.get_cookie(...arguments);
            },
            httpRequest(route, params = {}, readMethod = 'json') {
                const info = {
                    method: params.method || 'POST',
                };
                if (params.method !== 'GET') {
                    const formData = new FormData();
                    for (const key in params) {
                        if (key === 'method') {
                            continue;
                        }
                        const value = params[key];
                        if (Array.isArray(value) && value.length) {
                            for (const val of value) {
                                formData.append(key, val);
                            }
                        } else {
                            formData.append(key, value);
                        }
                    }
                    info.body = formData;
                }
                return fetch(route, info).then(response => response[readMethod]());
            },
            navigate(url, params) {
                window.location = $.param.querystring(url, params);
            },
            reloadPage() {
                window.location.reload();
            },
            rpc(params, options) {
                const query = rpc.buildQuery(params);
                return session.rpc(query.route, query.params, options);
            },
            setCookie() {
                utils.set_cookie(...arguments);
            },
        },
        session,
    };


    // Deploy services in the env (specializations of AbstractService registered
    // into the serviceRegistry)
    const UndeployedServices = {}; // dict containing classes of undeployed services
    function _deployServices() {
        let done = false;
        while (!done) {
            const serviceName = _.findKey(UndeployedServices, Service => {
                // no missing dependency
                return !_.some(Service.prototype.dependencies, depName => {
                    return !env.services[depName];
                });
            });
            if (serviceName) {
                const Service = UndeployedServices[serviceName];
                const service = new Service(env);
                env.services[serviceName] = service;
                delete UndeployedServices[serviceName];
                service.start();
            } else {
                done = true;
            }
        }
    }
    Object.keys(serviceRegistry.map).forEach(serviceName => {
        if (serviceName in UndeployedServices) {
            throw new Error(`Service ${serviceName} is already loaded.`);
        }
        UndeployedServices[serviceName] = serviceRegistry.get(serviceName);
    });
    serviceRegistry.onAdd((serviceName, Service) => {
        if (serviceName in env.services || serviceName in UndeployedServices) {
            throw new Error(`Service ${serviceName} is already loaded.`);
        }
        UndeployedServices[serviceName] = Service;
        _deployServices();
    });
    _deployServices();


    return env;
});
