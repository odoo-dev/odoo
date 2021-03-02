/** @odoo-module */
import { useService } from '@wowl/core/hooks';
import { _lt } from '@wowl/services/localization_service';

export class EditorMenu extends owl.Component {
  constructor() {
    super(...arguments);
    this.i18n = useService('localization');
    this.studio = useService('studio');
    this.actionManager = useService("action");
    this.rpc = useService('rpc');
  }

  get activeViews() {
    const action = this.studio.editedAction;
    const viewTypes = (action._views || action.views).map(([id, type]) => type);
    return this.constructor.viewTypes.filter(vt => viewTypes.includes(vt.type));
  }

  onEditorTabBack() {
    this.studio.setParams({ editorTab: this.studio.editorTab , viewType: false });
  }
  openTab(tab) {
    this.trigger('switch-tab', { tab });
  }
  onUndo() {

  }
  onRedo() {

  }
}
EditorMenu.template = "wowl.studio.EditorMenu";
EditorMenu.viewTypes = [{
    title: _lt('List'),
    type: 'list',
    faclass: 'fa-list-ul',
  }, {
    title: _lt('Form'),
    type: 'form',
    faclass: 'fa-address-card',
  }, {
    title: _lt('Kanban'),
    type: 'kanban',
    faclass: 'fa-th-large',
  }, {
    title: _lt('Map'),
    type: 'map',
    faclass: 'fa-map-marker',
  }, {
    title: _lt('Calendar'),
    type: 'calendar',
    faclass: 'fa-calendar-o',
  }, {
    title: _lt('Graph'),
    type: 'graph',
    faclass: 'fa-bar-chart',
  }, {
    title: _lt('Pivot'),
    type: 'pivot',
    faclass: 'fa-table',
  }, {
    title: _lt('Gantt'),
    type: 'gantt',
    faclass: 'fa-tasks',
  }, {
    title: _lt('Dashboard'),
    type: 'dashboard',
    faclass: 'fa-tachometer',
  }, {
    title: _lt('Cohort'),
    type: 'cohort',
    faclass: 'fa-signal',
  }, {
    title: _lt('Activity'),
    type: 'activity',
    faclass: 'fa-th',
  }, {
    title: _lt('Search'),
    type: 'search',
    faclass: 'fa-search',
  }
];