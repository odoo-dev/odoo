/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useModal } from "../../../src/core/modal/modal_hook";
import { uiService } from "@web/core/ui_service";
import { hotkeyService } from "@web/webclient/hotkeys/hotkey_service";
import { click, getFixture, nextTick } from "../../helpers/utils";
import { makeTestEnv } from "../../helpers/mock_env";
import { ErrorModal } from "@web/core/modal/error_modal";
import { makeFakeLocalizationService } from "../../helpers/mock_services";
const { tags, mount } = owl;
const serviceRegistry = registry.category("services");

let parent;
let target;
let env;

QUnit.module("Core", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
        const dialogContainer = document.createElement("div");
        dialogContainer.classList.add("o_dialog_container");
        target.append(dialogContainer);
        serviceRegistry.add("hotkey", hotkeyService);
        serviceRegistry.add("ui", uiService);
        serviceRegistry.add("localization", makeFakeLocalizationService());
        env = await makeTestEnv();
    });
    hooks.afterEach(() => {
        if (parent) {
            parent.unmount();
            parent = undefined;
        }
    });
    QUnit.module("Modal");

    QUnit.test("simple rendering", async function (assert) {
        assert.expect(8);
        class Parent extends owl.Component {
            setup() {
                useModal({ title: "Wow(l) Effect" });
            }
        }
        Parent.template = owl.tags.xml`
              <div>
                  Hello!
              </div>
          `;
        parent = await mount(Parent, { env, target });
        assert.containsOnce(target, "div.o_dialog_container .o_dialog");
        assert.containsOnce(
            target,
            ".o_dialog header .modal-title",
            "the header is rendered by default"
        );
        assert.strictEqual(
            target.querySelector("header .modal-title").textContent,
            "Wow(l) Effect"
        );
        assert.containsOnce(target, ".o_dialog main", "a dialog has always a main node");
        assert.strictEqual(target.querySelector("main").textContent, " Hello! ");
        assert.containsOnce(target, ".o_dialog footer", "the footer is rendered by default");
        assert.containsOnce(
            target,
            ".o_dialog footer button",
            "the footer is rendered with a single button 'Ok' by default"
        );
        assert.strictEqual(target.querySelector("footer button").textContent, "Ok");
    });

    QUnit.test("simple rendering with two dialogs", async function (assert) {
        assert.expect(2);
        class Parent extends owl.Component {}
        Parent.template = owl.tags.xml`
              <div>
                  <SimpleDialog title="'First Title'">
                      Hello!
                  </SimpleDialog>
                  <SimpleDialog title="'Second Title'">
                      Hello again!
                  </SimpleDialog>
              </div>
          `;
        parent = await mount(Parent, { env, target });
        assert.containsN(target, ".o_dialog", 2);
        assert.deepEqual(
            [...target.querySelectorAll(".o_dialog .modal-body")].map((el) => el.textContent),
            [" Hello again! ", " Hello! "] // mounted is called in reverse order
        );
    });

    QUnit.test("ErrorModal with traceback", async (assert) => {
        assert.expect(11);
        class Parent extends owl.Component {
            constructor() {
                super(...arguments);
                this.message = "Something bad happened";
                this.data = { debug: "Some strange unreadable stack" };
                this.name = "ERROR_NAME";
                this.traceback = "This is a tracback string";
            }
        }
        Parent.components = { ErrorModal };
        Parent.template = tags.xml`<ErrorModal traceback="traceback" name="name" message="message" data="data"/>`;
        assert.containsNone(target, ".o_dialog");
        env = await makeTestEnv();
        parent = await mount(Parent, { env, target });
        assert.containsOnce(target, "div.o_dialog_container .o_dialog");
        assert.strictEqual(target.querySelector("header .modal-title").textContent, "Odoo Error");
        const mainButtons = target.querySelectorAll("main button");
        assert.deepEqual(
            [...mainButtons].map((el) => el.textContent),
            ["Copy the full error to clipboard", "See details"]
        );
        assert.deepEqual(
            [...target.querySelectorAll("main .clearfix p")].map((el) => el.textContent),
            [
                "An error occurred",
                "Please use the copy button to report the error to your support service.",
            ]
        );
        assert.containsNone(target, "div.o_error_detail");
        assert.strictEqual(target.querySelector(".o_dialog footer button").textContent, "Ok");
        click(mainButtons[1]);
        await nextTick();
        assert.deepEqual(
            [...target.querySelectorAll("main .clearfix p")].map((el) => el.textContent),
            [
                "An error occurred",
                "Please use the copy button to report the error to your support service.",
                "Something bad happened",
            ]
        );
        assert.deepEqual(
            [...target.querySelectorAll("main .clearfix code")].map((el) => el.textContent),
            ["ERROR_NAME"]
        );
        assert.containsOnce(target, "div.o_error_detail");
        assert.strictEqual(
            target.querySelector("div.o_error_detail").textContent,
            "This is a tracback string"
        );
    });
});
