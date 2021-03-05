/** @odoo-module **/
const { mount, Component, tags, hooks } = owl;
import { Registry } from "../../../src/core/registry";
import { GraphModel } from "../../../src/views/graph/graph_model";
import {
  GraphView,
  BORDER_WHITE,
  DEFAULT_BG,
  processGraphViewDescription,
} from "../../../src/views/graph/graph_view";
import { getGroupBy } from "../../../src/views/view_utils/group_by";
import { View } from "../../../src/views/view_utils/view";
import { findItem } from "../../helpers/dom";
import { click, getFixture, makeTestEnv, nextTick } from "../../helpers/index";
import { getTestServiceRegistry, getTestViewRegistry } from "../../helpers/index";
const { xml } = tags;
const { useState, useRef } = hooks;

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
  const labels = graph.chart.data.labels.map((l) => l.toString());
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

function checkTooltip(assert, graph, expectedTooltipContent, index, datasetIndex) {
  // If the tooltip options are changed, this helper should change: we construct the dataPoints
  // similarly to Chart.js according to the values set for the tooltips options 'mode' and 'intersect'.
  const { datasets } = graph.chart.data;
  const dataPoints = [];
  for (let i = 0; i < datasets.length; i++) {
    const dataset = datasets[i];
    const yLabel = dataset.data[index];
    if (yLabel !== undefined && (datasetIndex === undefined || datasetIndex === i)) {
      dataPoints.push({
        datasetIndex: i,
        index,
        yLabel,
      });
    }
  }
  const tooltipModel = { opacity: 1, x: 1, y: 1, dataPoints };
  graph.chart.config.options.tooltips.custom(tooltipModel);
  const { title, lines } = expectedTooltipContent;
  const lineLabels = [];
  const lineValues = [];
  for (const line of lines) {
    lineLabels.push(line.label);
    lineValues.push(`${line.value}`);
  }
  assert.containsOnce(graph, "div.o_graph_custom_tooltip");
  const tooltipTitle = graph.el.querySelector("table thead tr th.o_measure");
  assert.strictEqual(tooltipTitle.innerText, title || "Count", `Wrong tooltip title`);
  assert.deepEqual(
    [...graph.el.querySelectorAll("table tbody tr td span.o_label")].map((td) => td.innerText),
    lineLabels,
    `Tooltip line labels`
  );
  assert.deepEqual(
    [...graph.el.querySelectorAll("table tbody tr td.o_value")].map((td) => td.innerText),
    lineValues,
    `Tooltip line values`
  );
}

async function selectMode(comp, mode) {
  await click(comp.el.querySelector(`.o_graph_button[data-mode="${mode}"`));
}

async function toggleMeasureMenu(comp) {
  await click(comp.el.querySelector(`.o_cp_bottom_left .o_dropdown .o_dropdown_toggler`));
}

async function selectMeasure(comp, measure) {
  const item = findItem(comp, ".o_cp_bottom_left .o_dropdown ul .o_dropdown_item", measure);
  await click(item);
}

class TestView extends View {
  constructor() {
    super(...arguments);
    this.viewComponent = useRef("viewComponent");
  }
}
TestView.template = xml`<t t-component="ViewClass" t-props="viewProps" t-ref="viewComponent"/>`;

async function createView(params) {
  const serviceRegistry = getTestServiceRegistry();
  const viewRegistry = getTestViewRegistry();
  const envParams = { serviceRegistry, viewRegistry };
  const envKeys = ["serverData", "mockRPC"];
  for (const key of envKeys) {
    if (key in params) {
      envParams[key] = params[key];
    }
  }
  const legacyMapping = { data: "serverData" };
  for (const [legacyKey, key] of Object.entries(legacyMapping)) {
    if (legacyKey in params) {
      envParams[key] = params[legacyKey];
    }
  }

  const env = await makeTestEnv(envParams);

  const props = {};
  const propsKeys = [
    "arch",
    "model",
    "type",
    "jsClass",
    "domain",
    "groupBy",
    "context",
    "domains",
    "orderedBy",
  ];
  for (const key of propsKeys) {
    if (key in params) {
      props[key] = params[key];
    }
  }
  if ("props" in params) {
    Object.assign(props, params.props);
  }

  const target = getFixture();

  const mountParams = { env, props, target };

  const view = await mount(TestView, mountParams);
  const comp = view.viewComponent.comp;

  const compWrapper = Object.assign(Object.create(comp), { unmount: view.unmount.bind(view) });

  return compWrapper;
}

