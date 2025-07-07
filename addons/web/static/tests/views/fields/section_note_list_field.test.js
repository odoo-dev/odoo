import { expect, getFixture, test } from "@odoo/hoot";
import { edit, queryAllTexts } from "@odoo/hoot-dom";
import {
    clickSave,
    contains,
    defineModels,
    fields,
    models,
    mountView,
    onRpc,
} from "@web/../tests/web_test_helpers";

class Child extends models.Model {
    _records = [
        { id: 1, name: "r1", display_type: false, sequence: 1 },
        { id: 2, name: "r2", display_type: false, sequence: 2 },
        { id: 3, name: "A", display_type: "line_section", sequence: 3 },
        { id: 4, name: "A1", display_type: false, sequence: 4 },
        { id: 5, name: "A2", display_type: false, sequence: 5 },
        { id: 6, name: "B", display_type: "line_section", sequence: 6 },
        { id: 7, name: "B1", display_type: false, sequence: 7 },
        { id: 8, name: "B2", display_type: false, sequence: 8 },
        { id: 9, name: "C", display_type: "line_section", sequence: 9 },
        { id: 10, name: "C1", display_type: false, sequence: 10 },
        { id: 11, name: "Ca", display_type: "line_subsection", sequence: 11 },
        { id: 12, name: "Ca1", display_type: false, sequence: 12 },
        { id: 13, name: "Ca2", display_type: false, sequence: 13 },
    ];

    name = fields.Char();
    display_type = fields.Selection({
        default: false,
        selection: [
            ["line_section", "Section"],
            ["line_subsection", "Subsection"],
            ["line_note", "Note"],
        ],
    });
    section_parent_id = fields.Integer();
    sequence = fields.Integer();
}

class Parent extends models.Model {
    _records = [
        {
            id: 1,
            child_ids: Array.from({ length: Child._records.length }, (_, i) => i + 1),
        },
    ];

    child_ids = fields.One2many({ relation: "child" });
}

defineModels([Child, Parent]);

onRpc("has_group", () => true);

test("can add a line in a section", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_list_section_options:eq(0) button").click();
    await contains(".o-dropdown-item:contains(Add a line)").click();
    await edit("A3");
    await contains(getFixture()).click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "A3",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
});

test("can add a line in a subsection", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_list_section_options:last button").click();
    await contains(".o-dropdown-item:contains(Add a line)").click();
    await edit("Ca3");
    await contains(getFixture()).click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
        "Ca3",
    ]);
});

test("can add a subsection in a section", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_list_section_options:eq(0) button").click();
    await contains(".o-dropdown-item:contains(Add a subsection)").click();
    await edit("Aa");
    await contains(getFixture()).click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "Aa",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    expect(".o_section_row:contains(Aa)").toHaveClass("o_section_row_level_2");
});

test("can't add a subsection in a subsection", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    await contains(".o_list_section_options:last button").click();
    expect(".o-dropdown-item:contains(Add a subsection)").toHaveCount(0);
});

test("can't add a subsection if value not in selection", async () => {
    Child._records[10].display_type = "line_section";
    Child._fields.display_type = fields.Selection({
        default: false,
        selection: [["line_section", "Section"], ["line_note", "Note"]],
    });

    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    await contains(".o_list_section_options:last button").click();
    expect(".o-dropdown-item:contains(Add a subsection)").toHaveCount(0);
});

test("can delete sections", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_list_section_options:eq(2) button").click();
    await contains(".o-dropdown-item:contains(Delete)").click();
    expect(queryAllTexts(".o_data_row")).toEqual(["r1", "r2", "A", "A1", "A2", "B", "B1", "B2"]);
});

test("can delete subsections", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_list_section_options:last button").click();
    await contains(".o-dropdown-item:contains(Delete)").click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
    ]);
});

test("can duplicate sections", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_list_section_options:eq(2) button").click();
    await contains(".o-dropdown-item:contains(Duplicate)").click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
});

