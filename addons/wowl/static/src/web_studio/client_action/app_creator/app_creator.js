/** @odoo-module **/
import Widget from "web.Widget";
import { COLORS, BG_COLORS, ICONS } from "../utils";
import { FieldMany2One } from "web.relational_fields";
import { IconCreator } from "../icon_creator/icon_creator";
import { ModelConfigurator } from "web_studio.ModelConfigurator";
import StandaloneFieldManagerMixin from "web.StandaloneFieldManagerMixin";
import { useAutofocus } from "@wowl/core/hooks";

import { ComponentAdapter, ComponentWrapper, WidgetAdapterMixin } from "web.OwlCompatibility";

const { Component, hooks, useState } = owl;
const { useExternalListener } = hooks;

export const AppCreatorWrapper = Widget.extend(StandaloneFieldManagerMixin, WidgetAdapterMixin, {
  /**
   * This widget is directly bound to its inner owl component and its sole purpose
   * is to instanciate it with the adequate properties: it will manually
   * mount the component when attached to the dom, will dismount it when detached
   * and destroy it when destroyed itself.
   * @constructor
   */
  init() {
    this._super(...arguments);
    StandaloneFieldManagerMixin.init.call(this);
    this.appCreatorComponent = new ComponentWrapper(this, AppCreator, { model: this.model });
  },

  async start() {
    this.$el.css("height", "100%");
    await this._super(...arguments);
    return this.appCreatorComponent.mount(this.el);
  },

  destroy() {
    WidgetAdapterMixin.destroy.call(this);
    this._super();
  },

  //--------------------------------------------------------------------------
  // Handlers
  //--------------------------------------------------------------------------

  /**
   * Overriden to register widgets on the fly since they have been instanciated
   * by the Component.
   * @override
   */
  _onFieldChanged(ev) {
    const targetWidget = ev.data.__targetWidget;
    this._registerWidget(ev.data.dataPointID, targetWidget.name, targetWidget);
    StandaloneFieldManagerMixin._onFieldChanged.apply(this, arguments);
  },
});
AppCreatorWrapper.prototype.forceFullscreen = true;

/**
 * App creator
 *
 * Action handling the complete creation of a new app. It requires the user
 * to enter an app name, to customize the app icon (@see IconCreator) and
 * to finally enter a menu name, with the option to bind the default app
 * model to an existing one.
 *
 * TODO: this component is bound to an action adapter since the action manager
 * cannot yet handle owl component. This file must be reviewed as soon as
 * the action manager is updated.
 * @extends Component
 */
class AppCreator extends Component {
  constructor() {
    super(...arguments);
    // TODO: Many2one component directly attached in XML. For now we have
    // to toggle it manually according to the state changes.
    this.state = useState({
      step: "welcome",
      appName: "",
      menuName: "",
      modelChoice: "new",
      modelOptions: [],
      modelId: false,
      iconData: {
        backgroundColor: BG_COLORS[5],
        color: COLORS[4],
        iconClass: ICONS[0],
        type: "custom_icon",
      },
    });
    this.debug = Boolean(AppCreator.env.isDebug());

    this.FieldMany2One = FieldMany2One;

    useAutofocus();
    this.invalid = useState({
      appName: false,
      menuName: false,
      modelId: false,
    });
    useExternalListener(window, "keydown", this._onKeydown);
  }

  async willStart() {
    const recordId = await this.props.model.makeRecord("ir.actions.act_window", [
      {
        name: "model",
        relation: "ir.model",
        type: "many2one",
        domain: [
          ["transient", "=", false],
          ["abstract", "=", false],
        ],
      },
    ]);
    this.record = this.props.model.get(recordId);
  }

  //--------------------------------------------------------------------------
  // Getters
  //--------------------------------------------------------------------------

  /**
   * @returns {boolean}
   */
  get isReady() {
    return (
      this.state.step === "welcome" ||
      (this.state.step === "app" && this.state.appName) ||
      (this.state.step === "model" &&
        this.state.menuName &&
        (this.state.modelChoice === "new" ||
          (this.state.modelChoice === "existing" && this.state.modelId)))
    );
  }

  //--------------------------------------------------------------------------
  // Private
  //--------------------------------------------------------------------------

  /**
   * Switch the current step and clean all invalid keys.
   * @private
   * @param {string} step
   */
  _changeStep(step) {
    this.state.step = step;
    for (const key in this.invalid) {
      this.invalid[key] = false;
    }
  }

