/** @odoo-module **/

import { start, startServer } from "@mail/../tests/helpers/test_utils";

import { getFixture } from "@web/../tests/helpers/utils";

let target;

QUnit.module("mail", (hooks) => {
    hooks.beforeEach(async () => {
        target = getFixture();
    });

    QUnit.module("components", {}, function () {
        QUnit.module("chatter", {}, function () {
            QUnit.module("chatter_tests.js");

            QUnit.skipRefactoring(
                "should not display subject when subject is the same as the thread name",
                async function (assert) {
                    assert.expect(1);

                    const pyEnv = await startServer();
                    const resPartnerId1 = pyEnv["res.partner"].create({
                        name: "Salutations, voyageur",
                    });
                    pyEnv["mail.message"].create({
                        body: "not empty",
                        model: "res.partner",
                        res_id: resPartnerId1,
                        subject: "Salutations, voyageur",
                    });
                    const { openView } = await start();
                    await openView({
                        res_id: resPartnerId1,
                        res_model: "res.partner",
                        views: [[false, "form"]],
                    });

                    assert.containsNone(target, ".o-mail-message-subject");
                }
            );
        });
    });
});
