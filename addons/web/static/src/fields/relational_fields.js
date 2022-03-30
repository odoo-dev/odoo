/** @odoo-module **/
import { registry } from "@web/core/registry";
import { KanbanRenderer } from "../views/kanban/kanban_renderer";
import { ListRenderer } from "../views/list/list_renderer";

const { Component } = owl;
const fieldRegistry = registry.category("fields");

const X2M_RENDERERS = {
    list: ListRenderer,
    kanban: KanbanRenderer,
};

export class FieldMany2one extends Component {
    setup() {
        const data = this.props.record.data[this.props.name];
        this.data = data ? data[1] : "";
    }
}

FieldMany2one.template = "web.FieldMany2one";

fieldRegistry.add("many2one", FieldMany2one);

export class FieldMany2ManyTags extends Component {
    setup() {
        const dataList = this.props.record.data[this.props.name];
        this.data = (dataList && dataList.data) || [];
    }
}

FieldMany2ManyTags.template = "web.FieldMany2ManyTags";
FieldMany2ManyTags.fieldsToFetch = {
    display_name: { type: "char" },
};

fieldRegistry.add("many2many_tags", FieldMany2ManyTags);

export class FieldKanbanMany2ManyTags extends FieldMany2ManyTags {}

FieldKanbanMany2ManyTags.template = "web.FieldKanbanMany2ManyTags";

fieldRegistry.add("kanban.many2many_tags", FieldKanbanMany2ManyTags);

export class FieldX2Many extends Component {
    setup() {
        const fieldInfo = this.props.record.activeFields[this.props.name];
        if (fieldInfo.views && fieldInfo.viewMode in fieldInfo.views) {
            const subViewInfo = fieldInfo.views[fieldInfo.viewMode];
            this.Renderer = X2M_RENDERERS[fieldInfo.viewMode];
            this.viewType = fieldInfo.viewMode;
            this.rendererProps = {
                info: subViewInfo,
                fields: subViewInfo.fields, // is this necessary?
                list: this.props.value,
                readonly: true,
                openRecord: this.openRecord.bind(this),
            };
        }
    }

    openRecord(record) {
        console.log("FieldX2M openRecord", record);
    }
}
FieldX2Many.useSubView = true;

FieldX2Many.template = "web.FieldX2Many";

fieldRegistry.add("one2many", FieldX2Many);
fieldRegistry.add("many2many", FieldX2Many);
