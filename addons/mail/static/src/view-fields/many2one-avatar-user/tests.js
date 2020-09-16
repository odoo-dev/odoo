/** @odoo-module alias=mail.viewFields.Many2OneAvatarUser.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import { Many2OneAvatarUser } from 'mail.viewFields.Many2OneAvatarUser';

import KanbanView from 'web.KanbanView';
import ListView from 'web.ListView';
import { createView } from 'web.test_utils';
import { click } from 'web.test_utils_dom';
import { intercept } from 'web.test_utils_mock';

QUnit.module('mail', {}, function () {
QUnit.module('viewFields', {}, function () {
QUnit.module('Many2OneAvatarUser', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);

        // reset the cache before each test
        Many2OneAvatarUser.prototype.partnerIds = {};

        Object.assign(this.data, {
            foo: {
                fields: {
                    user_id: {
                        relation: 'res.users',
                        string: "User",
                        type: 'many2one',
                    },
                },
                records: [
                    { id: 1, user_id: 11 },
                    { id: 2, user_id: 7 },
                    { id: 3, user_id: 11 },
                    { id: 4, user_id: 23 },
                ],
            },
        });

        this.data['res.partner'].records.push(
            { id: 11, display_name: "Partner 1" },
            { id: 12, display_name: "Partner 2" },
            { id: 13, display_name: "Partner 3" },
        );
        this.data['res.users'].records.push(
            { id: 11, name: "Mario", partner_id: 11 },
            { id: 7, name: "Luigi", partner_id: 12 },
            { id: 23, name: "Yoshi", partner_id: 13 },
        );
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('many2one_avatar_user widget in list view', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv({
        mockRPC(route, args) {
            if (args.method === 'read') {
                assert.step(`read ${args.model} ${args.args[0]}`);
            }
            return this._super(...arguments);
        },
    });
    const list = await createView({
        arch: '<tree><field name="user_id" widget="many2one_avatar_user"/></tree>',
        env,
        model: 'foo',
        View: ListView,
    });
    intercept(
        list,
        'open_record',
        () => assert.step('open record'),
    );
    assert.strictEqual(
        list.$('.o_data_cell span').text(),
        'MarioLuigiMarioYoshi',
    );

    // sanity check: later on, we'll check that clicking on the avatar doesn't open the record
    await click(list.$('.o_data_row:first span'));
    await click(list.$('.o_data_cell:nth(0) .o_m2o_avatar'));
    await click(list.$('.o_data_cell:nth(1) .o_m2o_avatar'));
    await click(list.$('.o_data_cell:nth(2) .o_m2o_avatar'));
    assert.verifySteps([
        'open record',
        'read res.users 11',
        // 'call service openDMChatWindow 1',
        'read res.users 7',
        // 'call service openDMChatWindow 2',
        // 'call service openDMChatWindow 1',
    ]);

    list.destroy();
});

QUnit.test('many2one_avatar_user widget in kanban view', async function (assert) {
    assert.expect(6);

    createServer(this.data);
    const env = await createEnv();
    const kanban = await createView({
        arch: `
            <kanban>
                <templates>
                    <t t-name="kanban-box">
                        <div>
                            <field name="user_id" widget="many2one_avatar_user"/>
                        </div>
                    </t>
                </templates>
            </kanban>`,
        env,
        model: 'foo',
        View: KanbanView,
    });
    assert.strictEqual(
        kanban.$('.o_kanban_record').text().trim(),
        '',
    );
    assert.containsN(
        kanban,
        '.o_m2o_avatar',
        4,
    );
    assert.strictEqual(
        kanban.$('.o_m2o_avatar:nth(0)').data('src'),
        '/web/image/res.users/11/image_128',
    );
    assert.strictEqual(
        kanban.$('.o_m2o_avatar:nth(1)').data('src'),
        '/web/image/res.users/7/image_128',
    );
    assert.strictEqual(
        kanban.$('.o_m2o_avatar:nth(2)').data('src'),
        '/web/image/res.users/11/image_128',
    );
    assert.strictEqual(
        kanban.$('.o_m2o_avatar:nth(3)').data('src'),
        '/web/image/res.users/23/image_128',
    );

    kanban.destroy();
});

});
});
});
