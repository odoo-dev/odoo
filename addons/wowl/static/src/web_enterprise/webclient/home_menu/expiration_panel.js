/** @odoo-module **/
import { browser } from "@wowl/core/browser";
import { useService } from "@wowl/core/hooks";

const { Component, hooks } = owl;
const { useState, useRef } = hooks;
const { DateTime } = luxon;

/**
 * Expiration panel
 *
 * Component representing the banner located on top of the home menu. Its purpose
 * is to display the expiration state of the current database and to help the
 * user to buy/renew its subscription.
 * @extends Component
 */
export class ExpirationPanel extends Component {
  constructor() {
    super(...arguments);
    this.enterprise = useService("enterprise");

    if (!this.enterprise.warning) {
      this.state = { display: false };
      return;
    }

    this.cookie = useService("cookie");
    this.ui = useService("ui");
    this.rpc = useService("rpc");
    this.orm = useService("orm");

    let expirationDate;
    if (this.enterprise.expirationDate) {
      expirationDate = this._parseExpirationDate(this.enterprise.expirationDate);
    } else {
      // If no date found, assume 1 month and hope for the best
      expirationDate = new DateTime.local().plus({ days: 30 });
    }
    const diffDays = this._computeDiffDays(expirationDate);

    const hideCookie = this.cookie.current.oe_instance_hide_panel;

    let alertType = "info";
    if (diffDays <= 6) {
      alertType = "danger";
    } else if (diffDays <= 16) {
      alertType = "warning";
    }

    this.state = useState({
      display: (diffDays <= 30 && !hideCookie) || diffDays <= 0,
      alertType,
      buttonText: "Register",
      diffDays,
      message: "register",
      expirationDate,
    });

    this.inputRef = useRef("input");

    // Expiration reason e.g. 'trial','renewal','upsell',...
    this.expirationReason = this.enterprise.expirationReason;
    this.notYetRegistered = ["trial", "demo", false].includes(this.expirationReason);

    // Check if mail (discuss) is installed
    // (this is a way to check that there is an app different from Apps or Settings installed)
    this.mailInstalled = this.enterprise.moduleList.some((m) => m === "mail");

    // Type of logged-in accounts addressed by message
    this.warning = this.enterprise.warning;
  }

  mounted() {
    if (this.state.diffDays <= 0) {
      this.ui.block({
        message: this.el,
        css: { cursor: "auto" },
        overlayCSS: { cursor: "auto" },
      });
    }
  }

  //--------------------------------------------------------------------------
  // Private
  //--------------------------------------------------------------------------

  /**
   * Used to ensure global state consistency.
   * @private
   */
  _clearState() {
    for (const key in this.state) {
      if (key !== "display") {
        delete this.state[key];
      }
    }
  }
  /**
   * @private
   * @param {number} date
   */
  _computeDiffDays(date) {
    const today = new DateTime.local();
    const duration = date.diff(today, "days");
    return Math.round(duration.values.days);
  }
  /**
   * @private
   * @param {string} date
   * @returns {luxon.DateTime}
   */
  _parseExpirationDate(date) {
    const fmt = "yyyy-MM-dd hh:mm:ss";
    return new DateTime.fromFormat(date, fmt);
  }

  //--------------------------------------------------------------------------
  // Handlers
  //--------------------------------------------------------------------------

  /**
   * @private
   */
  _onHide() {
    this.cookie.setCookie("oe_instance_hide_panel", true, 24 * 60 * 60);
    this.state.display = false;
  }

  /**
   * @private
   */
  _onClickRegister() {
    this.state.displayRegisterForm = !this.state.displayRegisterForm;
  }

  /**
   * @private
   */
  async _onBuy() {
    const limitDate = new DateTime.local().minus({ days: 15 }).toFormat("yyyy-MM-dd");
    const args = [
      [
        ["share", "=", false],
        ["login_date", ">=", limitDate],
      ],
    ];
    const nbUsers = await this.orm.call("res.users", "search_count", args);
    browser.location = `https://www.odoo.com/odoo-enterprise/upgrade?num_users=${nbUsers}`;
  }

