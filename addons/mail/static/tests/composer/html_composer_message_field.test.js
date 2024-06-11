import { setSelection } from "@html_editor/../tests/_helpers/selection";
import { insertText } from "@html_editor/../tests/_helpers/user_actions";
import { FileSelector } from "@html_editor/main/media/file_selector";
import { uploadService } from "@html_editor/main/media/upload_progress_toast/upload_service";
import { HtmlComposerMessageField } from "@mail/views/web/fields/html_composer_message_field/html_composer_message_field";
import { beforeEach, expect, test } from "@odoo/hoot";
import { manuallyDispatchProgrammaticEvent, press, queryAll, queryOne } from "@odoo/hoot-dom";
import { Deferred, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    makeMockServer,
    mockService,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { defineMailModels } from "../mail_test_helpers";

defineMailModels([]);

let htmlEditor;
beforeEach(() => {
    patchWithCleanup(HtmlComposerMessageField.prototype, {
        onEditorLoad(editor) {
            htmlEditor = editor;
            return super.onEditorLoad(...arguments);
        },
    });
});

test("media dialog: upload", async function () {
    const isUploaded = new Deferred();
    patchWithCleanup(FileSelector.prototype, {
        async onUploaded() {
            await super.onUploaded(...arguments);
            isUploaded.resolve();
        },
    });

    mockService("upload", uploadService);

    const { env } = await makeMockServer();
    const resId = env["mail.compose.message"].create({
        display_name: "Some Composer",
        body: "Hello",
        attachment_ids: [],
    });

    let newAttachmentId;
    onRpc("web_save", ({ args }) => {
        expect.step("web_save");
        const createVals = args[1];
        expect(createVals.attachment_ids[0][0]).toBe(4); // link command
        expect(createVals.attachment_ids[0][1]).toBe(newAttachmentId); // on attachment id "5"
    });
    onRpc("/web_editor/attachment/add_data", () => {
        const attachment = {
            name: "test.jpg",
            description: false,
            mimetype: "image/jpeg",
            checksum: "7951a43bbfb08fd742224ada280913d1897b89ab",
            url: false,
            type: "binary",
            res_id: 0,
            res_model: "mail.compose.message",
            public: false,
            access_token: false,
            image_src: "/web/image/1-a0e63e61/test.jpg",
            image_width: 1,
            image_height: 1,
            original_id: false,
        };
        newAttachmentId = env["ir.attachment"].create(attachment);
        attachment.id = newAttachmentId;
        return attachment;
    });

    onRpc("/web/dataset/call_kw/ir.attachment/generate_access_token", () => {
        return ["129a52e1-6bf2-470a-830e-8e368b022e13"];
    });
    await mountView({
        type: "form",
        resId,
        resModel: "mail.compose.message",
        arch: `
        <form>
            <field name="body" type="html" widget="html_composer_message"/>
            <field name="attachment_ids" widget="many2many_binary"/>
        </form>`,
    });

    const anchorNode = queryOne(".odoo-editor-editable p");
    setSelection({ anchorNode, anchorOffset: 0 });

    // Open media dialog
    await animationFrame();
    insertText(htmlEditor, "/image");
    press("Enter");
    await animationFrame();

    // upload test
    const fileInputs = queryAll(".o_select_media_dialog input.d-none.o_file_input");
    const fileB64 =
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
    const fileBytes = new Uint8Array(
        atob(fileB64)
            .split("")
            .map((char) => char.charCodeAt(0))
    );
    // redefine 'files' so we can put mock data in through js
    fileInputs.forEach((input) =>
        Object.defineProperty(input, "files", {
            value: [new File(fileBytes, "test.jpg", { type: "image/jpeg" })],
        })
    );
    fileInputs.forEach((input) => {
        manuallyDispatchProgrammaticEvent(input, "change");
    });
    expect("[name='attachment_ids'] .o_attachment[title='test.jpg']").toHaveCount(0);

    await isUploaded;
    await animationFrame();
    expect("[name='attachment_ids'] .o_attachment[title='test.jpg']").toHaveCount(1);

    await contains(".o_form_button_save").click();
    expect(["web_save"]).toVerifySteps();
});
