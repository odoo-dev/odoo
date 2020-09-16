/** @odoo-module alias=mail.components.DiscussMobileMailboxSelection.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('DiscussMobileMailboxSelection', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('select another mailbox', async function (assert) {
    assert.expect(7);

    createServer(this.data);
    const env = await createEnv({
        env: {
            browser: {
                innerHeight: 640,
                innerWidth: 360,
            },
            device: {
                isMobile: true,
            },
        },
    });
    await env.services.action.dispatch('Component/mount', 'Discuss');
    assert.containsOnce(
        document.body,
        '.o-Discuss',
        "should display discuss initially",
    );
    assert.hasClass(
        document.querySelector('.o-Discuss'),
        'o-isMobile',
        "discuss should be opened in mobile mode",
    );
    assert.containsOnce(
        document.body,
        '.o-Discuss-thread',
        "discuss should display a thread initially",
    );
    assert.strictEqual(
        document.querySelector('.o-Discuss-thread').dataset.threadLocalId,
        env.services.model.messaging.$$$inbox().localId,
        "inbox mailbox should be opened initially",
    );
    assert.containsOnce(
        document.body,
        `.o-DiscussMobileMailboxSelection-button[
            data-mailbox-local-id="${env.services.model.messaging.$$$starred().localId}"
        ]`,
        "should have a button to open starred mailbox",
    );

    await afterNextRender(
        () => document.querySelector(`.o-DiscussMobileMailboxSelection-button[
            data-mailbox-local-id="${env.services.model.messaging.$$$starred().localId}"]
        `).click(),
    );
    assert.containsOnce(
        document.body,
        '.o-Discuss-thread',
        "discuss should still have a thread after clicking on starred mailbox",
    );
    assert.strictEqual(
        document.querySelector('.o-Discuss-thread').dataset.threadLocalId,
        env.services.model.messaging.$$$starred().localId,
        "starred mailbox should be opened after clicking on it",
    );
});

QUnit.test('auto-select "Inbox" when discuss had channel as active thread', async function (assert) {
    assert.expect(3);

    this.data['mail.channel'].records.push(
        { id: 20 },
    );
    createServer(this.data);
    const env = await createEnv({
        env: {
            browser: {
                innerHeight: 640,
                innerWidth: 360,
            },
            device: {
                isMobile: true,
            },
        },
    });
    await env.services.action.dispatch('Component/mount', 'Discuss');
    await env.services.action.dispatch(
        'Thread/open',
        env.services.action.dispatch('Thread/findById', {
            $$$id: 20,
            $$$model: 'mail.channel',
        }),
    );
    assert.hasClass(
        document.querySelector('.o-MobileMessagingNavbar-tab[data-tab-id="channel"]'),
        'o-isActive',
        "'channel' tab should be active initially when loading discuss with channel id as active_id",
    );

    await afterNextRender(
        () => document.querySelector(
            '.o-MobileMessagingNavbar-tab[data-tab-id="mailbox"]'
        ).click(),
    );
    assert.hasClass(
        document.querySelector('.o-MobileMessagingNavbar-tab[data-tab-id="mailbox"]'),
        'o-isActive',
        "'mailbox' tab should be selected after click on mailbox tab",
    );
    assert.hasClass(
        document.querySelector(`
            .o-DiscussMobileMailboxSelection-button[data-mailbox-local-id="${
                env.services.model.messaging.$$$inbox().localId
            }"]
        `),
        'o-isActive',
        "'Inbox' mailbox should be auto-selected after click on mailbox tab",
    );
});

});
});
});
