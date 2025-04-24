import { Component, markup, onMounted, onPatched, onWillUnmount } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { InputConfirmationDialog } from "./input_confirmation_dialog";

export class SnippetViewer extends Component {
    static template = "html_builder.SnippetViewer";
    static props = {
        state: { type: Object },
        selectSnippet: { type: Function },
        snippetModel: { type: Object },
    };

    setup() {
        this.dialog = useService("dialog");

        this.websiteService = useService("website");
        this.websiteEditService = this.websiteService.websiteRootInstance.bindService("website_edit");
      
        const updatePreview = () => {
            const iframeDocument = document.querySelector("iframe.o_add_snippet_iframe").contentDocument;
            this.websiteEditService.update(iframeDocument.body, "preview");
        };

        onMounted(updatePreview);
        onPatched(updatePreview);

        onWillUnmount(() => {
            const iframeDocument = document.querySelector("iframe.o_add_snippet_iframe").contentDocument;
            this.websiteEditService.stop(iframeDocument.body);
        });

    }

    onClickRename(snippet) {
        this.dialog.add(InputConfirmationDialog, {
            title: _t("Rename the block"),
            inputLabel: _t("Name"),
            defaultValue: snippet.title,
            confirmLabel: _t("Save"),
            confirm: (inputValue) => {
                this.props.snippetModel.renameCustomSnippet(snippet, inputValue);
            },
            cancelLabel: _t("Discard"),
            cancel: () => {},
        });
    }

    onClickDelete(snippet) {
        this.props.snippetModel.deleteCustomSnippet(snippet);
    }

    getSnippetColumns() {
        const snippets = this.getSelectedSnippets();

        const columns = [[], []];
        for (const index in snippets) {
            if (index % 2 === 0) {
                columns[0].push(snippets[index]);
            } else {
                columns[1].push(snippets[index]);
            }
        }
        return columns;
    }

    onClick(snippet) {
        if (snippet.moduleId) {
            this.props.snippetModel.installSnippetModule(snippet);
        } else {
            this.props.selectSnippet(snippet);
        }
    }

    getContent(elem) {
        return markup(elem.outerHTML);
    }

    getButtonInstallName(snippet) {
        return _t("Install %s", snippet.title);
    }

    getSelectedSnippets() {
        const snippetStructures = this.props.snippetModel.snippetStructures.filter(
            (snippet) => !snippet.isExcluded && !snippet.isDisabled
        );
        if (this.props.state.search) {
            const strMatches = (str) =>
                str.toLowerCase().includes(this.props.state.search.toLowerCase());
            return snippetStructures.filter(
                (snippet) => strMatches(snippet.title) || strMatches(snippet.keyWords || "")
            );
        }

        return snippetStructures.filter(
            (snippet) => snippet.groupName === this.props.state.groupSelected
        );
    }
}
