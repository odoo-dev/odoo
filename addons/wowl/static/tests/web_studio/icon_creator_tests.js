/** @odoo-module **/

import { IconCreator } from "../../src/web_studio/client_action/icon_creator/icon_creator";
import makeTestEnvironment from "web.test_env";
import testUtils from "web.test_utils";

const { Component, tags } = owl;
const { xml } = tags;
const sampleIconUrl = "/web_enterprise/Parent.src/img/default_icon_app.png";

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

  QUnit.module("IconCreator");

  QUnit.test("icon creator: with initial web icon data", async function (assert) {
    assert.expect(4);

    class Parent extends Component {
      constructor() {
        super(...arguments);
        this.webIconData = sampleIconUrl;
      }
      _onIconChanged(ev) {
        // default values
        assert.step("icon-changed");
        assert.deepEqual(ev.detail, {
          backgroundColor: "#34495e",
          color: "#f1c40f",
          iconClass: "fa fa-diamond",
          type: "custom_icon",
        });
      }
    }
    Parent.components = { IconCreator };
    Parent.env = makeTestEnvironment();
    Parent.template = xml`
            <IconCreator
                editable="true"
                type="'base64'"
                webIconData="webIconData"
                t-on-icon-changed.stop.prevent="_onIconChanged"
            />`;
    const parent = new Parent();
    await parent.mount(testUtils.prepareTarget());

    assert.strictEqual(
      parent.el.querySelector(".o_web_studio_uploaded_image").style.backgroundImage,
      `url(\"${sampleIconUrl}\")`,
      "displayed image should prioritize web icon data"
    );

    // click on first link: "Design icon"
    await testUtils.dom.click(parent.el.querySelector(".o_web_studio_upload a"));

    assert.verifySteps(["icon-changed"]);

    parent.destroy();
  });

  QUnit.test("icon creator: without initial web icon data", async function (assert) {
    assert.expect(3);

    class Parent extends Component {}
    Parent.components = { IconCreator };
    Parent.env = makeTestEnvironment();
    Parent.template = xml`
            <IconCreator
                backgroundColor="'rgb(255, 0, 128)'"
                color="'rgb(0, 255, 0)'"
                editable="false"
                iconClass="'fa fa-heart'"
                type="'custom_icon'"
            />`;
    const parent = new Parent();
    await parent.mount(testUtils.prepareTarget());

    // Attributes should be correctly set
    assert.strictEqual(
      parent.el.querySelector(".o_app_icon").style.backgroundColor,
      "rgb(255, 0, 128)"
    );
    assert.strictEqual(parent.el.querySelector(".o_app_icon i").style.color, "rgb(0, 255, 0)");
    assert.hasClass(parent.el.querySelector(".o_app_icon i"), "fa fa-heart");

    parent.destroy();
  });
});
