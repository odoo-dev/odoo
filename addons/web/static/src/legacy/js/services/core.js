/** @odoo-module **/

import Bus from "@web/legacy/js/core/bus";
import config from "@web/legacy/js/services/config";
import Class from "@web/legacy/js/core/class";
import QWeb from "@web/legacy/js/core/qweb";
import Registry from "@web/legacy/js/core/registry";
import translation from "@web/legacy/js/core/translation";

/**
 * Whether the client is currently in "debug" mode
 *
 * @type Boolean
 */
export var bus = new Bus();

["click","dblclick","keydown","keypress","keyup"].forEach((evtype) => {
    $('html').on(evtype, function (ev) {
        bus.trigger(evtype, ev);
    });
});
["resize", "scroll"].forEach((evtype) => {
    $(window).on(evtype, function (ev) {
        bus.trigger(evtype, ev);
    });
});

export const _t = translation._t;
export const _lt = translation._lt;
export const qweb = new QWeb(config.isDebug());
export const action_registry = new Registry();
export const crash_registry = new Registry();
export const serviceRegistry = new Registry();
export const csrf_token = odoo.csrf_token;
export const main_bus = new Bus();

export default {
    qweb: qweb,

    // core classes and functions
    Class: Class,
    bus: bus,
    main_bus: main_bus,
    _t: _t,
    _lt: _lt,

    // registries
    action_registry: action_registry,
    crash_registry: crash_registry,
    serviceRegistry: serviceRegistry,
    /**
     * @type {String}
     */
    csrf_token: csrf_token,
};
