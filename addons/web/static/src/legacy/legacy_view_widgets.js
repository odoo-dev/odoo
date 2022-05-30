/** @odoo-module **/

import { registry } from "@web/core/registry";
import { ComponentAdapter } from "web.OwlCompatibility";
import legacyWidgetRegistry from "web.widget_registry";
import { mapRecordDatapoint } from "./legacy_fields";

const { Component, useEffect, xml } = owl;
const viewWidgetRegistry = registry.category("view_widgets");

const legacyWidgetTemplate = xml`
    <ViewWidgetAdapter Component="ViewWidget" viewWidgetParams="viewWidgetParams" />`;

// ----------------------------------------------------------------------------
// ViewWidgetAdapter
// ----------------------------------------------------------------------------

class ViewWidgetAdapter extends ComponentAdapter {
    setup() {
        super.setup();
        this.wowlEnv = this.env;
        this.env = Component.env;
        useEffect(() => {
            this.widgetEl.parentElement.classList.remove("o_text_overflow");
            this.widgetEl.classList.add("o_legacy_widget");
        });
    }

    /**
     * @override
     */
    get widgetArgs() {
        const { record, node, options } = this.props.viewWidgetParams;
        return [record, node, options];
    }

    updateWidget(nextProps) {
        const { record, node, options } = nextProps.viewWidgetParams;
        if (this.oldWidget) {
            this.widget.destroy(); // we were already updating -> abort, and start over
        } else {
            this.oldWidget = this.widget;
        }
        this.widget = new this.props.Component(this, record, node, options);
        return this.widget._widgetRenderAndInsert(() => {});
    }

    renderWidget() {
        if (this.oldWidget) {
            const parentEl = this.oldWidget.el.parentElement;
            parentEl.replaceChild(this.widget.el, this.oldWidget.el);
            this.widgetEl = this.widget.el;
            if (this.widget.on_attach_callback) {
                this.widget.on_attach_callback();
            }
            this.oldWidget.destroy();
            this.oldWidget = null;
        }
    }
}

// ----------------------------------------------------------------------------
// Register legacy widgets to the wowl widget registry (wrapped in a Component)
// ----------------------------------------------------------------------------

const registerWidget = (name, LegacyWidgetWidget) => {
    class LegacyViewWidget extends Component {
        setup() {
            this.ViewWidget = LegacyWidgetWidget;
        }
        get viewWidgetParams() {
            const { record } = this.props;
            let legacyRecord;
            if (record.model.__bm__) {
                legacyRecord = record.model.__bm__.get(record.__bm_handle__);
            } else {
                legacyRecord = mapRecordDatapoint(record);
            }
            legacyRecord = owl.reactive(legacyRecord);
            const options = {
                viewType: legacyRecord.viewType,
                mode: record.mode,
            };
            return { ...this.props, record: legacyRecord, options };
        }
    }
    LegacyViewWidget.template = legacyWidgetTemplate;
    LegacyViewWidget.components = { ViewWidgetAdapter };
    if (!viewWidgetRegistry.contains(name)) {
        console.log(`View widgets: using legacy ${name} Widget`);
        viewWidgetRegistry.add(name, LegacyViewWidget);
    }
};

// register widgets already in the legacy registry, and listens to future registrations
for (const [name, Widget] of Object.entries(legacyWidgetRegistry.entries())) {
    registerWidget(name, Widget);
}
legacyWidgetRegistry.onAdd(registerWidget);
