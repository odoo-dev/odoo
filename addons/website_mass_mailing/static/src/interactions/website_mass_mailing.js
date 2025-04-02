import { _t } from "@web/core/l10n/translation";
import { ReCaptcha } from "@google_recaptcha/js/recaptcha";
import { rpc } from "@web/core/network/rpc";
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class Subscribe extends Interaction {
  static selector = ".js_subscribe";
  disabledInEditableMode = false;
  dynamicContent = {
    "click .js_subscribe_btn": "_onSubscribeClick",
  };

  constructor() {
    super(...arguments);
    this._recaptcha = new ReCaptcha();
    this.notification = this.bindService("notification");
  }

  async willStart() {
    await this._recaptcha.loadLibs();
  }

  destroy() {
    this._updateView({ is_subscriber: false });
  }

  start() {
    if (this.editableMode) {
      // Since there is an editor option to choose whether "Thanks" button
      // should be visible or not, we should not vary its visibility here.
      return;
    }
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
   * @todo should probably be merged with _updateSubscribeControlsStatus
   * @param {Object} data
   */
  _updateView(data) {
    this._updateSubscribeControlsStatus(!!data.is_subscriber);

    // js_subscribe_email is kept by compatibility (it was the old name of js_subscribe_value)
    const valueInputEl = this.el.querySelector(
      "input.js_subscribe_value, input.js_subscribe_email"
    );
    valueInputEl.value = data.value || "";

    // Compat: remove d-none for DBs that have the button saved with it.
    this.el.classList.remove("d-none");
  }

  /**
   * Updates the visibility of the subscribe and subscribed buttons.
   *
   * @param {boolean} isSubscriber
   */
  _updateSubscribeControlsStatus(isSubscriber) {
    const thanksWrapEl = this.el.querySelector(".js_subscribed_wrap");
    const subscribeWrapEl = this.el.querySelector(".js_subscribe_wrap");
    const subscribeBtnEl = this.el.querySelector(".js_subscribe_btn");

    subscribeBtnEl.disabled = isSubscriber;
    subscribeWrapEl.classList.toggle("d-none", isSubscriber);
    thanksWrapEl.classList.toggle("d-none", !isSubscriber);

    // js_subscribe_email is kept by compatibility (it was the old name of js_subscribe_value)
    const valueInputEl = this.el.querySelector(
      "input.js_subscribe_value, input.js_subscribe_email"
    );
    valueInputEl.disabled = isSubscriber;
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
      ".js_subscribe_value:visible, .js_subscribe_email:visible"
    ); // js_subscribe_email is kept by compatibility (it was the old name of js_subscribe_value)
    if (inputName === "email" && input.length && !input.val().match(/.+@.+/)) {
      this.el
        .addClass("o_has_error")
        .find(".form-control")
        .addClass("is-invalid");
      return false;
    }
    this.el
      .removeClass("o_has_error")
      .find(".form-control")
      .removeClass("is-invalid");
    const tokenObj = await this._recaptcha.getToken(
      "website_mass_mailing_subscribe"
    );
    if (tokenObj.error) {
      this.notification.add(tokenObj.error, {
        type: "danger",
        title: _t("Error"),
        sticky: true,
      });
      return false;
    }
    rpc("/website_mass_mailing/subscribe", {
      list_id: this._getListId(),
      value: input.length ? input.val() : false,
      subscription_type: inputName,
      ...(tokenObj.token ? { recaptcha_token_response: tokenObj.token } : {}),
    }).then((result) => {
      let toastType = result.toast_type;
      if (toastType === "success") {
        this._updateSubscribeControlsStatus(true);

        const popup = this.el.closest(".o_newsletter_modal");
        if (popup.length) {
          popup.modal("hide");
        }
      }
      this.notification.add(result.toast_content, {
        type: toastType,
        title: toastType === "success" ? _t("Success") : _t("Error"),
        sticky: true,
      });
    });
  }
}

registry.category("public.interactions").add("website.subscribe", Subscribe);

