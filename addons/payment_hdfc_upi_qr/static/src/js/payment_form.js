/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget"
import { _t } from "@web/core/l10n/translation"
import { rpc } from "@web/core/network/rpc";

publicWidget.registry.HdfcUpiPaymentForm = publicWidget.Widget.extend({
  selector: ".hdfc_upi_payment_container",
  events: {
    "click #check_payment_status": "_onClickCheckStatus",
    "click #refresh_qr_code": "_onClickRefreshQR",
  },

  /**
   * @override
   */
  start: function () {
    console.log("HDFC UPI Payment Form widget starting")
    this._super.apply(this, arguments)
    this._startQrTimer()
    this._startStatusCheck()
    return Promise.resolve()
  },

  /**
   * Start automatic status checking
   *
   * @private
   */
  _startStatusCheck: function () {
    console.log("Starting status check interval")
    this._checkInterval = setInterval(this._checkPaymentStatus.bind(this), 10000)
    // Initial check after 2 seconds
    setTimeout(this._checkPaymentStatus.bind(this), 2000)
  },

  /**
   * Start QR code timer
   *
   * @private
   */
  _startQrTimer: function () {
    const expirySecondsEl = this.el.querySelector("#expiry_seconds")
    if (!expirySecondsEl) {
      console.error("Expiry seconds element not found")
      return
    }

    const expirySeconds = Number.parseInt(expirySecondsEl.value) || 300 // Default 5 minutes
    this._remainingSeconds = expirySeconds
    console.log("Starting QR timer with", expirySeconds, "seconds")

    // Initial update
    this._updateTimer()

    // Update every second
    this._timerInterval = setInterval(this._updateTimer.bind(this), 1000)
  },

  /**
   * Update the timer display
   *
   * @private
   */
  _updateTimer: function () {
    const timerEl = this.el.querySelector("#qr_timer")
    if (!timerEl) {
      console.error("Timer element not found")
      return
    }

    if (this._remainingSeconds <= 0) {
      clearInterval(this._timerInterval)
      timerEl.textContent = _t("Expired")
      timerEl.classList.add("text-danger", "font-weight-bold")

      // Show expired message
      const messageEl = this.el.querySelector("#payment_status_message")
      if (messageEl) {
        messageEl.classList.remove("d-none", "alert-success", "alert-warning")
        messageEl.classList.add("alert-danger")
        messageEl.textContent = _t("QR code has expired. Please refresh to generate a new QR code.")
      }

      // Check payment status one last time
      this._checkPaymentStatus()
      return
    }

    const minutes = Math.floor(this._remainingSeconds / 60)
    const seconds = this._remainingSeconds % 60

    timerEl.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`

    // Add warning class when less than 1 minute remains
    if (this._remainingSeconds < 60) {
      timerEl.classList.add("text-danger")
    }

    this._remainingSeconds--
  },

  /**
   * Handle click on check status button
   *
   * @private
   * @param {Event} ev
   */
  _onClickCheckStatus: function (ev) {
    ev.preventDefault()
    console.log("Check status button clicked")
    this._checkPaymentStatus()
  },

  /**
   * Handle click on refresh QR code button
   *
   * @private
   * @param {Event} ev
   */
  _onClickRefreshQR: (ev) => {
    ev.preventDefault()
    console.log("Refresh QR button clicked")
    window.location.reload()
  },

  /**
   * Check payment status via AJAX
   *
   * @private
   */
  _checkPaymentStatus: function () {
    const txIdEl = this.el.querySelector("#tx_id")
    if (!txIdEl) {
      console.error("Transaction ID element not found")
      return
    }

    const txId = txIdEl.value
    if (!txId) {
      console.error("Transaction ID not found")
      return
    }

    console.log("Checking payment status for transaction", txId)
    const buttonEl = this.el.querySelector("#check_payment_status")
    const messageEl = this.el.querySelector("#payment_status_message")

    if (!buttonEl || !messageEl) {
      console.error("Button or message element not found")
      return
    }

    buttonEl.disabled = true
    buttonEl.textContent = _t("Checking...")

    rpc(`/payment/hdfc_upi/check_status/${txId}`, {})
      .then((result) => {
        console.log("Payment status check result:", result)
        buttonEl.disabled = false
        buttonEl.textContent = _t("Check Payment Status")

        if (result.error) {
          messageEl.classList.remove("d-none", "alert-success", "alert-warning")
          messageEl.classList.add("alert-danger")
          messageEl.textContent = result.error
        } else {
          messageEl.classList.remove("d-none")

          if (result.expired) {
            messageEl.classList.remove("alert-success", "alert-warning")
            messageEl.classList.add("alert-danger")
            messageEl.textContent = _t("QR code has expired. Please refresh to generate a new QR code.")

            // Stop the timer
            clearInterval(this._timerInterval)
            const timerEl = this.el.querySelector("#qr_timer")
            if (timerEl) {
              timerEl.textContent = _t("Expired")
              timerEl.classList.add("text-danger", "font-weight-bold")
            }
          } else if (result.state === "done") {
            messageEl.classList.remove("alert-warning", "alert-danger")
            messageEl.classList.add("alert-success")
            messageEl.textContent = _t("Payment successful! Redirecting...")

            // Clear interval and redirect
            clearInterval(this._checkInterval)
            clearInterval(this._timerInterval)
            setTimeout(() => {
              window.location.href = "/payment/status"
            }, 2000)
          } else if (result.state === "pending") {
            messageEl.classList.remove("alert-success", "alert-danger")
            messageEl.classList.add("alert-warning")
            messageEl.textContent = _t("Payment is pending. Please wait or try again.")
          } else if (result.state === "cancel") {
            messageEl.classList.remove("alert-success", "alert-warning")
            messageEl.classList.add("alert-danger")
            messageEl.textContent = result.message || _t("Payment was cancelled.")
          } else {
            messageEl.classList.remove("alert-success", "alert-danger")
            messageEl.classList.add("alert-warning")
            messageEl.textContent = _t("Payment status: ") + result.state
          }
        }
      })
      .catch((error) => {
        console.error("Error checking payment status:", error)
        buttonEl.disabled = false
        buttonEl.textContent = _t("Check Payment Status")
        messageEl.classList.remove("d-none", "alert-success", "alert-warning")
        messageEl.classList.add("alert-danger")
        messageEl.textContent = _t("Error checking payment status.")
      })
  },

  /**
   * @override
   */
  destroy: function () {
    if (this._checkInterval) {
      clearInterval(this._checkInterval)
    }
    if (this._timerInterval) {
      clearInterval(this._timerInterval)
    }
    this._super.apply(this, arguments)
  },
})

export default publicWidget.registry.HdfcUpiPaymentForm
