/** @odoo-module **/

const { Component, xml } = owl;

export class EffectContainer extends Component {
    setup() {
        this.effect = null;
        this.props.bus.addEventListener("UPDATE", (effect) => {
            this.effect = effect;
            this.render();
        });
    }
    removeEffect() {
        this.effect = null;
        this.render();
    }
}

EffectContainer.template = xml`
  <div class="o_effects_manager">
    <t t-if="effect">
        <t t-component="effect.Component" t-props="effect.props" t-key="effect.id" close="() => removeEffect()"/>
    </t>
  </div>`;