test("can duplicate subsections", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_list_section_options:last button").click();
    await contains(".o-dropdown-item:contains(Duplicate)").click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
});

test("can resequence records inside sections", async () => {
    onRpc("web_save", ({ args }) => {
        expect.step("web_save");
        expect(args[1]).toEqual({
            child_ids: [
                [1, 4, { sequence: 1 }],
                [1, 1, { sequence: 2 }],
                [1, 2, { sequence: 3 }],
                [1, 3, { sequence: 4 }],
                [1, 6, { sequence: 6 }],
                [1, 7, { sequence: 7 }],
                [1, 8, { sequence: 8 }],
                [1, 9, { sequence: 9 }],
                [1, 10, { sequence: 10 }],
                [1, 11, { sequence: 11 }],
                [1, 5, { sequence: 12 }],
                [1, 13, { sequence: 5 }],
                [1, 12, { sequence: 13 }],
            ],
        });
    });
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });

    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_data_row:eq(3) .o_row_handle").dragAndDrop(".o_data_row:eq(0)");
    expect(queryAllTexts(".o_data_row")).toEqual([
        "A1",
        "r1",
        "r2",
        "A",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_data_row:eq(4) .o_row_handle").dragAndDrop(".o_data_row:eq(10)");
    expect(queryAllTexts(".o_data_row")).toEqual([
        "A1",
        "r1",
        "r2",
        "A",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "A2",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_data_row:last .o_row_handle").dragAndDrop(".o_data_row:eq(4)");
    expect(queryAllTexts(".o_data_row")).toEqual([
        "A1",
        "r1",
        "r2",
        "A",
        "Ca2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "A2",
        "Ca1",
    ]);
    await clickSave();
    expect.verifySteps(["web_save"]);
});

test("resequence can be discarded", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });

    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_data_row:eq(3) .o_row_handle").dragAndDrop(".o_data_row:eq(0)");
    expect(queryAllTexts(".o_data_row")).toEqual([
        "A1",
        "r1",
        "r2",
        "A",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    await contains(".o_form_button_cancel").click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
});

test("can resequence sections", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });

    await contains(".o_data_row:eq(8) .o_row_handle").dragAndDrop(".o_data_row:eq(0)");
    expect(queryAllTexts(".o_data_row")).toEqual(
        ["C", "r1", "r2", "A", "A1", "A2", "B", "B1", "B2", "C1", "Ca", "Ca1", "Ca2"],
        {
            message: "With C on top, B becomes the top section for all records starting from B1",
        }
    );
    await contains(".o_list_section_options:eq(2) button").click();
    await contains(".o-dropdown-item:contains(Delete)").click();
    expect(queryAllTexts(".o_data_row")).toEqual(["C", "r1", "r2", "A", "A1", "A2"], {
        message: "Deleting B will then remove all records starting from B1",
    });
});

test("add note", async () => {
    await mountView({
        type: "form",
        resModel: "parent",
        resId: 1,
        arch: `
            <form>
                <field
                    name="child_ids"
                    widget="section_note_list"
                    options="{'display_type_field': 'display_type', 'section_content_field': 'name', 'note_content_field': 'name'}"
                >
                    <list editable="bottom">
                        <field name="sequence" widget="handle"/>
                        <field name="name"/>
                        <field name="display_type" column_invisible="1"/>
                    </list>
                </field>
            </form>
        `,
    });
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
    ]);
    expect(`.o_note_row`).toHaveCount(0);
    await contains(".o_field_x2many_list_row_add a:last").click();
    await edit("this is a note");
    await contains(getFixture()).click();
    expect(queryAllTexts(".o_data_row")).toEqual([
        "r1",
        "r2",
        "A",
        "A1",
        "A2",
        "B",
        "B1",
        "B2",
        "C",
        "C1",
        "Ca",
        "Ca1",
        "Ca2",
        "this is a note",
    ]);
    expect(`.o_note_row`).toHaveCount(1);
});
