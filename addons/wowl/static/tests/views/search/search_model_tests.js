/** @odoo-module **/

import { getFixture, makeFakeUserService, makeTestEnv, patchDate } from "../../helpers";

import { Domain } from "../../../src/core/domain";

import { Registry } from "../../../src/core/registry";

import { modelService } from "../../../src/services/model_service";

import { useModel } from "../../../src/views/view_utils/model";

import { SearchModel } from "../../../src/views/search/search_model";
import { processSearchViewDescription } from "../../../src/views/search/search_utils";

const { Component, tags, mount } = owl;
const { xml } = tags;

let unmount;

async function createSearchModel(params = {}) {
  // prepare env
  const serviceRegistry = new Registry();
  const fakeUserService = makeFakeUserService();
  serviceRegistry.add(modelService.name, modelService).add(fakeUserService.name, fakeUserService);

  const env = await makeTestEnv({ serviceRegistry });

  // prepare props for auxiliary test component
  const props = { model: "foo" };

  const arch = params.arch;
  const fields = params.fields || {
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
  const irFilters = params.irFilters;
  const context = params.context;

  const searchDefaults = {};
  for (const key in context) {
    const match = /^search_default_(.*)$/.exec(key);
    if (match) {
      const val = context[key];
      if (val) {
        searchDefaults[match[1]] = val;
      }
      delete context[key];
    }
  }

  props.processedSearchViewDescription = await processSearchViewDescription(
    { arch, fields, irFilters },
    env.services.model,
    searchDefaults
  );

  for (const key of ["context", "domain", "dynamicFilters", "groupBy", "model"]) {
    if (key in params) {
      props[key] = params[key];
    }
  }

  // prepare params for useModel
  const hookParams = { Model: SearchModel };
  for (const key of ["onSaveParams", "onUpdate"]) {
    if (key in params) {
      hookParams[key] = params[key];
    }
  }

  // prepare auxiliary test component
  class TestComponent extends Component {
    searchModel = useModel(hookParams);
  }
  TestComponent.template = xml`<div/>`;

  const comp = await mount(TestComponent, { env, props, target: getFixture() });

  unmount = comp.unmount.bind(comp);

  return comp.searchModel;
}

function sanitizeSearchItems(model) {
  const searchItems = Object.values(model.searchItems); // We should not access searchItems but there is a problem with getSearchItems --> comparisons are not sent back in some cases
  return searchItems.map((searchItem) => {
    const copy = Object.assign({}, searchItem);
    delete copy.groupId;
    delete copy.groupNumber;
    delete copy.id;
    if (searchItem.type === "favorite") {
      copy.groupBys = searchItem.groupBys.map((g) => g.toJSON());
    }
    return copy;
  });
}

QUnit.module("SearchModel", (hooks) => {
  hooks.afterEach(() => {
    unmount();
  });

  QUnit.test("parsing empty arch", async function (assert) {
    const model = await createSearchModel();
    assert.deepEqual(sanitizeSearchItems(model), []);
  });

  QUnit.test("parsing one field tag", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <field name="bar"/>
        </search>
      `,
    });
    assert.deepEqual(sanitizeSearchItems(model), [
      {
        description: "Bar",
        fieldName: "bar",
        fieldType: "many2one",
        type: "field",
      },
    ]);
  });

  QUnit.test("parsing one separator tag", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <separator/>
        </search>
      `,
    });
    assert.deepEqual(sanitizeSearchItems(model), []);
  });

  QUnit.test("parsing one separator tag and one field tag", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <separator/>
            <field name="bar"/>
        </search>
      `,
    });
    assert.deepEqual(sanitizeSearchItems(model), [
      {
        description: "Bar",
        fieldName: "bar",
        fieldType: "many2one",
        type: "field",
      },
    ]);
  });

  QUnit.test("parsing one filter tag", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="filter" string="Hello" domain="[]"/>
        </search>
      `,
    });
    assert.deepEqual(sanitizeSearchItems(model), [
      {
        description: "Hello",
        domain: new Domain("[]"),
        type: "filter",
      },
    ]);
  });

  QUnit.test("parsing one filter tag with date attribute", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="date_filter" string="Date" date="date_field"/>
        </search>
      `,
    });
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

  QUnit.test("parsing one groupBy tag", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="groupby" string="Hi" context="{ 'group_by': 'date_field:day'}"/>
        </search>
      `,
    });
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

  QUnit.test("parsing two filter tags", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="filter_1" string="Hello One" domain="[]"/>
            <filter name="filter_2" string="Hello Two" domain="[('bar', '=', 3)]"/>
        </search>
      `,
    });
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

  QUnit.test("parsing two filter tags separated by a separator", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="filter_1" string="Hello One" domain="[]"/>
            <separator/>
            <filter name="filter_2" string="Hello Two" domain="[('bar', '=', 3)]"/>
        </search>
      `,
    });
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

  QUnit.test("parsing one filter tag and one field", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="filter" string="Hello" domain="[]"/>
            <field name="bar"/>
        </search>
      `,
    });
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

  QUnit.test("parsing two field tags", async function (assert) {
    const model = await createSearchModel({
      arch: `
        <search>
            <field name="foo"/>
            <field name="bar"/>
        </search>
      `,
    });
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

  QUnit.test("process search default group by", async function (assert) {
    assert.expect(1);
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="group_by" context="{ 'group_by': 'foo'}"/>
        </search>
      `,
      context: { search_default_group_by: 14 },
    });
    assert.deepEqual(sanitizeSearchItems(model), [
      {
        defaultRank: 14,
        description: "Foo",
        fieldName: "foo",
        fieldType: "char",
        type: "groupBy",
        isDefault: true,
      },
    ]);
  });

  QUnit.test("process favorite filters", async function (assert) {
    const model = await createSearchModel({
      irFilters: [
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
      ],
    });
    assert.deepEqual(sanitizeSearchItems(model), [
      {
        context: {},
        description: "Sorted filter",
        domain: new Domain("[('user_id', '=', uid)]"),
        groupBys: ["foo", "bar"],
        orderBy: [
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
    const model = await createSearchModel({
      dynamicFilters: [
        {
          description: "Quick search",
          domain: [["id", "in", [1, 3, 4]]],
        },
      ],
    });
    assert.deepEqual(sanitizeSearchItems(model), [
      {
        description: "Quick search",
        domain: new Domain([["id", "in", [1, 3, 4]]]),
        isDefault: true,
        type: "filter",
      },
    ]);
  });

  QUnit.test("toggle a filter", async function (assert) {
    assert.expect(3);
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="filter" string="Filter" domain="[['foo', '=', 'a']]"/>
        </search>
      `,
    });
    const filterId = Object.keys(model.searchItems).map((key) => Number(key))[0];
    assert.deepEqual([], model.domain);
    model.toggleSearchItem(filterId);
    assert.deepEqual([["foo", "=", "a"]], model.domain);
    model.toggleSearchItem(filterId);
    assert.deepEqual([], model.domain);
  });

  QUnit.test("toggle a date filter", async function (assert) {
    const unpatchDate = patchDate(2019, 0, 6, 15, 0, 0);
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="date_filter" date="date_field" string="DateFilter"/>
        </search>
      `,
    });
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
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="groupBy" string="GroupBy" context="{'group_by': 'foo'}"/>
        </search>
      `,
    });
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
    const model = await createSearchModel({
      arch: `
        <search>
            <filter name="date_groupBy" string="DateGroupBy" context="{'group_by': 'date_field:day'}"/>
        </search>
      `,
    });
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
});
