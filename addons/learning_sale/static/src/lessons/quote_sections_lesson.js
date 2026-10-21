import { _t } from "@web/core/l10n/translation";
import { formSaved, typed } from "@learning/core/step_conditions";
import { SAVE_BUTTON } from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";
import { ADD_TO_LINES, EDITED_LABEL, LINE_OPTION, lineCount, newLineStarted, picked } from "./quote_selectors";

function sectionSteps(title, lineCountBefore) {
    return [
        {
            trigger: ADD_TO_LINES,
            text: _t("Add Section"),
            bubble: _t("Add Section"),
            content: _t("A section is a title that groups the lines below it. Click “Add Section”."),
            run: "click",
            until: newLineStarted(lineCountBefore),
        },
        {
            trigger: EDITED_LABEL,
            bubble: _t("Type “%s”", title),
            content: _t("Type the title of the section: “%s”.", title),
            run: `edit ${title}`,
            until: typed(),
        },
    ];
}

function productSteps(search, product, lineCountBefore) {
    return [
        {
            trigger: ADD_TO_LINES,
            text: _t("Add Line"),
            bubble: _t("Add Line"),
            content: _t("Now add what goes in this section: click “Add Line”."),
            run: "click",
            until: newLineStarted(lineCountBefore),
        },
        {
            trigger: EDITED_LABEL,
            bubble: _t("Type “%s”", search),
            content: _t("Type “%s”.", search),
            run: `edit ${search}`,
            until: { trigger: LINE_OPTION, text: product },
        },
        {
            trigger: LINE_OPTION,
            text: product,
            bubble: _t("Pick “%s”", product),
            content: _t("Pick “%s”.", product),
            run: "click",
            until: picked(EDITED_LABEL, LINE_OPTION, product),
        },
    ];
}

lessonRegistry.add("quote_sections", {
    name: _t("Organise a quote with sections"),
    intro: _t("Group the lines of a quote by room or by part of the job, so your customer reads it easily."),
    level: "D",
    sequence: 20,
    focus: ["partner_id", "order_line"],
    checkpoints: [
        {
            key: "start",
            // built when the lesson starts: translations are not loaded yet
            // when this file is, and these steps format translated strings
            steps: () => [
                ...sectionSteps(_t("Bathroom"), 0),
                ...productSteps("Copper", "Copper pipe 15mm", 1),
                ...sectionSteps(_t("Kitchen"), 2),
                ...productSteps("Labour", "Labour (per hour)", 3),
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t(
                        "Each section shows its own lines. Click the cloud to save the quote."
                    ),
                    run: "click",
                    until: () => lineCount() === 4 && formSaved()(),
                },
            ],
        },
    ],
});