let target;
let env;
let serverData;
let serviceRegistry;
let fooFields;
QUnit.module(
  "Views",
  {
    async beforeEach() {
      fooFields = {
        id: { string: "Id", type: "integer" },
        foo: { string: "Foo", type: "integer", store: true, group_operator: "sum" },
        bar: { string: "bar", type: "boolean", store: true },
        product_id: { string: "Product", type: "many2one", relation: "product", store: true },
        color_id: { string: "Color", type: "many2one", relation: "color", store: true },
        date: { string: "Date", type: "date", store: true, sortable: true },
        revenue: { string: "Revenue", type: "float", store: true, group_operator: "sum" },
      };
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
          "foo,false,graph": `<graph/>`,
        },
      };
      serviceRegistry = getTestServiceRegistry();
      target = getFixture();
      const viewRegistry = new Registry();
      viewRegistry.add("graph", GraphView);
      env = await makeTestEnv({ serviceRegistry, viewRegistry, serverData });
    },
  },
  function () {
    QUnit.module("GraphView", {}, function () {
      QUnit.test("simple bar chart rendering", async function (assert) {
        assert.expect(12);
        const graph = await createView({
          type: "graph",
          model: "foo",
          serverData,
        });

        assert.containsOnce(graph, "div.o_graph_canvas_container canvas");
        assert.strictEqual(
          graph.model.metaData.activeMeasure,
          "__count",
          `the active measure should be "__count" by default`
        );
        assert.strictEqual(
          graph.model.metaData.mode,
          "bar",
          "should be in bar chart mode by default"
        );
        assert.strictEqual(graph.model.metaData.order, null, "should not be ordered by default");
        assert.strictEqual(
          graph.model.metaData.stacked,
          true,
          "bar charts should be stacked by default"
        );
        checkLabels(assert, graph, ["Total"]);
        checkDatasets(assert, graph, ["backgroundColor", "borderColor", "data", "label", "stack"], {
          backgroundColor: "#1f77b4",
          borderColor: undefined,
          data: [8],
          label: "Count",
          stack: "",
        });
        checkLegend(assert, graph, "Count");
        checkTooltip(assert, graph, { lines: [{ label: "Total", value: "8.00" }] }, 0);
        graph.unmount();
      });

      QUnit.test("simple bar chart rendering with no data", async function (assert) {
        assert.expect(4);
        serverData.models.foo.records = [];
        const graph = await createView({
          type: "graph",
          model: "foo",
          serverData,
        });
        assert.containsOnce(graph, "div.o_graph_canvas_container canvas");
        assert.containsNone(graph, ".o_nocontent_help");
        checkLabels(assert, graph, []);
        checkDatasets(assert, graph, [], []);
        graph.unmount();
      });

      QUnit.test("simple bar chart rendering (one groupBy)", async function (assert) {
        assert.expect(12);
        const graph = await createView({
          type: "graph",
          model: "foo",
          arch: `<graph><field name="bar"/></graph>`,
          serverData,
        });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        checkLabels(assert, graph, ["true", "false"]);
        checkDatasets(assert, graph, ["backgroundColor", "borderColor", "data", "label"], {
          backgroundColor: "#1f77b4",
          borderColor: undefined,
          data: [3, 5],
          label: "Count",
        });
        checkLegend(assert, graph, "Count");
        checkTooltip(assert, graph, { lines: [{ label: "true", value: "3.00" }] }, 0);
        checkTooltip(assert, graph, { lines: [{ label: "false", value: "5.00" }] }, 1);
        graph.unmount();
      });

      QUnit.test("simple bar chart rendering (two groupBy)", async function (assert) {
        assert.expect(20);
        const graph = await createView({
          type: "graph",
          model: "foo",
          arch: `<graph>
                  <field name="bar"/>
                  <field name="product_id"/>
                </graph>`,
          serverData,
        });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        checkLabels(assert, graph, ["true", "false"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: "#1f77b4",
              borderColor: undefined,
              data: [3, 1],
              label: "xphone",
            },
            {
              backgroundColor: "#ff7f0e",
              borderColor: undefined,
              data: [0, 4],
              label: "xpad",
            },
          ]
        );
        checkLegend(assert, graph, ["xphone", "xpad"]);
        checkTooltip(assert, graph, { lines: [{ label: "true / xphone", value: "3.00" }] }, 0, 0);
        checkTooltip(assert, graph, { lines: [{ label: "false / xphone", value: "1.00" }] }, 1, 0);
        checkTooltip(assert, graph, { lines: [{ label: "true / xpad", value: "0.00" }] }, 0, 1);
        checkTooltip(assert, graph, { lines: [{ label: "false / xpad", value: "4.00" }] }, 1, 1);
        graph.unmount();
      });

      QUnit.test("bar chart rendering (no groupBy, several domains)", async function (assert) {
        assert.expect(11);
        const graph = await createView({
          type: "graph",
          model: "foo",
          arch: `<graph>
                  <field name="revenue" type="measure"/>
                </graph>`,
          domain: [],
          groupBy: [],
          // domains: [
          //   { arrayRepr: [["bar", "=", true]], description: "True group" },
          //   { arrayRepr: [["bar", "=", false]], description: "False group" },
          // ],
          serverData,
          data: serverData,
        });
        checkLabels(assert, graph, ["Total"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: "#1f77b4",
              borderColor: undefined,
              data: [6],
              label: "True group",
            },
            {
              backgroundColor: "#ff7f0e",
              borderColor: undefined,
              data: [17],
              label: "False group",
            },
          ]
        );
        checkLegend(assert, graph, ["True group", "False group"]);
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "Total / True group", value: "6.00" }],
          },
          0,
          0
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "Total / False group", value: "17.00" }],
          },
          0,
          1
        );
        graph.unmount();
      });

      QUnit.test("bar chart rendering (one groupBy, several domains)", async function (assert) {
        assert.expect(19);
        serverData.models.foo.records = [
          { bar: true, foo: 1, revenue: 14 },
          { bar: true, foo: 2, revenue: false },
          { bar: false, foo: 1, revenue: 12 },
          { bar: false, foo: 2, revenue: -4 },
          { bar: false, foo: 3, revenue: 2 },
          { bar: false, foo: 4, revenue: 0 },
        ];
        const graph = await createView({
          type: "graph",
          model: "foo",
          arch: `<graph>
                  <field name="revenue" type="measure"/>
                  <field name="foo"/>
                </graph>`,
          domains: [
            { arrayRepr: [["bar", "=", true]], description: "True group" },
            { arrayRepr: [["bar", "=", false]], description: "False group" },
          ],
          serverData,
        });
        checkLabels(assert, graph, ["1", "2", "3", "4"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: "#1f77b4",
              borderColor: undefined,
              data: [14, 0, 0, 0],
              label: "True group",
            },
            {
              backgroundColor: "#ff7f0e",
              borderColor: undefined,
              data: [12, -4, 2, 0],
              label: "False group",
            },
          ]
        );
        checkLegend(assert, graph, ["True group", "False group"]);
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "1 / True group", value: "14.00" }],
          },
          0,
          0
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "1 / False group", value: "12.00" }],
          },
          0,
          1
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "2 / False group", value: "-4.00" }],
          },
          1,
          1
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "3 / False group", value: "2.00" }],
          },
          2,
          1
        );
        graph.unmount();
      });

      QUnit.test(
        "bar chart rendering (one groupBy, several domains with date identification)",
        async function (assert) {
          assert.expect(23);
          serverData.models.foo.records = [
            { date: "2021-01-04", revenue: 12 },
            { date: "2021-01-12", revenue: 5 },
            { date: "2021-01-19", revenue: 15 },
            { date: "2021-01-26", revenue: 2 },
            { date: "2021-02-04", revenue: 14 },
            { date: "2021-02-17", revenue: false },
            { date: false, revenue: 0 },
          ];
          const domains = [
            {
              arrayRepr: [
                ["date", ">=", "2021-02-01"],
                ["date", "<=", "2021-02-28"],
              ],
              description: "February 2021",
            },
            {
              arrayRepr: [
                ["date", ">=", "2021-01-01"],
                ["date", "<=", "2021-01-31"],
              ],
              description: "January 2021",
            },
          ];
          domains.fieldName = "date";
          const graph = await createView({
            type: "graph",
            model: "foo",
            arch: `<graph>
                    <field name="revenue" type="measure"/>
                    <field name="date" interval="week"/>
                  </graph>`,
            domains,
            serverData,
          });
          checkLabels(assert, graph, ["W5 2021", "W7 2021", "", ""]);
          checkDatasets(
            assert,
            graph,
            ["backgroundColor", "borderColor", "data", "label"],
            [
              {
                backgroundColor: "#1f77b4",
                borderColor: undefined,
                data: [14, 0],
                label: "February 2021",
              },
              {
                backgroundColor: "#ff7f0e",
                borderColor: undefined,
                data: [12, 5, 15, 2],
                label: "January 2021",
              },
            ]
          );
          checkLegend(assert, graph, ["February 2021", "January 2021"]);
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "W5 2021 / February 2021", value: "14.00" }],
            },
            0,
            0
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "W1 2021 / January 2021", value: "12.00" }],
            },
            0,
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "W2 2021 / January 2021", value: "5.00" }],
            },
            1,
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "W3 2021 / January 2021", value: "15.00" }],
            },
            2,
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "W4 2021 / January 2021", value: "2.00" }],
            },
            3,
            1
          );
          graph.unmount();
        }
      );

      QUnit.test(
        "bar chart rendering (two groupBy, several domains with no date identification)",
        async function (assert) {
          assert.expect(15);
          serverData.models.foo.records = [
            { date: "2021-01-04", bar: true, revenue: 12 },
            { date: "2021-01-12", bar: false, revenue: 5 },
            { date: "2021-02-04", bar: true, revenue: 14 },
            { date: "2021-02-17", bar: false, revenue: false },
            { date: false, bar: true, revenue: 0 },
          ];
          env = await makeTestEnv({ serviceRegistry, serverData });
          const domains = [
            {
              arrayRepr: [
                ["date", ">=", "2021-02-01"],
                ["date", "<=", "2021-02-28"],
              ],
              description: "February 2021",
            },
            {
              arrayRepr: [
                ["date", ">=", "2021-01-01"],
                ["date", "<=", "2021-01-31"],
              ],
              description: "January 2021",
            },
          ];
          domains.fieldName = "date";
          const graph = await createView({
            type: "graph",
            model: "foo",
            arch: `<graph>
                    <field name="revenue" type="measure"/>
                    <field name="bar"/>
                    <field name="date" interval="week"/>
                  </graph>`,
            domains,
            serverData,
          });

          checkLabels(assert, graph, ["true", "false"]);
          checkDatasets(
            assert,
            graph,
            ["backgroundColor", "borderColor", "data", "label"],
            [
              {
                backgroundColor: "#1f77b4",
                borderColor: undefined,
                data: [14, 0],
                label: "February 2021 / W5 2021",
              },
              {
                backgroundColor: "#ff7f0e",
                borderColor: undefined,
                data: [0, 0],
                label: "February 2021 / W7 2021",
              },
              {
                backgroundColor: "#aec7e8",
                borderColor: undefined,
                data: [12, 0],
                label: "January 2021 / W1 2021",
              },
              {
                backgroundColor: "#ffbb78",
                borderColor: undefined,
                data: [0, 5],
                label: "January 2021 / W2 2021",
              },
            ]
          );
          checkLegend(assert, graph, [
            "February 2021 / W5 2021",
            "February 2021 / W7 2021",
            "January 2021 / W1 2021",
            "January 2021 / W2 2021",
          ]);
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "true / February 2021 / W5 2021", value: "14.00" }],
            },
            0,
            0
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "true / January 2021 / W1 2021", value: "12.00" }],
            },
            0,
            2
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "false / January 2021 / W2 2021", value: "5.00" }],
            },
            1,
            3
          );
          graph.unmount();
        }
      );

      QUnit.module("Line chart");

      QUnit.test("line chart rendering (no groupBy)", async function (assert) {
        assert.expect(9);
        const props = { model: "foo", mode: "line" };
        const graph = await mount(GraphView, { env, target, props });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        assert.strictEqual(graph.model.metaData.mode, "line");
        checkLabels(assert, graph, ["", "Total", ""]);
        checkDatasets(assert, graph, ["backgroundColor", "borderColor", "data", "label", "stack"], {
          backgroundColor: "rgba(31,119,180,0.4)",
          borderColor: "#1f77b4",
          data: [undefined, 8],
          label: "Count",
          stack: undefined,
        });
        checkLegend(assert, graph, "Count");
        checkTooltip(assert, graph, { lines: [{ label: "Total", value: "8.00" }] }, 1);
        graph.unmount();
      });

      QUnit.test("line chart rendering (one groupBy)", async function (assert) {
        assert.expect(12);
        const props = { model: "foo", mode: "line", groupBy: ["bar"], fields: fooFields };
        const graph = await mount(GraphView, { env, target, props });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        checkLabels(assert, graph, ["true", "false"]);
        checkDatasets(assert, graph, ["backgroundColor", "borderColor", "data", "label"], {
          backgroundColor: "rgba(31,119,180,0.4)",
          borderColor: "#1f77b4",
          data: [3, 5],
          label: "Count",
        });
        checkLegend(assert, graph, "Count");
        checkTooltip(assert, graph, { lines: [{ label: "true", value: "3.00" }] }, 0);
        checkTooltip(assert, graph, { lines: [{ label: "false", value: "5.00" }] }, 1);
        graph.unmount();
      });

      QUnit.test("line chart rendering (two groupBy)", async function (assert) {
        assert.expect(12);
        const props = {
          model: "foo",
          mode: "line",
          groupBy: ["bar", "product_id"],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        checkLabels(assert, graph, ["true", "false"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: undefined,
              borderColor: "#1f77b4",
              data: [3, 1],
              label: "xphone",
            },
            {
              backgroundColor: undefined,
              borderColor: "#ff7f0e",
              data: [0, 4],
              label: "xpad",
            },
          ]
        );
        checkLegend(assert, graph, ["xphone", "xpad"]);
        checkTooltip(
          assert,
          graph,
          {
            lines: [
              { label: "true / xphone", value: "3.00" },
              { label: "true / xpad", value: "0.00" },
            ],
          },
          0
        );
        checkTooltip(
          assert,
          graph,
          {
            lines: [
              { label: "false / xpad", value: "4.00" },
              { label: "false / xphone", value: "1.00" },
            ],
          },
          1
        );
        graph.unmount();
      });

      QUnit.test("line chart rendering (no groupBy, several domains)", async function (assert) {
        assert.expect(7);
        const props = {
          model: "foo",
          mode: "line",
          activeMeasure: "revenue",
          groupBy: [],
          domains: [
            { arrayRepr: [["bar", "=", true]], description: "True group" },
            { arrayRepr: [["bar", "=", false]], description: "False group" },
          ],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        checkLabels(assert, graph, ["", "Total", ""]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: "rgba(31,119,180,0.4)",
              borderColor: "#1f77b4",
              data: [undefined, 6],
              label: "True group",
            },
            {
              backgroundColor: undefined,
              borderColor: "#ff7f0e",
              data: [undefined, 17],
              label: "False group",
            },
          ]
        );
        checkLegend(assert, graph, ["True group", "False group"]);
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [
              { label: "Total / False group", value: "17.00" },
              { label: "Total / True group", value: "6.00" },
            ],
          },
          1
        );
        graph.unmount();
      });

      QUnit.test("line chart rendering (one groupBy, several domains)", async function (assert) {
        assert.expect(19);
        serverData.models.foo.records = [
          { bar: true, foo: 1, revenue: 14 },
          { bar: true, foo: 2, revenue: false },
          { bar: false, foo: 1, revenue: 12 },
          { bar: false, foo: 2, revenue: -4 },
          { bar: false, foo: 3, revenue: 2 },
          { bar: false, foo: 4, revenue: 0 },
        ];
        env = await makeTestEnv({ serviceRegistry, serverData });
        const props = {
          model: "foo",
          mode: "line",
          activeMeasure: "revenue",
          groupBy: ["foo"],
          domains: [
            { arrayRepr: [["bar", "=", true]], description: "True group" },
            { arrayRepr: [["bar", "=", false]], description: "False group" },
          ],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        checkLabels(assert, graph, ["1", "2", "3", "4"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: "rgba(31,119,180,0.4)",
              borderColor: "#1f77b4",
              data: [14, 0, 0, 0],
              label: "True group",
            },
            {
              backgroundColor: undefined,
              borderColor: "#ff7f0e",
              data: [12, -4, 2, 0],
              label: "False group",
            },
          ]
        );
        checkLegend(assert, graph, ["True group", "False group"]);
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [
              { label: "1 / True group", value: "14.00" },
              { label: "1 / False group", value: "12.00" },
            ],
          },
          0
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [
              { label: "2 / True group", value: "0.00" },
              { label: "2 / False group", value: "-4.00" },
            ],
          },
          1
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [
              { label: "3 / False group", value: "2.00" },
              { label: "3 / True group", value: "0.00" },
            ],
          },
          2
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [
              { label: "4 / True group", value: "0.00" },
              { label: "4 / False group", value: "0.00" },
            ],
          },
          3
        );
        graph.unmount();
      });

      QUnit.test(
        "line chart rendering (one groupBy, several domains with date identification)",
        async function (assert) {
          assert.expect(19);
          serverData.models.foo.records = [
            { date: "2021-01-04", revenue: 12 },
            { date: "2021-01-12", revenue: 5 },
            { date: "2021-01-19", revenue: 15 },
            { date: "2021-01-26", revenue: 2 },
            { date: "2021-02-04", revenue: 14 },
            { date: "2021-02-17", revenue: false },
            { date: false, revenue: 0 },
          ];
          env = await makeTestEnv({ serviceRegistry, serverData });
          const domains = [
            {
              arrayRepr: [
                ["date", ">=", "2021-02-01"],
                ["date", "<=", "2021-02-28"],
              ],
              description: "February 2021",
            },
            {
              arrayRepr: [
                ["date", ">=", "2021-01-01"],
                ["date", "<=", "2021-01-31"],
              ],
              description: "January 2021",
            },
          ];
          domains.fieldName = "date";
          const props = {
            model: "foo",
            mode: "line",
            activeMeasure: "revenue",
            groupBy: ["date:week"],
            domains,
            fields: fooFields,
          };
          const graph = await mount(GraphView, { env, target, props });
          checkLabels(assert, graph, ["W5 2021", "W7 2021", "", ""]);
          checkDatasets(
            assert,
            graph,
            ["backgroundColor", "borderColor", "data", "label"],
            [
              {
                backgroundColor: "rgba(31,119,180,0.4)",
                borderColor: "#1f77b4",
                data: [14, 0],
                label: "February 2021",
              },
              {
                backgroundColor: undefined,
                borderColor: "#ff7f0e",
                data: [12, 5, 15, 2],
                label: "January 2021",
              },
            ]
          );
          checkLegend(assert, graph, ["February 2021", "January 2021"]);
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [
                { label: "W5 2021 / February 2021", value: "14.00" },
                { label: "W1 2021 / January 2021", value: "12.00" },
              ],
            },
            0
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [
                { label: "W2 2021 / January 2021", value: "5.00" },
                { label: "W7 2021 / February 2021", value: "0.00" },
              ],
            },
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "W3 2021 / January 2021", value: "15.00" }],
            },
            2
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "W4 2021 / January 2021", value: "2.00" }],
            },
            3
          );
          graph.unmount();
        }
      );

      QUnit.test(
        "line chart rendering (two groupBy, several domains with no date identification)",
        async function (assert) {
          assert.expect(11);
          serverData.models.foo.records = [
            { date: "2021-01-04", bar: true, revenue: 12 },
            { date: "2021-01-12", bar: false, revenue: 5 },
            { date: "2021-02-04", bar: true, revenue: 14 },
            { date: "2021-02-17", bar: false, revenue: false },
            { date: false, bar: true, revenue: 0 },
          ];
          env = await makeTestEnv({ serviceRegistry, serverData });
          const domains = [
            {
              arrayRepr: [
                ["date", ">=", "2021-02-01"],
                ["date", "<=", "2021-02-28"],
              ],
              description: "February 2021",
            },
            {
              arrayRepr: [
                ["date", ">=", "2021-01-01"],
                ["date", "<=", "2021-01-31"],
              ],
              description: "January 2021",
            },
          ];
          domains.fieldName = "date";
          const props = {
            model: "foo",
            mode: "line",
            activeMeasure: "revenue",
            groupBy: ["bar", "date:week"],
            domains,
            fields: fooFields,
          };
          const graph = await mount(GraphView, { env, target, props });
          checkLabels(assert, graph, ["true", "false"]);
          checkDatasets(
            assert,
            graph,
            ["backgroundColor", "borderColor", "data", "label"],
            [
              {
                backgroundColor: undefined,
                borderColor: "#1f77b4",
                data: [14, 0],
                label: "February 2021 / W5 2021",
              },
              {
                backgroundColor: undefined,
                borderColor: "#ff7f0e",
                data: [0, 0],
                label: "February 2021 / W7 2021",
              },
              {
                backgroundColor: undefined,
                borderColor: "#aec7e8",
                data: [12, 0],
                label: "January 2021 / W1 2021",
              },
              {
                backgroundColor: undefined,
                borderColor: "#ffbb78",
                data: [0, 5],
                label: "January 2021 / W2 2021",
              },
            ]
          );
          checkLegend(assert, graph, [
            "February 2021 / W5 2021",
            "February 2021 / W7 2021",
            "January 2021 / W1 2021",
            "January 2021 / W2 2021",
          ]);
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [
                { label: "true / February 2021 / W5 2021", value: "14.00" },
                { label: "true / January 2021 / W1 2021", value: "12.00" },
                { label: "true / February 2021 / W7 2021", value: "0.00" },
                { label: "true / January 2021 / W2 2021", value: "0.00" },
              ],
            },
            0
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [
                { label: "false / January 2021 / W2 2021", value: "5.00" },
                { label: "false / February 2021 / W5 2021", value: "0.00" },
                { label: "false / February 2021 / W7 2021", value: "0.00" },
                { label: "false / January 2021 / W1 2021", value: "0.00" },
              ],
            },
            1
          );
          graph.unmount();
        }
      );

      QUnit.module("Pie chart");

      QUnit.test("simple graph rendering (pie mode, no groupBy)", async function (assert) {
        assert.expect(9);
        const props = { model: "foo", mode: "pie" };
        const graph = await mount(GraphView, { env, target, props });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        assert.strictEqual(graph.model.metaData.mode, "pie");
        checkLabels(assert, graph, ["Total"]);
        checkDatasets(assert, graph, ["backgroundColor", "borderColor", "data", "label", "stack"], {
          backgroundColor: ["#1f77b4"],
          borderColor: BORDER_WHITE,
          data: [8],
          label: "",
          stack: undefined,
        });
        checkLegend(assert, graph, "Total");
        checkTooltip(assert, graph, { lines: [{ label: "Total", value: "8.00" }] }, 0);
        graph.unmount();
      });

      QUnit.test("simple graph rendering (pie mode, one groupBy)", async function (assert) {
        assert.expect(12);
        const props = { model: "foo", mode: "pie", groupBy: ["bar"], fields: fooFields };
        const graph = await mount(GraphView, { env, target, props });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        checkLabels(assert, graph, ["true", "false"]);
        checkDatasets(assert, graph, ["backgroundColor", "borderColor", "data"], {
          backgroundColor: ["#1f77b4", "#ff7f0e"],
          borderColor: BORDER_WHITE,
          data: [3, 5],
        });
        checkLegend(assert, graph, ["true", "false"]);
        checkTooltip(assert, graph, { lines: [{ label: "true", value: "3.00" }] }, 0);
        checkTooltip(assert, graph, { lines: [{ label: "false", value: "5.00" }] }, 1);
        graph.unmount();
      });

      QUnit.test("simple graph rendering (pie mode, two groupBy)", async function (assert) {
        assert.expect(16);
        const props = {
          model: "foo",
          mode: "pie",
          groupBy: ["bar", "product_id"],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        assert.containsOnce(graph.el, "div.o_graph_canvas_container canvas");
        checkLabels(assert, graph, ["true / xphone", "false / xphone", "false / xpad"]);
        checkDatasets(assert, graph, ["backgroundColor", "borderColor", "data", "label"], {
          backgroundColor: ["#1f77b4", "#ff7f0e", "#aec7e8"],
          borderColor: BORDER_WHITE,
          data: [3, 1, 4],
          label: "",
        });
        checkLegend(assert, graph, ["true / xphone", "false / xphone", "false / xpad"]);
        checkTooltip(assert, graph, { lines: [{ label: "true / xphone", value: "3.00" }] }, 0);
        checkTooltip(assert, graph, { lines: [{ label: "false / xphone", value: "1.00" }] }, 1);
        checkTooltip(assert, graph, { lines: [{ label: "false / xpad", value: "4.00" }] }, 2);
        graph.unmount();
      });

      QUnit.test("pie chart rendering (no groupBy, several domains)", async function (assert) {
        assert.expect(11);
        const props = {
          model: "foo",
          mode: "pie",
          activeMeasure: "revenue",
          groupBy: [],
          domains: [
            { arrayRepr: [["bar", "=", true]], description: "True group" },
            { arrayRepr: [["bar", "=", false]], description: "False group" },
          ],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        checkLabels(assert, graph, ["Total"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: ["#1f77b4"],
              borderColor: BORDER_WHITE,
              data: [6],
              label: "True group",
            },
            {
              backgroundColor: ["#1f77b4"],
              borderColor: BORDER_WHITE,
              data: [17],
              label: "False group",
            },
          ]
        );
        checkLegend(assert, graph, ["Total"]);
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "True group / Total", value: "6.00" }],
          },
          0,
          0
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "False group / Total", value: "17.00" }],
          },
          0,
          1
        );
        graph.unmount();
      });

      QUnit.test("pie chart rendering (one groupBy, several domains)", async function (assert) {
        assert.expect(19);
        serverData.models.foo.records = [
          { bar: true, foo: 1, revenue: 14 },
          { bar: true, foo: 2, revenue: false },
          { bar: false, foo: 1, revenue: 12 },
          { bar: false, foo: 2, revenue: 5 },
          { bar: false, foo: 3, revenue: 0 },
          { bar: false, foo: 4, revenue: 2 },
        ];
        env = await makeTestEnv({ serviceRegistry, serverData });
        const props = {
          model: "foo",
          mode: "pie",
          activeMeasure: "revenue",
          groupBy: ["foo"],
          domains: [
            { arrayRepr: [["bar", "=", true]], description: "True group" },
            { arrayRepr: [["bar", "=", false]], description: "False group" },
          ],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        checkLabels(assert, graph, ["1", "2", "3", "4"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: ["#1f77b4", "#ff7f0e", "#aec7e8", "#ffbb78"],
              borderColor: BORDER_WHITE,
              data: [14, 0, 0, 0],
              label: "True group",
            },
            {
              backgroundColor: ["#1f77b4", "#ff7f0e", "#aec7e8", "#ffbb78"],
              borderColor: BORDER_WHITE,
              data: [12, 5, 0, 2],
              label: "False group",
            },
          ]
        );
        checkLegend(assert, graph, ["1", "2", "3", "4"]);
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "True group / 1", value: "14.00" }],
          },
          0,
          0
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "False group / 1", value: "12.00" }],
          },
          0,
          1
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "False group / 2", value: "5.00" }],
          },
          1,
          1
        );
        checkTooltip(
          assert,
          graph,
          {
            title: "Revenue",
            lines: [{ label: "False group / 4", value: "2.00" }],
          },
          3,
          1
        );
        graph.unmount();
      });

      QUnit.test(
        "pie chart rendering (one groupBy, several domains with date identification)",
        async function (assert) {
          assert.expect(27);
          serverData.models.foo.records = [
            { date: "2021-01-04" },
            { date: "2021-01-12" },
            { date: "2021-01-19" },
            { date: "2021-01-26" },
            { date: "2021-02-04" },
            { date: "2021-02-17" },
            { date: false },
          ];
          env = await makeTestEnv({ serviceRegistry, serverData });
          const domains = [
            {
              arrayRepr: [
                ["date", ">=", "2021-02-01"],
                ["date", "<=", "2021-02-28"],
              ],
              description: "February 2021",
            },
            {
              arrayRepr: [
                ["date", ">=", "2021-01-01"],
                ["date", "<=", "2021-01-31"],
              ],
              description: "January 2021",
            },
          ];
          domains.fieldName = "date";
          const props = {
            model: "foo",
            mode: "pie",
            groupBy: ["date:week"],
            domains,
            fields: fooFields,
          };
          const graph = await mount(GraphView, { env, target, props });
          checkLabels(assert, graph, [
            "W5 2021, W1 2021",
            "W7 2021, W2 2021",
            "W3 2021",
            "W4 2021",
          ]);
          checkDatasets(
            assert,
            graph,
            ["backgroundColor", "borderColor", "data", "label"],
            [
              {
                backgroundColor: ["#1f77b4", "#ff7f0e", "#aec7e8", "#ffbb78"],
                borderColor: BORDER_WHITE,
                data: [1, 1, 0, 0],
                label: "February 2021",
              },
              {
                backgroundColor: ["#1f77b4", "#ff7f0e", "#aec7e8", "#ffbb78"],
                borderColor: BORDER_WHITE,
                data: [1, 1, 1, 1],
                label: "January 2021",
              },
            ]
          );
          checkLegend(assert, graph, [
            "W5 2021, W1 2021",
            "W7 2021, W2 2021",
            "W3 2021",
            "W4 2021",
          ]);
          checkTooltip(
            assert,
            graph,
            {
              lines: [{ label: "February 2021 / W5 2021", value: "1.00" }],
            },
            0,
            0
          );
          checkTooltip(
            assert,
            graph,
            {
              lines: [{ label: "January 2021 / W1 2021", value: "1.00" }],
            },
            0,
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              lines: [{ label: "February 2021 / W7 2021", value: "1.00" }],
            },
            1,
            0
          );
          checkTooltip(
            assert,
            graph,
            {
              lines: [{ label: "January 2021 / W2 2021", value: "1.00" }],
            },
            1,
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              lines: [{ label: "January 2021 / W3 2021", value: "1.00" }],
            },
            2,
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              lines: [{ label: "January 2021 / W4 2021", value: "1.00" }],
            },
            3,
            1
          );
          graph.unmount();
        }
      );

      QUnit.test(
        "pie chart rendering (two groupBy, several domains with no date identification)",
        async function (assert) {
          assert.expect(15);
          serverData.models.foo.records = [
            { date: "2021-01-04", bar: true, revenue: 12 },
            { date: "2021-01-12", bar: false, revenue: 5 },
            { date: "2021-02-04", bar: true, revenue: 14 },
            { date: "2021-02-17", bar: false, revenue: false },
            { date: false, bar: true, revenue: 0 },
          ];
          env = await makeTestEnv({ serviceRegistry, serverData });
          const domains = [
            {
              arrayRepr: [
                ["date", ">=", "2021-02-01"],
                ["date", "<=", "2021-02-28"],
              ],
              description: "February 2021",
            },
            {
              arrayRepr: [
                ["date", ">=", "2021-01-01"],
                ["date", "<=", "2021-01-31"],
              ],
              description: "January 2021",
            },
          ];
          domains.fieldName = "date";
          const props = {
            model: "foo",
            mode: "pie",
            activeMeasure: "revenue",
            groupBy: ["bar", "date:week"],
            domains,
            fields: fooFields,
          };
          const graph = await mount(GraphView, { env, target, props });
          checkLabels(assert, graph, [
            "true / W5 2021",
            "false / W7 2021",
            "true / W1 2021",
            "false / W2 2021",
          ]);
          checkDatasets(
            assert,
            graph,
            ["backgroundColor", "borderColor", "data", "label"],
            [
              {
                backgroundColor: ["#1f77b4", "#ff7f0e", "#aec7e8", "#ffbb78"],
                borderColor: BORDER_WHITE,
                data: [14, 0, 0, 0],
                label: "February 2021",
              },
              {
                backgroundColor: ["#1f77b4", "#ff7f0e", "#aec7e8", "#ffbb78"],
                borderColor: BORDER_WHITE,
                data: [0, 0, 12, 5],
                label: "January 2021",
              },
            ]
          );
          checkLegend(assert, graph, [
            "true / W5 2021",
            "false / W7 2021",
            "true / W1 2021",
            "false / W2 2021",
          ]);
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "February 2021 / true / W5 2021", value: "14.00" }],
            },
            0,
            0
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "January 2021 / true / W1 2021", value: "12.00" }],
            },
            2,
            1
          );
          checkTooltip(
            assert,
            graph,
            {
              title: "Revenue",
              lines: [{ label: "January 2021 / false / W2 2021", value: "5.00" }],
            },
            3,
            1
          );
          graph.unmount();
        }
      );

      QUnit.test("pie chart rendering (no data)", async function (assert) {
        assert.expect(7);
        serverData.models.foo.records = [];
        env = await makeTestEnv({ serviceRegistry, serverData });
        const props = {
          model: "foo",
          mode: "pie",
          groupBy: ["product_id"],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        checkLabels(assert, graph, ["No data"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: [DEFAULT_BG],
              borderColor: BORDER_WHITE,
              data: [1],
              label: null,
            },
          ]
        );
        checkLegend(assert, graph, ["No data"]);
        checkTooltip(assert, graph, { lines: [{ label: "No data", value: "0.00" }] }, 0);
        graph.unmount();
      });

      QUnit.test("pie chart rendering (no data)", async function (assert) {
        assert.expect(11);
        serverData.models.foo.records = [{ product_id: 37, bar: true }];
        env = await makeTestEnv({ serviceRegistry, serverData });
        const props = {
          model: "foo",
          mode: "pie",
          groupBy: ["product_id"],
          domains: [
            { arrayRepr: [["bar", "=", true]], description: "True group" },
            { arrayRepr: [["bar", "=", false]], description: "False group" },
          ],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        checkLabels(assert, graph, ["xphone", "No data"]);
        checkDatasets(
          assert,
          graph,
          ["backgroundColor", "borderColor", "data", "label"],
          [
            {
              backgroundColor: ["#1f77b4"],
              borderColor: BORDER_WHITE,
              data: [1],
              label: "True group",
            },
            {
              backgroundColor: ["#1f77b4", DEFAULT_BG],
              borderColor: BORDER_WHITE,
              data: [undefined, 1],
              label: "False group",
            },
          ]
        );
        checkLegend(assert, graph, ["xphone", "No data"]);
        checkTooltip(
          assert,
          graph,
          { lines: [{ label: "True group / xphone", value: "1.00" }] },
          0,
          0
        );
        checkTooltip(
          assert,
          graph,
          { lines: [{ label: "False group / No data", value: "0.00" }] },
          1,
          1
        );
        graph.unmount();
      });

      QUnit.test("pie chart rendering for mix of positive and negative values", async function (
        assert
      ) {
        assert.expect(3);
        serverData.models.foo.records = [
          { bar: true, revenue: 2 },
          { bar: false, revenue: -3 },
        ];
        env = await makeTestEnv({ serviceRegistry, serverData });
        const props = {
          model: "foo",
          mode: "pie",
          activeMeasure: "revenue",
          groupBy: ["bar"],
          fields: fooFields,
        };
        const graph = await mount(GraphView, { env, target, props });
        assert.containsOnce(graph, ".o_view_nocontent");
        assert.strictEqual(
          graph.el.querySelector(".o_view_nocontent").innerText.replace(/[\s\n]/g, " "),
          `Invalid data  Pie chart cannot mix positive and negative numbers. Try to change your domain to only display positive results`
        );
        assert.containsNone(graph, ".o_graph_canvas_container");
        graph.unmount();
      });

      QUnit.module("Props management");

      QUnit.test("mode props", async function (assert) {
        assert.expect(2);
        const props = { model: "foo", mode: "pie" };
        const graph = await mount(GraphView, { env, target, props });
        assert.strictEqual(graph.model.metaData.mode, "pie", "should be in pie chart mode");
        assert.strictEqual(graph.chart.config.type, "pie");
        // we should add some check: this is not good
        graph.unmount();
      });

      QUnit.skip("title props", async function (assert) {
        // @todo review CSS and uncomment in XML title part
        assert.expect(1);
        const title = "Partners";
        const props = { model: "foo", title };
        const graph = await mount(GraphView, { env, target, props });
        assert.strictEqual(
          graph.el.querySelector(".o_graph_view .o_content label").innerText,
          title
        );
        graph.unmount();
      });

      QUnit.test("field id not in groupBy", async function (assert) {
        assert.expect(3);
        const props = { model: "foo", groupBy: ["id"], fields: fooFields };
        const graph = await mount(GraphView, { env, target, props });
        checkLabels(assert, graph, ["Total"]);
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

      QUnit.test("props modifications", async function (assert) {
        assert.expect(6);
        class Parent extends Component {
          constructor() {
            super(...arguments);
            this.state = useState({ model: "foo", groupBy: ["bar"], fields: fooFields });
            this.graph = useRef("graph");
          }
        }
        Parent.template = xml`<GraphView t-props="state" t-ref="graph"/>`;
        Parent.components = { GraphView };
        const parent = await mount(Parent, { env, target });
        assert.strictEqual(
          parent.graph.comp.model.metaData.mode,
          "bar",
          "should be in bar chart mode by default"
        );
        assert.strictEqual(parent.graph.comp.model.metaData.groupBy[0].toJSON(), "bar");
        await selectMode(parent, "line");
        assert.strictEqual(
          parent.graph.comp.model.metaData.mode,
          "line",
          "should be in 'line' mode"
        );
        assert.strictEqual(parent.graph.comp.model.metaData.groupBy[0].toJSON(), "bar");
        parent.state.groupBy = ["foo"];
        await nextTick();
        assert.strictEqual(
          parent.graph.comp.model.metaData.mode,
          "line",
          "should still be in 'line' mode"
        );
        assert.strictEqual(parent.graph.comp.model.metaData.groupBy[0].toJSON(), "foo");
        parent.destroy();
      });

      QUnit.module("Control panel interactions");

      QUnit.test("switching mode", async function (assert) {
        assert.expect(12);
        const props = { model: "foo" };
        const graph = await mount(GraphView, { env, target, props });
        function checkMode(mode) {
          assert.strictEqual(graph.model.metaData.mode, mode);
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

      QUnit.test("switching measure", async function (assert) {
        assert.expect(6);
        const props = { model: "foo", fields: fooFields };
        const graph = await mount(GraphView, { env, target, props });
        function checkMeasure(measure) {
          const yAxe = graph.chart.config.options.scales.yAxes[0];
          assert.strictEqual(yAxe.scaleLabel.labelString, measure);
          const item = findItem(
            graph,
            ".o_cp_bottom_left .o_dropdown ul .o_dropdown_item",
            measure
          );
          assert.hasClass(item, "active");
        }
        await toggleMeasureMenu(graph);
        checkMeasure("Count");
        checkLegend(assert, graph, "Count");
        await selectMeasure(graph, "Foo");
        checkMeasure("Foo");
        checkLegend(assert, graph, "Foo");
        graph.unmount();
      });

      QUnit.module("processGraphViewDescription");

      QUnit.test("process default view description", async function (assert) {
        assert.expect(1);
        const propsFromArch = processGraphViewDescription({});
        assert.deepEqual(propsFromArch, { fields: {} });
      });

      QUnit.test("process simple arch (no field tag)", async function (assert) {
        assert.expect(2);
        let propsFromArch = processGraphViewDescription({
          arch: `<graph order="ASC" disable_linking="1" type="line"/>`,
          fields: fooFields,
        });
        assert.deepEqual(propsFromArch, {
          disableLinking: true,
          fields: fooFields,
          mode: "line",
          order: "ASC",
        });
        propsFromArch = processGraphViewDescription({
          arch: `<graph disable_linking="0" string="Title" stacked="False"/>`,
          fields: fooFields,
        });
        assert.deepEqual(propsFromArch, {
          disableLinking: false,
          fields: fooFields,
          stacked: false,
          title: "Title",
        });
      });

      QUnit.test("process arch with field tags", async function (assert) {
        assert.expect(1);
        fooFields.fighters = { type: "text", string: "Fighters" };

        let propsFromArch = processGraphViewDescription({
          fields: fooFields,
          arch: `
          <graph type="pie">
            <field name="revenue" type="measure"/>
            <field name="date" interval="day"/>
            <field name="foo" invisible="0"/>
            <field name="bar" invisible="1"/>
            <field name="id"/>
            <field name="fighters"/>
          <graph/>
        `,
        });
        delete fooFields.bar;
        assert.deepEqual(propsFromArch, {
          fields: fooFields,
          activeMeasure: "revenue",
          groupBy: ["date:day", "foo"],
          mode: "pie",
        });
      });

      QUnit.module("GraphModel");

      QUnit.skip(
        "should not reload data points when loadParams keys 'activeMeasure', 'domains', 'fields', 'groupBy', 'model' are the same as last one",
        async function (assert) {
          assert.expect(2);
          const mockRPC = async function (_, args) {
            if (args.method === "web_read_group") {
              assert.step(args.method);
            }
          };
          env = await makeTestEnv({ serviceRegistry, serverData, mockRPC });
          const model = new GraphModel(env);
          model.load({ model: "foo" });
          model.load({ model: "foo", order: "ASC" });
          assert.verifySteps([
            "web_read_group", // initial load
          ]);
        }
      );

      QUnit.skip(
        "should reload data points when loadParams keys 'activeMeasure', 'domains', 'fields', 'groupBy', 'model' are modified",
        async function (assert) {
          assert.expect(3);
          const mockRPC = async function (_, args) {
            if (args.method === "web_read_group") {
              assert.step(args.method);
            }
          };
          env = await makeTestEnv({ serviceRegistry, serverData, mockRPC });
          const model = new GraphModel(env);
          model.load({ model: "foo" });
          model.load({
            model: "foo",
            domains: [{ arrayRepr: [["bar", "=", true]], description: null }],
          });
          assert.verifySteps([
            "web_read_group", // initial load
            "web_read_group",
          ]);
        }
      );

      QUnit.skip(
        "should reload data points and use correct loadParams to process the data points",
        async function (assert) {
          assert.expect(7);
          const mockRPC = async function (_, args) {
            if (args.method === "web_read_group") {
              assert.step(args.method);
            }
          };
          env = await makeTestEnv({ serviceRegistry, serverData, mockRPC });
          const model = new GraphModel(env);
          const prom1 = model.load({ model: "foo" });
          const prom2 = model.load({
            model: "foo",
            fields: fooFields,
            groupBy: [getGroupBy("bar")],
          });
          const prom3 = model.load({ model: "foo" });
          prom1.then(() => {
            assert.step("prom1 resolved");
          });
          prom2.then(() => {
            assert.step("prom2 resolved");
          });
          prom3.then(() => {
            assert.step("prom3 resolved");
          });
          await nextTick();
          assert.verifySteps([
            "web_read_group", // initial load
            "web_read_group",
            "web_read_group",
            "prom1 resolved",
            "prom2 resolved",
            "prom3 resolved",
          ]);
        }
      );
    });
  }
);
