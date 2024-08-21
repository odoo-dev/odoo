import { mailModels } from "@mail/../tests/mail_test_helpers";
import { expect, test } from "@odoo/hoot";
import { click, edit, press, queryOne, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { clickSave, defineModels, fields, models, mountView, onRpc } from "@web/../tests/web_test_helpers";


class Mailing extends models.Model {
    _name = "mailing.mailing";

    name = fields.Char({ string: "Display name" });
    subject = fields.Char({ string: "subject" });
    mailing_model_id = fields.Many2one({ string: "Recipients", relation: "ir.model" });
    mailing_model_name = fields.Char({ string: "Recipients Model Nam" });
    mailing_filter_id = fields.Many2one({ string: "Filters", relation: "mailing.filter" });
    mailing_domain = fields.Char({ string: "Domain" });
    mailing_filter_domain = fields.Char({
        string: "Domain",
        related: "mailing_filter_id.mailing_domain",
    });

    mailing_filter_count = fields.Integer({ string: "filter Count" });

    _onChanges = {
        mailing_filter_id: () => {},
    };
    _records = [
        {
            id: 1,
            name: "Belgian Event promotion",
            subject: "Early bird discount for Belgian Events! Register Now!",
            mailing_model_id: 1,
            mailing_model_name: "event",
            mailing_domain: '[["country","=","be"]]',
            mailing_filter_id: 1,
            mailing_filter_count: 1,
            mailing_filter_domain: '[["country","=","be"]]',
        },
        {
            id: 2,
            name: "New Users Promotion",
            subject: "Early bird discount for new users! Register Now!",
            mailing_model_id: 1,
            mailing_filter_count: 1,
            mailing_model_name: "event",
            mailing_domain: '[["new_user","=",True]]',
            mailing_filter_domain: '[["new_user","=",True]]',
        },
    ];
}

class IrModel extends models.Model {
    _name = "ir.model";

    name = fields.Char({ string: "Display name" });
    model = fields.Char({ string: "Model" });

    _records = [
        {
            id: 1,
            name: "Event",
            model: "event",
        },
        {
            id: 2,
            name: "Partner",
            model: "partner",
        },
    ];
}

class MailFilter extends models.Model {
    _name = "mailing.filter";

    name = fields.Char({ string: "Name" });
    mailing_domain = fields.Char({ string: "Mailing Domain" });
    mailing_model_id = fields.Many2one({ string: "Recipients Model", relation: "ir.model" });

    _records = [
        {
            id: 1,
            name: "Belgian Events",
            mailing_domain: '[["country","=","be"]]',
            mailing_model_id: 1,
        },
    ];
}

defineModels({ ...mailModels, Mailing, IrModel, MailFilter });

test.debug("create favorite filter", async () => {
    onRpc("mailing.filter", "create", ({ args }) => {
        expect.step("create");

        expect(args[0][0]).toEqual({
            name: "event promo - new users",
            mailing_model_id: 1,
            mailing_domain: '[["new_user","=",True]]',
        });
    });
    await mountView({
        type: "form",
        resModel: "mailing.mailing",
        resId: 2,
        arch: `<form>
                    <field name="display_name"/>
                    <field name="subject"/>
                    <field name="mailing_domain"/>
                    <field name="mailing_model_name" invisible="1"/>
                    <field name="mailing_model_id"/>
                    <field name="mailing_filter_count"/>
                    <field name="mailing_filter_domain" invisible="1"/>
                    <field name="mailing_filter_id"
                        widget="mailing_filter"
                        options="{'no_create': '1', 'no_open': '1', 'domain_field': 'mailing_domain', 'model': 'mailing_model_id'}"/>
                </form>`,
    });

    queryOne(".o_field_mailing_filter input").autocomplete = "widget";
    expect(".o_mass_mailing_remove_filter").not.toBeVisible({
        message: "should hide the option to remove filter if no filter is set",
    });
    expect(".o_mass_mailing_save_filter_container").toBeVisible({
        message: "should have option to save filter if no filter is set",
    });
    click(".o_field_mailing_filter input");
    await animationFrame();
    expect(".o_field_mailing_filter .dropdown li.ui-menu-item").toHaveCount(2, {
        message: "there should be only one existing filter and a search more btn",
    });

    // create a new filter
    click(".o_mass_mailing_add_filter");
    await waitFor(".o_mass_mailing_filter_name");
    click(".o_mass_mailing_filter_name");
    edit("event promo - new users");
    press("Enter");
    await animationFrame();
    expect.verifySteps(["create"]);

    // check if filter is set correctly
    expect(".o_field_mailing_filter input").toHaveValue("event promo - new users", {
        message: "saved filter should be set automatically",
    });

    await animationFrame();
    expect(".o_mass_mailing_remove_filter").toBeVisible({
        message: "should have option to remove filter if filter is already set",
    });
    expect(".o_mass_mailing_save_filter_container").not.toBeVisible({
        message: "should not have option to save filter if filter is already set",
    });

    click(".o_field_mailing_filter input");
    await animationFrame();
    expect(".o_field_mailing_filter .dropdown li.ui-menu-item").toHaveCount(3, {
        message: "there should be two existing filters and a search more btn",
    });

    await clickSave();
    expect.verifySteps([]);
});
