/** @odoo-module alias=mail.utils.test.start **/

import BusService from 'bus.BusService';

import usingModels from 'mail.envMixins.usingModels';
import usingTimeControl from 'mail.envMixins.usingTimeControl';
import ChatWindowService from 'mail.services.ChatWindow';
import DialogService from 'mail.services.Dialog';
import afterNextRender from 'mail.utils.test.afterNextRender';
import DiscussWidget from 'mail.widgets.Discuss';
import MessagingMenuWidget from 'mail.widgets.MessagingMenu';

import AbstractStorageService from 'web.AbstractStorageService';
import NotificationService from 'web.NotificationService';
import RamStorage from 'web.RamStorage';
import { createActionManager, createView } from 'web.test_utils';
import {
    addMockEnvironment,
    patch,
    unpatch,
} from 'web.test_utils_mock';
import Widget from 'web.Widget';

const { Component } = owl;

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

/**
 * @private
 * @param {Object} callbacks
 * @param {function[]} callbacks.init
 * @param {function[]} callbacks.mount
 * @param {function[]} callbacks.destroy
 * @param {function[]} callbacks.return
 * @returns {Object} update callbacks
 */
function _useChatWindow(callbacks) {
    const {
        mount: prevMount,
        destroy: prevDestroy,
    } = callbacks;
    return {
        ...callbacks,
        mount: prevMount.concat(
            async () => {
                // trigger mounting of chat window manager
                await Component.env.services.chatWindow._onWebClientReady();
            },
        ),
        destroy: prevDestroy.concat(
            () => {
                Component.env.services.chatWindow.destroy();
            },
        ),
    };
}

/**
 * @private
 * @param {Object} callbacks
 * @param {function[]} callbacks.init
 * @param {function[]} callbacks.mount
 * @param {function[]} callbacks.destroy
 * @param {function[]} callbacks.return
 * @returns {Object} update callbacks
 */
function _useDialog(callbacks) {
    const {
        mount: prevMount,
        destroy: prevDestroy,
    } = callbacks;
    return {
        ...callbacks,
        mount: prevMount.concat(
            async () => {
                // trigger mounting of dialog manager
                await Component.env.services.dialog._onWebClientReady();
            },
        ),
        destroy: prevDestroy.concat(
            () => {
                Component.env.services.dialog.destroy();
            },
        ),
    };
}

/**
 * @private
 * @param {Object} callbacks
 * @param {function[]} callbacks.init
 * @param {function[]} callbacks.mount
 * @param {function[]} callbacks.destroy
 * @param {function[]} callbacks.return
 * @return {Object} update callbacks
 */
function _useDiscuss(callbacks) {
    const {
        init: prevInit,
        mount: prevMount,
        return: prevReturn,
    } = callbacks;
    let discussWidget;
    const state = {
        autoOpenDiscuss: false,
        discussData: {},
    };
    return {
        ...callbacks,
        init: prevInit.concat(
            params => {
                const {
                    autoOpenDiscuss = state.autoOpenDiscuss,
                    discuss: discussData = state.discussData
                } = params;
                Object.assign(state, { autoOpenDiscuss, discussData });
                delete params.autoOpenDiscuss;
                delete params.discuss;
            },
        ),
        mount: prevMount.concat(
            async params => {
                const { selector, widget } = params;
                DiscussWidget.prototype._pushStateActionManager = () => {};
                discussWidget = new DiscussWidget(widget, state.discussData);
                await discussWidget.appendTo($(selector));
                if (state.autoOpenDiscuss) {
                    await discussWidget.on_attach_callback();
                }
            },
        ),
        return: prevReturn.concat(
            result => {
                return {
                    ...result,
                    discussWidget,
                };
            },
        ),
    };
}

/**
 * @private
 * @param {Object} callbacks
 * @param {function[]} callbacks.init
 * @param {function[]} callbacks.mount
 * @param {function[]} callbacks.destroy
 * @param {function[]} callbacks.return
 * @returns {Object} update callbacks
 */
