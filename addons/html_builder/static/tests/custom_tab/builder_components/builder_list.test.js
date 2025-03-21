import { BuilderList } from "@html_builder/core/building_blocks/builder_list";
import { expect, test } from "@odoo/hoot";
import { Component, onError, xml } from "@odoo/owl";
import { contains } from "@web/../tests/web_test_helpers";
import { addOption, defineWebsiteModels, setupWebsiteBuilder } from "../../website_helpers";

defineWebsiteModels();

const defaultValue = { value: "75", title: "default title" };
const defaultValueStr = JSON.stringify(defaultValue).replaceAll('"', "'");
function defaultValueWithIds(ids) {
    return ids.map((id) => ({
        ...defaultValue,
        _id: id.toString(),
    }));
}

test("writes a list of numbers to a data attribute", async () => {
    addOption({
        selector: ".test-options-target",
        template: xml`<BuilderList
                          dataAttributeAction="'list'"
                          entryShape="{ value: 'number', title: 'text' }"
                          defaultValue="${defaultValueStr}"
                      />`,
    });
    await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
    await contains(":iframe .test-options-target").click();

    await contains(".we-bg-options-container .builder_list_add_entry").click();
    await contains(".we-bg-options-container input[type=number]").edit("35");
    await contains(".we-bg-options-container input[type=text]").edit("a thing");
    await contains(".we-bg-options-container .builder_list_add_entry").click();
    await contains(".we-bg-options-container .builder_list_add_entry").click();
    expect(":iframe .test-options-target").toHaveAttribute(
        "data-list",
        JSON.stringify([
            {
                value: "35",
                title: "a thing",
                _id: "0",
            },
            ...defaultValueWithIds([1, 2]),
        ])
    );
});

test("supports arbitrary number of text and number inputs on entries", async () => {
    addOption({
        selector: ".test-options-target",
        template: xml`<BuilderList
                          dataAttributeAction="'list'"
                          entryShape="{ a: 'number', b: 'text', c: 'text', d: 'number' }"
                          defaultValue="{ a: '4', b: '3', c: '2', d: '1' }"
                      />`,
    });
    await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
    await contains(":iframe .test-options-target").click();
    await contains(".we-bg-options-container .builder_list_add_entry").click();
    expect(".we-bg-options-container input[type=number]").toHaveCount(2);
    expect(".we-bg-options-container input[type=text]").toHaveCount(2);
    expect(":iframe .test-options-target").toHaveAttribute(
        "data-list",
        JSON.stringify([
            {
                a: "4",
                b: "3",
                c: "2",
                d: "1",
                _id: "0",
            },
        ])
    );
});

test("delete an item", async () => {
    addOption({
        selector: ".test-options-target",
        template: xml`<BuilderList
                          dataAttributeAction="'list'"
                          entryShape="{ value: 'number', title: 'text' }"
                          defaultValue="${defaultValueStr}"
                      />`,
    });
    await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
    await contains(":iframe .test-options-target").click();

    await contains(".we-bg-options-container > button").click();
    expect(":iframe .test-options-target").toHaveAttribute(
        "data-list",
        JSON.stringify(defaultValueWithIds([0]))
    );
    await contains(".we-bg-options-container .builder_list_remove_entry").click();
    expect(":iframe .test-options-target").toHaveAttribute("data-list", JSON.stringify([]));
});

test("reorder items", async () => {
    addOption({
        selector: ".test-options-target",
        template: xml`<BuilderList
                          dataAttributeAction="'list'"
                          entryShape="{ value: 'number', title: 'text' }"
                          defaultValue="${defaultValueStr}"
                      />`,
    });
    await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
    await contains(":iframe .test-options-target").click();

    await contains(".we-bg-options-container > button").click();
    await contains(".we-bg-options-container > button").click();
    await contains(".we-bg-options-container > button").click();
    function expectOrder(ids) {
        expect(":iframe .test-options-target").toHaveAttribute(
            "data-list",
            JSON.stringify(defaultValueWithIds(ids))
        );
    }
    expectOrder([0, 1, 2]);

    const rowSelector = (id) => `.we-bg-options-container .o_row_draggable[data-id="${id}"]`;
    const rowHandleSelector = (id) => `${rowSelector(id)} .o_handle_cell`;

    await contains(rowHandleSelector(0)).dragAndDrop(rowSelector(1));
    expectOrder([1, 0, 2]);

    await contains(rowHandleSelector(1)).dragAndDrop(rowSelector(2));
    expectOrder([0, 2, 1]);

    await contains(rowHandleSelector(1)).dragAndDrop(rowSelector(0));
    expectOrder([1, 0, 2]);

    await contains(rowHandleSelector(2)).dragAndDrop(rowSelector(0));
    expectOrder([1, 2, 0]);

    await contains(rowHandleSelector(2)).dragAndDrop(rowSelector(0));
    expectOrder([1, 0, 2]);

    await contains(rowHandleSelector(0)).dragAndDrop(rowSelector(1));
    expectOrder([0, 1, 2]);
});

async function testBuilderListFaultyProps(template) {
    class Test extends Component {
        static template = xml`${template}`;
        static components = { BuilderList };
        static props = ["*"];
        setup() {
            onError(() => {
                expect.step("threw");
            });
        }
    }
    addOption({
        selector: ".test-options-target",
        Component: Test,
    });
    await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
    await contains(":iframe .test-options-target").click();
    expect.verifySteps(["threw"]);
}
test("throws error on empty shape", async () => {
    await testBuilderListFaultyProps(`
        <BuilderList
            dataAttributeAction="'list'"
            entryShape="{}"
            defaultValue="{}"
        />
    `);
});

test("throws error on wrong entry shape types", async () => {
    await testBuilderListFaultyProps(`
        <BuilderList
            dataAttributeAction="'list'"
            entryShape="{ a: 'doesnotexist' }"
            defaultValue="{ a: '1' }"
        />
    `);
});

test("throws error on wrong properties default value", async () => {
    await testBuilderListFaultyProps(`
        <BuilderList
            dataAttributeAction="'list'"
            entryShape="{ a: 'number' }"
            defaultValue="{ b: '1' }"
        />
    `);
});

test("throws error on missing default value with a custom entryShape", async () => {
    await testBuilderListFaultyProps(`
        <BuilderList
            dataAttributeAction="'list'"
            entryShape="{ a: 'number', b: 'text' }"
        />
    `);
});

test("throws error if entryShape contains reserved key '_id'", async () => {
    await testBuilderListFaultyProps(`
        <BuilderList
            dataAttributeAction="'list'"
            entryShape="{ _id: 'number' }"
            defaultValue="{ _id: '1' }"
        />
    `);
});
