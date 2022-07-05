/** @odoo-module **/

import { useService } from "@web/core/utils/hooks";
import { View, getDefaultConfig } from "@web/views/view";

const { Component, onError, onWillStart, useSubEnv, useState, xml } = owl;

export class EmbeddedView extends Component {
    setup() {
        const { bus, services } = odoo.__WOWL_DEBUG__.root.env;
        useSubEnv({
            bus,
            config: {
                ...getDefaultConfig(),
                actionId: this.props.actionId
            },
            services,
        });

        this.actionService = useService("action");
        this.viewService = useService("view");
        this.state = useState({
            error: false
        });

        onWillStart(this.onWillStart);
        onError(this.onError);
    }

    async onWillStart() {
        const action = await this.actionService.loadAction(this.props.actionId, {
            active_id: false,
            active_ids: [],
        });
        if (action.type !== "ir.actions.act_window") {
            return;
        }
        this.env.config.setDisplayName(action.display_name);
        const ViewProps = {
            resModel: action.res_model,
            context: action.context,
            type: this.props.viewType,
            views: action.views,
            /**
             * @param {integer} recordId
             */
            selectRecord: recordId => {
                this.actionService.doAction({
                    type: 'ir.actions.act_window',
                    res_model: action.res_model,
                    views: [[false, 'form']],
                    res_id: recordId,
                });
            },
        };
        if (action.search_view_id) {
            ViewProps.searchViewId = action.search_view_id[0];
        }
        this.Component = View;
        this.ComponentProps = ViewProps;
    }

    /**
     * @param {Error} error
     */
    onError (error) {
        if (error.name === 'odoo.exceptions.AccessError') {
            this.state.error = 'access';
        } else {
            this.state.error = 'other';
        }
    }
}

EmbeddedView.template = xml/* xml */ `
    <t t-if="this.state.error">
        <t t-if="this.state.error === 'access'">
            <i class="fa fa-warning"/>You don't have access to the <span t-out="this.props.resModel" class="font-italic"/> model.
        </t>
        <t t-else="">
            <i class="fa fa-warning"/>Error while loading the view.
        </t>
    </t>
    <t t-else="" t-component="this.Component" t-props="this.ComponentProps"/>
`;

EmbeddedView.props = {
    actionId: { type: String },
    viewType: { type: String },
};
