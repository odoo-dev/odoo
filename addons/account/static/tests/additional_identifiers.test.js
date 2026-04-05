import { expect, test } from "@odoo/hoot";
import { queryFirst } from "@odoo/hoot-dom";
import {
    contains,
    defineModels,
    fields,
    models,
    mountView,
    onRpc,
} from "@web/../tests/web_test_helpers";

class ResPartner extends models.Model {
    _name = "res.partner";

    additional_identifiers = fields.Json({ string: "Additional identifiers" });
    country_code = fields.Char({ string: "Country Code" });

    _records = [
        {
            id: 1,
            country_code: "FR",
            additional_identifiers: '{"FR_SIRET": "12345"}',
        },
    ];

    _views = {
        form: /* xml */ `
            <form>
                <sheet>
                    <field name="country_code" invisible="1"/>
                    <field name="additional_identifiers" widget="additional_identifiers" nolabel="1"/>
                </sheet>
            </form>
        `,
    };
}

defineModels([ResPartner]);

test.tags("desktop");
test("Form: additional_identifiers widget basic interaction", async () => {
    onRpc("res.partner", "get_identifiers_metadata", (args) => {
        return {
            "FR_SIRET": { label: "France SIRET", country_codes: ["FR"], type: false },
            "FR_SIREN": { label: "France SIRENE", country_codes: ["FR"], type: false },
            "FR_VAT": { label: "France VAT", country_codes: ["FR"], type: "VAT" },
            "GLN": { label: "GLN", country_codes: false, type: false }
        };
    });

    await mountView({
        type: "form",
        resModel: "res.partner",
        resId: 1,
    });

    // Check rendering of stored identifiers
    expect(".o_field_additional_identifiers").toHaveCount(1, { message: "Widget should be rendered" });
    expect(".badge:contains('France SIRET:')").toHaveCount(1, { message: "Stored identifier should be visible" });
    expect(".badge").toHaveText("France SIRET: 12345");

    // Click the "+" button
    await contains(".dropdown > .btn").click();

    // Check dropdown options (VAT is excluded because type === "VAT". Included: FR_SIRET, FR_SIREN, GLN)
    expect(".dropdown-item").toHaveCount(3);

    // Select SIREN
    await contains(".dropdown-item:contains('France SIRENE')").click();

    // Check input is shown
    expect("input[type=text]").toHaveCount(1, { message: "Input field should be rendered" });

    // Edit and save
    await contains("input[type=text]").edit("987654", { confirm: false });
    await contains(".btn-outline-success").click();

    // Verify it is added
    expect(".badge:contains('France SIRENE:')").toHaveCount(1, { message: "Newly saved identifier is shown" });

    // Validate clicking X removes it
    await contains(".badge:contains('France SIRENE:') .fa-times").click();
    expect(".badge:contains('France SIRENE:')").toHaveCount(0, { message: "Identifier deleted" });
});
