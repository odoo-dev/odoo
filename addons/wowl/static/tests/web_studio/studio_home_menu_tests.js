/** @odoo-module **/

import { StudioHomeMenu } from "../../src/web_studio/client_action/studio_home_menu/studio_home_menu";
import { MODES } from "../../src/web_studio/studio_service";

import { makeFakeEnterpriseService } from "../web_enterprise/mocks";

import { makeFakeNotificationService, makeFakeUserService } from "@wowl/../tests/helpers/mocks";
import { makeTestEnv, mount } from "@wowl/../tests/helpers/utility";
import { Registry } from "@wowl/core/registry";

import testUtils from "web.test_utils";

const { Component, core, hooks, tags } = owl;
const { EventBus } = core;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function createStudioHomeMenu(testConfig) {
    class Parent extends Component {
        constructor() {
            super(...arguments);
            this.homeMenuRef = hooks.useRef("home-menu");
            this.homeMenuProps = testConfig.homeMenuProps;
        }
    }
    Parent.components = { StudioHomeMenu };
    Parent.template = tags.xml`
        <div>
            <StudioHomeMenu t-ref="home-menu" t-props="homeMenuProps"/>
            <div class="o_dialog_container"/>
        </div>`;
    const env = await makeTestEnv(testConfig);
    const parent = await mount(Parent, { env });
    return {
        studioHomeMenu: parent.homeMenuRef.comp,
        destroy: parent.destroy.bind(parent),
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

let testConfig;
let bus;

QUnit.module("Studio", (hooks) => {
    hooks.beforeEach(() => {
        bus = new EventBus();

        const serviceRegistry = new Registry();
        const fakeEnterpriseService = makeFakeEnterpriseService();
        const fakeNotificationService = makeFakeNotificationService();
        const fakeUserService = makeFakeUserService();
        const fakeHomeMenuService = {
            name: "home_menu",
            deploy() {
              return {
                toggle() {},
              };
            },
        };
        const fakeMenuService = {
            name: "menu",
            deploy() {
              return {
                setCurrentMenu(menu) {
                  bus.trigger("menu:setCurrentMenu", menu.id);
                },
                reload() {
                    bus.trigger('menu:reload');
                }
              };
            },
        };
        const fakeStudioService = {
            name: "studio",
            deploy() {
              return {
                MODES,
                open() {
                  bus.trigger("studio:open", ...arguments);
                },
              };
            },
        };
        const fakeHTTPService = {
            name: "http",
            deploy() {
                return {};
            },
        };
        serviceRegistry.add(fakeEnterpriseService.name, fakeEnterpriseService);
        serviceRegistry.add(fakeHomeMenuService.name, fakeHomeMenuService);
        serviceRegistry.add(fakeHTTPService.name, fakeHTTPService);
        serviceRegistry.add(fakeMenuService.name, fakeMenuService);
        serviceRegistry.add(fakeNotificationService.name, fakeNotificationService);
        serviceRegistry.add(fakeUserService.name, fakeUserService);
        serviceRegistry.add(fakeStudioService.name, fakeStudioService);

        const homeMenuProps = {
            apps: [{
                actionID: 121,
                id: 1,
                appID: 1,
                label: "Discuss",
                parents: "",
                webIcon: 'mail,static/description/icon.png',
                webIconData: "/web_enterprise/static/src/img/default_icon_app.png",
                xmlid: 'app.1',
            }, {
                actionID: 122,
                id: 2,
                appID: 2,
                label: "Calendar",
                parents: "",
                webIcon: {
                    backgroundColor: "#C6572A",
                    color: "#FFFFFF",
                    iconClass: "fa fa-diamond",
                },
                xmlid: 'app.2',
            }, {
                actionID: 123,
                id: 3,
                appID: 3,
                label: "Contacts",
                parents: "",
                webIcon: false,
                webIconData: "/web_enterprise/static/src/img/default_icon_app.png",
                xmlid: 'app.3',
            }],
        };

        testConfig = {
            homeMenuProps,
            serviceRegistry,
        };
    });

    QUnit.module("StudioHomeMenu");

    QUnit.test("simple rendering", async function (assert) {
        assert.expect(21);

        const { studioHomeMenu, destroy } = await createStudioHomeMenu(testConfig);

        // Main div
        assert.hasClass(studioHomeMenu.el, 'o_home_menu');

        // Hidden elements
        assert.isNotVisible(studioHomeMenu.el.querySelector('.database_expiration_panel'),
            "Expiration panel should not be visible");
        assert.hasClass(studioHomeMenu.el, 'o_search_hidden');

        // App list
        assert.containsOnce(studioHomeMenu.el, 'div.o_apps');
        assert.containsN(studioHomeMenu.el, 'div.o_apps > a.o_app.o_menuitem', 4,
            "should contain 3 normal app icons + the new app button");

        // App with image
        const firstApp = studioHomeMenu.el.querySelector('div.o_apps > a.o_app.o_menuitem');
        assert.strictEqual(firstApp.dataset.menuXmlid, 'app.1');
        assert.containsOnce(firstApp, 'div.o_app_icon');
        assert.strictEqual(firstApp.querySelector('div.o_app_icon').style.backgroundImage,
            'url("/web_enterprise/static/src/img/default_icon_app.png")');
        assert.containsOnce(firstApp, 'div.o_caption');
        assert.strictEqual(firstApp.querySelector('div.o_caption').innerText, 'Discuss');
        assert.containsOnce(firstApp, '.o_web_studio_edit_icon i');

        // App with custom icon
        const secondApp = studioHomeMenu.el.querySelectorAll('div.o_apps > a.o_app.o_menuitem')[1];
        assert.strictEqual(secondApp.dataset.menuXmlid, 'app.2');
        assert.containsOnce(secondApp, 'div.o_app_icon');
        assert.strictEqual(secondApp.querySelector('div.o_app_icon').style.backgroundColor, 'rgb(198, 87, 42)',
            "Icon background color should be #C6572A");
        assert.containsOnce(secondApp, 'i.fa.fa-diamond');
        assert.strictEqual(secondApp.querySelector('i.fa.fa-diamond').style.color, 'rgb(255, 255, 255)',
            "Icon color should be #FFFFFF");
        assert.containsOnce(secondApp, '.o_web_studio_edit_icon i');

        // New app button
        assert.containsOnce(studioHomeMenu.el, 'div.o_apps > a.o_app.o_web_studio_new_app', 'should contain a "New App icon"');
        const newApp = studioHomeMenu.el.querySelector('a.o_app.o_web_studio_new_app');
        assert.strictEqual(newApp.querySelector('div.o_app_icon').style.backgroundImage, 'url("/web_studio/static/src/img/default_icon_app.png")',
            "Image source URL should end with '/web_studio/static/src/img/default_icon_app.png'");
        assert.containsOnce(newApp, 'div.o_caption');
        assert.strictEqual(newApp.querySelector('div.o_caption').innerText, 'New App');

        destroy();
    });

    QUnit.test("Click on a normal App", async function (assert) {
        assert.expect(3);

        bus.on('studio:open', null, (mode, actionId) => {
            assert.strictEqual(mode, MODES.EDITOR);
            assert.strictEqual(actionId, 121);
        });
        bus.on('menu:setCurrentMenu', null, (menuId) => {
            assert.strictEqual(menuId, 1);
        });
        const { studioHomeMenu, destroy } = await createStudioHomeMenu(testConfig);

        await testUtils.dom.click(studioHomeMenu.el.querySelector('.o_menuitem'));

        destroy();
    });

    QUnit.test("Click on new App", async function (assert) {
        assert.expect(1);

        bus.on('studio:open', null, (mode) => {
            assert.strictEqual(mode, MODES.APP_CREATOR);
        });
        bus.on('menu:setCurrentMenu', null, () => {
            throw new Error('should not update the current menu');
        });
        const { studioHomeMenu, destroy } = await createStudioHomeMenu(testConfig);

        await testUtils.dom.click(studioHomeMenu.el.querySelector('a.o_app.o_web_studio_new_app'));

        destroy();
    });

    QUnit.test("Click on edit icon button", async function (assert) {
        assert.expect(11);

        const { studioHomeMenu, destroy } = await createStudioHomeMenu(testConfig);

        // TODO: we should maybe check icon visibility comes on mouse over
        const firstEditIconButton = studioHomeMenu.el.querySelector('.o_web_studio_edit_icon i');
        await testUtils.dom.click(firstEditIconButton);

        const dialog = document.querySelector('div.modal');
        assert.containsOnce(dialog, 'header.modal-header');
        assert.strictEqual(dialog.querySelector('header.modal-header h4').innerText, 'Edit Application Icon');

        assert.containsOnce(dialog, '.modal-content.o_web_studio_edit_menu_icon_modal .o_web_studio_icon_creator');

        assert.containsOnce(dialog, 'footer.modal-footer');
        assert.containsN(dialog, 'footer button', 2);

        const buttons = dialog.querySelectorAll('footer button');
        const firstButton = buttons[0];
        const secondButton = buttons[1];

        assert.strictEqual(firstButton.innerText, 'CONFIRM');
        assert.hasClass(firstButton, 'btn-primary');

        assert.strictEqual(secondButton.innerText, 'CANCEL');
        assert.hasClass(secondButton, 'btn-secondary');

        await testUtils.dom.click(secondButton);

        assert.strictEqual(document.querySelector('div.modal'), null);

        await testUtils.dom.click(firstEditIconButton);
        await testUtils.dom.click(document.querySelector('footer button'));

        assert.strictEqual(document.querySelector('div.modal'), null);

        destroy();
    });
});
