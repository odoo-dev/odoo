/** @odoo-module **/
const { Component, mount, tags } = owl;
import { useSearch } from "../../../src/views/view_utils/hooks";
import {
  getFacetTexts,
  removeFacet,
  toggleComparisonMenu,
  toggleFilterMenu,
  toggleMenuItem,
  toggleMenuItemOption,
} from "../../helpers/control_panel";
import { patchDate } from "./search_model_tests";
import { SearchBar } from "../../../src/views/view_utils/search_bar/search_bar";
import { FilterMenu } from "../../../src/views/view_utils/filter_menu/filter_menu";
import { ComparisonMenu } from "../../../src/views/view_utils/comparison_menu/comparison_menu";
import { getFixture, makeFakeUserService, makeTestEnv } from "../../helpers/index";
import { Registry } from "../../../src/core/registry";
import { makeFakeLocalizationService, makeFakeRPCService } from "../../helpers/mocks";
import { modelService } from "../../../src/services/model";
import { viewManagerService } from "../../../src/services/view_manager";
import { processSearchViewDescription } from "../../../src/views/view_utils/search_utils";
class PseudoControlPanel extends Component {
  constructor() {
    super(...arguments);
    this.searchModel = useSearch({
      onSearchUpdate: () => {
        this.render();
      },
      searchMenuTypes: ["filter", "comparison"],
    });
  }
}
PseudoControlPanel.template = tags.xml`
    <div>
        <SearchBar searchModel="searchModel"/>
        <FilterMenu searchModel="searchModel"/>
        <ComparisonMenu t-if="searchModel.getSearchItems(i => i.type === 'comparison').length" searchModel="searchModel"/>
    </div>
    `;
PseudoControlPanel.components = { SearchBar, FilterMenu, ComparisonMenu };
let controlPanel;
let env;
let props;
let target;
QUnit.module(
  "ComparisonMenu",
  {
    async beforeEach() {
      const serviceRegistry = new Registry();
      const fakeUserService = makeFakeUserService();
      const fakeLocalizationService = makeFakeLocalizationService();
      const fakeRPCService = makeFakeRPCService();
      serviceRegistry
        .add(fakeLocalizationService.name, fakeLocalizationService)
        .add(fakeRPCService.name, fakeRPCService)
        .add(fakeUserService.name, fakeUserService)
        .add(modelService.name, modelService)
        .add(viewManagerService.name, viewManagerService);
      env = await makeTestEnv({ serviceRegistry });
      const processedSearchViewDescription = await processSearchViewDescription(
        {
          fields: {
            birthday: { string: "Birthday", type: "date", store: true, sortable: true },
            date_field: { string: "Date", type: "date", store: true, sortable: true },
          },
          arch: `
            <search>
              <filter name="birthday" date="birthday"/>
              <filter name="date_field" date="date_field"/>
            </search>
          `,
        },
        env.services.model
      );
      props = { processedSearchViewDescription };
      target = getFixture();
    },
  },
  function () {
    QUnit.test("simple rendering", async function (assert) {
      assert.expect(6);
      const unpatchDate = patchDate(1997, 0, 9, 12, 0, 0);
      controlPanel = await mount(PseudoControlPanel, { env, target, props });
      assert.containsOnce(controlPanel, ".o_dropdown.o_filter_menu");
      assert.containsNone(controlPanel, ".o_dropdown.o_comparison_menu");
      await toggleFilterMenu(controlPanel);
      await toggleMenuItem(controlPanel, "Birthday");
      await toggleMenuItemOption(controlPanel, "Birthday", "January");
      assert.containsOnce(controlPanel, "div.o_comparison_menu > button i.fa.fa-adjust");
      assert.strictEqual(
        controlPanel.el.querySelector("div.o_comparison_menu > button span").innerText.trim(),
        "Comparison"
      );
      await toggleComparisonMenu(controlPanel);
      const comparisonOptions = [...controlPanel.el.querySelectorAll(".o_comparison_menu li")];
      assert.strictEqual(comparisonOptions.length, 2);
      assert.deepEqual(
        comparisonOptions.map((e) => e.innerText.trim()),
        ["Birthday: Previous Period", "Birthday: Previous Year"]
      );
      controlPanel.destroy();
      unpatchDate();
    });
    QUnit.test("activate a comparison works", async function (assert) {
      assert.expect(5);
      const unpatchDate = patchDate(1997, 0, 9, 12, 0, 0);
      controlPanel = await mount(PseudoControlPanel, { env, target, props });
      await toggleFilterMenu(controlPanel);
      await toggleMenuItem(controlPanel, "Birthday");
      await toggleMenuItemOption(controlPanel, "Birthday", "January");
      await toggleComparisonMenu(controlPanel);
      await toggleMenuItem(controlPanel, "Birthday: Previous Period");
      assert.deepEqual(getFacetTexts(controlPanel), [
        "Birthday: January 1997",
        "Birthday: Previous Period",
      ]);
      await toggleFilterMenu(controlPanel);
      await toggleMenuItem(controlPanel, "Date");
      await toggleMenuItemOption(controlPanel, "Date", "December");
      await toggleComparisonMenu(controlPanel);
      await toggleMenuItem(controlPanel, "Date: Previous Year");
      assert.deepEqual(getFacetTexts(controlPanel), [
        ["Birthday: January 1997", "Date: December 1996"].join("or"),
        "Date: Previous Year",
      ]);
      await toggleFilterMenu(controlPanel);
      await toggleMenuItem(controlPanel, "Date");
      await toggleMenuItemOption(controlPanel, "Date", "1996");
      assert.deepEqual(getFacetTexts(controlPanel), ["Birthday: January 1997"]);
      await toggleComparisonMenu(controlPanel);
      await toggleMenuItem(controlPanel, "Birthday: Previous Year");
      assert.deepEqual(getFacetTexts(controlPanel), [
        "Birthday: January 1997",
        "Birthday: Previous Year",
      ]);
      await removeFacet(controlPanel);
      assert.deepEqual(getFacetTexts(controlPanel), []);
      controlPanel.destroy();
      unpatchDate();
    });
  }
);
