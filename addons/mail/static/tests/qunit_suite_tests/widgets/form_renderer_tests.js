/** @odoo-module **/

import { click, start, startServer } from "@mail/../tests/helpers/test_utils";

QUnit.skipRefactoring(
    "read more/less links are not duplicated when switching from read to edit mode",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({});
        pyEnv["mail.message"].create({
            author_id: partnerId,
            // "data-o-mail-quote" added by server is intended to be compacted in read more/less blocks
            body: `
                <div>
                    Dear Joel Willis,<br>
                    Thank you for your enquiry.<br>
                    If you have any questions, please let us know.
                    <br><br>
                    Thank you,<br>
                    <span data-o-mail-quote="1">-- <br data-o-mail-quote="1">
                        System
                    </span>
                </div>`,
            model: "res.partner",
            res_id: partnerId,
        });
        const views = {
            "res.partner,false,form": `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>`,
        };
        const { openView } = await start({ serverData: { views } });
        const openViewAction = {
            res_model: "res.partner",
            res_id: partnerId,
            views: [[false, "form"]],
        };
        await openView(openViewAction);
        assert.containsOnce(document.body, ".o-mail-chatter");
        assert.containsOnce(document.body, ".o-mail-message");
        assert.containsOnce(document.body, ".o_MessageView_readMoreLess");
    }
);

QUnit.skipRefactoring(
    "read more links becomes read less after being clicked",
    async function (assert) {
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({});
        pyEnv["mail.message"].create([
            {
                author_id: partnerId,
                // "data-o-mail-quote" added by server is intended to be compacted in read more/less blocks
                body: `
                    <div>
                        Dear Joel Willis,<br>
                        Thank you for your enquiry.<br>
                        If you have any questions, please let us know.
                        <br><br>
                        Thank you,<br>
                        <span data-o-mail-quote="1">-- <br data-o-mail-quote="1">
                            System
                        </span>
                    </div>`,
                model: "res.partner",
                res_id: partnerId,
            },
        ]);
        const views = {
            "res.partner,false,form": `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>`,
        };
        const { openView } = await start({ serverData: { views } });
        const openViewAction = {
            res_model: "res.partner",
            res_id: partnerId,
            views: [[false, "form"]],
        };
        await openView(openViewAction);
        assert.containsOnce(document.body, ".o-mail-chatter");
        assert.containsOnce(document.body, ".o-mail-message");
        assert.containsOnce(document.body, ".o_MessageView_readMoreLess");
        assert.strictEqual(
            document.querySelector(".o_MessageView_readMoreLess").textContent,
            "Read More"
        );

        document.querySelector(".o_MessageView_readMoreLess").click();
        assert.strictEqual(
            document.querySelector(".o_MessageView_readMoreLess").textContent,
            "Read Less"
        );
    }
);

QUnit.skipRefactoring(
    "[TECHNICAL] unfolded read more/less links should not fold on message click besides those button links",
    async function (assert) {
        // message click triggers a re-render. Before writing of this test, the
        // insertion of read more/less links were done during render. This meant
        // any re-render would re-insert the read more/less links. If some button
        // links were unfolded, any re-render would fold them again.
        //
        // This previous behavior is undesirable, and results to bothersome UX
        // such as inability to copy/paste unfolded message content due to click
        // from text selection automatically folding all read more/less links.
        const pyEnv = await startServer();
        const partnerId = pyEnv["res.partner"].create({ display_name: "Someone" });
        pyEnv["mail.message"].create({
            author_id: partnerId,
            // "data-o-mail-quote" added by server is intended to be compacted in read more/less blocks
            body: `
                <div>
                    Dear Joel Willis,<br>
                    Thank you for your enquiry.<br>
                    If you have any questions, please let us know.
                    <br><br>
                    Thank you,<br>
                    <span data-o-mail-quote="1">-- <br data-o-mail-quote="1">
                        System
                    </span>
                </div>
            `,
            model: "res.partner",
            res_id: partnerId,
        });
        const views = {
            "res.partner,false,form": `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>`,
        };
        const { openView } = await start({ serverData: { views } });
        await openView({
            res_model: "res.partner",
            res_id: partnerId,
            views: [[false, "form"]],
        });
        assert.strictEqual(
            document.querySelector(".o_MessageView_readMoreLess").textContent,
            "Read More"
        );

        document.querySelector(".o_MessageView_readMoreLess").click();
        assert.strictEqual(
            document.querySelector(".o_MessageView_readMoreLess").textContent,
            "Read Less"
        );

        await click(".o-mail-message");
        assert.strictEqual(
            document.querySelector(".o_MessageView_readMoreLess").textContent,
            "Read Less"
        );
    }
);
