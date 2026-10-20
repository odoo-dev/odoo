import { expect, test } from "@odoo/hoot";
import { contains, makeMockServer, MockServer, mountView } from "@web/../tests/web_test_helpers";
import { definePosModels } from "../data/generate_model_definitions";

definePosModels();

test("the View button of a terminal opens it in a dialog", async () => {
    odoo.pos_session_id = 1;
    odoo.pos_config_id = 1;
    odoo.info = { db: "pos", isEnterprise: true };
    await makeMockServer();
    MockServer.env["pos.payment.terminal"].create({ name: "Kiosk", payment_method_id: 2 });
    await mountView({
        resModel: "pos.payment.method",
        type: "form",
        resId: 2,
        arch: `
            <form>
                <field name="terminal_ids" widget="pos_payment_terminals">
                    <list editable="bottom" open_form_view="True">
                        <field name="name"/>
                    </list>
                    <form>
                        <field name="name"/>
                    </form>
                </field>
            </form>
        `,
    });

    await contains(".o_list_record_open_form_view button").click();
    expect(".o_dialog .o_form_view").toHaveCount(1);
    expect(".o_dialog .o_field_widget[name=name] input").toHaveValue("Kiosk");

    // The terminal is edited with its payment method, which is still open
    await contains(".o_dialog .o_field_widget[name=name] input").edit("Counter");
    await contains(".o_dialog .o_form_button_save").click();
    expect(".o_dialog").toHaveCount(0);
    expect(".o_data_row .o_data_cell[name=name]").toHaveText("Counter");
});
