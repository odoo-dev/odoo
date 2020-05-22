odoo.define('mail.messaging.component.FollowerSubtypeTests', function (require) {
'use strict';

const components = {
    FollowerSubtype: require('mail.messaging.component.FollowerSubtype'),
};
const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    pause,
    start: utilsStart,
} = require('mail.messaging.testUtils');

QUnit.module('mail', {}, function () {
QUnit.module('messaging', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('FollowerSubtype', {
    beforeEach() {
        utilsBeforeEach(this);

        this.createFollowerSubtypeComponent = async ({ follower, followerSubtype }) => {
            const FollowerSubtypeComponent = components.FollowerSubtype;
            FollowerSubtypeComponent.env = this.env;
            this.component = new FollowerSubtypeComponent(null, {
                followerLocalId: follower.localId,
                followerSubtypeLocalId: followerSubtype.localId,
            });
            await this.component.mount(this.widget.el);
        };

        this.start = async params => {
            let { env, widget } = await utilsStart(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.component) {
            this.component.destroy();
            this.component = undefined;
        }
        if (this.widget) {
            this.widget.destroy();
            this.widget = undefined;
        }
        this.env = undefined;
        delete components.FollowerSubtype.env;
    }
});

QUnit.test('simplest layout of a followed subtype', async function (assert) {
    assert.expect(5);

    await this.start();

    const thread = this.env.entities.Thread.create({
        id: 100,
        model: 'res.partner',
    });
    const follower = this.env.entities.Follower.create({
        channel: [['insert', {
            id: 1,
            model: 'mail.channel',
            name: "François Perusse",
        }]],
        followedThread: [['link', thread]],
        id: 2,
        isActive: true,
        isEditable: true,
    });
    const followerSubtype = this.env.entities.FollowerSubtype.create({
        id: 1,
        isDefault: true,
        isInternal: false,
        name: "Dummy test",
        resModel: 'res.partner'
    });
    follower.update({
        selectedSubtypes: [['link', followerSubtype]],
        subtypes: [['link', followerSubtype]],
    });
    await this.createFollowerSubtypeComponent({
        follower,
        followerSubtype,
    });
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype',
        "should have follower subtype component"
    );
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype_label',
        "should have a label"
    );
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype_checkbox',
        "should have a checkbox"
    );
    assert.strictEqual(
        document.querySelector('.o_FollowerSubtype_label').textContent,
        "Dummy test",
        "should have the name of the subtype as label"
    );
    assert.ok(
        document.querySelector('.o_FollowerSubtype_checkbox').checked,
        "checkbox should be checked as follower subtype is followed"
    );
});

QUnit.test('simplest layout of a not followed subtype', async function (assert) {
    assert.expect(5);

    await this.start();

    const thread = this.env.entities.Thread.create({
        id: 100,
        model: 'res.partner',
    });
    const follower = this.env.entities.Follower.create({
        channel: [['insert', {
            id: 1,
            model: 'mail.channel',
            name: "François Perusse",
        }]],
        followedThread: [['link', thread]],
        id: 2,
        isActive: true,
        isEditable: true,
    });
    const followerSubtype = this.env.entities.FollowerSubtype.create({
        id: 1,
        isDefault: true,
        isInternal: false,
        name: "Dummy test",
        resModel: 'res.partner'
    });
    follower.update({ subtypes: [['link', followerSubtype]] });
    await this.createFollowerSubtypeComponent({
        follower,
        followerSubtype,
    });
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype',
        "should have follower subtype component"
    );
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype_label',
        "should have a label"
    );
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype_checkbox',
        "should have a checkbox"
    );
    assert.strictEqual(
        document.querySelector('.o_FollowerSubtype_label').textContent,
        "Dummy test",
        "should have the name of the subtype as label"
    );
    assert.notOk(
        document.querySelector('.o_FollowerSubtype_checkbox').checked,
        "checkbox should not be checked as follower subtype is not followed"
    );
});

QUnit.test('toggle follower subtype checkbox', async function (assert) {
    assert.expect(5);

    await this.start();

    const thread = this.env.entities.Thread.create({
        id: 100,
        model: 'res.partner',
    });
    const follower = this.env.entities.Follower.create({
        channel: [['insert', {
            id: 1,
            model: 'mail.channel',
            name: "François Perusse",
        }]],
        followedThread: [['link', thread]],
        id: 2,
        isActive: true,
        isEditable: true,
    });
    const followerSubtype = this.env.entities.FollowerSubtype.create({
        id: 1,
        isDefault: true,
        isInternal: false,
        name: "Dummy test",
        resModel: 'res.partner'
    });
    follower.update({ subtypes: [['link', followerSubtype]] });
    await this.createFollowerSubtypeComponent({
        follower,
        followerSubtype,
    });
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype',
        "should have follower subtype component"
    );
    assert.containsOnce(
        document.body,
        '.o_FollowerSubtype_checkbox',
        "should have a checkbox"
    );
    assert.notOk(
        document.querySelector('.o_FollowerSubtype_checkbox').checked,
        "checkbox should not be checked as follower subtype is not followed"
    );

    document.querySelector('.o_FollowerSubtype_checkbox').click();
    await afterNextRender();
    assert.ok(
        document.querySelector('.o_FollowerSubtype_checkbox').checked,
        "checkbox should now be checked"
    );

    document.querySelector('.o_FollowerSubtype_checkbox').click();
    await afterNextRender();
    assert.notOk(
        document.querySelector('.o_FollowerSubtype_checkbox').checked,
        "checkbox should be no more checked"
    );
});

});
});
});

});
