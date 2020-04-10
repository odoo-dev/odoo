odoo.define('mail.messaging.entity.Device', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr } = require('mail.messaging.EntityField');

function DeviceFactory({ Entity }) {

    class Device extends Entity {

        /**
         * @override
         */
        static create() {
            const entity = super.create();
            entity._refresh();
            entity._onResize = _.debounce(() => entity._refresh(), 100);
            return entity;
        }

        /**
         * @override
         */
        delete() {
            window.removeEventListener('resize', this._onResize);
            super.delete();
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * Called when messaging is started.
         */
        start() {
            // TODO FIXME Not using this.env.window because it's proxified, and
            // addEventListener does not work on proxified window. task-2234596
            window.addEventListener('resize', this._onResize);
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         */
        _refresh() {
            this.update({
                globalWindowInnerHeight: this.env.window.innerHeight,
                globalWindowInnerWidth: this.env.window.innerWidth,
                isMobile: this.env.device.isMobile,
            });
        }
    }

    Device.entityName = 'Device';

    Device.fields = {
        globalWindowInnerHeight: attr(),
        globalWindowInnerWidth: attr(),
        isMobile: attr(),
    };

    return Device;
}

registerNewEntity('Device', DeviceFactory);

});