function _useMessagingMenu(callbacks) {
    const {
        mount: prevMount,
        return: prevReturn,
    } = callbacks;
    let messagingMenuWidget;
    return {
        ...callbacks,
        mount: prevMount.concat(
            async ({ selector, widget }) => {
                messagingMenuWidget = new MessagingMenuWidget(widget, {});
                await messagingMenuWidget.appendTo($(selector));
                await messagingMenuWidget.on_attach_callback();
            },
        ),
        return: prevReturn.concat(
            result => {
                return {
                    ...result,
                    messagingMenuWidget,
                };
            },
        ),
    };
}

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

/**
 * Main function used to make a mocked environment with mocked messaging env.
 *
 * @param {Object} [param0={}]
 * @param {string} [param0.arch] makes only sense when `param0.hasView` is set:
 *   the arch to use in createView.
 * @param {Object} [param0.archs]
 * @param {boolean} [param0.autoOpenDiscuss=false] makes only sense when
 *   `param0.hasDiscuss` is set: determine whether mounted discuss should be
 *   open initially.
 * @param {Deferred|Promise} [param0.beforeGenerateModels]
 *   Deferred that let tests block messaging creation and simulate resolution.
 *   Useful for testing working components when messaging is not yet created.
 * @param {boolean} [param0.debug=false]
 * @param {Object} [param0.data] makes only sense when `param0.hasView` is set:
 *   the data to use in createView.
 * @param {Object} [param0.discuss={}] makes only sense when `param0.hasDiscuss`
 *   is set: provide data that is passed to discuss widget (= client action) as
 *   2nd positional argument.
 * @param {Object} [param0.env={}]
 * @param {function} [param0.mockFetch]
 * @param {function} [param0.mockRPC]
 * @param {boolean} [param0.hasActionManager=false] if set, use
 *   createActionManager.
 * @param {boolean} [param0.hasChatWindow=false] if set, mount chat window
 *   service.
 * @param {boolean} [param0.hasDiscuss=false] if set, mount discuss app.
 * @param {boolean} [param0.hasMessagingMenu=false] if set, mount messaging
 *   menu.
 * @param {boolean} [param0.hasView=false] if set, use createView to create a
 *   view instead of a generic widget.
 * @param {string} [param0.model] makes only sense when `param0.hasView` is set:
 *   the model to use in createView.
 * @param {integer} [param0.res_id] makes only sense when `param0.hasView` is set:
 *   the res_id to use in createView.
 * @param {Object} [param0.services]
 * @param {Object} [param0.session]
 * @param {boolean} [param0.usingTimeControl=false] if set, all flow of time
 *   with `env.browser.setTimeout` are fully controlled by test itself.
 *     @see usingTimeControl that adds `Time/advance` action in
 *     `env`.
 * @param {Object} [param0.View] makes only sense when `param0.hasView` is set:
 *   the View class to use in createView.
 * @param {Object} [param0.viewOptions] makes only sense when `param0.hasView`
 *   is set: the view options to use in createView.
 * @param {Object} [param0.waitUntilEvent]
 * @param {String} [param0.waitUntilEvent.eventName]
 * @param {String} [param0.waitUntilEvent.message]
 * @param {function} [param0.waitUntilEvent.predicate]
 * @param {integer} [param0.waitUntilEvent.timeoutDelay]
 * @param {string} [param0.waitUntilMessagingCondition='initialized'] Determines
 *   the condition of messaging when this function is resolved.
 *   Supported values: ['none', 'created', 'initialized'].
 *   - 'none': the function resolves regardless of whether messaging is created.
 *   - 'created': the function resolves when messaging is created, but
 *     regardless of whether messaging is initialized.
 *   - 'initialized' (default): the function resolves when messaging is
 *     initialized.
 *   To guarantee messaging is not created, test should pass a pending deferred
 *   as param of `beforeGenerateModels`. To make sure messaging is
 *   not initialized, test should mock RPC `mail/init_messaging` and block its
 *   resolution.
 * @param {...Object} [param0.kwargs]
 * @throws {Error} in case some provided parameters are wrong, such as
 *   `waitUntilMessagingCondition`.
 * @returns {Object}
 */
