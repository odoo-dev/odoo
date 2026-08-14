import { expect, test } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import { markup } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { ActionHelper } from "@web/views/action_helper";

test("no help: default helper, with its pictogram", async () => {
    await mountWithCleanup(ActionHelper, { props: {} });
    expect(".o_nocontent_help svg.o_picto").toHaveCount(1);
    expect(".o_nocontent_help p:eq(0)").toHaveText("No data to display");
});

test("picto element is replaced by its illustration", async () => {
    await mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: markup(`<picto name="poof"/><p>Create a Contact</p>`),
        },
    });
    // the illustration comes first, the rest of the help is left untouched
    expect(".o_nocontent_help > *:eq(0)").toHaveClass("o_picto");
    expect(".o_nocontent_help > p").toHaveText("Create a Contact");
});

test("picto element accepts an extra class", async () => {
    await mountWithCleanup(ActionHelper, {
        props: {
            noContentHelp: markup(`<picto name="poof" class="my_picto"/><p>Create a Contact</p>`),
        },
    });
    expect(".o_nocontent_help svg.o_picto").toHaveClass("my_picto");
});

test("help that isn't markup is not interpreted as html", async () => {
    await mountWithCleanup(ActionHelper, {
        props: { noContentHelp: `<picto name="poof"/>Create a Contact` },
    });
    expect(".o_nocontent_help svg").toHaveCount(0);
    expect(queryOne(".o_nocontent_help")).toHaveText(`<picto name="poof"/>Create a Contact`);
});
