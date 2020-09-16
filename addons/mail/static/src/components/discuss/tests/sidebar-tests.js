/** @odoo-module alias=mail.components.Discuss.sidebarTests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';
import makeDeferred from 'mail.utils.makeDeferred';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Discuss', {}, function () {
QUnit.module('sidebarTests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('sidebar find shows channels matching search term', async function (assert) {
    assert.expect(3);

    this.data['mail.channel'].records.push(
        {
            channel_partner_ids: [],
            channel_type: 'channel',
            id: 20,
            members: [],
            name: 'test',
            public: 'public',
        },
    );
    const searchReadDef = makeDeferred();
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            const res = await this._super(...arguments);
            if (args.method === 'search_read') {
                searchReadDef.resolve();
            }
            return res;
        },
    });
    await env.services.action.dispatch('Component/mount', 'Discuss');
    await afterNextRender(
        () => document.querySelector('.o-DiscussSidebar-groupHeaderItemAdd').click()
    );
    document.querySelector('.o-DiscussSidebar-itemNew').focus();
    document.execCommand('insertText', false, "test");
    document.querySelector('.o-DiscussSidebar-itemNew')
        .dispatchEvent(new window.KeyboardEvent('keydown'));
    document.querySelector('.o-DiscussSidebar-itemNew')
        .dispatchEvent(new window.KeyboardEvent('keyup'));

    await searchReadDef;
    await nextAnimationFrame(); // ensures search_read rpc is rendered.
    const results = document.querySelectorAll(`
        .ui-autocomplete
        .ui-menu-item
        a
    `);
    assert.ok(
        results,
        "should have autocomplete suggestion after typing on 'find or create channel' input",
    );
    assert.strictEqual(
        results.length,
        // When searching for a single existing channel, the results list will have at least 3 lines:
        // One for the existing channel itself
        // One for creating a public channel with the search term
        // One for creating a private channel with the search term
        3,
    );
    assert.strictEqual(
        results[0].textContent,
        "test",
        "autocomplete suggestion should target the channel matching search term",
    );
});

QUnit.test('sidebar find shows channels matching search term even when user is member', async function (assert) {
    assert.expect(3);

    this.data['mail.channel'].records.push(
        {
            channel_partner_ids: [this.data.currentPartnerId],
            channel_type: 'channel',
            id: 20,
            members: [this.data.currentPartnerId],
            name: 'test',
            public: 'public',
        },
    );
    const searchReadDef = makeDeferred();
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            const res = await this._super(...arguments);
            if (args.method === 'search_read') {
                searchReadDef.resolve();
            }
            return res;
        },
    });
    await env.services.action.dispatch('Component/mount', 'Discuss');
    await afterNextRender(
        () => document.querySelector('.o-DiscussSidebar-groupHeaderItemAdd').click(),
    );
    document.querySelector('.o-DiscussSidebar-itemNew').focus();
    document.execCommand('insertText', false, "test");
    document.querySelector('.o-DiscussSidebar-itemNew')
        .dispatchEvent(new window.KeyboardEvent('keydown'));
    document.querySelector('.o-DiscussSidebar-itemNew')
        .dispatchEvent(new window.KeyboardEvent('keyup'));

    await searchReadDef;
    await nextAnimationFrame();
    const results = document.querySelectorAll(`
        .ui-autocomplete
        .ui-menu-item
        a
    `);
    assert.ok(
        results,
        "should have autocomplete suggestion after typing on 'find or create channel' input",
    );
    assert.strictEqual(
        results.length,
        // When searching for a single existing channel, the results list will have at least 3 lines:
        // One for the existing channel itself
        // One for creating a public channel with the search term
        // One for creating a private channel with the search term
        3,
    );
    assert.strictEqual(
        results[0].textContent,
        "test",
        "autocomplete suggestion should target the channel matching search term even if user is member",
    );
});

});
});
});
