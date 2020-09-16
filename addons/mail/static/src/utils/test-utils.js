/** @odoo-module alias=mail.utils.testUtils **/

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Public: rendering timers
//------------------------------------------------------------------------------

/**
 * Creates and returns a new root Component with the given props and mounts it
 * on target.
 * Assumes that self.env is set to the correct value.
 * Components created this way are automatically registered for clean up after
 * the test, which will happen when `afterEach` is called.
 *
 * @param {Object} self the current QUnit instance
 * @param {Class} Component the component class to create
 * @param {Object} param2
 * @param {Object} [param2.props={}] forwarded to component constructor
 * @param {DOM.Element} param2.target mount target for the component
 * @returns {owl.Component} the new component instance
 */
export async function createRootComponent(self, Component, { props = {}, target }) {
    Component.env = self.env;
    const component = new Component(null, props);
    delete Component.env;
    self.components.push(component);
    await afterNextRender(() => component.mount(target));
    return component;
}
