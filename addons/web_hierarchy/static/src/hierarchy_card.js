import { useProps, t } from "@odoo/owl";

import { CardRenderer, cardRendererProps } from "@web/views/card/card_renderer";

export class HierarchyCard extends CardRenderer {
    static template = "web_hierarchy.HierarchyCard";

    props = useProps({
        ...cardRendererProps,
        node: t.object(),
        openRecord: t.function(),
        classNames: t.string().optional(""),
    });

    getCardClasses() {
        const classes = ['bg-view', super.getCardClasses(), this.props.classNames];
        if (this.props.node.nodes.length) {
            classes.push("o_hierarchy_node_unfolded");
        }
        return classes.join(" ");
    }

    onGlobalClick(ev, newWindow) {
        if (ev.target.closest("button")) {
            return;
        }
        this.props.openRecord(this.props.node, newWindow);
    }

    onClickArrowDown(ev) {
        if (this.props.node.nodes.length) {
            this.props.node.collapseChildNodes();
        } else {
            this.props.node.showChildNodes();
        }
    }
}
