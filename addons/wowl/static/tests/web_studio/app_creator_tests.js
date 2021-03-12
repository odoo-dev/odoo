/** @odoo-module **/

import { AppCreatorWrapper } from "../../src/web_studio/client_action/app_creator/app_creator";
import testUtils from "web.test_utils";

const { Component } = owl;
const sampleIconUrl = "/web_enterprise/Parent.src/img/default_icon_app.png";

async function createAppCreator({ debug, env, events, rpc, state }) {
  const cleanUp = await testUtils.mock.addMockEnvironmentOwl(Component, {
    debug,
    env,
    mockRPC: rpc,
  });
  const appCreatorWrapper = new AppCreatorWrapper(null, {});
  const _destroy = appCreatorWrapper.destroy;
  appCreatorWrapper.destroy = () => {
    _destroy.call(appCreatorWrapper, arguments);
    cleanUp();
  };
  await appCreatorWrapper.prependTo(testUtils.prepareTarget(debug));
  Object.keys(events || {}).forEach((eventName) => {
    appCreatorWrapper.appCreatorComponent.el.addEventListener(eventName, (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      events[eventName](ev);
    });
  });
  const appCreator = Object.values(appCreatorWrapper.appCreatorComponent.__owl__.children)[0];
  if (state) {
    for (const key in state) {
      appCreator.state[key] = state[key];
    }
    await testUtils.nextTick();
  }
  return { appCreator, wrapper: appCreatorWrapper };
}

