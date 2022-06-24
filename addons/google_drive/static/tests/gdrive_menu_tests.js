/** @odoo-module */
import { makeView, setupViewRegistries } from "@web/../tests/views/helpers";
import { getFixture, patchWithCleanup } from "@web/../tests/helpers/utils";
import { toggleActionMenu, toggleMenuItem, pagerNext } from "@web/../tests/search/helpers";
import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { googleDriveActionMenu } from "@google_drive/gdrive_menu";

QUnit.module('Google Drive Integration', (hooks) => {
    let serverData;
    let target;
    hooks.beforeEach(() => {
        serverData = {
            models: {
                partner: {
                    fields: {
                        display_name: { string: "Displayed name", type: "char", searchable: true },
                    },
                    records: [
                        { id: 1, display_name: "Locomotive Breath" },
                        { id: 2, display_name: "Hey Macarena" },
                    ],
                }
            }
        };
        target = getFixture();
        setupViewRegistries();
        registry.category("action_menus").add("google-drive-menu", googleDriveActionMenu);
    });

    QUnit.module('Google Drive ActionMenus');

    QUnit.test('rendering of the google drive attachments in action menus', async function (assert) {
        assert.expect(5);

        patchWithCleanup(browser, {
            open(route, opt) {
                assert.strictEqual(route, "someUrl");
                assert.strictEqual(opt, "_blank");
            }
        })

        await makeView({
            type:"form",
            arch:
                `<form string="Partners">
                    <field name="display_name"/>
                </form>`,
            serverData,
            loadActionMenus: true,
            async mockRPC(route, args) {
                switch (route) {
                    case '/web/dataset/call_kw/google.drive.config/get_google_drive_config':
                        assert.deepEqual(args.args, ['partner', 1],
                            'The route to get google drive config should have been called');
                        return [{
                            id: 27,
                            name: 'Cyberdyne Systems',
                        }];
                    case '/web/dataset/call_kw/google.drive.config/search_read':
                        return [{
                            google_drive_resource_id: "T1000",
                            google_drive_client_id: "cyberdyne.org",
                            id: 1,
                        }];
                    case '/web/dataset/call_kw/google.drive.config/get_google_drive_url':
                        assert.deepEqual(args.args, [27, 1, 'T1000'],
                            'The route to get the Google url should have been called');
                        return "someUrl";
                }
            },
            resModel: 'partner',
            resId: 1,
        });
        await toggleActionMenu(target);

        assert.containsOnce(target, '.oe_share_gdoc_item',
            "The button to the google action should be present");

        await toggleMenuItem(target, "Cyberdyne Systems");
    });

    QUnit.test("no google drive data", async function (assert) {
        assert.expect(1);

        await makeView({
            loadActionMenus: true,
            arch:
                `<form string="Partners">
                    <field name="display_name"/>
                </form>`,
            serverData,
            resModel: 'partner',
            resId: 1,
            resIds: [1,2],
            type: "form",
        });

        await toggleActionMenu(target);

        assert.containsNone(target, ".o_cp_action_menus .oe_share_gdoc_item");
    });

    QUnit.test('click on the google drive attachments after switching records', async function (assert) {
        assert.expect(4);

        patchWithCleanup(browser, {
            open() {}
        })

        let currentRecordId = 1;
        await makeView({
            loadActionMenus: true,
            arch:
                `<form string="Partners">
                    <field name="display_name"/>
                </form>`,
            serverData,
            async mockRPC(route, args) {
                switch (route) {
                    case '/web/dataset/call_kw/google.drive.config/get_google_drive_config':
                        assert.deepEqual(args.args, ['partner', currentRecordId],
                            'The route to get google drive config should have been called');
                        return [{
                            id: 27,
                            name: 'Cyberdyne Systems',
                        }];
                    case '/web/dataset/call_kw/google.drive.config/search_read':
                        return [{
                            google_drive_resource_id: "T1000",
                            google_drive_client_id: "cyberdyne.org",
                            id: 1,
                        }];
                    case '/web/dataset/call_kw/google.drive.config/get_google_drive_url':
                        assert.deepEqual(args.args, [27, currentRecordId, 'T1000'],
                            'The route to get the Google url should have been called');
                        return "someUrl";
                }
            },
            resModel: 'partner',
            resId: 1,
            resIds: [1, 2],
            type: "form",
        });

        await toggleActionMenu(target);
        await toggleMenuItem(target, "Cyberdyne Systems");

        currentRecordId = 2;
        await pagerNext(target);

        await toggleActionMenu(target);
        await toggleMenuItem(target, "Cyberdyne Systems");
    });
});
