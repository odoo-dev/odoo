import { Component, onWillStart, useState } from "@odoo/owl";
import { getEmbeddedProps } from "@html_editor/others/embedded_component_utils";
import { TableOfContentManager } from "@html_editor/others/embedded_components/table_of_content/table_of_content_manager";

export class TableOfContentEmbeddedComponent extends Component {
    static template = "html_editor.TableOfContent";
    static props = {
        manager: { type: TableOfContentManager },
        readonly: { type: Boolean, optional: true },
    };

    setup() {
        this.state = useState({ toc: this.props.manager.structure });
        onWillStart(async () => {
            await this.props.manager.batchedUpdateStructure();
        });
    }

    displayTocHint() {
        return this.state.toc.headings.length < 2 && !this.props.readonly;
    }

    /**
     * @param {Object} heading
     */
    onTocLinkClick(heading) {
        this.props.manager.scrollIntoView(heading);
    }
}

export const tableOfContentEmbedding = {
    name: "table-of-content",
    Component: TableOfContentEmbeddedComponent,
    getProps: (host) => {
        return {
            // @TODO ABD will probably be needed for the version, currently not used
            ...getEmbeddedProps(host),
        };
    },
};

export const readonlyTableOfContentEmbedding = {
    name: "table-of-content",
    Component: TableOfContentEmbeddedComponent,
    getProps: (host) => {
        return {
            // @TODO ABD will probably be needed for the version, currently not used
            ...getEmbeddedProps(host),
            readonly: true,
        };
    },
};
