import { test, expect } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";
import { toggleCheckList } from "../_helpers/user_actions";
import { MAIN_PLUGINS } from "../../src/plugin_sets";

// @phoenix @todo: ChecklistIdsPlugin
import { Plugin } from "@html_editor/plugin";
class ChecklistIdsPlugin extends Plugin {}

test.todo("should add a unique id on a new checklist", async () => {
    await testEditor({
        contentBefore: "<p>ab[]cd</p>",
        stepFunction: (editor) => {
            toggleCheckList(editor);
            const id = editor.editable.querySelector("li[id^=checkId-]").getAttribute("id");
            expect(editor.editable.innerHTML).toBe(
                `<ul class="o_checklist"><li id="${id}">abcd</li></ul>`
            );
        },
        config: { Plugins: [...MAIN_PLUGINS, ChecklistIdsPlugin] },
    });
});
