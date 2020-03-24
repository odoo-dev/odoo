odoo.define('mail.hooks.useStoreTests', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component, QWeb, Store } = owl;
const { xml } = owl.tags;

const {
    afterNextRender,
    nextAnimationFrame,
} = require('mail.messagingTestUtils');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('hooks', {}, function () {
QUnit.module('useStoreTests', {
    beforeEach() {
        const qweb = new QWeb();
        this.env = { qweb };
    },
    afterEach() {
        this.env = undefined;
        this.store = undefined;
    }
});


QUnit.test("compare keys, no depth, primitives", async function (assert) {
    assert.expect(8);
    this.store = new Store({
        env: this.env,
        state: { obj: {
            subObj1: 'a',
            subObj2: 'b',
            use1: true,
        } },
    });
    this.env.store = this.store;
    let count = 0;
    class MyComponent extends Component {
        constructor() {
            super(...arguments);
            this.storeProps = useStore((state, props) => {
                return {
                    res: state.obj.use1 ? state.obj.subObj1 : state.obj.subObj2,
                };
            }, {
                onUpdate: () => {
                    count++;
                },
            });
        }
    }
    MyComponent.env = this.env;
    MyComponent.template = xml`<div t-esc="storeProps.res"/>`;

    const fixture = document.querySelector('#qunit-fixture');

    const myComponent = new MyComponent();
    await myComponent.mount(fixture);
    assert.strictEqual(count, 0,
        'should not detect an update initially');
    assert.strictEqual(fixture.textContent, 'a',
        'should display the content of subObj1');

    this.store.state.obj.use1 = false;
    await afterNextRender();
    assert.strictEqual(count, 1,
        'should detect an update because the selector is returning a different value (was subObj1, now is subObj2)');
    assert.strictEqual(fixture.textContent, 'b',
        'should display the content of subObj2');

    this.store.state.obj.subObj2 = 'b';
    // there must be no render here
    await nextAnimationFrame();
    assert.strictEqual(count, 1,
        'should not detect an update because the same primitive value was assigned (subObj2 was already "b")');
    assert.strictEqual(fixture.textContent, 'b',
        'should still display the content of subObj2');

    this.store.state.obj.subObj2 = 'd';
    await afterNextRender();
    assert.strictEqual(count, 2,
        'should detect an update because the selector is returning a different value for subObj2');
    assert.strictEqual(fixture.textContent, 'd',
        'should display the new content of subObj2');

    myComponent.destroy();
});

QUnit.test("compare keys, depth 1, proxy", async function (assert) {
    assert.expect(8);
    this.store = new Store({
        env: this.env,
        state: { obj: {
            subObj1: { a: 'a' },
            subObj2: { a: 'b' },
            use1: true,
        } },
    });
    this.env.store = this.store;
    let count = 0;
    class MyComponent extends Component {
        constructor() {
            super(...arguments);
            this.storeProps = useStore((state, props) => {
                return {
                    array: [state.obj.use1 ? state.obj.subObj1 : state.obj.subObj2],
                };
            }, {
                compareDepth: {
                    array: 1,
                },
                onUpdate: () => {
                    count++;
                },
            });
        }
    }
    MyComponent.env = this.env;
    MyComponent.template = xml`<div t-esc="storeProps.array[0].a"/>`;

    const fixture = document.querySelector('#qunit-fixture');

    const myComponent = new MyComponent();
    await myComponent.mount(fixture);
    assert.strictEqual(count, 0,
        'should not detect an update initially');
    assert.strictEqual(fixture.textContent, 'a',
        'should display the content of subObj1');

    this.store.state.obj.use1 = false;
    await afterNextRender();
    assert.strictEqual(count, 1,
        'should detect an update because the selector is returning a different value (was subObj1, now is subObj2)');
    assert.strictEqual(fixture.textContent, 'b',
        'should display the content of subObj2');

    this.store.state.obj.subObj1.a = 'c';
    // there must be no render here
    await nextAnimationFrame();
    assert.strictEqual(count, 1,
        'should not detect an update because subObj1 was changed but only subObj2 is selected');
    assert.strictEqual(fixture.textContent, 'b',
        'should still display the content of subObj2');

    this.store.state.obj.subObj2.a = 'd';
    await afterNextRender();
    assert.strictEqual(count, 2,
        'should detect an update because the value of subObj2 changed');
    assert.strictEqual(fixture.textContent, 'd',
        'should display the new content of subObj2');

    myComponent.destroy();
});

});
});
});
