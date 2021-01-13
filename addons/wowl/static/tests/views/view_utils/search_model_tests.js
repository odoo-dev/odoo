/** @odoo-module **/
import { SearchModel } from "../../../src/views/view_utils/search_model";
import { makeFakeRPCService, makeFakeUserService, makeTestEnv } from "../../helpers/index";
import { Domain } from "../../../src/core/domain";
import { Registry } from "../../../src/core/registry";
import { modelService } from "../../../src/services/model";
import { makeFakeLocalizationService } from "../../helpers/mocks";
const { Settings } = luxon;
import { processSearchViewDescription } from "../../../src/views/view_utils/search_utils";
function unpatchDate() {
  Settings.resetCaches();
}
export function patchDate(year, month, day, hours, minutes, seconds) {
  const actualDate = new Date();
  const fakeDate = new Date(year, month, day, hours, minutes, seconds);
  const timeInterval = actualDate.getTime() - fakeDate.getTime();
  Settings.now = () => Date.now() - timeInterval;
  return unpatchDate;
}
let serviceRegistry;
let env;
let fields;
async function getSearchModel(config, searchViewDescription = {}, searchDefaults) {
  const params = await processSearchViewDescription(
    searchViewDescription,
    env.services.model,
    searchDefaults
  );
  const model = new SearchModel(
    Object.assign(
      {
        env,
        modelName: "",
        _localizationService: env.services.localization,
        _modelService: env.services.model,
        _userService: env.services.user,
      },
      params,
      config
    )
  );
  return model;
}
function sanitizeSearchItems(model) {
  const searchItems = Object.values(model.searchItems); // We should not access searchItems but there is a problem with getSearchItems --> comparisons are not sent back in some cases
  return searchItems.map((searchItem) => {
    const copy = Object.assign({}, searchItem);
    // delete copy.isActive;
    // delete copy.options;
    // delete copy.autocompleteValues;
    delete copy.groupId;
    delete copy.groupNumber;
    delete copy.id;
    if (searchItem.type === "favorite") {
      copy.groupBys = searchItem.groupBys.map((g) => g.toJSON());
    }
    return copy;
  });
}
QUnit.module(
  "SearchModel",
  {
    async beforeEach() {
      fields = {
        display_name: { string: "Displayed name", type: "char" },
        foo: {
          string: "Foo",
          type: "char",
          default: "My little Foo Value",
          store: true,
          sortable: true,
        },
        date_field: { string: "Date", type: "date", store: true, sortable: true },
        float_field: { string: "Float", type: "float" },
        bar: { string: "Bar", type: "many2one", relation: "partner" },
      };
      serviceRegistry = new Registry();
      const fakeUserService = makeFakeUserService();
      const fakeRPCService = makeFakeRPCService();
      const fakeLocalizationService = makeFakeLocalizationService();
      serviceRegistry
        .add(fakeUserService.name, fakeUserService)
        .add(fakeRPCService.name, fakeRPCService)
        .add(fakeLocalizationService.name, fakeLocalizationService)
        .add(modelService.name, modelService);
      env = await makeTestEnv({ serviceRegistry });
    },
  },
  () => {
    QUnit.module("Arch parsing");
    QUnit.test("empty arch", async function (assert) {
      assert.expect(1);
      const model = await getSearchModel({ env });
      assert.deepEqual(sanitizeSearchItems(model), []);
    });
    QUnit.test("one field tag", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <field name="bar"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Bar",
          fieldName: "bar",
          fieldType: "many2one",
          type: "field",
        },
      ]);
    });
    QUnit.test("one separator tag", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <separator/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), []);
    });
    QUnit.test("one separator tag and one field tag", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <separator/>
                <field name="bar"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Bar",
          fieldName: "bar",
          fieldType: "many2one",
          type: "field",
        },
      ]);
    });
    QUnit.test("one filter tag", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <filter name="filter" string="Hello" domain="[]"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Hello",
          domain: new Domain("[]"),
          type: "filter",
        },
      ]);
    });
    QUnit.test("one filter tag with date attribute", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <filter name="date_filter" string="Date" date="date_field"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      const dateFilterId = model.getSearchItems((f) => f.type === "dateFilter")[0].id;
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          defaultGeneratorId: "this_month",
          description: "Date",
          fieldName: "date_field",
          fieldType: "date",
          type: "dateFilter",
        },
        {
          comparisonOptionId: "previous_period",
          dateFilterId,
          description: "Date: Previous Period",
          type: "comparison",
        },
        {
          comparisonOptionId: "previous_year",
          dateFilterId,
          description: "Date: Previous Year",
          type: "comparison",
        },
      ]);
    });
    QUnit.test("one groupBy tag", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <filter name="groupby" string="Hi" context="{ 'group_by': 'date_field:day'}"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          defaultIntervalId: "day",
          description: "Hi",
          fieldName: "date_field",
          fieldType: "date",
          type: "dateGroupBy",
        },
      ]);
    });
    QUnit.test("two filter tags", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <filter name="filter_1" string="Hello One" domain="[]"/>
                <filter name="filter_2" string="Hello Two" domain="[('bar', '=', 3)]"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Hello One",
          domain: new Domain("[]"),
          type: "filter",
        },
        {
          description: "Hello Two",
          domain: new Domain("[('bar', '=', 3)]"),
          type: "filter",
        },
      ]);
    });
    QUnit.test("two filter tags separated by a separator", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <filter name="filter_1" string="Hello One" domain="[]"/>
                <separator/>
                <filter name="filter_2" string="Hello Two" domain="[('bar', '=', 3)]"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Hello One",
          domain: new Domain("[]"),
          type: "filter",
        },
        {
          description: "Hello Two",
          domain: new Domain("[('bar', '=', 3)]"),
          type: "filter",
        },
      ]);
    });
    QUnit.test("one filter tag and one field", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <filter name="filter" string="Hello" domain="[]"/>
                <field name="bar"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Hello",
          domain: new Domain("[]"),
          type: "filter",
        },
        {
          description: "Bar",
          fieldName: "bar",
          fieldType: "many2one",
          type: "field",
        },
      ]);
    });
    QUnit.test("two field tags", async function (assert) {
      assert.expect(1);
      const arch = `
            <search>
                <field name="foo"/>
                <field name="bar"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Foo",
          fieldName: "foo",
          fieldType: "char",
          type: "field",
        },
        {
          description: "Bar",
          fieldName: "bar",
          fieldType: "many2one",
          type: "field",
        },
      ]);
    });
    QUnit.module("Preparing initial state");
    QUnit.test("process favorite filters", async function (assert) {
      assert.expect(1);
      const irFilters = [
        {
          user_id: [2, "Mitchell Admin"],
          name: "Sorted filter",
          id: 5,
          context: `{"group_by":["foo","bar"]}`,
          sort: '["foo", "-bar"]',
          domain: "[('user_id', '=', uid)]",
          is_default: false,
          model_id: "res.partner",
          action_id: false,
        },
      ];
      const model = await getSearchModel({ env }, { irFilters });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          context: {},
          description: "Sorted filter",
          domain: new Domain("[('user_id', '=', uid)]"),
          groupBys: ["foo", "bar"],
          orderedBy: [
            {
              asc: true,
              name: "foo",
            },
            {
              asc: false,
              name: "bar",
            },
          ],
          removable: true,
          serverSideId: 5,
          type: "favorite",
          userId: 2,
        },
      ]);
    });
    QUnit.test("process dynamic filters", async function (assert) {
      assert.expect(1);
      const dynamicFilters = [
        {
          description: "Quick search",
          domain: [["id", "in", [1, 3, 4]]],
        },
      ];
      const model = await getSearchModel({ env, dynamicFilters });
      assert.deepEqual(sanitizeSearchItems(model), [
        {
          description: "Quick search",
          domain: new Domain([["id", "in", [1, 3, 4]]]),
          isDefault: true,
          type: "filter",
        },
      ]);
    });
    QUnit.module("Toggle Items");
    QUnit.test("toggle a filter", async function (assert) {
      assert.expect(3);
      const arch = `
            <search>
                <filter name="filter" string="Filter" domain="[['foo', '=', 'a']]"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      const filterId = Object.keys(model.searchItems).map((key) => Number(key))[0];
      assert.deepEqual([], model.domain);
      model.toggleSearchItem(filterId);
      assert.deepEqual([["foo", "=", "a"]], model.domain);
      model.toggleSearchItem(filterId);
      assert.deepEqual([], model.domain);
    });
    QUnit.test("toggle a date filter", async function (assert) {
      // need some patchDate function
      assert.expect(3);
      const unpatchDate = patchDate(2019, 0, 6, 15, 0, 0);
      const arch = `
            <search>
                <filter name="date_filter" date="date_field" string="DateFilter"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      const filterId = Object.keys(model.searchItems).map((key) => Number(key))[0];
      model.toggleDateFilter(filterId);
      assert.deepEqual(
        ["&", ["date_field", ">=", "2019-01-01"], ["date_field", "<=", "2019-01-31"]],
        model.domain
      );
      model.toggleDateFilter(filterId, "first_quarter");
      assert.deepEqual(
        [
          "|",
          "&",
          ["date_field", ">=", "2019-01-01"],
          ["date_field", "<=", "2019-01-31"],
          "&",
          ["date_field", ">=", "2019-01-01"],
          ["date_field", "<=", "2019-03-31"],
        ],
        model.domain
      );
      model.toggleDateFilter(filterId, "this_year");
      assert.deepEqual([], model.domain);
      unpatchDate();
    });
    QUnit.test("toggle a groupBy", async function (assert) {
      assert.expect(3);
      const arch = `
            <search>
                <filter name="groupBy" string="GroupBy" context="{'group_by': 'foo'}"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      const filterId = Object.keys(model.searchItems).map((key) => Number(key))[0];
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        []
      );
      model.toggleSearchItem(filterId);
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        ["foo"]
      );
      model.toggleSearchItem(filterId);
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        []
      );
    });
    QUnit.test("toggle a date groupBy", async function (assert) {
      assert.expect(5);
      const arch = `
            <search>
                <filter name="date_groupBy" string="DateGroupBy" context="{'group_by': 'date_field:day'}"/>
            </search>`;
      const model = await getSearchModel({ env }, { arch, fields });
      const filterId = Object.keys(model.searchItems).map((key) => Number(key))[0];
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        []
      );
      model.toggleDateGroupBy(filterId);
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        ["date_field:day"]
      );
      model.toggleDateGroupBy(filterId, "week");
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        ["date_field:week", "date_field:day"]
      );
      model.toggleDateGroupBy(filterId);
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        ["date_field:week"]
      );
      model.toggleDateGroupBy(filterId, "week");
      assert.deepEqual(
        model.groupBy.map((gb) => gb.toJSON()),
        []
      );
    });
  }
);
