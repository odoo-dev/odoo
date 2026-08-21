import { expect, test } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import { markup } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { ActionHelper } from "@web/views/action_helper";

const help = (picto, text = "Create a Contact") => markup(`${picto}<p>${text}</p>`);

test("no help: default helper, with its pictogram", async () => {
    await mountWithCleanup(ActionHelper, { props: {} });
    expect(".o_nocontent_help svg.o_picto").toHaveCount(1);
    expect(".o_nocontent_help p:eq(0)").toHaveText("No data to display");
});

test("picto element is replaced by its illustration", async () => {
    await mountWithCleanup(ActionHelper, {
        // as `html_sanitize` serializes it
        props: { noContentHelp: help(`<picto name="poof"></picto>`) },
    });
    // the illustration comes first, the rest of the help is left untouched
    expect(".o_nocontent_help > *:eq(0)").toHaveClass("o_picto");
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
    expect(".o_nocontent_help picto").toHaveCount(0);
});

test("self closed picto element does not nest the rest of the help", async () => {
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: help(`<picto name="poof"/>`) },
    });
    expect(".o_nocontent_help > *:eq(0)").toHaveClass("o_picto");
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
    expect(".o_nocontent_help picto").toHaveCount(0);
});

test("picto element accepts the module defining the pictogram", async () => {
    // `web` is the default one, hence resolves to the same template
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: help(`<picto name="poof" module="web"/>`) },
    });
    expect(".o_nocontent_help svg.o_picto").toHaveCount(1);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
});

test("picto of an unknown module renders no illustration", async () => {
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: help(`<picto name="poof" module="not_a_module"/>`) },
    });
    expect(".o_nocontent_help svg").toHaveCount(0);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
});

test("picto element without a name renders no illustration", async () => {
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: help(`<picto/>`) },
    });
    expect(".o_nocontent_help svg").toHaveCount(0);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
    expect(".o_nocontent_help picto").toHaveCount(0);
});

test("unknown pictogram renders no illustration", async () => {
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: help(`<picto name="not_a_picto"/>`) },
    });
    expect(".o_nocontent_help svg").toHaveCount(0);
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
    expect(".o_nocontent_help picto").toHaveCount(0);
});

test("help that isn't markup is not interpreted as html", async () => {
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: `<picto name="poof"/>Create a Contact` },
    });
    expect(".o_nocontent_help svg").toHaveCount(0);
    expect(queryOne(".o_nocontent_help")).toHaveText(`<picto name="poof"/>Create a Contact`);
});
