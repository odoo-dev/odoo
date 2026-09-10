import { mailModels } from "@mail/../tests/mail_test_helpers";
import { expect, test } from "@odoo/hoot";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";

import {
    contains,
    defineModels,
    fields,
    models,
    mountView,
    onRpc,
} from "@web/../tests/web_test_helpers";

async function editAutocomplete(el, value) {
    await contains(el).edit(value, { confirm: "blur" });
    await advanceTime(250);  // Autocomplete has a debounce time of 250 ms on input
}

const DEFAULT_METADATA = {
    FR_SIRET: {
        label: "France SIRET",
        sequence: 10,
        placeholder: "73282932000074",
    },
};

class Partner extends models.Model {
    _name = "partner";
    _records = [
        {
            id: 1,
            country_code: "FR",
            additional_identifiers: {},
            available_additional_identifiers_metadata: DEFAULT_METADATA,
        },
    ];

    additional_identifiers = fields.Json({ string: "Additional identifiers" });
    country_code = fields.Char({ string: "Country Code" });
    available_additional_identifiers_metadata = fields.Json({
        string: "Available identifiers metadata",
    });

    _views = {
        form: /* xml */ `
            <form>
                <sheet>
                    <field name="country_code" invisible="1"/>
                    <field name="additional_identifiers" widget="additional_identifiers_button" nolabel="1"/>
                    <field name="additional_identifiers" widget="additional_identifiers_list_partner_autocomplete" nolabel="1"/>
                </sheet>
            </form>
        `,
    };
}

defineModels({ ...mailModels, Partner });

onRpc("res.partner", "autocomplete_by_field", () => []);

test.tags("desktop");
test("typing an identifier value without picking a suggestion still commits it", async () => {
    onRpc("web_save", ({ args }) => expect.step(args[1]));

    await mountView({
        type: "form",
        resModel: "partner",
        resId: 1,
    });

    // Add the "France SIRET" identifier row via the dropdown
    await contains(".dropdown-toggle").click();
    await contains(".o-dropdown--menu .o-dropdown-item:contains('France SIRET')").click();
    await advanceTime(100); // flush debouncedCommitChanges (50ms)
    await animationFrame();

    // Type a value directly, without picking a suggestion from the autocomplete dropdown
    await editAutocomplete(
        ".o_additional_identifiers_list .o-autocomplete--input",
        "73282932000074"
    );

    expect(".o_additional_identifiers_list .o-autocomplete--input").toHaveValue(
        "73282932000074"
    );

    // The typed value must be persisted on save, not silently dropped
    await contains(".o_form_button_save").click();
    expect.verifySteps([{ additional_identifiers: { FR_SIRET: "73282932000074" } }]);
});
