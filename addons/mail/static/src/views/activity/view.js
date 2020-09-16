/** @odoo-module alias=mail.views.Activity **/

import ActivityController from 'mail.views.activity.Controller';
import ActivityModel from 'mail.views.activity.Model';
import ActivityRenderer from 'mail.views.activity.Renderer';

import BasicView from 'web.BasicView';
import { _lt } from 'web.core';
import RendererWrapper from 'web.RendererWrapper';
import view_registry from 'web.view_registry';

const ActivityView = BasicView.extend({
    accesskey: 'a',
    display_name: _lt("Activity"),
    icon: 'fa-clock-o',
    config: {
        ...BasicView.prototype.config,
        Controller: ActivityController,
        Model: ActivityModel,
        Renderer: ActivityRenderer,
    },
    viewType: 'activity',
    searchMenuTypes: ['filter', 'favorite'],

    /**
     * @override
     */
    init() {
        this._super(...arguments);
        this.loadParams.type = 'list';
        // limit makes no sense in this view as we display all records having activities
        this.loadParams.limit = false;

        this.rendererParams.templates = this.arch.children.find(
            child => child.tag === 'templates',
        );
        this.controllerParams.title = this.arch.attrs.string;
    },
    /**
     *
     * @override
     */
    getRenderer(parent, state) {
        const state2 = { ...state, ...this.rendererParams };
        return new RendererWrapper(null, this.config.Renderer, state2);
    },
});

view_registry.add('activity', ActivityView);

export default ActivityView;
