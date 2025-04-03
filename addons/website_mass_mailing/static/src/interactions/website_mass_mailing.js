import { _t } from "@web/core/l10n/translation";
import { ReCaptcha } from "@google_recaptcha/js/recaptcha";
import { rpc } from "@web/core/network/rpc";
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class Subscribe extends Interaction {
  static selector = ".js_subscribe";
  dynamicContent = {
    ".js_subscribe_btn": {
      "t-on-click": this._onSubscribeClick.bind(this),
      "t-att-class": (el) => ({ disabled: this.state.isDisabled }),
    },
    ".js_subscribe_wrap": {
      "t-att-class": (el) => ({ "d-none": this.state.isSubscriber }),
    },
    ".js_subscribed_wrap": {
      "t-att-class": (el) => ({ "d-none": !this.state.isSubscriber }),
    },
    "input.js_subscribe_value, input.js_subscribe_email": {
      "t-att-class": (el) => ({ disabled: this.state.isDisabled }),
    },
  };

  setup() {
    super.setup();
    this._recaptcha = new ReCaptcha();
    this.state = { isSubscriber: false, isDisabled: false };
  }

  async willStart() {
    await this._recaptcha.loadLibs();
  }

  destroy() {
    this._updateView({ is_subscriber: false });
  }

  start() {
    const always = this._updateView.bind(this);
    const inputName = this.el.querySelector("input").name;
    return this.waitFor(
      rpc("/website_mass_mailing/is_subscriber", {
        list_id: this._getListId(),
        subscription_type: inputName,
      }).then(always, always)
    );
  }

  //--------------------------------------------------------------------------
  // Private
  //--------------------------------------------------------------------------

  /**
   * Modifies the elements to have the view of a subscriber/non-subscriber.
   *
   * @param {Object} data
   */
  _updateView(data) {
    this.state.isSubscriber = !!data.is_subscriber;
  }

  _getListId() {
    // TODO this should be improved: we currently have snippets (e.g. the
    // s_newsletter_block one) who relies on the fact the list-id is saved
    // on the snippet's main section, and ignores the one saved on the inner
    // form snippet. Some other (e.g. the s_newsletter_popup one) relies on
    // the ID of the inner form snippet. We should make it more consistent:
    // probably always relying on the inner form list-id? (upgrade...)
    return (
      this.el.closest("section[data-list-id]")?.dataset.listId ||
      this.el.dataset.listId
    );
  }

  //--------------------------------------------------------------------------
  // Handlers
  //--------------------------------------------------------------------------

  /**
   * @private
   */
  async _onSubscribeClick() {
    const inputName = this.el.querySelector("input").name;
    const input = this.el.querySelectorAll(
      ".js_subscribe_value, .js_subscribe_email"
    ); // js_subscribe_email is kept by compatibility (it was the old name of js_subscribe_value)
    if (
      inputName === "email" &&
      input.length &&
      !input[0].value.match(/.+@.+/)
    ) {
      this.el.classList.add("o_has_error");

      const formControls = this.el.querySelectorAll(".form-control");
      formControls.forEach((control) => {
        control.classList.add("is-invalid");
      });

      return false;
    }

    this.el.classList.remove("o_has_error");
    const formControls = this.el.querySelectorAll(".form-control");
    formControls.forEach((control) => {
      control.classList.remove("is-invalid");
    });

    const tokenObj = this.waitFor(
      this._recaptcha.getToken("website_mass_mailing_subscribe")
    );
    if (tokenObj.error) {
      this.services.notification.add(tokenObj.error, {
        type: "danger",
        title: _t("Error"),
        sticky: true,
      });
      return false;
    }
    this.state.isDisabled = true;
    const result = await this.waitFor(
      rpc("/website_mass_mailing/subscribe", {
        list_id: this._getListId(),
        value: input.length ? input[0].value : false,
        subscription_type: inputName,
        ...(tokenObj.token ? { recaptcha_token_response: tokenObj.token } : {}),
      })
    );
    let toastType = result.toast_type;
    if (toastType === "success") {
      this.state.isSubscriber = true;
      const popup = this.el.closest(".o_newsletter_modal");
      if (popup?.length) {
        popup.modal("hide");
      }
    } else {
      this.state.isDisabled = false;
    }

    this.services.notification.add(result.toast_content, {
      type: toastType,
      title: toastType === "success" ? _t("Success") : _t("Error"),
      sticky: true,
    });
  }
}

registry.category("public.interactions").add("website.subscribe", Subscribe);
