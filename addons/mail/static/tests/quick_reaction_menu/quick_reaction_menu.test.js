import {
    click,
    contains,
    defineMailModels,
    insertText,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { QuickReactionMenu } from "@mail/core/common/quick_reaction_menu";
import { describe, test } from "@odoo/hoot";
import { animationFrame, press } from "@odoo/hoot-dom";

describe.current.tags("desktop");
defineMailModels();

test("can toggle reaction from quick reaction menu", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await click("[title='Add a Reaction']");
    await click(".o-mail-QuickReactionMenu button[data-codepoints='👍']");
    await contains(".o-mail-MessageReaction-twemoji[data-codepoints='👍']");
    await click(".o-mail-Message-actions [title='Add a Reaction']");
    await click(".o-mail-QuickReactionMenu button[data-codepoints='👍']");
    await contains(".o-mail-MessageReaction-twemoji[data-codepoints='👍']", { count: 0 });
});

test("toggle emoji picker from quick reaction menu", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await click("[title='Add a Reaction']");
    await click(".o-mail-QuickReactionMenu [title='Toggle Emoji Picker']");
    await contains(".o-EmojiPicker");
    await click(".o-mail-QuickReactionMenu [title='Toggle Emoji Picker']");
    await contains(".o-EmojiPicker", { count: 0 });
});

test("show default emojis when no frequent emojis are available", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await click("[title='Add a Reaction']");
    await contains(".o-mail-QuickReactionMenu-emoji", {
        count: QuickReactionMenu.DEFAULT_EMOJIS.length,
    });
    for (const emoji of QuickReactionMenu.DEFAULT_EMOJIS) {
        await contains(`.o-mail-QuickReactionMenu-emoji[data-codepoints='${emoji}']`);
    }
    await click(".o-mail-QuickReactionMenu [title='Toggle Emoji Picker']");
    await click(".o-Emoji[data-codepoints='🤢']");
    await click(".o-mail-Message-actions [title='Add a Reaction']");
    const emojiToLook = QuickReactionMenu.DEFAULT_EMOJIS.at(-1);
    await contains(`.o-mail-QuickReactionMenu-emoji[data-codepoints='${emojiToLook}']`, {
        count: 0,
    });
    await contains(".o-mail-QuickReactionMenu-emoji[data-codepoints='🤢']");
});

test("navigate quick reaction menu using tab key", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await click("[title='Add a Reaction']");
    for (const emoji of QuickReactionMenu.DEFAULT_EMOJIS) {
        await contains(`.o-mail-QuickReactionMenu-emoji[data-codepoints='${emoji}']:focus`);
        await press("Tab");
    }
    await contains(".o-mail-QuickReactionMenu-emojiPicker:focus");
});

test("navigate quick reaction menu using arrow keys", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await click("[title='Add a Reaction']");
    for (const emoji of QuickReactionMenu.DEFAULT_EMOJIS) {
        await contains(`.o-mail-QuickReactionMenu-emoji[data-codepoints='${emoji}']:focus`);
        await press("ArrowRight");
    }
    await contains(".o-mail-QuickReactionMenu-emojiPicker:focus");
    await press("ArrowLeft");
    for (const emoji of [...QuickReactionMenu.DEFAULT_EMOJIS].reverse()) {
        await contains(`.o-mail-QuickReactionMenu-emoji:focus[data-codepoints='${emoji}']`);
        await press("ArrowLeft");
    }
    await contains(".o-mail-QuickReactionMenu-emojiPicker:focus");
});

test("can quick search emoji from quick reaction", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await click("[title='Add a Reaction']");
    await contains(".o-mail-QuickReactionMenu");
    await press("b");
    await contains(".o-EmojiPicker");
    await contains(".o-EmojiPicker-search input:value('b')");
    for (const ch of [..."roccoli"]) {
        await press(ch);
    }
    await contains(".o-EmojiPicker-search input:value('broccoli')");
    await animationFrame();
    await press("Enter");
    await contains(".o-mail-MessageReaction:text('1') [data-codepoints='🥦']");
});

test.tags("focus required");
test("return focus to thread composer on close", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await contains(".o-mail-Composer-input:focus");
    await click("[title='Add a Reaction']");
    await contains(".o-mail-QuickReactionMenu-emoji:focus[data-codepoints='👍']");
    await press("Enter");
    await contains(".o-mail-MessageReaction:text('1') [data-codepoints='👍']");
    await contains(".o-mail-Composer-input:focus");
});

test.tags("focus required");
test("return focus to message edition composer on close", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "General" });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Hello world!");
    await press("Enter");
    await contains(".o-mail-Composer-input", { value: "" });
    await insertText(".o-mail-Composer-input", "Goodbye world!!");
    await press("Enter");
    await click(".o-mail-Message:last [title='Expand']");
    await click(".o-dropdown-item:text('Edit')");
    await contains(".o-mail-Message .o-mail-Composer-input:focus");
    await click("[title='Add a Reaction']");
    await contains(".o-mail-QuickReactionMenu-emoji:focus[data-codepoints='👍']");
    await press("Enter");
    await contains(".o-mail-MessageReaction:text('1') [data-codepoints='👍']");
    await contains(".o-mail-Message .o-mail-Composer-input:focus");
});
