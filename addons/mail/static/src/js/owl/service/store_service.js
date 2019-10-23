odoo.define('mail.service.Store', function (require) {
'use strict';

const actions = require('mail.store.actions');
const getters = require('mail.store.getters');
const { init: initState } = require('mail.store.state');
const EnvMixin = require('mail.widget.EnvMixin');

const AbstractService = require('web.AbstractService');
const config = require('web.config');
const core = require('web.core');

const { Store } = owl;

const StoreService = AbstractService.extend(EnvMixin, {
    DEBUG: true,
    /**
     * Data related to store service when used in a test environment.
     */
    TEST_ENV: {
        /**
         * This is set when store service is used in a test environment.
         * Useful to prevent sending and/or receiving events from
         * core.bus.
         */
        active: false,
        /**
         * Object that is used to extend the store state initially. This is
         * applied just before mocked `/mail/init_messaging`. Prefer mocking
         * data received from `/mail/init_messaging` most of the time: this
         * way of populating the store should ideally only be store-specific
         * tests.
         */
        initStateAlteration: {},
    },
    dependencies: ['ajax', 'bus_service', 'env', 'local_storage'],
    /**
     * @override {web.AbstractService}
     */
    async start() {
        let state = initState(this.TEST_ENV.active ? this.TEST_ENV.initStateAlteration : undefined);
        const env = await this.getEnv({ withStore: false });
        if (this.TEST_ENV.active) {
            actions._startLoopFetchPartnerImStatus = () => {};
            actions._loopFetchPartnerImStatus = () => {};
        }
        this.store = new Store({ actions, env, getters, state });
        if (this.DEBUG) {
            window.store = this.store;
        }

        this.ready = new Promise(resolve =>
            this.store.dispatch('initMessaging', {
                ready: () => {
                    this._resizeGlobalWindow();
                    resolve();
                }
            })
        );
        if (!this.TEST_ENV.active) {
            window.addEventListener('resize', _.debounce(() => {
                this._resizeGlobalWindow();
            }), 100);
        } else {
            this['test:resize'] = this._resize;
        }
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Get the store. If the store is not yet ready, i.e. populated with data
     * from `/mail/init_messaging`, it waits for it.
     *
     * @return {Promise<mail.store>}
     */
    async get() {
        await this.ready;
        return this.store;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Called when browser size changes. Updates the store with new screen sizes
     * and update `isMobile` value accordingly. Useful for components that
     * are dependent on browser size.
     *
     * @private
     * @param {Object} [param0={}] passed data only in test environment
     * @param {integer} [param0.globalWindowInnerHeight]
     * @param {integer} [param0.globalWindowInnerWidth]
     * @param {boolean} [param0.isMobile]
     */
    _resizeGlobalWindow({
        globalWindowInnerHeight,
        globalWindowInnerWidth,
        isMobile,
    }={}) {
        if (this.TEST_ENV.active) {
            // in test environment, use mocked values
            this.store.dispatch('handleGlobalWindowResize', {
                globalWindowInnerHeight: globalWindowInnerHeight ||
                    this.store.state.globalWindow.innerHeight,
                globalWindowInnerWidth: globalWindowInnerWidth ||
                    this.store.state.globalWindow.innerWidth,
                isMobile: isMobile ||
                    this.store.state.isMobile,
            });
        } else {
            this.store.dispatch('handleGlobalWindowResize', {
                globalWindowInnerHeight: window.innerHeight,
                globalWindowInnerWidth: window.innerWidth,
                isMobile: config.device.isMobile,
            });
        }
    },
});

core.serviceRegistry.add('store', StoreService);

return StoreService;

});
