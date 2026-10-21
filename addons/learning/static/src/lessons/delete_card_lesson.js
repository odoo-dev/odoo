import { _t } from "@web/core/l10n/translation";
import { findTarget } from "../core/dom_target";
import { lessonRegistry } from "./lesson_registry";
import { ACTIONS_MENU, ACTIONS_MENU_ITEM } from "./common_selectors";

const DELETE_CONFIRM = ".o_dialog .modal-footer .btn-danger";

lessonRegistry.add("delete_card", {
    name: _t("Delete for good"),
    intro: _t("Delete a card you will never need again, and know when to archive instead."),
    level: "A",
    sequence: 35,
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: ACTIONS_MENU,
                    bubble: _t("Click ⋮"),
                    content: _t("This card was a mistake. Open the ⋮ menu."),
                    run: "click",
                    until: { trigger: ACTIONS_MENU_ITEM, text: _t("Delete") },
                },
                {
                    trigger: ACTIONS_MENU_ITEM,
                    text: _t("Delete"),
                    bubble: _t("Click Delete"),
                    content: _t("Delete removes the card for good. Odoo will ask you to confirm."),
                    run: "click",
                    until: DELETE_CONFIRM,
                },
                {
                    trigger: DELETE_CONFIRM,
                    bubble: _t("Delete"),
                    content: _t(
                        "Deleting cannot be undone: for things you might need later, archive them instead. This card can go: click Delete."
                    ),
                    run: "click",
                    pointOfNoReturn: true,
                    // Odoo goes back to the list once the card is gone
                    until: () => !document.querySelector(".o_dialog") && Boolean(findTarget({ trigger: ".o_list_view" })),
                },
            ],
        },
    ],
});
