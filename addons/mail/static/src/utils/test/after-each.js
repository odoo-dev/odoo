/** @odoo-module alias=mail.utils.test.afterEach **/

export default function afterEach(self) {
    if (self.env) {
        self.env.bus.off('hide_home_menu', null);
        self.env.bus.off('show_home_menu', null);
        self.env.bus.off('will_hide_home_menu', null);
        self.env.bus.off('will_show_home_menu', null);
    }
    // The components must be destroyed before the widget, because the
    // widget might destroy the models before destroying the components,
    // and the components might still rely on messaging (or other) record(s).
    while (self.components.length > 0) {
        const component = self.components.pop();
        component.destroy();
    }
    if (self.widget) {
        self.widget.destroy();
        self.widget = undefined;
    }
    self.env = undefined;
    self.doUnpatch();
}
