/** @odoo-module **/

import { serviceRegistry } from "@web/webclient/service_registry";
import { makeTestEnv } from "../helpers/mock_env";
import { click, getFixture, nextTick } from "../helpers/utils";
import { scrollerService } from "@web/services/scroller_service";

const { Component, mount, tags } = owl;

let env;
let comp;
let target;

class MyComponent extends Component {}
MyComponent.template = tags.xml/* xml */ `
        <div class="o_content">
            <a href="#scrollToHere"  class="btn btn-primary">sroll to ...</a>
            <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus.
                Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed,
                dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper
                congue, euismod non, mi. Proin porttitor, orci nec nonummy molestie, enim est
                eleifend mi, non fermentum diam nisl sit amet erat. Duis semper. Duis arcu
                massa, scelerisque vitae, consequat in, pretium a, enim. Pellentesque congue. Ut
                in risus volutpat libero pharetra tempor. Cras vestibulum bibendum augue. Praesent
                egestas leo in pede. Praesent blandit odio eu enim. Pellentesque sed dui ut augue
                blandit sodales. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices
                posuere cubilia Curae; Aliquam nibh. Mauris ac mauris sed pede pellentesque
                fermentum. Maecenas adipiscing ante non diam sodales hendrerit.
            </p>
            <p>
                Ut velit mauris, egestas sed, gravida nec, ornare ut, mi. Aenean ut orci vel massa
                suscipit pulvinar. Nulla sollicitudin. Fusce varius, ligula non tempus aliquam, nunc
                turpis ullamcorper nibh, in tempus sapien eros vitae ligula. Pellentesque rhoncus
                nunc et augue. Integer id felis. Curabitur aliquet pellentesque diam. Integer quis
                metus vitae elit lobortis egestas. Lorem ipsum dolor sit amet, consectetuer adipiscing
                elit. Morbi vel erat non mauris convallis vehicula. Nulla et sapien. Integer tortor
                tellus, aliquam faucibus, convallis id, congue eu, quam. Mauris ullamcorper felis
                vitae erat. Proin feugiat, augue non elementum posuere, metus purus iaculis lectus,
                et tristique ligula justo vitae magna.
            </p>
            <p>
                Aliquam convallis sollicitudin purus. Praesent aliquam, enim at fermentum mollis,
                ligula massa adipiscing nisl, ac euismod nibh nisl eu lectus. Fusce vulputate sem
                at sapien. Vivamus leo. Aliquam euismod libero eu enim. Nulla nec felis sed leo
                placerat imperdiet. Aenean suscipit nulla in justo. Suspendisse cursus rutrum
                augue. Nulla tincidunt tincidunt mi. Curabitur iaculis, lorem vel rhoncus faucibus,
                felis magna fermentum augue, et ultricies lacus lorem varius purus. Curabitur eu amet.
            </p>
            <div id="scrollToHere">sroll here!</div>
        </div>
    `;

QUnit.module("ScrollerService", {
  async beforeEach() {
    serviceRegistry.add("scroller", scrollerService);
    env = await makeTestEnv();
    target = getFixture();
  },
  afterEach() {
    comp.destroy();
  },
});
QUnit.test("Simple rendering with a scroll", async (assert) => {
  assert.expect(2);
  const scrollableParent = document.createElement("div");
  scrollableParent.style.overflow = "scroll";
  scrollableParent.style.height = "150px";
  scrollableParent.style.width = "400px";
  target.append(scrollableParent);
  comp = await mount(MyComponent, { env, target: scrollableParent });

  assert.strictEqual(scrollableParent.scrollTop, 0);
  await click(scrollableParent.querySelector(".btn"));
  assert.ok(scrollableParent.scrollTop !== 0);
});