export default async function start(param0 = {}) {
    let callbacks = {
        init: [],
        mount: [],
        destroy: [],
        return: [],
    };
    const {
        beforeGenerateModels,
        env: providedEnv,
        hasActionManager = false,
        hasChatWindow = false,
        hasDialog = false,
        hasDiscuss = false,
        hasMessagingMenu = false,
        hasView = false,
        usingTimeControl: usingTimeControlParam = false,
        waitUntilEvent,
        waitUntilMessagingCondition = 'initialized',
    } = param0;
    if (!['none', 'created', 'initialized'].includes(waitUntilMessagingCondition)) {
        throw Error(`Unknown parameter value ${waitUntilMessagingCondition} for 'waitUntilMessaging'.`);
    }
    delete param0.env;
    delete param0.hasActionManager;
    delete param0.hasChatWindow;
    delete param0.hasDiscuss;
    delete param0.hasMessagingMenu;
    delete param0.hasView;
    delete param0.usingTimeControl;
    if (hasChatWindow) {
        callbacks = _useChatWindow(callbacks);
    }
    if (hasDialog) {
        callbacks = _useDialog(callbacks);
    }
    if (hasDiscuss) {
        callbacks = _useDiscuss(callbacks);
    }
    if (hasMessagingMenu) {
        callbacks = _useMessagingMenu(callbacks);
    }
    const {
        init: initCallbacks,
        mount: mountCallbacks,
        destroy: destroyCallbacks,
        return: returnCallbacks,
    } = callbacks;
    const { debug = false } = param0;
    initCallbacks.forEach(callback => callback(param0));

    let env = Object.assign(providedEnv || {});
    env.session = {
        is_bound: Promise.resolve(),
        url: s => s,
        ...env.session
    };
    usingModels(env, {
        autofetchPartnerImStatus: false,
        beforeGenerateModels,
        browser: {
            innerHeight: 1080,
            innerWidth: 1920,
            Notification: {
                permission: 'denied',
                async requestPermission() {
                    return this.permission;
                },
                ...((env.browser && env.browser.Notification) || {}),
            },
            ...env.browser,
        },
        disableAnimation: true,
        isQUnitTest: true,
        loadingBaseDelayDuration: providedEnv.loadingBaseDelayDuration || 0,
    });
    if (usingTimeControlParam) {
        env = usingTimeControl(env);
    }

    const services = {
        bus_service: BusService.extend({
            _beep() {}, // Do nothing
            _poll() {}, // Do nothing
            _registerWindowUnload() {}, // Do nothing
            isOdooFocused() {
                return true;
            },
            updateOption() {},
        }),
        chatWindow: ChatWindowService.extend({
            _getParentNode() {
                return document.querySelector(debug ? 'body' : '#qunit-fixture');
            },
            _listenHomeMenu: () => {},
        }),
        dialog: DialogService.extend({
            _getParentNode() {
                return document.querySelector(debug ? 'body' : '#qunit-fixture');
            },
            _listenHomeMenu: () => {},
        }),
        local_storage: AbstractStorageService.extend({ storage: new RamStorage() }),
        notification: NotificationService.extend(),
        ...param0.services,
    };

    const kwargs = {
        ...param0,
        archs: {
            'mail.message,false,search': '<search/>',
            ...param0.archs,
        },
        debug: param0.debug || false,
        env,
        services: {
            ...services,
            ...param0.services,
        },
    };
    let widget;
    let mockServer; // only in basic mode
    let testEnv;
    const selector = debug ? 'body' : '#qunit-fixture';
    if (hasView) {
        widget = await createView(kwargs);
        patch(widget, {
            destroy() {
                destroyCallbacks.forEach(callback => callback({ widget }));
                this._super(...arguments);
                unpatch(widget);
                if (testEnv) {
                    testEnv.services.action.dispatch(
                        'Record/deleteAll',
                    );
                }
            },
        });
    } else if (hasActionManager) {
        widget = await createActionManager(kwargs);
        patch(widget, {
            destroy() {
                destroyCallbacks.forEach(callback => callback({ widget }));
                this._super(...arguments);
                unpatch(widget);
                if (testEnv) {
                    testEnv.services.action.dispatch(
                        'Record/deleteAll',
                    );
                }
            },
        });
    } else {
        const Parent = Widget.extend({ do_push_state() {} });
        const parent = new Parent();
        mockServer = await addMockEnvironment(parent, kwargs);
        widget = new Widget(parent);
        await widget.appendTo($(selector));
        Object.assign(widget, {
            destroy() {
                delete widget.destroy;
                destroyCallbacks.forEach(callback => callback({ widget }));
                parent.destroy();
                if (testEnv) {
                    testEnv.services.action.dispatch(
                        'Record/deleteAll',
                    );
                }
            },
        });
    }

    testEnv = Component.env;

    /**
     * Components cannot use web.bus, because they cannot use
     * EventDispatcherMixin, and webclient cannot easily access env.
     * Communication between webclient and components by core.bus
     * (usable by webclient) and messagingBus (usable by components), which
     * the messaging service acts as mediator since it can easily use both
     * kinds of buses.
     */
    testEnv.bus.on(
        'hide_home_menu',
        null,
        () => testEnv.services.model.messagingBus.trigger('hide_home_menu'),
    );
    testEnv.bus.on(
        'show_home_menu',
        null,
        () => testEnv.services.model.messagingBus.trigger('show_home_menu'),
    );
    testEnv.bus.on(
        'will_hide_home_menu',
        null,
        () => testEnv.services.model.messagingBus.trigger('will_hide_home_menu'),
    );
    testEnv.bus.on(
        'will_show_home_menu',
        null,
        () => testEnv.services.model.messagingBus.trigger('will_show_home_menu'),
    );

    /**
     * Returns a promise resolved after the expected event is received.
     *
     * @param {Object} param0
     * @param {string} param0.eventName event to wait
     * @param {function} param0.func function which, when called, is expected to
     *  trigger the event
     * @param {string} [param0.message] assertion message
     * @param {function} [param0.predicate] predicate called with event data.
     *  If not provided, only the event name has to match.
     * @param {number} [param0.timeoutDelay=5000] how long to wait at most in ms
     * @returns {Promise}
     */
    const afterEvent = (async ({ eventName, func, message, predicate, timeoutDelay = 5000 }) => {
        // Set up the timeout to reject if the event is not triggered.
        let timeoutNoEvent;
        const timeoutProm = new Promise((resolve, reject) => {
            timeoutNoEvent = setTimeout(() => {
                let error = message
                    ? new Error(message)
                    : new Error(`Timeout: the event ${eventName} was not triggered.`);
                console.error(error);
                reject(error);
            }, timeoutDelay);
        });
        // Set up the promise to resolve if the event is triggered.
        const eventProm = new Promise(resolve => {
            testEnv.services.model.messagingBus.on(
                eventName,
                null,
                data => {
                    if (!predicate || predicate(data)) {
                        resolve();
                    }
                },
            );
        });
        // Start the function expected to trigger the event after the
        // promise has been registered to not miss any potential event.
        const funcRes = func();
        // Make them race (first to resolve/reject wins).
        await Promise.race([eventProm, timeoutProm]);
        clearTimeout(timeoutNoEvent);
        // If the event is triggered before the end of the async function,
        // ensure the function finishes its job before returning.
        await funcRes;
    });

    const result = {
        afterEvent,
        env: testEnv,
        mockServer,
        widget,
    };

    const start = async () => {
        if (waitUntilMessagingCondition === 'created') {
            await testEnv.services.model.messagingCreated;
        }
        if (waitUntilMessagingCondition === 'initialized') {
            await testEnv.services.model.messagingInitialized;
        }

        if (mountCallbacks.length > 0) {
            await afterNextRender(
                async () => {
                    await Promise.all(
                        mountCallbacks.map(
                            callback => callback({ selector, widget }),
                        ),
                    );
                },
            );
        }
        returnCallbacks.forEach(callback => callback(result));
    };
    if (waitUntilEvent) {
        await afterEvent({
            func: start,
            ...waitUntilEvent,
        });
    } else {
        await start();
    }
    return result;
}
