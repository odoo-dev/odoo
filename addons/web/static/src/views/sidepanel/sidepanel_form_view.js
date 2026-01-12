/** @odoo-module **/

import { Component, onWillUpdateProps, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { View } from "@web/views/view";

export class SidePanelFormView extends Component {
    static template = "web.SidePanelFormView";
    static components = { View };
    static props = {
        resModel: String,
        resId: Number,
        context: { type: Object, optional: true },
        viewId: { type: [Number, Boolean], optional: true },
        onRecordSaved: { type: Function, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");

        this.state = useState({
            resId: this.props.resId,
            resModel: this.props.resModel,
            loading: false,
        });

        onWillUpdateProps(async (nextProps) => {
            if (
                nextProps.resId !== this.props.resId ||
                nextProps.resModel !== this.props.resModel
            ) {
                console.log("Props changed, reloading form:", {
                    from: { resModel: this.props.resModel, resId: this.props.resId },
                    to: { resModel: nextProps.resModel, resId: nextProps.resId }
                });

                this.state.loading = true;

                // workaround to force update state
                await new Promise(resolve => setTimeout(resolve, 0));

                this.state.resModel = nextProps.resModel;
                this.state.resId = nextProps.resId;
                this.state.loading = false;
            }
        });
    }

    // Generate unique key to destory and re-create component
    getViewKey() {
        return `${this.state.resModel}-${this.state.resId}`;
    }

    get viewProps() {
        return {
            type: "form",
            resModel: this.state.resModel,
            resId: this.state.resId,
            context: this.props.context || {},
            viewId: this.props.viewId || false,
            display: {
                controlPanel: false,
            },

            saveRecord: async (record, params) => {
                // 🤷🏻‍♂️
            },
            discardRecord: (record) => {
                // 🤷🏻‍♂️
            },
        };
    }
}