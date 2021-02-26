odoo.define('mail/static/src/model/tests/model_field_command_tests.js', function (require) {
'use strict';

const {
    afterEach,
    beforeEach,
    start,
} = require('mail/static/src/utils/test_utils.js');

const {
    clear,
    noop,
    decrement,
    increment,
    create,
    insert,
    insertAndReplace,
    link,
    replace,
    unlink,
    unlinkAll,
} = require('mail/static/src/model/model_field_command.js');

QUnit.module('mail', {}, function () {
QUnit.module('model', {}, function () {
QUnit.module('model_field_command_tests.js', {
    beforeEach(){
        beforeEach(this);
        this.start = async params => {
            const { env, widget } = await start(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;

            this.contactModel = this.env.models['test.contact'];
            this.addressModel = this.env.models['test.address'];
            this.countryModel = this.env.models['test.country'];
            this.taskModel = this.env.models['test.task'];
        };
    },
    afterEach() {
        afterEach(this);
    }
});

QUnit.test('clear: should set attr field to undefined or the default value', async function (assert) {
    assert.expect(4);

    await this.start();
    const task = this.taskModel.create({
        title: 'Test Task',
        description: 'This is a test task',
        difficulty: 10,
    });

    // clear attr field without default value
    assert.strictEqual(
        task.description,
        'This is a test task',
    )
    task.update({description: clear()});
    assert.strictEqual(
        task.description,
        undefined,
        "clear: attr field without default value should be set as undefined",
    );

    // clear attr field with default value
    assert.strictEqual(
        task.difficulty,
        10,
    );
    task.update({difficulty: clear()});
    assert.strictEqual(
        task.difficulty,
        1,
        "clear: attr field with default vaule should be set as the default value",
    );
});

QUnit.test('increment/decrement: should increase/decrease attr field', async function (assert) {
    assert.expect(3);

    await this.start();
    const task = this.taskModel.create({
        title: 'Test Task',
        description: 'This is a test task',
        difficulty: 10,
    })

    // increment
    assert.strictEqual(
        task.difficulty,
        10,
    );
    task.update({ difficulty: increment(10) });
    assert.strictEqual(
        task.difficulty,
        20,
        "increment: attr field should be increased correctly"
    );

    // decrement
    task.update({ difficulty: decrement(15) });
    assert.strictEqual(
        task.difficulty,
        5,
        "decrement: attr field should be decreased correctly"
    );
});

QUnit.test('create: should create and link', async function (assert) {
    assert.expect(16);

    await this.start();
    // create a model object using nested create method
    const contact = this.contactModel.create({ 
        name: 'test contact' ,
        // one2one field
        address: create({
            addressInfo: 'a test address',
            // many2one field
            country: create({
                name: 'Belgium',
                code: 'BE',
            }),
        }),
        // one2many field
        tasks: create({
            title: 'task 1',
        }),
        // many2many field
        friends: create({
            name: 'test contact friend',
        }),
    });
    assert.strictEqual(contact.name,'test contact');
    assert.ok(
        contact.address instanceof this.addressModel,
        'create: should create a one2one object correctly'
    );
    assert.ok(
        contact.tasks instanceof Array && 
        contact.tasks[0] instanceof this.taskModel && 
        contact.tasks.length === 1,
        'create: should create a one2many object correctly'
    );
    assert.ok(
        contact.friends instanceof Array &&
        contact.friends[0] instanceof this.contactModel &&
        contact.friends.length === 1,
        'create: should create a many2many object correctly'
    );

    const address = contact.address;
    assert.strictEqual(address.addressInfo, 'a test address');
    assert.ok(
        address.country instanceof this.countryModel,
        'create: should create a many2one object correctly'
    ),
    assert.strictEqual(
        address.contact,
        contact,
        'create: one2one inverse field should be linked correctly',
    );

    const country = address.country;
    assert.ok(
        country.name === 'Belgium' &&
        country.code === 'BE'
    );
    assert.ok(
        country.addresses instanceof Array &&
        country.addresses.length === 1 &&
        country.addresses[0] instanceof this.addressModel,
        'create: many2one inverse field should be created correctly',
    );
    assert.strictEqual(
        country.addresses[0],
        address,
        'create: many2one inverse field should be linked correctly'
    );

    const task = contact.tasks[0];
    assert.ok(task.title === 'task 1');
    assert.ok(
        task.responsible instanceof this.contactModel,
        'create: one2many inverse field should be created correctly',
    );
    assert.strictEqual(
        task.responsible,
        contact,
        'create: one2many inverse field should be linked correctly'
    );

    contact.update({
        address: create({
            addressInfo: 'a new address',
        }),
    });
    assert.strictEqual(
        contact.address.addressInfo,
        'a new address',
        'create: should crate and replace a new object for x2one field',
    );
    assert.strictEqual(
        address.contact,
        undefined,
        'create: x2one inverse field should be unliked'
    );

    contact.update({
        tasks: create({
            title: 'task 2'
        }),
    });
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 2,
        'create: should create and add a new object for x2many field'
    );
});

QUnit.test('insert: should create/update and link', async function (assert) {
    assert.expect(13);

    await this.start();
    const contact = this.contactModel.create({
        name: 'test contact',
    });
    
    assert.strictEqual(contact.name, 'test contact');
    assert.strictEqual(contact.address, undefined);
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 0,
    )

    // x2one field insert
    contact.update({
        address: insert({
            id: 10,
            addressInfo: 'a test address',
        })
    });
    const address = this.addressModel.findFromIdentifyingData({
        id: 10,
        addressInfo: 'a test address',
    });
    assert.ok(address, 'insert: should create a new record if it is not existing');
    assert.strictEqual(
        contact.address,
        address,
        'insert: should link x2one field correctly',
    );
    contact.update({
        address: insert({
            id: 10,
            addressInfo: 'a modified test address',
        })
    });
    assert.strictEqual(
        contact.address,
        address,
    );
    assert.strictEqual(
        address.addressInfo,
        'a modified test address',
        'insert: should update the existing record',
    );
    contact.update({
        address: insert({
            id: 20,
            addressInfo: 'another test address',
        })
    });
    const newAddress = this.addressModel.findFromIdentifyingData({
        id: 20,
        addressInfo: 'another test address',
    });
    assert.strictEqual(
        contact.address,
        newAddress,
        'insert: should create and replace a new record for x2one field',
    );
    assert.strictEqual(
        address.contact,
        undefined,
        'insert: old x2one field record should be unlinked',
    );

    // x2many field insert
    contact.update({
        tasks: insert({ id: 10, title: 'task 10' }),
    });
    assert.strictEqual(
        contact.tasks.length,
        1,
        'insert: should create and add a new record for x2many field',
    );
    contact.update({
        tasks: insert({ id: 10, description: 'update task 10' }),
    });
    assert.strictEqual(
        contact.tasks.length,
        1,
    );
    const task = this.taskModel.findFromIdentifyingData({ id: 10 });
    assert.strictEqual(
        contact.tasks[0],
        task,
        'insert: should update the existing record'
    );
    contact.update({
        tasks: insert([
            { id: 20, title: 'task 20' },
            { id: 30, title: 'task 30' }
        ]),
    });
    assert.strictEqual(
        contact.tasks.length,
        3,
        'insert: should create and add new fields for x2many field',
    );
});

QUnit.test('insertAndReplace: should create/update and replace', async function (assert) {
    assert.expect(3);
    await this.start();

    const contact = this.contactModel.create({
        name: 'test contact',
        tasks: create([
            { id: 10, title: 'task 10' },
            { id: 20, title: 'task 20' },    
        ])
    });
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 2
    );
    const task10 = this.taskModel.findFromIdentifyingData({ id: 10 });
    const task20 = this.taskModel.findFromIdentifyingData({ id: 20 });
    assert.ok(
        contact.tasks.includes(task10) &&
        contact.tasks.includes(task20)
    );

    // insert and replace
    contact.update({
        tasks: insertAndReplace([
            { id: 10, title: 'task 10 (modified)' },
            { id: 30, title: 'task 30' }
        ]),
    });
    const task30 = this.taskModel.findFromIdentifyingData({ id: 30 });
    assert.ok(
        contact.tasks.length == 2 &&
        contact.tasks.includes(task10) &&
        ! contact.tasks.includes(task20) &&
        contact.tasks.includes(task30),
        'insertAndReplace: should update existing records and replace other records',
    );


});

QUnit.test('link: should link record', async function (assert) {
    assert.expect(9);
    await this.start();

    // x2one field
    const contact = this.contactModel.create({
        name: 'test contact',
    });
    assert.strictEqual(
        contact.address,
        undefined,
    );
    const [address10, address20] = this.addressModel.create([
        { id: 10, addressInfo: 'address 10' },
        { id: 20, addressInfo: 'address 20' },
    ]);
    contact.update({
        address: link(address10),
    });
    assert.strictEqual(
        contact.address,
        address10,
        'link: should link the record for x2one field'
    );
    assert.strictEqual(
        address10.contact,
        contact,
        'link: should link the inverse field as well'
    );
    contact.update({
        address: link(address20),
    });
    assert.strictEqual(
        contact.address,
        address20,
        'link: should replace the record for x2one field'
    );
    assert.strictEqual(
        address10.contact,
        undefined,
    );
    assert.strictEqual(
        address20.contact,
        contact,
    );

    //x2many
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 0
    );
    const [task10, task20, task30] = this.taskModel.create([
        { id: 10, title: 'task 10' },
        { id: 20, title: 'task 20' },
        { id: 30, title: 'task 30' },
    ]);
    contact.update({
        tasks: link(task10),
    });
    assert.ok(
        contact.tasks.length === 1 &&
        contact.tasks.includes(task10),
        'link: should add a new record',
    );
    contact.update({
        tasks: link([task20, task30]),
    });
    assert.ok(
        contact.tasks.length === 3 &&
        contact.tasks.includes(task10) &&
        contact.tasks.includes(task20) &&
        contact.tasks.includes(task30),
        'link: should add new records for x2many field'
    );
});

QUnit.test('replace: should replace record(s)', async function (assert) {
    assert.expect(5);
    await this.start();

    const [address10, address20] = this.addressModel.create([
        { id: 10, addressInfo:'address 10'},
        { id: 20, addressInfo:'address 20'},
    ]);
    const [task10, task20, task30] = this.taskModel.create([
        { id: 10, title: 'task 10' },
        { id: 20, title: 'task 20' },
        { id: 30, title: 'task 30' },
    ]);
    const contact = this.contactModel.create({
        name: 'test contact',
        address: link(address10),
        tasks: link([task10, task20]),
    });
    assert.strictEqual(
        contact.address,
        address10,
    );
    assert.ok(
        contact.tasks.length === 2 &&
        contact.tasks.includes(task10) &&
        contact.tasks.includes(task20)
    );

    // replace: x2one field
    contact.update({
        address: replace(address20),
    })
    assert.strictEqual(
        address10.contact,
        undefined,
    )
    assert.strictEqual(
        contact.address,
        address20,
        "replace: should replace record for x2one field"
    );

    // replace: x2many field
    contact.update({
        tasks: replace(task30),
    });
    assert.ok(
        contact.tasks.length === 1 &&
        contact.tasks[0] === task30,
        "replace: should replace records for x2many field"
    );
});

QUnit.test('unlink: should unlink the record', async function (assert) {
    assert.expect(7);
    await this.start();

    const address10 = this.addressModel.create(
        { id: 10, addressInfo: 'address 10' },
    );
    const [task10, task20, task30] = this.taskModel.create([
        { id: 10, title: 'task 10' },
        { id: 20, title: 'task 20' },
        { id: 30, title: 'task 30' },
    ]);
    const contact = this.contactModel.create({
        name: 'test contact',
        address: link(address10),
        tasks: link([task10, task20, task30]),
    });
    assert.strictEqual(
        contact.address,
        address10,
    );
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 3 &&
        contact.tasks.includes(task10),
        contact.tasks.includes(task20),
        contact.tasks.includes(task30)
    );

    // unlink x2one field
    contact.update({
        address: unlink(),
    });
    assert.strictEqual(
        contact.address,
        undefined,
        'unlink: should set x2one field undefined',
    );
    assert.strictEqual(
        address10.contact,
        undefined,
        'unlink: should unlink from  x2one inverse field as well',
    );

    //
    contact.update({
        tasks: unlink(task10),
    });
    assert.ok(
        contact.tasks.length === 2 &&
        ! contact.tasks.includes(task10) &&
        contact.tasks.includes(task20) &&
        contact.tasks.includes(task30),
        'unlink: should remove a record from x2many field'
    );
    assert.strictEqual(
        task10.contact,
        undefined,
        'unlink: should unlink from x2many inverse field as well',
    );
    contact.update({
        tasks: unlink([task20, task30]),
    });
    assert.strictEqual(
        contact.tasks.length,
        0,
        'unlink: should remove records from x2many field'
    );
});

QUnit.test('unlinkAll: should unlink all records', async function (assert) {
    assert.expect(6);
    await this.start();

    const address10 = this.addressModel.create(
        { id: 10, addressInfo: 'address 10' },
    );
    const [task10, task20, task30] = this.taskModel.create([
        { id: 10, title: 'task 10' },
        { id: 20, title: 'task 20' },
        { id: 30, title: 'task 30' },
    ]);
    const contact = this.contactModel.create({
        name: 'test contact',
        address: link(address10),
        tasks: link([task10, task20, task30]),
    });
    assert.strictEqual(
        contact.address,
        address10,
    );
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 3 &&
        contact.tasks.includes(task10) &&
        contact.tasks.includes(task20) &&
        contact.tasks.includes(task30)
    );

    // unlinkAll: x2one field
    contact.update({
        address: unlinkAll(),
    });
    assert.strictEqual(
        contact.address,
        undefined,
        'unlinkAll: should set x2one field undefined',
    );
    assert.strictEqual(
        address10.contact,
        undefined,
        'unlinkAll: should unlink from  x2one inverse field as well',
    );

    // unlinkAll: x2many field
    contact.update({
        tasks: unlinkAll(),
    });
    assert.strictEqual(
        contact.tasks.length,
        0,
        "unlinkAll: should remove all records from a x2many field"
    );
    assert.strictEqual(
        task10.contact || task20.contact || task30.contact,
        undefined,
        "unlinkAll: should unlink x2many inverse field as well"
    );
});


QUnit.test('noop: should not modify the field', async function (assert) {
    assert.expect(6);
    await this.start();

    const address10 = this.addressModel.create(
        { id: 10, addressInfo: 'address 10' },
    );
    const [task10, task20] = this.taskModel.create([
        { id: 10, title: 'task 10' },
        { id: 20, title: 'task 20' },
    ]);
    const contact = this.contactModel.create({
        name: 'test contact',
        address: link(address10),
        tasks: link([task10, task20]),
    });
    assert.strictEqual(contact.name, 'test contact');
    assert.strictEqual(contact.address, address10);
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 2 &&
        contact.tasks.includes(task10) &&
        contact.tasks.includes(task20)
    );

    contact.update({ name: noop() });
    assert.strictEqual(contact.name, 'test contact', 'noop: should not modify attribute field');
    contact.update({ address: noop() });
    assert.strictEqual(contact.address, address10, 'noop: should not modify x2one field');
    contact.update({ tasks: noop() });
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length === 2 &&
        contact.tasks.includes(task10) &&
        contact.tasks.includes(task20),
        'noop: should not modify x2many field'
    );;
});

QUnit.test('FieldCommand: command array', async function (assert) {
    assert.expect(5);
    await this.start();

    const contact = this.contactModel.create({ name: 'test contact' });
    contact.update({
        tasks: [
            create({ id: 10, title: 'task 10' }),            // create and link
            insert({ id: 10, title: 'task 10(modified)' }),  // update
            insert([                                        // insert multiple 
                { id: 20, title: 'task 20' }, 
                { id: 30, title: 'task 30' }
            ]),
        ]
    });
    assert.ok(
        contact.tasks instanceof Array &&
        contact.tasks.length == 3
    );
    const task10 = this.taskModel.findFromIdentifyingData({ id:10 });
    assert.ok(contact.tasks.includes(task10));
    assert.strictEqual(task10.title, 'task 10(modified)');
    
    const task20 = this.taskModel.findFromIdentifyingData({ id:20 });
    assert.ok(contact.tasks.includes(task20));
    
    const task30 = this.taskModel.findFromIdentifyingData({ id: 30 });
    assert.strictEqual(task30.responsible, contact);
});

});
});
});