  /**
   * @private
   * @returns {Promise}
   */
  async _createNewApp() {
    this.env.services.blockUI();

    const iconValue =
      this.state.iconData.type === "custom_icon"
        ? // custom icon data
          [
            this.state.iconData.iconClass,
            this.state.iconData.color,
            this.state.iconData.backgroundColor,
          ]
        : // attachment
          this.state.iconData.uploaded_attachment_id;

    const result = await this.rpc({
      route: "/web_studio/create_new_app",
      params: {
        app_name: this.state.appName,
        menu_name: this.state.menuName,
        model_choice: this.state.modelChoice,
        model_id: this.state.modelChoice && this.state.modelId,
        model_options: this.state.modelOptions,
        icon: iconValue,
        context: this.env.session.user_context,
      },
    }).guardedCatch(() => {
      this.env.services.unblockUI();
      this._onPrevious();
    });
    this.trigger("new-app-created", result);
    this.env.services.unblockUI();
  }

  //--------------------------------------------------------------------------
  // Handlers
  //--------------------------------------------------------------------------

  /**
   * @private
   * @param {Event} ev
   */
  _onChecked(ev) {
    const modelChoice = ev.currentTarget.value;
    this.state.modelChoice = modelChoice;
    if (this.state.modelChoice === "new") {
      this.state.modelId = undefined;
    }
  }

  /**
   * @private
   * @param {OwlEvent} ev
   */
  _onModelIdChanged(ev) {
    if (this.state.modelChoice === "existing") {
      this.state.modelId = ev.detail.changes.model.id;
      this.invalid.modelId = isNaN(this.state.modelId);
    } else {
      this.state.modelId = false;
      this.invalid.modelId = false;
    }
  }

  /**
   * @private
   * @param {OwlEvent} ev
   */
  _onIconChanged(ev) {
    for (const key in this.state.iconData) {
      delete this.state.iconData[key];
    }
    Object.assign(this.state.iconData, ev.detail);
  }

  /**
   * @private
   * @param {InputEvent} ev
   */
  _onInput(ev) {
    const input = ev.currentTarget;
    if (this.invalid[input.id]) {
      this.invalid[input.id] = !input.value;
    }
    this.state[input.id] = input.value;
  }

  /**
   * @private
   * @param {KeyboardEvent} ev
   */
  _onKeydown(ev) {
    if (
      ev.key === "Enter" &&
      !(ev.target.classList && ev.target.classList.contains("o_web_studio_app_creator_previous"))
    ) {
      ev.preventDefault();
      this._onNext();
    }
  }

  /**
   * Handle the confirmation of options in the modelconfigurator
   * @param {OwlEvent} ev
   */
  _onConfirmOptions(ev) {
    const options = ev.detail;
    this.state.modelOptions = Object.entries(options)
      .filter((opt) => opt[1].value)
      .map((opt) => opt[0]);
    return this._onNext();
  }

  /**
   * @private
   */
  async _onNext() {
    switch (this.state.step) {
      case "welcome":
        this._changeStep("app");
        break;
      case "app":
        if (!this.state.appName) {
          this.invalid.appName = true;
        } else {
          this._changeStep("model");
        }
        break;
      case "model":
        if (!this.state.menuName) {
          this.invalid.menuName = true;
        }
        if (this.state.modelChoice === "existing" && !this.state.modelId) {
          this.invalid.modelId = true;
        } else if (this.state.modelChoice === "new") {
          this.invalid.modelId = false;
        }
        const isValid = Object.values(this.invalid).reduce((valid, key) => valid && !key, true);
        if (isValid) {
          if (this.state.modelChoice === "new") {
            this._changeStep("model_configuration");
          } else {
            this._createNewApp();
          }
        }
        break;
      case "model_configuration":
        // no validation for this step, every configuration is valid
        this._createNewApp();
        break;
    }
  }

  /**
   * @private
   */
  _onPrevious() {
    switch (this.state.step) {
      case "app":
        this._changeStep("welcome");
        break;
      case "model":
        this._changeStep("app");
        break;
      case "model_configuration":
        this._changeStep("model");
        break;
    }
  }
}

AppCreator.components = { ComponentAdapter, IconCreator, ModelConfigurator };
AppCreator.props = {
  model: Object,
};
AppCreator.template = "web_studio.AppCreator";
