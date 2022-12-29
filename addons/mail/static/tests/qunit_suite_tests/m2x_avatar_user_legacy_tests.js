/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";
import { dom } from "web.test_utils";

QUnit.module("mail", {}, function () {
    QUnit.module("M2XAvatarUserLegacy");

    QUnit.skipRefactoring("many2many_avatar_user widget in form view", async function (assert) {
        assert.expect(2);

        const pyEnv = await startServer();
        const resPartnerId1 = pyEnv["res.partner"].create({ display_name: "Partner 1" });
        const resUsersId1 = pyEnv["res.users"].create({ name: "Mario", partner_id: resPartnerId1 });
        const m2xAvatarUserId1 = pyEnv["m2x.avatar.user"].create({ user_ids: [resUsersId1] });
        const views = {
            "m2x.avatar.user,false,form":
                '<form js_class="legacy_form"><field name="user_ids" widget="many2many_avatar_user"/></form>',
        };
        const { openView } = await start({
            serverData: { views },
        });
        await openView({
            res_model: "m2x.avatar.user",
            res_id: m2xAvatarUserId1,
            views: [[false, "form"]],
        });

        await dom.click(
            document.querySelector(".o_field_many2manytags.avatar .badge .o_m2m_avatar")
        );
        assert.containsOnce(document.body, ".o-mail-chat-window", "Chat window should be opened");
        assert.strictEqual(
            document.querySelector(".o-mail-chat-window-header-name").textContent,
            "Partner 1",
            "First chat window should be related to partner 1"
        );
    });
});
