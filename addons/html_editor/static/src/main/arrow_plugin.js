// import { _t } from "@web/core/l10n/translation";
import { Plugin } from "@html_editor/plugin";

export class ArrowsPlugin extends Plugin {
    static id = "arrows";
    static dependencies = ["baseContainer", "selection", "input", "dom", "history"];
    /** @type {import("plugins").EditorResources} */
    resources = {
        input_handlers: this.onInput.bind(this),
    };

    termMap = {
        simpleArrow: { pattern: "-->", value: "→" },
        doubleArrow: { pattern: "==>", value: "⇒" },
    };

    currentIndex = 0;
    currentTerm = "";

    onInput(ev) {
        const data = ev.data;

        if (
            data.match(/\s/) &&
            this.currentIndex === this.termMap[this.currentTerm]?.pattern.length
        ) {
            this.dependencies.selection.modifySelection("extend", "backward", "word");
            const selection = this.dependencies.selection.getEditableSelection();
            this.dependencies.selection.extractContent(selection);
            const insertValue = this.termMap[this.currentTerm].value;
            this.dependencies.dom.insert(`${insertValue}${data}`);
            this.dependencies.history.addStep();
            this.currentIndex = 0;
            this.currentTerm = "";
            // return;
        } else if (this.currentTerm) {
            if (data === this.termMap[this.currentTerm].pattern[this.currentIndex]) {
                this.currentIndex += 1;
            } else {
                this.currentIndex = 0;
                this.currentTerm = "";
            }
        } else {
            const term = Object.keys(this.termMap).find(
                (term) => data === this.termMap[term].pattern[0]
            );
            if (term) {
                this.currentTerm = term;
                this.currentIndex = 1;
            }
        }
    }
}
