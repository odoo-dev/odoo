/** @odoo-module */
import { Dialog } from "@web/core/dialog/dialog";
import { Notebook } from "@web/core/notebook/notebook";
import { _lt } from "@web/core/l10n/translation";

const { Component, useRef } = owl;

class KanbanExamplesNotebookTemplate extends Component {
    random(min, max) {
        return new Array(Math.floor(Math.random() * (max - min) + min));
    }
}
KanbanExamplesNotebookTemplate.template = "web.KanbanExamplesNotebookTemplate";

export class KanbanColumnExamplesDialog extends Component {
    setup() {
        this.navList = useRef("navList");
        this.pages = [];
        this.activePage = null;
        this.props.examples.forEach((eg) => {
            eg.randomNumber = this.random(1, 4);
            this.pages.push({
                Component: KanbanExamplesNotebookTemplate,
                props: {
                    ...eg,
                    isVisible: true,
                    title: eg.name,
                },
                id: eg.name,
            });
        });
    }

    onPageUpdate(page) {
        this.activePage = page;
    }

    random(min, max) {
        return new Array(Math.floor(Math.random() * (max - min) + min));
    }

    applyExamples() {
        const index = this.props.examples.findIndex((e) => e.name === this.activePage);
        this.props.applyExamples(index);
        this.props.close();
    }
}
KanbanColumnExamplesDialog.template = "web.KanbanColumnExamplesDialog";
KanbanColumnExamplesDialog.components = { Dialog, Notebook };
KanbanColumnExamplesDialog.title = _lt("Kanban Examples");
