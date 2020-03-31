odoo.define('mail.messaging.entity.Device', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entity.core');

const config = require('web.config');

function DeviceFactory({ Entity }) {

    class Device extends Entity {

        start() {
            this.constructor._listenGlobalWindowResize(this);
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * Method helps overriding in tests.
         *
         * @private
         * @static
         */
        static _listenGlobalWindowResize(entity) {
            window.addEventListener('resize', _.debounce(() => entity.update()), 100);
        }

        /**
         * Method to compute `globalWindowInnerHeigh`.
         * Method helps overriding in tests.
         *
         * @private
         * @static
         * @returns {boolean}
         */
        static _updateGlobalWindowInnerHeight() {
            return window.innerHeight;
        }

        /**
         * Method to compute `globalWindowInnerWidth`.
         * Method helps overriding in tests.
         *
         * @private
         * @static
         * @returns {boolean}
         */
        static _updateGlobalWindowInnerWidth() {
            return window.innerWidth;
        }

        /**
         * Method to compute `isMobile`.
         * Method helps overriding in tests.
         *
         * @private
         * @static
         * @returns {boolean}
         */
        static _updateIsMobile() {
            return config.device.isMobile;
        }

        /**
         * @override
         */
        _update() {
            this._write({
                globalWindowInnerHeight: this.constructor._updateGlobalWindowInnerHeight(),
                globalWindowInnerWidth: this.constructor._updateGlobalWindowInnerWidth(),
                isMobile: this.constructor._updateIsMobile(),
            });
        }

    }

    Object.assign(Device, { isSingleton: true });

    return Device;
}

registerNewEntity('Device', DeviceFactory, ['Entity']);

});
