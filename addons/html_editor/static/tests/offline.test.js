import { Plugin } from "@html_editor/plugin";
import { describe, expect, test } from "@odoo/hoot";
import { click, press, queryAll, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { mockOffline } from "@web/../tests/web_test_helpers";
import { setupEditor } from "./_helpers/editor";
import { getContent } from "./_helpers/selection";
import { expandToolbar } from "./_helpers/toolbar";
import { insertText } from "./_helpers/user_actions";
import { expectElementCount } from "./_helpers/ui_expectations";
import { TranslatePlugin } from "@html_editor/main/translate/translate_plugin";

class OfflineTestPlugin extends Plugin {
    static id = "offlineTest";
    resources = {
        user_commands: [
            {
                id: "localCommand",
                title: "LocalCommand",
                description: "Local command",
                icon: "bug_report",
                run: () => {},
            },
            {
                id: "networkCommand",
                title: "NetworkCommand",
                description: "Network command",
                icon: "cloud",
                isAvailableOffline: false,
                run: () => {},
            },
        ],
        powerbox_items: [
            { categoryId: "offline_test", commandId: "localCommand" },
            { categoryId: "offline_test", commandId: "networkCommand" },
        ],
        powerbox_categories: { id: "offline_test", name: "Offline test" },
    };
}

describe("toolbar", () => {
    test("only network-dependent toolbar buttons are disabled offline", async () => {
        const expectAvailableOffline = (selector) => {
            expect(selector).toHaveAttribute("data-available-offline");
            expect(selector).not.toHaveAttribute("disabled");
        };

        const setOffline = mockOffline();
        await setupEditor("<p><strong>[abc]</strong></p>", {
            config: { includePlugins: [TranslatePlugin] },
        });
        await waitFor(".o-we-toolbar");
        await expandToolbar();
        await setOffline(true);

        const toolbarButtonNames = [
            "bold",
            "italic",
            "underline",
            "strikethrough",
            "remove_format",
            "font_type",
            "font_size",
            "list_selector",
            "text_align",
            "link",
        ];
        for (const name of toolbarButtonNames) {
            expectAvailableOffline(`.o-we-toolbar button[name='${name}']`);
        }
        expectAvailableOffline(".o-we-toolbar .o-select-color-foreground");
        expectAvailableOffline(".o-we-toolbar .o-select-color-background");

        await click(".o-we-toolbar button[name='list_selector']");
        await animationFrame();
        for (const name of ["bulleted_list", "numbered_list", "checklist"]) {
            expectAvailableOffline(`.o-we-toolbar-dropdown button[name='${name}']`);
        }

        await click(".o-we-toolbar button[name='text_align']");
        await animationFrame();
        for (const title of ["Left align", "Center align", "Right align", "Justify"]) {
            expectAvailableOffline(`.o-we-toolbar-dropdown button[title='${title}']`);
        }

        const translateButton = ".o-we-toolbar button[name='translate']";
        expect(translateButton).not.toHaveAttribute("data-available-offline");
        expect(translateButton).toHaveAttribute("disabled");
    });
});

describe("powerbox", () => {
    test("commands respect offline availability", async () => {
        const setOffline = mockOffline();
        const { el, editor } = await setupEditor("<p>ab[]</p>", {
            config: { includePlugins: [OfflineTestPlugin] },
        });
        await setOffline(true);
        await insertText(editor, "/NetworkCommand");
        await animationFrame();
        expect(".o-we-powerbox").toHaveCount(0);
        expect(getContent(el)).toBe("<p>ab/NetworkCommand[]</p>");

        await insertText(editor, " /LocalCommand");
        await expectElementCount(".o-we-powerbox .o-we-command", 1);
        await press("Escape");

        await setOffline(false);
        await insertText(editor, " /NetworkCommand");
        await expectElementCount(".o-we-powerbox .o-we-command", 1);
    });
});

describe("power buttons", () => {
    test("power buttons respect offline availability", async () => {
        const setOffline = mockOffline();
        const { editor } = await setupEditor("<p>[]<br></p>");
        await waitFor(".o_we_power_buttons");
        await setOffline(true);

        const powerButtonDefinitions = editor.getResource("power_buttons");
        const powerButtonElements = queryAll(".power_button");
        expect(powerButtonElements).toHaveLength(powerButtonDefinitions.length);
        for (const [index, definition] of powerButtonDefinitions.entries()) {
            const command = editor.shared.userCommand.getCommand(definition.commandId);
            const button = powerButtonElements[index];
            const isAvailableOffline = command.isAvailableOffline !== false;
            expect(button.hasAttribute("data-available-offline")).toBe(isAvailableOffline);
            expect(button.disabled).toBe(!isAvailableOffline);
        }

        await setOffline(false);
        expect(".power_button.o_disabled_offline").toHaveCount(0);
    });
});
