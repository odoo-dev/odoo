odoo.define('mail.owl.test_utils', function (require) {
"use strict";

const BusService = require('bus.BusService');

const ChatWindowService = require('mail.service.ChatWindowService');
const EnvService = require('mail.service.Env');
const StoreService = require('mail.service.Store');
const Discuss = require('mail.widget.Discuss');
const MessagingMenu = require('mail.widget.MessagingMenu');

const AbstractStorageService = require('web.AbstractStorageService');
const Class = require('web.Class');
const NotificationService = require('web.NotificationService');
const RamStorage = require('web.RamStorage');
const testUtils = require('web.test_utils');
const Widget = require('web.Widget');

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

const MockMailService = Class.extend({
    bus_service() {
        return BusService.extend({
            _poll() {}, // Do nothing
            isOdooFocused() { return true; },
            updateOption() {},
        });
    },
    chat_window() {
        return ChatWindowService;
    },
    env() {
        return EnvService;
    },
    local_storage() {
        return AbstractStorageService.extend({
            storage: new RamStorage(),
        });
    },
    notification() {
        return NotificationService;
    },
    store_service() {
        return StoreService;
    },
    getServices() {
        return {
            bus_service: this.bus_service(),
            chat_window: this.chat_window(),
            env: this.env(),
            local_storage: this.local_storage(),
            notification: this.notification(),
            store: this.store_service(),
        };
    },
});

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

/**
 * @param {Object} self qunit test environment
 */
function afterEach(self) {
    // unpatch _.debounce and _.throttle
    _.debounce = self.underscoreDebounce;
    _.throttle = self.underscoreThrottle;
}

function beforeEach(self) {
    // patch _.debounce and _.throttle to be fast and synchronous
    self.underscoreDebounce = _.debounce;
    self.underscoreThrottle = _.throttle;
    _.debounce = _.identity;
    _.throttle = _.identity;

    self.data = {
        initMessaging: {
            channel_slots: {},
            commands: [],
            is_moderator: false,
            mail_failures: [],
            mention_partner_suggestions: [],
            menu_id: false,
            moderation_counter: 0,
            moderation_channel_ids: [],
            needaction_inbox_counter: 0,
            shortcodes: [],
            starred_counter: 0,
        },
        'mail.message': {
            fields: {},
        },
    };
}

/**
 * Create chat window manager, discuss, and messaging menu with
 * messaging store
 *
 * @param {Object} params
 * @param {boolean} [params.autoOpenDiscuss=false]
 * @param {boolean} [params.debug=false]
 * @param {Object} [params.initStoreStateAlteration]
 * @param {Object} [params.session={}]
 * @param {string} [params.session.name="Admin"]
 * @param {integer} [params.session.partner_id=3]
 * @param {string} [params.session.partner_display_name="Your Company, Admin"]
 * @param {integer} [params.session.uid=2]
 * @return {Promise}
 */
async function createAll(params) {
    const Parent = Widget.extend({
        do_push_state: function () {},
    });
    const parent = new Parent();
    params.archs = params.archs || {
        'mail.message,false,search': '<search/>',
    };
    params.services = new MockMailService().getServices();
    params.session = params.session || {};
    _.defaults(params.session, {
        name: "Admin",
        partner_id: 3,
        partner_display_name: "Your Company, Admin",
        uid: 2,
    });
    const selector = params.debug ? 'body' : '#qunit-fixture';
    params.services.env.prototype.TEST_ENV.active = true;
    let ORIGINAL_STORE_SERVICE_TEST_ENV = params.services.store.prototype.TEST_ENV;
    Object.assign(params.services.store.prototype.TEST_ENV, {
        active: true,
        initStateAlteration: params.initStoreStateAlteration || {
            globalWindow: {
                innerHeight: 1080,
                innerWidth: 1920,
            },
            isMobile: false,
        }
    });
    let ORIGINAL_CHAT_WINDOW_SERVICE_TEST_ENV = params.services.chat_window.prototype.TEST_ENV;
    Object.assign(params.services.chat_window.prototype.TEST_ENV, {
        active: true,
        container: selector,
    });
    testUtils.mock.addMockEnvironment(parent, params);
    const discuss = new Discuss(parent, params);
    const menu = new MessagingMenu(parent, params);
    const widget = new Widget(parent);

    Object.assign(widget, {
        closeDiscuss() {
            discuss.on_detach_callback();
        },
        destroy() {
            params.services.chat_window.prototype.TEST_ENV = ORIGINAL_CHAT_WINDOW_SERVICE_TEST_ENV;
            params.services.env.prototype.TEST_ENV.active = false;
            params.services.store.prototype.TEST_ENV = ORIGINAL_STORE_SERVICE_TEST_ENV;
            delete widget.destroy;
            delete window.o_test_store;
            widget.call('chat_window', 'destroy');
            parent.destroy();
        },
        openDiscuss() {
            discuss.on_attach_callback();
        },
    });

    await widget.appendTo($(selector));
    widget.call('chat_window', 'test:web_client_ready'); // trigger mounting of chat window manager
    await menu.appendTo($(selector));
    menu.on_attach_callback(); // trigger mounting of menu component
    await discuss.appendTo($(selector));
    if (params.autoOpenDiscuss) {
        widget.openDiscuss();
    }
    await testUtils.nextTick(); // mounting of chat window manager, discuss, and messaging menu
    const store = await widget.call('store', 'get');
    if (params.debug) {
        window.o_test_store = store;
    }
    return { store, widget };
}

/**
 * Create messaging store
 *
 * @param {Object} params
 * @param {boolean} [params.debug=false]
 * @param {Object} [params.initStoreStateAlteration]
 * @param {Object} [params.session={}]
 * @param {string} [params.session.name="Admin"]
 * @param {integer} [params.session.partner_id=3]
 * @param {string} [params.session.partner_display_name="Your Company, Admin"]
 * @param {integer} [params.session.uid=2]
 * @return {Promise}
 */
async function createStore(params) {
    const Parent = Widget.extend({
        do_push_state: function () {},
    });
    const parent = new Parent();
    const selector = params.debug ? 'body' : '#qunit-fixture';
    params.services = new MockMailService().getServices();
    params.session = params.session || {};
    _.defaults(params.session, {
        name: "Admin",
        partner_id: 3,
        partner_display_name: "Your Company, Admin",
        uid: 2,
    });
    params.services.env.prototype.TEST_ENV.active = true;
    let ORIGINAL_STORE_SERVICE_TEST_ENV = params.services.store.prototype.TEST_ENV;
    Object.assign(params.services.store.prototype.TEST_ENV, {
        active: true,
        initStateAlteration: params.initStoreStateAlteration || {
            globalWindow: {
                innerHeight: 1080,
                innerWidth: 1920,
            },
            isMobile: false,
        }
    });

    testUtils.mock.addMockEnvironment(parent, params);
    const widget = new Widget(parent);

    Object.assign(widget, {
        destroy() {
            params.services.env.prototype.TEST_ENV.active = false;
            params.services.store.prototype.TEST_ENV = ORIGINAL_STORE_SERVICE_TEST_ENV;
            delete widget.destroy;
            delete window.o_test_store;
            parent.destroy();
        },
    });

    await widget.appendTo($(selector));
    const store = await widget.call('store', 'get');
    if (params.debug) {
        window.o_test_store = store;
    }
    return { store, widget };
}

async function pause() {
    await new Promise(resolve => {});
}

function getMailServices() {
    return new MockMailService().getServices();
}

//------------------------------------------------------------------------------
// Export
//------------------------------------------------------------------------------

return {
    afterEach,
    beforeEach,
    createAll,
    createStore,
    pause,
    getMailServices,
};

});
