/** @odoo-module **/
// import { INTERVAL_OPTIONS, PERIOD_OPTIONS, COMPARISON_OPTIONS } from "../../../src/views/view_utils/search_utils";
// const INTERVAL_OPTION_IDS = Object.keys(INTERVAL_OPTIONS);
const { mount } = owl;
import { actionManagerService } from "../../../src/action_manager/action_manager";
import { Registry } from "../../../src/core/registry";
import { modelService } from "../../../src/services/model";
import { titleService } from "../../../src/services/title";
import { viewManagerService } from "../../../src/services/view_manager";
import { DEFAULT_MEASURE } from "../../../src/views/graph/graph_model";
import { GraphView } from "../../../src/views/graph/graph_view";
import { ViewLoader } from "../../../src/views/view_utils/view_loader";
import { click, getFixture, makeFakeUserService, makeTestEnv } from "../../helpers/index";
import { makeFakeLocalizationService, makeFakeRPCService } from "../../helpers/mocks";
// const yearIds = [];
// const otherIds = [];
// for (const id of Object.keys(PERIOD_OPTIONS)) {
//     const option = PERIOD_OPTIONS[id];
//     if (option.granularity === 'year') {
//         yearIds.push(id);
//     } else {
//         otherIds.push(id);
//     }
// }
// const BASIC_DOMAIN_IDS = [];
// for (const yearId of yearIds) {
//     BASIC_DOMAIN_IDS.push(yearId);
//     for (const id of otherIds) {
//         BASIC_DOMAIN_IDS.push(`${yearId}__${id}`);
//     }
// }
// const GENERATOR_INDEXES: { [key:string]: number; } = {};
// Object.keys(PERIOD_OPTIONS).forEach((id, index) => {
//     GENERATOR_INDEXES[id] = index;
// });
// const COMPARISON_OPTION_IDS = Object.keys(COMPARISON_OPTIONS);
// const COMPARISON_OPTION_INDEXES: { [key:string]: number; } = {};
// COMPARISON_OPTION_IDS.forEach((id, index) => {
//     COMPARISON_OPTION_INDEXES[id] = index;
// });
// const f = (a, b) => [].concat(...a.map(d => b.map(e => [].concat(d, e))));
// const cartesian = (a, b, ...c) => (b ? cartesian(f(a, b), ...c) : a);
// const COMBINATIONS = cartesian(COMPARISON_OPTION_IDS, BASIC_DOMAIN_IDS);
// const COMBINATIONS_WITH_DATE = cartesian(COMPARISON_OPTION_IDS, BASIC_DOMAIN_IDS, INTERVAL_OPTION_IDS);
function checkDatasets(assert, graph, keys, expectedDatasets) {
  keys = keys instanceof Array ? keys : [keys];
  expectedDatasets = expectedDatasets instanceof Array ? expectedDatasets : [expectedDatasets];
  const datasets = graph.chart.data.datasets;
  const actualValues = [];
  for (const dataset of datasets) {
    const partialDataset = {};
    for (const key of keys) {
      partialDataset[key] = dataset[key];
    }
    actualValues.push(partialDataset);
  }
  assert.deepEqual(actualValues, expectedDatasets);
}
function checkLabels(assert, graph, expectedLabels) {
  const labels = graph.chart.data.labels;
  assert.deepEqual(labels, expectedLabels);
}
function checkLegend(assert, graph, expectedLegendLabels) {
  expectedLegendLabels =
    expectedLegendLabels instanceof Array ? expectedLegendLabels : [expectedLegendLabels];
  const chart = graph.chart;
  const actualLegendLabels = chart.config.options.legend.labels
    .generateLabels(chart)
    .map((o) => o.text);
  assert.deepEqual(actualLegendLabels, expectedLegendLabels);
}
async function selectMode(graph, mode) {
  await click(graph.el.querySelector(`.o_graph_button[data-mode="${mode}"`));
}
let target;
let env;
let serverData;
const fooFields = {
  id: { string: "Id", type: "integer" },
  foo: { string: "Foo", type: "integer", store: true },
  bar: { string: "bar", type: "boolean", store: true },
  product_id: { string: "Product", type: "many2one", relation: "product", store: true },
  color_id: { string: "Color", type: "many2one", relation: "color", store: true },
  date: { string: "Date", type: "date", store: true, sortable: true },
  revenue: { string: "Revenue", type: "integer", store: true },
};
QUnit.module(
  "Views",
  {
    async beforeEach() {
      serverData = {
        models: {
          foo: {
            fields: fooFields,
            records: [
              { id: 1, foo: 3, bar: true, product_id: 37, date: "2016-01-01", revenue: 1 },
              {
                id: 2,
                foo: 53,
                bar: true,
                product_id: 37,
                color_id: 7,
                date: "2016-01-03",
                revenue: 2,
              },
              { id: 3, foo: 2, bar: true, product_id: 37, date: "2016-03-04", revenue: 3 },
              { id: 4, foo: 24, bar: false, product_id: 37, date: "2016-03-07", revenue: 4 },
              { id: 5, foo: 4, bar: false, product_id: 41, date: "2016-05-01", revenue: 5 },
              { id: 6, foo: 63, bar: false, product_id: 41 },
              { id: 7, foo: 42, bar: false, product_id: 41 },
              { id: 8, foo: 48, bar: false, product_id: 41, date: "2016-04-01", revenue: 8 },
            ],
          },
          product: {
            fields: {
              id: { string: "Id", type: "integer" },
              name: { string: "Product Name", type: "char" },
            },
            records: [
              {
                id: 37,
                display_name: "xphone",
              },
              {
                id: 41,
                display_name: "xpad",
              },
            ],
          },
          color: {
            fields: {
              id: { string: "Id", type: "integer" },
              name: { string: "Color", type: "char" },
            },
            records: [
              {
                id: 7,
                display_name: "red",
              },
              {
                id: 14,
                display_name: "black",
              },
            ],
          },
        },
        views: {
          "foo,false,graph": `<graph type="line"/>`,
        },
      };
      const serviceRegistry = new Registry();
      const fakeUserService = makeFakeUserService();
      const fakeLocalizationService = makeFakeLocalizationService();
      const fakeRPCService = makeFakeRPCService();
      serviceRegistry
        .add(fakeLocalizationService.name, fakeLocalizationService)
        .add(fakeRPCService.name, fakeRPCService)
        .add(fakeUserService.name, fakeUserService)
        .add(modelService.name, modelService)
        .add(viewManagerService.name, viewManagerService)
        .add(titleService.name, titleService)
        .add(actionManagerService.name, actionManagerService);
      target = getFixture();
      const viewRegistry = new Registry();
      viewRegistry.add("graph", GraphView);
      env = await makeTestEnv({ serviceRegistry, viewRegistry, serverData });
    },
  },
  function () {
    QUnit.module("GraphView");
    QUnit.test("simple graph rendering (with default props)", async function (assert) {
      assert.expect(8);
      const props = { modelName: "foo" };
      const graph = await mount(GraphView, { env, target, props });
      assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
      assert.strictEqual(
        graph.state.activeMeasure,
        DEFAULT_MEASURE,
        `the active measure should be "${DEFAULT_MEASURE}" by default`
      );
      assert.strictEqual(graph.state.mode, "bar", "should be in bar chart mode by default");
      assert.strictEqual(graph.state.order, null, "should not be ordered by default");
      assert.strictEqual(graph.state.stacked, true, "bar charts should be stacked by default");
      checkLabels(assert, graph, [[]]);
      checkDatasets(assert, graph, ["backgroundColor", "data", "label", "originIndex", "stack"], {
        backgroundColor: "#1f77b4",
        data: [8],
        label: "Count",
        originIndex: 0,
        stack: "",
      });
      checkLegend(assert, graph, "Count");
      graph.unmount();
    });
    QUnit.test("simple graph rendering (one groupBy)", async function (assert) {
      assert.expect(4);
      const props = { modelName: "foo", groupBy: ["bar"], fields: fooFields };
      const graph = await mount(GraphView, { env, target, props });
      assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
      checkLabels(assert, graph, [["true"], ["false"]]);
      checkDatasets(assert, graph, ["backgroundColor", "data", "label", "originIndex", "stack"], {
        backgroundColor: "#1f77b4",
        data: [3, 5],
        label: "Count",
        originIndex: 0,
        stack: "",
      });
      checkLegend(assert, graph, "Count");
      graph.unmount();
    });
    QUnit.test("simple graph rendering (two groupBy)", async function (assert) {
      assert.expect(4);
      const props = { modelName: "foo", groupBy: ["bar", "product_id"], fields: fooFields };
      const graph = await mount(GraphView, { env, target, props });
      assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
      checkLabels(assert, graph, [["true"], ["false"]]);
      checkDatasets(
        assert,
        graph,
        ["backgroundColor", "data", "label", "originIndex", "stack"],
        [
          {
            backgroundColor: "#1f77b4",
            data: [3, 1],
            label: "xphone",
            originIndex: 0,
            stack: "",
          },
          {
            backgroundColor: "#ff7f0e",
            data: [0, 4],
            label: "xpad",
            originIndex: 0,
            stack: "",
          },
        ]
      );
      checkLegend(assert, graph, ["xphone", "xpad"]);
      graph.unmount();
    });
    QUnit.test("mode props", async function (assert) {
      assert.expect(2);
      const props = { modelName: "foo", mode: "pie" };
      const graph = await mount(GraphView, { env, target, props });
      assert.strictEqual(graph.state.mode, "pie", "should be in pie chart mode");
      assert.strictEqual(graph.chart.config.type, "pie");
      graph.unmount();
    });
    QUnit.test("title props", async function (assert) {
      assert.expect(1);
      const title = "Partners";
      const props = { modelName: "foo", title };
      const graph = await mount(GraphView, { env, target, props });
      assert.strictEqual(graph.el.querySelector(".o_graph_view .o_content label").innerText, title);
      graph.unmount();
    });
    QUnit.test("field id not in groupBy", async function (assert) {
      assert.expect(3);
      const props = { modelName: "foo", groupBy: ["id"], fields: fooFields };
      const graph = await mount(GraphView, { env, target, props });
      checkLabels(assert, graph, [[]]);
      checkDatasets(assert, graph, ["backgroundColor", "data", "label", "originIndex", "stack"], {
        backgroundColor: "#1f77b4",
        data: [8],
        label: "Count",
        originIndex: 0,
        stack: "",
      });
      checkLegend(assert, graph, "Count");
      graph.unmount();
    });
    QUnit.test("switching mode", async function (assert) {
      assert.expect(12);
      const props = { modelName: "foo" };
      const graph = await mount(GraphView, { env, target, props });
      function checkMode(mode) {
        assert.strictEqual(graph.state.mode, mode);
        assert.strictEqual(graph.chart.config.type, mode);
        assert.hasClass(graph.el.querySelector(`.o_graph_button[data-mode="${mode}"`), "active");
      }
      checkMode("bar");
      await selectMode(graph, "bar"); // click on the active mode does not change anything
      checkMode("bar");
      await selectMode(graph, "line");
      checkMode("line");
      await selectMode(graph, "pie");
      checkMode("pie");
      graph.unmount();
    });
    QUnit.test("displaying line chart with only 1 data point", async function (assert) {
      assert.expect(4);
      // this test makes sure the line chart does not crash when only one data
      // point is displayed.
      // for a better visual aspect the point is centered on the graph (and not on the left!)
      serverData.models.foo.records = serverData.models.foo.records.slice(0, 1);
      const props = { modelName: "foo", mode: "line" };
      const graph = await mount(GraphView, { env, target, props });
      assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
      checkLabels(assert, graph, [[""], [], [""]]);
      checkDatasets(assert, graph, ["data"], { data: [undefined, 1] });
      checkLegend(assert, graph, "Count");
      graph.destroy();
    });
    QUnit.debug("displaying chart data with multiple groupbys", async function (assert) {
      // this test makes sure the line chart shows all data labels (X axis) when
      // it is grouped by several fields
      assert.expect(6);
      const props = {
        modelName: "foo",
        groupBy: ["product_id", "bar", "color_id"],
        fields: fooFields,
      };
      const graph = await mount(GraphView, { env, target, props });
      checkLabels(assert, graph, [["xphone"], ["xpad"]]);
      checkLegend(assert, graph, ["true/Undefined", "true/red", "false/Undefined"]);
      await selectMode(graph, "line");
      checkLabels(assert, graph, [["xphone"], ["xpad"]]);
      checkLegend(assert, graph, ["true/Undefined", "true/red", "false/Undefined"]);
      await selectMode(graph, "pie");
      checkLabels(assert, graph, [
        ["xphone", true, "Undefined"],
        ["xphone", true, "red"],
        ["xphone", false, "Undefined"],
        ["xpad", false, "Undefined"],
      ]);
      checkLegend(assert, graph, [
        "xphone/true/Undefined",
        "xphone/true/red",
        "xphone/false/Undefined",
        "xpad/false/Undefined",
      ]);
      graph.destroy();
    });

    QUnit.test("'embedded' graph view", async function (assert) {
      // no need to have a viewLoader --> we should just have good graph view props reflecting what we need when isEmbedded is true
      assert.expect(1);
      const props = { type: "graph", model: "foo", isEmbedded: true };
      const viewLoader = await mount(ViewLoader, { env, target, props });
      assert.strictEqual(1, 1);
      viewLoader.destroy();
    });
  }
);
