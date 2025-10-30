import { contains, dragenterFiles, dropFiles, scroll } from "@web/../tests/utils";
import { registry } from "@web/core/registry";
// import { SubChannelList } from "@mail/discuss/core/public_web/sub_channel_list";

function isInViewPort() {
    const parent = document.querySelector(".o-mail-ActionPanel");
    const child = document.querySelector(".o-mail-SubChannelList-loadMore");
    let inViewPort = false;
    if (parent && child) {
        const childRect = child.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        inViewPort =
            childRect.top <= parentRect.top
                ? parentRect.top - childRect.top <= childRect.height
                : childRect.bottom - parentRect.bottom <= childRect.height;
    }
    return inViewPort;
}
function debugScroll(label) {
    const container = document.querySelector(".o-mail-ActionPanel:has(.o-mail-SubChannelList)");
    if (!container) {
        console.warn(`[${label}] Panel not found`);
        return;
    }
    console.warn(
        `[${label}]`,
        JSON.stringify(
            {
                scrollTop: container.scrollTop,
                scrollHeight: container.scrollHeight,
                clientHeight: container.clientHeight,
                isInViewPort: isInViewPort(),
                atBottom:
                    Math.abs(
                        container.scrollHeight - container.clientHeight - container.scrollTop
                    ) < 2,
                count: document.querySelectorAll(".o-mail-SubChannelPreview").length,
            },
            null,
            2
        )
    );
}

async function debugScrollBottom(sel, label) {
    debugScroll(label);
    await scroll(sel, "bottom");
    debugScroll(label);
}

/********************************************************/
/******************** FIRST TOUR ************************/
/********************************************************/

// import { status } from "@odoo/owl";

// import { Deferred } from "@web/core/utils/concurrency";
// import { patch } from "@web/core/utils/patch";
// import { effect } from "@web/core/utils/reactive";

// let waitForLoadMoreToDisappearDef;
registry.category("web_tour.tours").add("test_discuss_sub_channel_search", {
    steps: () => [
        {
            trigger: "body",
            run() {
                // patch(SubChannelList.prototype, {
                //     setup() {
                //         super.setup(...arguments);
                //         effect(
                //             (state) => {
                //                 if (status(this) === "destroyed") {
                //                     return;
                //                 }
                //                 if (!state.isVisible) {
                //                     waitForLoadMoreToDisappearDef?.resolve();
                //                 }
                //             },
                //             [this.loadMoreState]
                //         );
                //     },
                // });
            },
        },
        {
            trigger: "button[title='Threads']",
            run: "click",
        },
        {
            trigger: ".o-mail-SubChannelList",
            async run() {
                // 30 newest sub channels are loaded initially.
                for (let i = 99; i > 69; i--) {
                    await contains(".o-mail-SubChannelPreview", { text: `Sub Channel ${i}` });
                    await contains(".o-mail-SubChannelPreview", { count: 30 });
                }
            },
        },
        {
            trigger: ".o-mail-ActionPanel:has(.o-mail-SubChannelList) .o_searchview_input",
            run: "edit Sub Channel 10",
        },
        {
            trigger:
                ".o-mail-ActionPanel:has(.o-mail-SubChannelList) button[aria-label='Search button']",
            run: "click",
        },
        {
            trigger: ".o-mail-SubChannelPreview:contains(Sub Channel 10)",
            async run() {
                await contains(".o-mail-SubChannelPreview", { count: 1 });
                // waitForLoadMoreToDisappearDef = new Deferred();
            },
        },
        {
            trigger: ".o_searchview_input",
            run: "clear",
        },
        {
            trigger: ".o-mail-SubChannelPreview:contains(Sub Channel 99)",
            async run() {
                await contains(".o-mail-SubChannelPreview", { count: 31 });
                // Already fetched sub channels are shown in addition to the one
                // that was fetched during the search.
                for (let i = 99; i > 69; i--) {
                    await contains(".o-mail-SubChannelPreview", {
                        text: `Sub Channel ${i}`,
                    });
                }
                await contains(".o-mail-SubChannelPreview", { text: `Sub Channel 10` });
                await scroll(".o-mail-ActionPanel:has(.o-mail-SubChannelList)", "bottom");
            },
        },
        {
            trigger: ".o-mail-SubChannelPreview:contains(Sub Channel 40)",
            async run() {
                await contains(".o-mail-SubChannelPreview", { count: 61 });
                for (let i = 99; i > 39; i--) {
                    await contains(".o-mail-SubChannelPreview", {
                        text: `Sub Channel ${i}`,
                    });
                }
                await debugScrollBottom(
                    ".o-mail-ActionPanel:has(.o-mail-SubChannelList)",
                    "Scroll #2 lazy-load"
                );
            },
        },
        {
            trigger: ".o-mail-SubChannelPreview:contains(Sub Channel 11)",
            async run() {
                await contains(".o-mail-SubChannelPreview", { count: 90 });
                for (let i = 99; i > 9; i--) {
                    await contains(".o-mail-SubChannelPreview", {
                        text: `Sub Channel ${i}`,
                    });
                }
                await debugScrollBottom(
                    ".o-mail-ActionPanel:has(.o-mail-SubChannelList)",
                    "Scroll #3 lazy-load"
                );
            },
        },
        {
            trigger: ".o-mail-SubChannelPreview:contains(Sub Channel 0)",
            async run() {
                await contains(".o-mail-SubChannelPreview", { count: 100 });
                for (let i = 99; i > 0; i--) {
                    await contains(".o-mail-SubChannelPreview", {
                        text: `Sub Channel ${i}`,
                    });
                }
                // Final state debug
                debugScroll(".o-mail-ActionPanel:has(.o-mail-SubChannelList)", "Final state");
            },
        },
    ],
});

registry.category("web_tour.tours").add("create_thread_for_attachment_without_body", {
    steps: () => [
        {
            content: "Open general channel",
            trigger: '.o-mail-DiscussSidebarChannel-itemName:contains("general")',
            run: "click",
        },
        {
            content: "Drop a file",
            trigger: ".o-mail-DiscussContent-main",
            async run() {
                const files = [new File(["hi there"], "file2.txt", { type: "text/plain" })];
                await dragenterFiles(".o-mail-DiscussContent-main", files);
                await dropFiles(".o-Dropzone", files);
            },
        },
        {
            trigger: '.o-mail-AttachmentContainer:not(.o-isUploading):contains("file2.txt")',
        },
        {
            content: "Click on send button",
            trigger: ".o-mail-Composer-mainActions [title='Send']:enabled",
            run: "click",
        },
        {
            content: "Hover on attachment",
            trigger:
                '.o-mail-Message:not(:has(.o-mail-Message-pendingProgress)) .o-mail-AttachmentContainer:contains("file2.txt")',
            run: "hover",
        },
        {
            content: "Click on expand button",
            trigger: '.o-mail-Message [title="Expand"]',
            run: "click",
        },
        {
            content: "Create a new thread",
            trigger: '.o-dropdown-item:contains("Create Thread")',
            run: "click",
        },
        {
            content: "Check a new thread is created",
            trigger: '.o-mail-Discuss:contains("New Thread")',
        },
    ],
});
