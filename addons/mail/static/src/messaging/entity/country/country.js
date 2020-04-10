odoo.define('mail.messaging.entity.Country', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr } = require('mail.messaging.EntityField');

function CountryFactory({ Entity }) {

    class Country extends Entity {}

    Country.entityName = 'Country';

    Country.fields = {
        id: attr(),
        name: attr(),
    };

    return Country;
}

registerNewEntity('Country', CountryFactory);

});