  /**
   * Save the registration code then triggers a ping to submit it.
   * @private
   */
  async _onCodeSubmit() {
    const input = this.inputRef.el;
    const enterpriseCode = input.value;
    if (!enterpriseCode) {
      const inputTitle = input.getAttribute("title");
      input.setAttribute("placeholder", inputTitle);
      return;
    }
    const [oldDate, , linkedSubscriptionUrl, emailLinked] = await Promise.all([
      this.orm.call("ir.config_parameter", "get_param", ["database.expiration_date"]),
      this.orm.call("ir.config_parameter", "set_param", ["database.enterprise_code", enterpriseCode]),
      this.orm.call("ir.config_parameter", "get_param", ["database.already_linked_subscription_url"]),
      this.orm.call("ir.config_parameter", "get_param", ["database.already_linked_email"]),
    ]);

    this.cookie.setCookie("oe_instance_hide_panel", "", -1);

    await this.orm.call("publisher_warranty.contract", "update_notification", [[]]);

    const expirationDate = await this.orm.call("ir.config_parameter", "get_param", ["database.expiration_date"]);

    this.ui.unblock();

    this._clearState();
    if (expirationDate !== oldDate && !linkedSubscriptionUrl) {
      this.state.message = "success";
      this.state.displayRegisterForm = false;
      this.state.alertType = "success";
      this.state.expirationDate = this._parseExpirationDate(expirationDate);
    } else {
      this.state.alertType = "danger";
      this.state.buttonText = "Retry";
      this.state.displayRegisterForm = true;
      if (linkedSubscriptionUrl) {
        this.state.message = "link";
        this.state.linkedSubscriptionUrl = linkedSubscriptionUrl;
        this.state.emailDelivery = null;
        this.state.emailLinked = emailLinked;
      } else {
        this.state.message = "error";
      }
    }
  }

  /**
   * @private
   */
  async _onCheckStatus() {
    const oldDateStr = await this.orm.call("ir.config_parameter", "get_param", ["database.expiration_date"]);

    const oldDate = this._parseExpirationDate(oldDateStr);
    if (this._computeDiffDays(oldDate) >= 30) {
      return;
    }

    await this.orm.call("publisher_warranty.contract", "update_notification", [[]]);

    const expirationDateStr = await this.orm.call("ir.config_parameter", "get_param", ["database.expiration_date"]);
    const expirationDate = this._parseExpirationDate(expirationDateStr);

    if (expirationDateStr !== oldDateStr && expirationDate > new DateTime.local()) {
      this.ui.unblock();
      this._clearState();
      this.state.message = "update";
      this.state.alertType = "success";
      this.state.expirationDate = expirationDate;
      this.state.diffDays = this._computeDiffDays(expirationDate);
    } else {
      browser.location.reload();
    }
  }

  /**
   * @private
   */
  async _onSendUnlinkEmail() {
    const args = ["database.already_linked_send_mail_url"];
    const unlink_mail_send_url = await this.orm.call("ir.config_parameter", "get_param", args);
    this.state.emailDelivery = "ongoing";
    const { result, reason } = await this.rpc(unlink_mail_send_url, {});
    if (result) {
      this.emailDelivery = "success";
    } else {
      this.state.emailDelivery = "fail";
      this.state.failReason = reason;
    }
  }

  /**
   * @private
   */
  async _onRenew() {
    const oldDate = await this.orm.call("ir.config_parameter", "get_param", ["database.expiration_date"]);

    this.cookie.setCookie("oe_instance_hide_panel", "", -1);

    await this.orm.call("publisher_warranty.contract", "update_notification", [[]]);

    const [expirationDateStr, enterpriseCode] = await Promise.all([
      this.orm.call("ir.config_parameter", "get_param", ["database.expiration_date"]),
      this.orm.call("ir.config_parameter", "get_param", ["database.enterprise_code"]),
    ]);

    const expirationDate = this._parseExpirationDate(expirationDateStr);

    if (expirationDateStr !== oldDate && expirationDate > new DateTime.local()) {
      this.ui.unblock();
      this._clearState();
      this.state.message = "success";
      this.state.alertType = "success";
      this.state.expirationDate = expirationDate;
      // Same remark as above (we just want to show clear button)
      this.state.diffDays = this._computeDiffDays(expirationDate);
    } else {
      const params = enterpriseCode ? { contract: enterpriseCode } : {};
      this.env.services.navigate("https://www.odoo.com/odoo-enterprise/renew", params);
    }
  }

  /**
   * @private
   */
  async _onUpsell() {
    const limitDate = new DateTime.local().minus({ days: 15 }).toFormat("yyyy-MM-dd");
    const [enterpriseCode, nbUsers] = await Promise.all([
      this.orm.call("ir.config_parameter", "get_param", ["database.enterprise_code"]),
      this.orm.call("res.users", "search_count", [
        [
          ["share", "=", false],
          ["login_date", ">=", limitDate],
        ],
      ]),
    ]);
    const url = "https://www.odoo.com/odoo-enterprise/upsell";
    const contractQueryString = enterpriseCode ? `&contract=${enterpriseCode}` : "";
    browser.location = `${url}?num_users=${nbUsers}${contractQueryString}`;
  }
}

ExpirationPanel.template = "DatabaseExpirationPanel";
