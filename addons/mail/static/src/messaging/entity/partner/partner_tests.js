odoo.define('mail.messaging.entity.PartnerTests', function (require) {
'use strict';

const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    start: utilsStart,
} = require('mail.messaging.testUtils');

QUnit.module('mail', {}, function () {
QUnit.module('messaging', {}, function () {
QUnit.module('entity', {}, function () {
QUnit.module('Partner', {
    beforeEach() {
        utilsBeforeEach(this);
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            const { env, widget } = await utilsStart(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        this.env = undefined;
        if (this.widget) {
            this.widget.destroy();
            this.widget = undefined;
        }
    },
});

QUnit.test('current', async function (assert) {
    assert.expect(7);

    await this.start({
        session: {
            name: "Admin",
            partner_id: 3,
            partner_display_name: "Your Company, Admin",
            uid: 2,
        },
    });
    assert.ok(this.env.entities.Partner.current);
    assert.strictEqual(
        this.env.entities.Partner.current,
        this.env.entities.Partner.fromId(3)
    );
    assert.strictEqual(
        this.env.entities.Partner.current.display_name,
        "Your Company, Admin"
    );
    assert.strictEqual(this.env.entities.Partner.current.id, 3);
    assert.strictEqual(this.env.entities.Partner.current.name, "Admin");
    assert.strictEqual(
        this.env.entities.Partner.current.user,
        this.env.entities.User.fromId(2)
    );
    assert.strictEqual(this.env.entities.Partner.current.user.id, 2);
});

});
});
});
});
