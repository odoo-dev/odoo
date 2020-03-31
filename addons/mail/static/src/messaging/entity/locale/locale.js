odoo.define('mail.messaging.entity.Locale', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entity.core');

function LocaleFactory({ Entity }) {

    class Locale extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @returns {string}
         */
        get textDirection() {
            return this.env._t.database.parameters.direction;
        }

    }

    Object.assign(Locale, { isSingleton: true });

    return Locale;
}

registerNewEntity('Locale', LocaleFactory, ['Entity']);

});
