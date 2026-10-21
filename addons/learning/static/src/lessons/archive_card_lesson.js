import { _t } from "@web/core/l10n/translation";
import { findTarget } from "../core/dom_target";
import { lessonRegistry } from "./lesson_registry";
import {
    ACTIONS_MENU,
    ACTIONS_MENU_ITEM,
    BACK_TO_LIST,
    DIALOG_CONFIRM,
    FILTER_ITEM,
    FILTERS_TOGGLER,
    LIST_ROW,
    NAME_FIELD,
    SEARCH_FACET,
} from "./common_selectors";

const ARCHIVED_RIBBON = { trigger: ".ribbon span", text: _t("Archived") };

lessonRegistry.add("archive_card", {
    name: _t("Put away and bring back"),
    intro: _t("Archive a card you don't need anymore without losing it, then bring it back."),
    level: "A",
    sequence: 30,
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: ACTIONS_MENU,
                    bubble: _t("Click ⋮"),
                    content: _t("This idea is old. Open the ⋮ menu to put it away."),
                    run: "click",
                    until: { trigger: ACTIONS_MENU_ITEM, text: _t("Archive") },
                },
                {
                    trigger: ACTIONS_MENU_ITEM,
                    text: _t("Archive"),
                    bubble: _t("Click Archive"),
                    content: _t(
                        "Archive puts a card away: it leaves your lists, but it is not deleted. Click Archive."
                    ),
                    run: "click",
                    until: DIALOG_CONFIRM,
                },
                {
                    trigger: DIALOG_CONFIRM,
                    bubble: _t("Confirm"),
                    content: _t("Odoo checks with you first. Click Archive to confirm."),
                    run: "click",
                    until: ARCHIVED_RIBBON,
                },
                {
                    trigger: BACK_TO_LIST,
                    bubble: _t("Back to the list"),
                    content: _t("The card now says “Archived”. Go back to the list: you will not see it there."),
                    run: "click",
                    until: { trigger: ".o_last_breadcrumb_item", text: _t("Practice Cards") },
                },
                {
                    trigger: FILTERS_TOGGLER,
                    bubble: _t("Open the filters"),
                    content: _t("Archived cards are still there, behind a filter. Open the filters."),
                    run: "click",
                    until: FILTER_ITEM,
                },
                {
                    trigger: FILTER_ITEM,
                    text: _t("Archived"),
                    bubble: _t("Click Archived"),
                    content: _t("Click “Archived” to see the cards you put away."),
                    run: "click",
                    until: { trigger: SEARCH_FACET, text: _t("Archived") },
                },
                {
                    trigger: LIST_ROW,
                    text: _t("Old idea"),
                    bubble: _t("Open “Old idea”"),
                    content: _t("Here is your old idea. Open it."),
                    run: "click",
                    until: NAME_FIELD,
                },
                {
                    trigger: ACTIONS_MENU,
                    bubble: _t("Click ⋮"),
                    content: _t("To bring it back, open the ⋮ menu again."),
                    run: "click",
                    until: { trigger: ACTIONS_MENU_ITEM, text: _t("Unarchive") },
                },
                {
                    trigger: ACTIONS_MENU_ITEM,
                    text: _t("Unarchive"),
                    bubble: _t("Click Unarchive"),
                    content: _t("Click Unarchive: the card is back in your lists, as if nothing happened."),
                    run: "click",
                    until: () => !findTarget(ARCHIVED_RIBBON),
                },
            ],
        },
    ],
});
