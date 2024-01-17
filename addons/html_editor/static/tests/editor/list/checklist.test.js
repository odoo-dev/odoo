/** @odoo-module */

import { test } from "@odoo/hoot";
import { testEditor } from "../../helpers";
import { unformat } from "../../utils";

function click(el, options) {
    throw new Error("need a proper implementation");
}

test.todo("should do nothing if do not click on the checkbox", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li>1</li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[0];
            await click(li, { clientX: li.getBoundingClientRect().left + 10 });
        },
        contentAfter: unformat(`
            <ul class="o_checklist">
                <li>1</li>
            </ul>`),
    });
});

test.todo("should check a simple item", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li>1</li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[0];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
            <ul class="o_checklist">
                <li class="o_checked">1</li>
            </ul>`),
    });
});

test.todo("should uncheck a simple item", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li class="o_checked">1</li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[0];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
                <ul class="o_checklist">
                    <li>1</li>
                </ul>`),
    });
});

test.todo("should check an empty item", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
                <ul class="o_checklist">
                    <li><br></li>
                </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[0];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
            <ul class="o_checklist">
                <li class="o_checked"><br></li>
            </ul>`),
    });
});

test.todo("should uncheck an empty item", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li><br></li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[0];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
                <ul class="o_checklist">
                    <li class="o_checked"><br></li>
                </ul>`),
    });
});

test.todo("should check a nested item and the previous checklist item used as title", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li>2</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">2.1</li>
                        <li>2.2</li>
                    </ul>
                </li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[2];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
            <ul class="o_checklist">
                <li>2</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">2.1</li>
                        <li class="o_checked">2.2</li>
                    </ul>
                </li>
            </ul>`),
    });
});

test.todo(
    "should uncheck a nested item and the previous checklist item used as title",
    async () => {
        await testEditor({
            removeCheckIds: true,
            contentBefore: unformat(`
            <ul class="o_checklist">
                <li class="o_checked">2</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">2.1</li>
                        <li class="o_checked">2.2</li>
                    </ul>
                </li>
            </ul>`),
            stepFunction: async (editor) => {
                const lis = editor.editable.querySelectorAll(
                    '.o_checklist > li:not([class^="oe-nested"])'
                );
                const li = lis[2];
                await click(li, { clientX: li.getBoundingClientRect().left - 10 });
            },
            contentAfter: unformat(`
            <ul class="o_checklist">
                <li class="o_checked">2</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">2.1</li>
                        <li>2.2</li>
                    </ul>
                </li>
            </ul>`),
        });
    }
);

test.todo("should check a nested item and the wrapper wrapper title", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
                <ul class="o_checklist">
                    <li>3</li>
                    <li class="oe-nested">
                        <ul class="o_checklist">
                            <li>3.1</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">3.2.1</li>
                                    <li>3.2.2</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[3];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
                <ul class="o_checklist">
                    <li>3</li>
                    <li class="oe-nested">
                        <ul class="o_checklist">
                            <li>3.1</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">3.2.1</li>
                                    <li class="o_checked">3.2.2</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
    });
});

test.todo("should uncheck a nested item and the wrapper wrapper title", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
                <ul class="o_checklist">
                    <li class="o_checked">3</li>
                    <li class="oe-nested">
                        <ul class="o_checklist">
                            <li class="o_checked">3.1</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">3.1.1</li>
                                    <li class="o_checked">3.1.2</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[3];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
                <ul class="o_checklist">
                    <li class="o_checked">3</li>
                    <li class="oe-nested">
                        <ul class="o_checklist">
                            <li class="o_checked">3.1</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">3.1.1</li>
                                    <li>3.1.2</li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>`),
    });
});

test.todo("should check all nested checklist item", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
                    <ul class="o_checklist">
                        <li>3</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li>3.1</li>
                                <li class="oe-nested">
                                    <ul class="o_checklist">
                                        <li class="o_checked">3.1.1</li>
                                        <li>3.1.2</li>
                                    </ul>
                                </li>
                                <li class="oe-nested">
                                    <ul class="o_checklist">
                                        <li class="o_checked">3.2.1</li>
                                        <li>3.2.2</li>
                                    </ul>
                                </li>
                                <li>3.3</li>
                            </ul>
                        </li>
                    </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[0];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
                <ul class="o_checklist">
                    <li class="o_checked">3</li>
                    <li class="oe-nested">
                        <ul class="o_checklist">
                            <li>3.1</li>
                            <li class="oe-nested">
                                <ul class="o_checklist">
                                    <li class="o_checked">3.1.1</li>
                                    <li>3.1.2</li>
                                    <li class="o_checked">3.2.1</li>
                                    <li>3.2.2</li>
                                </ul>
                            </li>
                            <li>3.3</li>
                        </ul>
                    </li>
                </ul>`),
    });
});

test.todo("should uncheck all nested checklist item", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li class="o_checked">3</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">3.1</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">3.1.1</li>
                                <li class="o_checked">3.1.2</li>
                            </ul>
                        </li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">3.2.1</li>
                                <li class="o_checked">3.2.2</li>
                            </ul>
                        </li>
                        <li class="o_checked">3.3</li>
                    </ul>
                </li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[0];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
            <ul class="o_checklist">
                <li>3</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">3.1</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">3.1.1</li>
                                <li class="o_checked">3.1.2</li>
                                <li class="o_checked">3.2.1</li>
                                <li class="o_checked">3.2.2</li>
                            </ul>
                        </li>
                        <li class="o_checked">3.3</li>
                    </ul>
                </li>
            </ul>`),
    });
});

test.todo("should check all nested checklist item and update wrapper title", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li>3</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li>3.1</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">3.2.1</li>
                                <li>3.2.2</li>
                            </ul>
                        </li>
                    </ul>
                </li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[1];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
            <ul class="o_checklist">
                <li>3</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">3.1</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">3.2.1</li>
                                <li>3.2.2</li>
                            </ul>
                        </li>
                    </ul>
                </li>
            </ul>`),
    });
});

test.todo("should uncheck all nested checklist items and update wrapper title", async () => {
    await testEditor({
        removeCheckIds: true,
        contentBefore: unformat(`
            <ul class="o_checklist">
                <li class="o_checked">3</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li class="o_checked">3.1</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">3.2.1</li>
                                <li class="o_checked">3.2.2</li>
                            </ul>
                        </li>
                    </ul>
                </li>
            </ul>`),
        stepFunction: async (editor) => {
            const lis = editor.editable.querySelectorAll(
                '.o_checklist > li:not([class^="oe-nested"])'
            );
            const li = lis[1];
            await click(li, { clientX: li.getBoundingClientRect().left - 10 });
        },
        contentAfter: unformat(`
            <ul class="o_checklist">
                <li class="o_checked">3</li>
                <li class="oe-nested">
                    <ul class="o_checklist">
                        <li>3.1</li>
                        <li class="oe-nested">
                            <ul class="o_checklist">
                                <li class="o_checked">3.2.1</li>
                                <li class="o_checked">3.2.2</li>
                            </ul>
                        </li>
                    </ul>
                </li>
            </ul>`),
    });
});
