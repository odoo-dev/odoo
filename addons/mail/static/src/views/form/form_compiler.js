/** @odoo-module */

import { evaluateExpr } from "@web/core/py_js/py";
import { registry } from "@web/core/registry";
import { SIZES } from "@web/core/ui/ui_service";
import { patch } from "@web/core/utils/patch";
import { append, createElement, setAttributes } from "@web/core/utils/xml";
import { FormCompiler } from "@web/views/form/form_compiler";

function compileChatter(node, params) {
    let hasActivities = false;
    let hasFollowers = false;
    let hasMessageList = false;
    let hasParentReloadOnAttachmentsChanged;
    let hasParentReloadOnFollowersUpdate = false;
    let hasParentReloadOnMessagePosted = false;
    let isAttachmentBoxVisibleInitially = false;
    for (const childNode of node.children) {
        const options = evaluateExpr(childNode.getAttribute("options") || "{}");
        switch (childNode.getAttribute("name")) {
            case "activity_ids":
                hasActivities = true;
                break;
            case "message_follower_ids":
                hasFollowers = true;
                hasParentReloadOnFollowersUpdate = Boolean(options["post_refresh"]);
                isAttachmentBoxVisibleInitially =
                    isAttachmentBoxVisibleInitially || Boolean(options["open_attachments"]);
                break;
            case "message_ids":
                hasMessageList = true;
                hasParentReloadOnAttachmentsChanged = options["post_refresh"] === "always";
                hasParentReloadOnMessagePosted = Boolean(options["post_refresh"]);
                isAttachmentBoxVisibleInitially =
                    isAttachmentBoxVisibleInitially || Boolean(options["open_attachments"]);
                break;
        }
    }
    const chatterContainerXml = createElement("Chatter");
    setAttributes(chatterContainerXml, {
        hasActivities,
        hasFollowers,
        hasMessageList,
        hasParentReloadOnAttachmentsChanged,
        hasParentReloadOnFollowersUpdate,
        hasParentReloadOnMessagePosted,
        isAttachmentBoxVisibleInitially,
        threadId: "__comp__.props.record.model.root.resId or undefined",
        threadModel: "__comp__.props.record.model.root.resModel",
        webRecord: "__comp__.props.record.model.root",
        saveRecord: "() => __comp__.saveButtonClicked and __comp__.saveButtonClicked()",
    });
    const chatterContainerHookXml = createElement("div");
    chatterContainerHookXml.classList.add("o-mail-Form-chatter", "bg-view");
    append(chatterContainerHookXml, chatterContainerXml);
    return chatterContainerHookXml;
}

function compileAttachmentPreview(node, params) {
    const webClientViewAttachmentViewContainerHookXml = createElement("div");
    webClientViewAttachmentViewContainerHookXml.classList.add("o_attachment_preview");
    const webClientViewAttachmentViewContainerXml = createElement("AttachmentView");
    setAttributes(webClientViewAttachmentViewContainerXml, {
        threadId: "__comp__.props.record.model.root.resId or undefined",
        threadModel: "__comp__.props.record.model.root.resModel",
    });
    append(webClientViewAttachmentViewContainerHookXml, webClientViewAttachmentViewContainerXml);
    return webClientViewAttachmentViewContainerHookXml;
}

registry.category("form_compilers").add("chatter_compiler", {
    selector: "div.oe_chatter",
    fn: compileChatter,
});

registry.category("form_compilers").add("attachment_preview_compiler", {
    selector: "div.o_attachment_preview",
    fn: compileAttachmentPreview,
});

patch(FormCompiler.prototype, "mail", {
    compile(node, params) {
        // TODO no chatter if in dialog?
        const res = this._super(node, params);
        const chatterContainerHookXml = res.querySelector(".o-mail-Form-chatter");
        if (!chatterContainerHookXml) {
            return res; // no chatter, keep the result as it is
        }
        const chatterContainerXml = chatterContainerHookXml.querySelector("Chatter");
        setAttributes(chatterContainerXml, {
            hasMessageScrollAdjustInChatter: "false",
            isInFormSheetBg: "false",
            saveRecord: "__comp__.props.saveButtonClicked",
        });
        if (chatterContainerHookXml.parentNode.classList.contains("o_form_sheet")) {
            return res; // if chatter is inside sheet, keep it there
        }
        const formSheetBgXml = res.querySelector(".o_form_sheet_bg");
        const parentXml = formSheetBgXml && formSheetBgXml.parentNode;
        if (!parentXml) {
            return res; // miss-config: a sheet-bg is required for the rest
        }

        const webClientViewAttachmentViewHookXml = res.querySelector(".o_attachment_preview");
        if (webClientViewAttachmentViewHookXml) {
            // in sheet bg (attachment viewer present)
            setAttributes(webClientViewAttachmentViewHookXml, {
                "t-if": `__comp__.hasAttachmentViewer() and __comp__.uiService.size >= ${SIZES.XXL}`,
            });
            const sheetBgChatterContainerHookXml = chatterContainerHookXml.cloneNode(true);
            sheetBgChatterContainerHookXml.classList.add("o-isInFormSheetBg");
            setAttributes(sheetBgChatterContainerHookXml, {
                "t-if": `__comp__.hasAttachmentViewer() and __comp__.uiService.size >= ${SIZES.XXL}`,
            });
            append(formSheetBgXml, sheetBgChatterContainerHookXml);
            const sheetBgChatterContainerXml =
                sheetBgChatterContainerHookXml.querySelector("Chatter");
            setAttributes(sheetBgChatterContainerXml, {
                isInFormSheetBg: "true",
                hasMessageScrollAdjustInChatter: "false",
            });
        }
        // after sheet bg (standard position, either aside or below)
        if (webClientViewAttachmentViewHookXml) {
            setAttributes(chatterContainerHookXml, {
                "t-if": `!(__comp__.hasAttachmentViewer() and __comp__.uiService.size >= ${SIZES.XXL})`,
                "t-attf-class": `{{ __comp__.uiService.size >= ${SIZES.XXL} and !(__comp__.hasAttachmentViewer() and __comp__.uiService.size >= ${SIZES.XXL}) ? "o-aside" : "" }}`,
            });
            setAttributes(chatterContainerXml, {
                isInFormSheetBg: "__comp__.hasAttachmentViewer()",
                hasMessageScrollAdjustInChatter: `__comp__.uiService.size >= ${SIZES.XXL} and !(__comp__.hasAttachmentViewer() and __comp__.uiService.size >= ${SIZES.XXL})`,
            });
        } else {
            setAttributes(chatterContainerXml, {
                isInFormSheetBg: "false",
                hasMessageScrollAdjustInChatter: `__comp__.uiService.size >= ${SIZES.XXL}`,
            });
            setAttributes(chatterContainerHookXml, {
                "t-attf-class": `{{ __comp__.uiService.size >= ${SIZES.XXL} ? "o-aside" : "" }}`,
            });
        }
        append(parentXml, chatterContainerHookXml);
        return res;
    },
});
