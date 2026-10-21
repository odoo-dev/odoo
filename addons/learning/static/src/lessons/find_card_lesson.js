import { _t } from "@web/core/l10n/translation";
import { findTarget } from "../core/dom_target";
import { lessonRegistry } from "./lesson_registry";
import {
    BACK_TO_LIST,
    FILTER_ITEM,
    FILTERS_TOGGLER,
    LIST_ROW,
    NAME_FIELD,
    SEARCH_FACET,
    SEARCH_FACET_REMOVE,
    SEARCH_INPUT,
} from "./common_selectors";

const noFacet = () => !findTarget({ trigger: SEARCH_FACET });

lessonRegistry.add("find_card", {
    name: _t("Find it again"),
    intro: _t("Search a list, use a ready-made filter, and go back where you were."),
    level: "A",
    sequence: 25,
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: SEARCH_INPUT,
                    bubble: _t("Search “brass”"),
                    content: _t(
                        "Lists get long. To find a card, type a word of its name in the search bar, for example “brass”, then press Enter."
                    ),
                    run: "search brass",
                    until: { trigger: SEARCH_FACET, text: "brass" },
                },
                {
                    trigger: LIST_ROW,
                    text: "brass",
                    bubble: _t("Open “Buy brass fittings”"),
                    content: _t("Only the matching cards are left. Open “Buy brass fittings”."),
                    run: "click",
                    until: NAME_FIELD,
                },
                {
                    trigger: BACK_TO_LIST,
                    bubble: _t("Back to the list"),
                    content: _t("Go back to the list with “Practice Cards” at the top. Your search is still there."),
                    run: "click",
                    until: LIST_ROW,
                },
                {
                    trigger: SEARCH_FACET_REMOVE,
                    bubble: _t("Remove the search"),
                    content: _t(
                        "The grey label in the search bar is your search. Click its ✕ to see all your cards again."
                    ),
                    run: "click",
                    until: noFacet,
                },
                {
                    trigger: FILTERS_TOGGLER,
                    bubble: _t("Open the filters"),
                    content: _t("The arrow at the end of the search bar opens ready-made filters."),
                    run: "click",
                    until: FILTER_ITEM,
                },
                {
                    trigger: FILTER_ITEM,
                    text: _t("Done"),
                    bubble: _t("Click Done"),
                    content: _t("Click “Done” to see only the cards marked as done."),
                    run: "click",
                    until: { trigger: SEARCH_FACET, text: _t("Done") },
                },
                {
                    trigger: SEARCH_FACET_REMOVE,
                    bubble: _t("Remove the filter"),
                    content: _t("A filter is a label in the search bar too. Remove it to see everything again."),
                    run: "click",
                    until: noFacet,
                },
            ],
        },
    ],
});