QUnit.module("Studio", (hooks) => {
  const fadeIn = $.fn.fadeIn;
  const fadeOut = $.fn.fadeOut;

  hooks.before(() => {
    const fadeEmptyFunction = (delay, cb) => (cb ? cb() : null);
    $.fn.fadeIn = fadeEmptyFunction;
    $.fn.fadeOut = fadeEmptyFunction;
  });
  hooks.after(() => {
    $.fn.fadeIn = fadeIn;
    $.fn.fadeOut = fadeOut;
  });

  QUnit.module("AppCreator");

  QUnit.test("app creator: standard flow with model creation", async function (assert) {
    assert.expect(39);

    const { wrapper, appCreator } = await createAppCreator({
      env: {
        services: {
          blockUI: () => assert.step("UI blocked"),
          httpRequest: (route) => {
            if (route === "/web/binary/upload_attachment") {
              assert.step(route);
              return Promise.resolve('[{ "id": 666 }]');
            }
          },
          unblockUI: () => assert.step("UI unblocked"),
        },
      },
      events: {
        "new-app-created": () => assert.step("new-app-created"),
      },
      rpc: async (route, params) => {
        if (route === "/web_studio/create_new_app") {
          const { app_name, menu_name, model_choice, model_id, model_options } = params;
          assert.strictEqual(app_name, "Kikou", "App name should be correct");
          assert.strictEqual(menu_name, "Petite Perruche", "Menu name should be correct");
          assert.notOk(model_id, "Should not have a model id");
          assert.strictEqual(model_choice, "new", "Model choice should be 'new'");
          assert.deepEqual(
            model_options,
            ["use_partner", "use_sequence", "use_mail", "use_active"],
            "Model options should include the defaults and 'use_partner'"
          );
          return Promise.resolve();
        }
        if (route === "/web/dataset/call_kw/ir.attachment/read") {
          assert.strictEqual(params.model, "ir.attachment");
          return Promise.resolve([{ datas: sampleIconUrl }]);
        }
      },
    });

    // step: 'welcome'
    assert.strictEqual(appCreator.state.step, "welcome", "Current step should be welcome");
    assert.containsNone(
      appCreator,
      ".o_web_studio_app_creator_previous",
      "Previous button should not be rendered at step welcome"
    );
    assert.hasClass(
      appCreator.el.querySelector(".o_web_studio_app_creator_next"),
      "is_ready",
      "Next button should be ready at step welcome"
    );

    // go to step: 'app'
    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_app_creator_next"));

    assert.strictEqual(appCreator.state.step, "app", "Current step should be app");
    assert.containsOnce(
      appCreator,
      ".o_web_studio_icon_creator .o_web_studio_selectors",
      "Icon creator should be rendered in edit mode"
    );

    // Icon creator interactions
    const icon = appCreator.el.querySelector(".o_app_icon i");

    // Initial state: take default values
    assert.strictEqual(
      appCreator.el.querySelector(".o_app_icon").style.backgroundColor,
      "rgb(52, 73, 94)",
      "default background color: #34495e"
    );
    assert.strictEqual(icon.style.color, "rgb(241, 196, 15)", "default color: #f1c40f");
    assert.hasClass(icon, "fa fa-diamond", "default icon class: diamond");

    await testUtils.dom.click(appCreator.el.getElementsByClassName("o_web_studio_selector")[0]);

    assert.containsOnce(appCreator, ".o_web_studio_palette", "the first palette should be open");

    await testUtils.dom.triggerEvent(
      appCreator.el.querySelector(".o_web_studio_palette"),
      "mouseleave"
    );

    assert.containsNone(
      appCreator,
      ".o_web_studio_palette",
      "leaving palette with mouse should close it"
    );

    await testUtils.dom.click(
      appCreator.el.querySelectorAll(".o_web_studio_selectors > .o_web_studio_selector")[0]
    );
    await testUtils.dom.click(
      appCreator.el.querySelectorAll(".o_web_studio_selectors > .o_web_studio_selector")[1]
    );

    assert.containsOnce(
      appCreator,
      ".o_web_studio_palette",
      "opening another palette should close the first"
    );

    await testUtils.dom.click(appCreator.el.querySelectorAll(".o_web_studio_palette div")[2]);
    await testUtils.dom.click(
      appCreator.el.querySelectorAll(".o_web_studio_selectors > .o_web_studio_selector")[2]
    );
    await testUtils.dom.click(
      appCreator.el.querySelectorAll(".o_web_studio_icons_library div")[43]
    );

    await testUtils.dom.triggerEvent(
      appCreator.el.querySelector(".o_web_studio_icons_library"),
      "mouseleave"
    );

    assert.containsNone(
      appCreator,
      ".o_web_studio_palette",
      "no palette should be visible anymore"
    );

    assert.strictEqual(
      appCreator.el.querySelectorAll(".o_web_studio_selector")[1].style.backgroundColor,
      "rgb(0, 222, 201)", // translation of #00dec9
      "color selector should have changed"
    );
    assert.strictEqual(icon.style.color, "rgb(0, 222, 201)", "icon color should also have changed");

    assert.hasClass(
      appCreator.el.querySelector(".o_web_studio_selector i"),
      "fa fa-heart",
      "class selector should have changed"
    );
    assert.hasClass(icon, "fa fa-heart", "icon class should also have changed");

    // Click and upload on first link: upload a file
    // mimic the event triggered by the upload (jquery)
    await testUtils.dom.triggerEvent(
      appCreator.el.querySelector(".o_web_studio_upload input"),
      "change"
    );

    assert.strictEqual(
      appCreator.state.iconData.uploaded_attachment_id,
      666,
      "attachment id should have been given by the RPC"
    );
    assert.strictEqual(
      appCreator.el.querySelector(".o_web_studio_uploaded_image").style.backgroundImage,
      `url("data:image/png;base64,${sampleIconUrl}")`,
      "icon should take the updated attachment data"
    );

    // try to go to step 'model'
    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_app_creator_next"));

    const appNameInput = appCreator.el.querySelector('input[name="appName"]').parentNode;

    assert.strictEqual(
      appCreator.state.step,
      "app",
      "Current step should not be update because the input is not filled"
    );
    assert.hasClass(
      appNameInput,
      "o_web_studio_app_creator_field_warning",
      "Input should be in warning mode"
    );

    await testUtils.fields.editInput(appCreator.el.querySelector('input[name="appName"]'), "Kikou");
    assert.doesNotHaveClass(
      appNameInput,
      "o_web_studio_app_creator_field_warning",
      "Input shouldn't be in warning mode anymore"
    );

    // step: 'model'
    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_app_creator_next"));

    assert.strictEqual(appCreator.state.step, "model", "Current step should be model");

    assert.containsNone(
      appCreator,
      ".o_web_studio_selectors",
      "Icon creator should be rendered in readonly mode"
    );

    // try to go to next step
    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_app_creator_next"));

    assert.hasClass(
      appCreator.el.querySelector('input[name="menuName"]').parentNode,
      "o_web_studio_app_creator_field_warning",
      "Input should be in warning mode"
    );

    await testUtils.fields.editInput(
      appCreator.el.querySelector('input[name="menuName"]'),
      "Petite Perruche"
    );

    // go to next step (model configuration)
    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_app_creator_next"));
    assert.strictEqual(
      appCreator.state.step,
      "model_configuration",
      "Current step should be model_configuration"
    );
    assert.containsOnce(
      appCreator,
      'input[name="use_active"]',
      "Debug options should be visible without debug mode"
    );
    // check an option
    await testUtils.dom.click(appCreator.el.querySelector('input[name="use_partner"]'));
    assert.containsOnce(
      appCreator,
      'input[name="use_partner"]:checked',
      "Option should have been checked"
    );

    // go back then go forward again
    await testUtils.dom.click(
      appCreator.el.querySelector(".o_web_studio_model_configurator_previous")
    );
    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_app_creator_next"));
    // options should have been reset
    assert.containsNone(
      appCreator,
      'input[name="use_partner"]:checked',
      "Options should have been reset by going back then forward"
    );

    // check the option again, we want to test it in the RPC
    await testUtils.dom.click(appCreator.el.querySelector('input[name="use_partner"]'));

    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_model_configurator_next"));

    assert.verifySteps([
      "/web/binary/upload_attachment",
      "UI blocked",
      "new-app-created",
      "UI unblocked",
    ]);

    wrapper.destroy();
  });

  QUnit.test("app creator: debug flow with existing model", async function (assert) {
    assert.expect(16);

    const { wrapper, appCreator } = await createAppCreator({
      env: {
        isDebug: () => true,
        services: {
          blockUI() {},
          unblockUI() {},
        },
      },
      async rpc(route, params) {
        assert.step(route);
        switch (route) {
          case "/web/dataset/call_kw/ir.model/name_search":
            assert.strictEqual(params.model, "ir.model", "request should target the right model");
            return [[69, "The Value"]];
          case "/web_studio/create_new_app":
            assert.strictEqual(params.model_id, 69, "model id should be the one provided");
        }
      },
      state: {
        menuName: "Kikou",
        step: "model",
      },
    });

    let buttonNext = appCreator.el.querySelector("button.o_web_studio_app_creator_next");

    assert.hasClass(buttonNext, "is_ready");

    await testUtils.fields.editInput(
      appCreator.el.querySelector('input[name="menuName"]'),
      "Petite Perruche"
    );
    // check the 'new model' radio
    await testUtils.dom.click(
      appCreator.el.querySelector('input[name="model_choice"][value="new"]')
    );

    // go to next step (model configuration)
    await testUtils.dom.click(appCreator.el.querySelector(".o_web_studio_app_creator_next"));
    assert.strictEqual(
      appCreator.state.step,
      "model_configuration",
      "Current step should be model_configuration"
    );
    assert.containsOnce(
      appCreator,
      'input[name="use_active"]',
      "Debug options should be visible in debug mode"
    );
    // go back, we want the 'existing model flow'
    await testUtils.dom.click(
      appCreator.el.querySelector(".o_web_studio_model_configurator_previous")
    );

    // since we came back, we need to update our buttonNext ref - the querySelector is not live
    buttonNext = appCreator.el.querySelector("button.o_web_studio_app_creator_next");

    // check the 'existing model' radio
    await testUtils.dom.click(
      appCreator.el.querySelector('input[name="model_choice"][value="existing"]')
    );

    assert.doesNotHaveClass(
      appCreator.el.querySelector(".o_web_studio_app_creator_model"),
      "o_web_studio_app_creator_field_warning"
    );
    assert.doesNotHaveClass(buttonNext, "is_ready");
    assert.containsOnce(
      appCreator,
      ".o_field_many2one",
      "There should be a many2one to select a model"
    );

    await testUtils.dom.click(buttonNext);

    assert.hasClass(
      appCreator.el.querySelector(".o_web_studio_app_creator_model"),
      "o_web_studio_app_creator_field_warning"
    );
    assert.doesNotHaveClass(buttonNext, "is_ready");

    await testUtils.dom.click(appCreator.el.querySelector(".o_field_many2one input"));
    await testUtils.dom.click(document.querySelector(".ui-menu-item-wrapper"));

    assert.strictEqual(appCreator.el.querySelector(".o_field_many2one input").value, "The Value");

    assert.doesNotHaveClass(
      appCreator.el.querySelector(".o_web_studio_app_creator_model"),
      "o_web_studio_app_creator_field_warning"
    );
    assert.hasClass(buttonNext, "is_ready");

    await testUtils.dom.click(buttonNext);

    assert.verifySteps(["/web/dataset/call_kw/ir.model/name_search", "/web_studio/create_new_app"]);

    wrapper.destroy();
  });

  QUnit.test('app creator: navigate through steps using "ENTER"', async function (assert) {
    assert.expect(12);

    const { wrapper, appCreator } = await createAppCreator({
      env: {
        services: {
          blockUI: () => assert.step("UI blocked"),
          unblockUI: () => assert.step("UI unblocked"),
        },
      },
      events: {
        "new-app-created": () => assert.step("new-app-created"),
      },
      rpc: (route, { app_name, is_app, menu_name, model_id }) => {
        if (route === "/web_studio/create_new_app") {
          assert.strictEqual(app_name, "Kikou", "App name should be correct");
          assert.strictEqual(menu_name, "Petite Perruche", "Menu name should be correct");
          assert.notOk(model_id, "Should not have a model id");

          return Promise.resolve();
        }
      },
    });

    // step: 'welcome'
    assert.strictEqual(appCreator.state.step, "welcome", "Current step should be set to 1");

    // go to step 'app'
    await testUtils.dom.triggerEvent(window, "keydown", { key: "Enter" });
    assert.strictEqual(appCreator.state.step, "app", "Current step should be set to app");

    // try to go to step 'model'
    await testUtils.dom.triggerEvent(window, "keydown", { key: "Enter" });
    assert.strictEqual(
      appCreator.state.step,
      "app",
      "Current step should not be update because the input is not filled"
    );

    await testUtils.fields.editInput(appCreator.el.querySelector('input[name="appName"]'), "Kikou");

    // go to step 'model'
    await testUtils.dom.triggerEvent(window, "keydown", { key: "Enter" });
    assert.strictEqual(appCreator.state.step, "model", "Current step should be model");

    // try to create app
    await testUtils.dom.triggerEvent(window, "keydown", { key: "Enter" });
    assert.hasClass(
      appCreator.el.querySelector('input[name="menuName"]').parentNode,
      "o_web_studio_app_creator_field_warning",
      "a warning should be displayed on the input"
    );

    await testUtils.fields.editInput(
      appCreator.el.querySelector('input[name="menuName"]'),
      "Petite Perruche"
    );
    await testUtils.dom.triggerEvent(window, "keydown", { key: "Enter" });
    await testUtils.dom.triggerEvent(window, "keydown", { key: "Enter" });

    assert.verifySteps(["UI blocked", "new-app-created", "UI unblocked"]);

    wrapper.destroy();
  });
});
