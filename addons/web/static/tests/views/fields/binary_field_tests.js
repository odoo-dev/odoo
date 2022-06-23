/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { patch, unpatch } from "@web/core/utils/patch";
import { FileUploader } from "@web/views/fields/file_handler";
import { registerCleanup } from "@web/../tests/helpers/cleanup";
import { makeMockXHR } from "@web/../tests/helpers/mock_services";
import {
    click,
    getFixture,
    makeDeferred,
    nextTick,
    patchWithCleanup,
} from "@web/../tests/helpers/utils";
import { makeView, setupViewRegistries } from "@web/../tests/views/helpers";

let serverData;
let target;

QUnit.module("Fields", (hooks) => {
    hooks.beforeEach(() => {
        target = getFixture();
        serverData = {
            models: {
                partner: {
                    fields: {
                        foo: {
                            string: "Foo",
                            type: "char",
                            default: "My little Foo Value",
                            trim: true,
                        },
                        document: { string: "Binary", type: "binary" },
                        product_id: {
                            string: "Product",
                            type: "many2one",
                            relation: "product",
                            searchable: true,
                        },
                    },
                    records: [
                        {
                            foo: "coucou.txt",
                            document: "coucou==\n",
                        },
                    ],
                },
                product: {
                    fields: {
                        name: { string: "Product Name", type: "char", searchable: true },
                    },
                    records: [
                        {
                            id: 37,
                            display_name: "xphone",
                        },
                        {
                            id: 41,
                            display_name: "xpad",
                        },
                    ],
                },
            },
        };

        setupViewRegistries();
    });

    QUnit.module("BinaryField");

    QUnit.test("BinaryField is correctly rendered", async function (assert) {
        assert.expect(15);

        async function send(data) {
            assert.ok(data instanceof FormData);
            assert.strictEqual(
                data.get("field"),
                "document",
                "we should download the field document"
            );
            assert.strictEqual(
                data.get("data"),
                "coucou==\n",
                "we should download the correct data"
            );

            this.status = 200;
            this.response = new Blob([data.get("data")], { type: "text/plain" });
        }
        const MockXHR = makeMockXHR("", send);

        patchWithCleanup(
            browser,
            {
                XMLHttpRequest: MockXHR,
            },
            { pure: true }
        );

        await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch: `
                <form>
                    <field name="document" filename="foo"/>
                    <field name="foo"/>
                </form>`,
            resId: 1,
        });
        assert.containsOnce(
            target,
            '.o_field_widget[name="document"] a > .fa-download',
            "the binary field should be rendered as a downloadable link in readonly"
        );
        assert.strictEqual(
            target.querySelector('.o_field_widget[name="document"] span').textContent.trim(),
            "coucou.txt",
            "the binary field should display the name of the file in the link"
        );
        assert.strictEqual(
            target.querySelector(".o_field_char").textContent,
            "coucou.txt",
            "the filename field should have the file name as value"
        );

        // Testing the download button in the field
        // We must avoid the browser to download the file effectively
        const prom = makeDeferred();
        const downloadOnClick = (ev) => {
            const target = ev.target;
            if (target.tagName === "A" && "download" in target.attributes) {
                ev.preventDefault();
                document.removeEventListener("click", downloadOnClick);
                prom.resolve();
            }
        };
        document.addEventListener("click", downloadOnClick);
        registerCleanup(() => document.removeEventListener("click", downloadOnClick));
        await click(target.querySelector('.o_field_widget[name="document"] a'));
        await prom;

        await click(target, ".o_form_button_edit");

        assert.containsNone(
            target,
            '.o_field_widget[name="document"] a > .fa-download',
            "the binary field should not be rendered as a downloadable link in edit"
        );
        assert.strictEqual(
            target.querySelector('.o_field_widget[name="document"].o_field_binary span')
                .textContent,
            "coucou.txt",
            "the binary field should display the file name in the input edit mode"
        );
        assert.containsOnce(
            target,
            ".o_field_binary .o_clear_file_button",
            "there shoud be a button to clear the file"
        );
        assert.strictEqual(
            target.querySelector(".o_field_char input").value,
            "coucou.txt",
            "the filename field should have the file name as value"
        );

        await click(target.querySelector(".o_field_binary .o_clear_file_button"));

        assert.isNotVisible(
            target.querySelector(".o_field_binary input"),
            "the input should be hidden"
        );
        assert.containsOnce(
            target,
            ".o_field_binary .o_select_file_button",
            "there should be a button to upload the file"
        );
        assert.strictEqual(
            target.querySelector(".o_field_char input").value,
            "",
            "the filename field should be empty since we removed the file"
        );

        await click(target, ".o_form_button_save");
        assert.containsNone(
            target,
            '.o_field_widget[name="document"] a > .fa-download',
            "the binary field should not render as a downloadable link since we removed the file"
        );
        assert.containsNone(
            target,
            "o_field_widget span",
            "the binary field should not display a filename in the link since we removed the file"
        );
    });

    QUnit.test(
        "binary fields input value is empty when clearing after uploading",
        async function (assert) {
            patch(FileUploader.prototype, "test.FileUploader", {
                async onFileChange(ev) {
                    const file = new File([ev.target.value], ev.target.value + ".txt", {
                        type: "text/plain",
                    });
                    await this._super({
                        target: { files: [file] },
                    });
                },
            });

            await makeView({
                type: "form",
                resModel: "partner",
                serverData,
                arch: `
                    <form>
                        <field name="document" filename="foo"/>
                        <field name="foo"/>
                    </form>`,
                resId: 1,
            });

            await click(target, ".o_form_button_edit");

            const input = target.querySelector(".o_field_binary input");
            // We need to convert the input type since we can't programmatically set
            // the value of a file input. The patch of the onFileChange will create
            // a file object to be used by the component.
            input.setAttribute("type", "text");
            input.value = "fake_file";
            input.dispatchEvent(new InputEvent("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            await nextTick();
            await nextTick();

            assert.strictEqual(
                target.querySelector(".o_field_binary span").textContent,
                "fake_file.txt",
                'displayed value should be changed to "fake_file.txt"'
            );

            await click(target.querySelector(".o_clear_file_button"));

            assert.strictEqual(
                target.querySelector(".o_input_file").value,
                "",
                "input value should be empty"
            );

            unpatch(FileUploader.prototype, "test.FileUploader");
        }
    );

    QUnit.test("BinaryField: option accepted_file_extensions", async function (assert) {
        await makeView({
            serverData,
            type: "form",
            resModel: "partner",
            arch: `
                <form>
                    <field name="document" widget="binary" options="{'accepted_file_extensions': '.dat,.bin'}"/>
                </form>`,
        });
        assert.strictEqual(
            target.querySelector("input.o_input_file").getAttribute("accept"),
            ".dat,.bin",
            "the input should have the correct ``accept`` attribute"
        );
    });

    QUnit.test(
        "BinaryField that is readonly in create mode does not download",
        async function (assert) {
            async function download() {
                assert.step("We shouldn't be getting the file.");
            }
            const MockXHR = makeMockXHR("", download);

            patchWithCleanup(
                browser,
                {
                    XMLHttpRequest: MockXHR,
                },
                { pure: true }
            );

            serverData.models.partner.onchanges = {
                product_id: function (obj) {
                    obj.document = "onchange==\n";
                },
            };

            serverData.models.partner.fields.document.readonly = true;

            await makeView({
                serverData,
                type: "form",
                resModel: "partner",
                arch: `
                    <form>
                        <field name="product_id"/>
                        <field name="document" filename="yooo"/>
                    </form>`,
                resId: 1,
            });

            await click(target, ".o_form_button_create");
            await click(target, ".o_field_many2one[name='product_id'] input");
            await click(
                target.querySelector(".o_field_many2one[name='product_id'] .dropdown-item")
            );

            assert.containsNone(
                target,
                '.o_field_widget[name="document"] a',
                "The link to download the binary should not be present"
            );
            assert.containsNone(
                target,
                '.o_field_widget[name="document"] a > .fa-download',
                "The download icon should not be present"
            );

            assert.verifySteps([], "We shouldn't have passed through steps");
        }
    );
});
