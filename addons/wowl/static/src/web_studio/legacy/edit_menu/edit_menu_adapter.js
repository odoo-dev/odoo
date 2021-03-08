/** @odoo-module */
import { useService } from '@wowl/core/hooks';
import { ComponentAdapter } from "web.OwlCompatibility";
import { MenuItem } from 'web_studio.EditMenu';


class EditMenuItemAdapter extends ComponentAdapter {
  constructor(parent, props) {
    props.Component = MenuItem;
    super(...arguments);
    this.menus = useService('menu');
    this.env = owl.Component.env;
  }

  get currentMenuId() {
    return this.menus.getCurrentApp().id;
  }

  get legacyMenuData() {
    return this.menus.getMenuAsTree('root');
  }

  get widgetArgs() {
    return [this.legacyMenuData, this.currentMenuId];
  }
  mounted() {
    super.mounted(...arguments);
    if (this.props.keepOpen) {
      this.widget.editMenu(this.props.scrollToBottom);
    }
  }
  updateWidget() {}
  renderWidget() {}
}

// why a high order component ?
// - support navbar re-rendering without having to fiddle too much in
// the legacy widget's code
// - allow to support the keepopen, and autoscroll features (yet to come)
export class EditMenuItem extends owl.Component {
  constructor() {
    super(...arguments);
    this.localId=0;
    this.menus = useService('menu');
    owl.hooks.onWillUpdateProps(() => this.localId++);
    this.editMenuParams = {};
    owl.hooks.onPatched(() => {
      this.editMenuParams = {};
    });
  }
  reloadMenuData(ev) {
    const { keep_open, scroll_to_bottom } = ev.detail;
    this.editMenuParams = {keepOpen: keep_open, scrollToBottom: scroll_to_bottom};
    this.menus.reload();
  }
}
EditMenuItem.components = { EditMenuItemAdapter };
EditMenuItem.template = owl.tags.xml`
  <t>
    <div t-if="!menus.getCurrentApp()"/>
    <t t-else="" t-component="EditMenuItemAdapter" t-props="editMenuParams" t-key="localId" t-on-reload-menu-data="reloadMenuData" />
  </t>
`;
