odoo.define('mail/static/src/model/tests/test_models.js', function (require) {
'use strict';
const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr, many2one, one2many, one2one, many2many } = require('mail/static/src/model/model_field.js');

function factoryContact(dependencies) {
    class Contact extends dependencies['mail.model'] {}

    Contact.fields = {
        name: attr(),
        address: one2one('test.address', {
            inverse: 'contact',
        }),
        tasks: one2many('test.task', {
            inverse: 'responsible'
        }),
        friends: many2many('test.contact'),
    };

    Contact.modelName = 'test.contact';

    return Contact;
}

function factoryAddress(dependencies) {
    class Address extends dependencies['mail.model'] {
        static _createRecordLocalId(data) {
            if (data.id) {
                return `${this.modelName}_${data.id}`;
            }
            else {
                return _.uniqueId(`${this.modelName}_`);
            }
        }
    }

    Address.fields = {
        id: attr(),
        addressInfo: attr(),
        country: many2one('test.country', {
            inverse: 'addresses'
        }),
        contact: one2one('test.contact', {
            inverse: 'address',
        }),
    };

    Address.modelName = 'test.address';

    return Address;
}

function factoryCountry(dependencies) {
    class Country extends dependencies['mail.model'] {}

    Country.fields = {
        name: attr(),
        code: attr(),
        addresses: one2many('test.address', {
            inverse: 'country',
        }),
    };

    Country.modelName = 'test.country';

    return Country;
}

function factoryTask(dependencies) {
    class Task extends dependencies['mail.model'] {
        static _createRecordLocalId(data) {
            if (data.id) {
                return `${this.modelName}_${data.id}`;
            }
            else {
                return _.uniqueId(`${this.modelName}_`);
            }
        }
    }

    Task.fields = {
        id: attr(),
        title: attr(),
        description: attr(),
        difficulty: attr({
            default: 1,
        }),
        responsible: many2one('test.contact', {
            inverse: 'tasks'
        }),
    };

    Task.modelName = 'test.task';

    return Task;
}

registerNewModel('test.contact', factoryContact);
registerNewModel('test.country', factoryCountry);
registerNewModel('test.address', factoryAddress);
registerNewModel('test.task', factoryTask);

});
