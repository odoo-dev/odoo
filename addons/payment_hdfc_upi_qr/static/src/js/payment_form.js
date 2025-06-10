/* global odoo */
// Part of Odoo. See LICENSE file for full copyright and licensing details.

/** @odoo-module **/

import paymentForm from "@payment/js/payment_form";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

// Global UPI Modal instance
let globalUpiModal = null

paymentForm.include({
  // #=== DOM MANIPULATION ===#

  /**
   * Prepare the inline form of HDFC UPI for direct payment.
   *
   * @override method from payment.payment_form
   * @private
   * @param {number} providerId - The id of the selected payment option's provider.
   * @param {string} providerCode - The code of the selected payment option's provider.
   * @param {number} paymentOptionId - The id of the selected payment option
   * @param {string} paymentMethodCode - The code of the selected payment method, if any.
   * @param {string} flow - The online payment flow of the selected payment option
   * @return {void}
   */
  async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
    if (providerCode !== "hdfc_upi") {
      this._super(...arguments)
      return
    }

    console.log("Preparing HDFC UPI inline form", {
      providerId,
      providerCode,
      paymentOptionId,
      paymentMethodCode,
      flow,
    })

    // Check if instantiation is needed
    if (flow === "token") {
      this._super(...arguments)
      return // No component for tokens
    }

    // Overwrite the flow of the selected payment method
    this._setPaymentFlow("direct")

    // Create global modal if it doesn't exist
    if (!globalUpiModal) {
      globalUpiModal = new UpiPaymentModal()
    }

    console.log("HDFC UPI inline form prepared successfully")
  },

  // #=== PAYMENT FLOW ===#

  /**
   * Trigger the payment processing by initiating UPI QR flow.
   *
   * @override method from payment.payment_form
   * @private
   * @param {string} providerCode - The code of the selected payment option's provider.
   * @param {number} paymentOptionId - The id of the payment option handling the transaction.
   * @param {string} paymentMethodCode - The code of the selected payment method, if any.
   * @param {string} flow - The online payment flow of the transaction.
   * @return {void}
   */
  async _initiatePaymentFlow(providerCode, paymentOptionId, paymentMethodCode, flow) {
    if (providerCode !== "hdfc_upi" || flow === "token") {
      await this._super(...arguments)
      return
    }

    console.log("Initiating HDFC UPI payment flow", { providerCode, paymentOptionId, paymentMethodCode, flow })

    // Create the transaction and retrieve the processing values
    try {
      const processingValues = await rpc(this.paymentContext["transactionRoute"], this._prepareTransactionRouteParams())

      console.log("Processing values received:", processingValues)

      // Show UPI modal with transaction data
      this._showUpiModal(processingValues)
    } catch (error) {
      console.error("Error creating transaction:", error)
      this._displayErrorDialog(_t("Payment processing failed"), error.message)
      this._enableButton()
    }
  },

  /**
   * Show UPI QR modal with transaction data
   * @private
   * @param {Object} processingValues - The processing values from transaction creation
   */
  _showUpiModal(processingValues) {
    console.log("Showing UPI modal with processing values:", processingValues)

    if (!globalUpiModal) {
      globalUpiModal = new UpiPaymentModal()
    }

    // Extract transaction data from processing values
    const transactionData = {
      transaction_id: processingValues.transaction_id,
      reference: processingValues.reference,
      amount: processingValues.amount,
      currency: processingValues.currency_code,
      merchant_name: processingValues.merchant_name || "HDFC UPI",
      provider_code: "hdfc_upi",
    }

    console.log("Transaction data for modal:", transactionData)

    // Show modal
    globalUpiModal.show(transactionData)
  },
})

// UPI Payment Modal Class
class UpiPaymentModal {
  constructor() {
    this.isOpen = false
    this.transactionId = null
    this.timerInterval = null
    this.monitoringInterval = null
    this.remainingSeconds = 0
    this._finalStateReceived = false
    this._qrExpired = false // Track QR expiry state
    this._beforeUnloadHandler = null
    this._isRedirecting = false // Flag to prevent cancellation during intended redirects
    this._createModal()
    this._bindEvents()
    console.log("UPI Payment Modal created")
  }

  /**
   * Create the modal HTML structure
   * @private
   */
  _createModal() {
    // Remove existing modal if any
    const existingModal = document.getElementById("upiPaymentModal")
    if (existingModal) {
      existingModal.remove()
    }

    const modalHtml = `
            <div class="upi-payment-modal" id="upiPaymentModal">
                <div class="upi-modal-content">
                    <div class="upi-modal-header">
                        <button class="upi-modal-close" id="closeUpiModal">&times;</button>
                        <h2 class="merchant-name" id="merchantName">Loading...</h2>
                        <p class="payment-title">Pay With UPI QR</p>
                    </div>
                    <div class="upi-modal-body">
                        <div class="qr-loading" id="qrLoading">
                            <div class="loading-spinner"></div>
                            <p class="mt-2">Generating QR code...</p>
                        </div>
                        <div id="qrContainer" style="display: none;">
                            <img class="qr-code-image" id="qrCodeImage" alt="UPI QR Code" />
                        </div>
                        
                        <div class="payment-amount" id="paymentAmount">
                            Amount: <span class="currency">₹</span> <span id="amountValue">0</span>
                        </div>
                        
                        <p class="scan-instruction">
                            Scan the QR using any UPI app on your phone.
                        </p>
                        
                        <div class="timer-container" id="timerContainer">
                            <span class="timer-icon">⏰</span>
                            <span class="timer-text">Expires in: </span>
                            <span class="timer-value" id="timerValue">5:00</span>
                        </div>
                        
                        <div class="status-message" id="statusMessage"></div>
                        
                        <div class="upi-apps-container">
                            <p class="upi-apps-title">Supported UPI Apps</p>
                            <div class="upi-apps-grid">
                                <img src="/payment_hdfc_upi_qr/static/img/googlepay.svg" alt="Google Pay" class="upi-app-icon" />
                                <img src="/payment_hdfc_upi_qr/static/img/phonepe.svg" alt="PhonePe" class="upi-app-icon" />
                                <img src="/payment_hdfc_upi_qr/static/img/paytm.svg" alt="Paytm" class="upi-app-icon" />
                                <img src="/payment_hdfc_upi_qr/static/img/bhim.svg" alt="BHIM" class="upi-app-icon" />
                                <img src="/payment_hdfc_upi_qr/static/img/amazonpay.svg" alt="Amazon Pay" class="upi-app-icon" />
                                <img src="/payment_hdfc_upi_qr/static/img/cred.svg" alt="CRED" class="upi-app-icon" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `

    // Add modal to body
    document.body.insertAdjacentHTML("beforeend", modalHtml)
  }

  /**
   * Bind modal events
   * @private
   */
  _bindEvents() {
    // Close button with confirmation
    document.getElementById("closeUpiModal").addEventListener("click", () => {
      this._handleModalClose("User clicked close button")
    })

    // Click outside to close with confirmation
    document.getElementById("upiPaymentModal").addEventListener("click", (e) => {
      if (e.target.id === "upiPaymentModal") {
        this._handleModalClose("User clicked outside modal")
      }
    })

    // Escape key to close with confirmation
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        this._handleModalClose("User pressed Escape key")
      }
    })

    // Browser beforeunload event handling
    this._setupBeforeUnloadHandler()
  }

  /**
   * Show modal with transaction data
   * @param {Object} transactionData - Transaction data
   */
  show(transactionData) {
    console.log("Showing UPI modal with transaction data:", transactionData)

    // Ensure we have a transaction ID
    if (!transactionData.transaction_id) {
      console.error("No transaction ID provided to modal")
      this._showStatus("error", _t("Transaction ID missing. Please try again."))
      return
    }

    this.transactionId = transactionData.transaction_id
    this._finalStateReceived = false // Reset state tracking
    this._qrExpired = false // Reset QR expiry state
    this._isRedirecting = false // Reset redirect flag

    // Show modal
    const modal = document.getElementById("upiPaymentModal")
    if (!modal) {
      console.error("Modal element not found, recreating...")
      this._createModal()
      this._bindEvents()
    }

    modal.classList.add("show")
    this.isOpen = true

    // Prevent body scroll
    document.body.style.overflow = "hidden"

    // Setup beforeunload handler when modal is shown
    this._setupBeforeUnloadHandler()

    // Update merchant name and amount immediately
    document.getElementById("merchantName").textContent = transactionData.merchant_name || "HDFC UPI"
    document.getElementById("amountValue").textContent = transactionData.amount

    // Load QR code data
    this._loadQrCode(transactionData.transaction_id)
  }

  /**
   * Load QR code for transaction
   * @private
   * @param {number} transactionId
   */
  _loadQrCode(transactionId) {
    console.log("Loading QR code for transaction:", transactionId)

    if (!transactionId) {
      console.error("No transaction ID provided to _loadQrCode")
      this._showStatus("error", _t("Transaction ID missing"))
      return
    }

    // Show loading state
    this._showStatus("info", _t("Generating QR code..."))

    // Add timeout for QR code loading
    const qrLoadTimeout = setTimeout(() => {
      console.error("QR code loading timeout")
      this._showStatus("error", _t("QR code generation timed out. Please try again."))
    }, 30000) // 30 second timeout

    rpc(`/payment/hdfc_upi/get_qr_data/${transactionId}`, {})
      .then((response) => {
        clearTimeout(qrLoadTimeout)
        console.log("QR data response:", response)

        if (response.success) {
          this._displayQrCode(response)
        } else {
          this._showStatus("error", response.error || _t("Failed to generate QR code"))
        }
      })
      .catch((error) => {
        clearTimeout(qrLoadTimeout)
        console.error("Error loading QR code:", error)
        
        // Enhanced error handling for different scenarios
        let errorMessage = _t("Failed to load QR code")
        
        if (error.name === 'AbortError' || error.message?.toLowerCase().includes('abort')) {
          errorMessage = _t("QR code loading was cancelled")
        } else if (error.name === 'TimeoutError' || error.message?.toLowerCase().includes('timeout')) {
          errorMessage = _t("QR code loading timed out. Please check your connection and try again.")
        } else if (error.message?.toLowerCase().includes('network') || 
                   error.message?.toLowerCase().includes('fetch') ||
                   error.message?.toLowerCase().includes('connection')) {
          errorMessage = _t("Network error. Please check your internet connection and try again.")
        } else if (error.status >= 500) {
          errorMessage = _t("Server error. Please try again later.")
        } else if (error.status === 404) {
          errorMessage = _t("Transaction not found. Please refresh the page and try again.")
        } else if (error.status >= 400) {
          errorMessage = _t("Invalid request. Please refresh the page and try again.")
        }
        
        this._showStatus("error", errorMessage)
        
        // Provide retry option for certain errors
        if (!error.name?.includes('Abort') && !this._finalStateReceived) {
          setTimeout(() => {
            if (this.isOpen && !this._finalStateReceived) {
              this._showRetryOption(transactionId)
            }
          }, 3000)
        }
      })
  }

  /**
   * Show retry option for QR code loading
   * @private
   * @param {number} transactionId
   /**
   * Show retry option for QR code loading
   * @private
   * @param {number} transactionId
   */
  _showRetryOption(transactionId) {
    const statusEl = document.getElementById("statusMessage")
    if (statusEl && statusEl.classList.contains("error")) {
      statusEl.innerHTML = `
        ${statusEl.textContent}
        <br>
        <button class="retry-qr-btn" style="margin-top: 10px; padding: 8px 16px; background: #007cba; color: white; border: none; border-radius: 4px; cursor: pointer;">
          ${_t("Retry")}
        </button>
      `
      
      const retryBtn = statusEl.querySelector('.retry-qr-btn')
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          console.log("Retrying QR code load")
          this._loadQrCode(transactionId)
        })
      }
    }
  }

  /**
   * Display QR code in modal
   * @private
   * @param {Object} qrData
   */
  _displayQrCode(qrData) {
    console.log("Displaying QR code with data:", qrData)

    // Hide loading
    document.getElementById("qrLoading").style.display = "none"

    // Show QR code
    const qrContainer = document.getElementById("qrContainer")
    const qrImage = document.getElementById("qrCodeImage")

    if (qrData.qr_code) {
      qrImage.src = qrData.qr_code
      qrImage.onload = () => {
        console.log("QR code image loaded successfully")
      }
      qrImage.onerror = () => {
        console.error("Failed to load QR code image")
        this._showStatus("error", _t("Failed to display QR code"))
        return
      }
      qrContainer.style.display = "block"
    } else {
      console.error("No QR code data received")
      this._showStatus("error", _t("No QR code data received"))
      return
    }

    // Update merchant name and amount (in case they weren't set earlier)
    document.getElementById("merchantName").textContent = qrData.merchant_name || "HDFC UPI"
    document.getElementById("amountValue").textContent = qrData.amount

    // Start timer
    this._startTimer(qrData.expiry_seconds || 300)

    // Show initial status
    this._showStatus("info", _t("Scan the QR code to complete your payment"))

    // Start monitoring transaction status
    this._startPaymentMonitoring(this.transactionId)
  }

  /**
   * Start payment monitoring
   * @private
   * @param {number} transactionId
   */
  _startPaymentMonitoring(transactionId) {
    console.log("Starting payment monitoring for transaction:", transactionId)

    // Check every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this._checkPaymentStatus(transactionId)
    }, 5000)
  }

  /**
   * Check payment status
   * @private
   * @param {number} transactionId
   */
  _checkPaymentStatus(transactionId) {
    rpc(`/payment/status/poll`, {})
      .then((result) => {
        console.log("Payment status result:", result)

        // The poll endpoint returns the monitored transaction's state directly
        if (result.state && result.state !== 'draft') {
          console.log("Transaction state changed:", result.state)
          this._handleStateChange(result.state, result.landing_route)
        }
      })
      .catch((error) => {
        console.error("Error checking payment status:", error)
        
        // Handle specific error cases
        if (error.message === 'retry') {
          console.log("Retrying status check due to database error")
          // Don't stop monitoring, just continue
        } else {
          console.error("Payment status polling error:", error)
        }
      })
  }

  /**
   * Handle transaction state change
   * @private
   * @param {string} state
   * @param {string} landingRoute
   */
  _handleStateChange(state, landingRoute) {
    this._finalStateReceived = true
    this._isRedirecting = true // Set flag before removing handler
    
    // Remove beforeunload handler immediately to prevent dialog
    this._removeBeforeUnloadHandler()
    
    this._stopMonitoring()
    console.log("Handling state change:", state, "Landing route:", landingRoute)

    // Show appropriate status message based on state
    let statusMessage = _t("Payment status updated. Redirecting...")
    let statusType = "info"

    switch (state) {
      case "done":
        statusMessage = _t("Payment completed successfully! Redirecting...")
        statusType = "success"
        break
      case "cancel":
      case "error":
        statusMessage = _t("Payment failed. Redirecting...")
        statusType = "error"
        break
      case "pending":
        statusMessage = _t("Payment is being processed. Redirecting...")
        statusType = "info"
        break
    }

    this._showStatus(statusType, statusMessage)

    // Redirect to the landing route (inline flow)
    setTimeout(() => {
      console.log("Redirecting to landing route:", landingRoute)
      window.location.href = landingRoute || "/shop/payment/validate"
    }, 2000)
  }

  /**
   * Handle QR code expiry
   * @private
   * @param {string} message
   */
  _handleQrExpiry(message) {
    // Mark as final state and remove handler immediately
    this._finalStateReceived = true
    this._qrExpired = true
    this._isRedirecting = true // Set flag before removing handler
    this._removeBeforeUnloadHandler()
    
    this._stopMonitoring()
    this._showStatus("error", message || _t("QR code has expired. Redirecting..."))

    // Update timer
    document.getElementById("timerValue").textContent = _t("Expired")
    document.getElementById("timerContainer").classList.add("warning")

    // Redirect to payment status page
    setTimeout(() => {
      console.log("Redirecting to payment status page due to QR expiry...")
      window.location.href = "/payment/status"
    }, 2000)
  }

  /**
   * Start countdown timer
   * @private
   * @param {number} seconds
   */
  _startTimer(seconds) {
    this.remainingSeconds = seconds
    this._updateTimer()

    this.timerInterval = setInterval(() => {
      this._updateTimer()
    }, 1000)
  }

  /**
   * Update timer display
   * @private
   */
  _updateTimer() {
    if (this.remainingSeconds <= 0) {
      // Mark as final state and remove handler immediately
      this._finalStateReceived = true
      this._qrExpired = true
      this._isRedirecting = true // Set flag before removing handler
      this._removeBeforeUnloadHandler()
      
      this._stopMonitoring()
      this._showStatus("error", _t("QR code has expired. Redirecting..."))
      
      // Update timer display
      document.getElementById("timerValue").textContent = _t("Expired")
      document.getElementById("timerContainer").classList.add("warning")
      
      // Redirect to payment status page for expired QR
      setTimeout(() => {
        console.log("Redirecting to payment status page due to timer expiry...")
        window.location.href = "/payment/status"
      }, 2000)
      return
    }

    const minutes = Math.floor(this.remainingSeconds / 60)
    const seconds = this.remainingSeconds % 60

    document.getElementById("timerValue").textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`

    // Add warning when less than 1 minute
    if (this.remainingSeconds < 60) {
      document.getElementById("timerContainer").classList.add("warning")
    }

    this.remainingSeconds--
  }

  /**
   * Show status message
   * @private
   * @param {string} type - success, error, info
   * @param {string} message
   */
  _showStatus(type, message) {
    const statusEl = document.getElementById("statusMessage")
    statusEl.className = `status-message show ${type}`
    statusEl.textContent = message
  }

  /**
   * Close modal
   */
  close() {
    const modal = document.getElementById("upiPaymentModal")
    modal.classList.remove("show")
    this.isOpen = false

    // Restore body scroll
    document.body.style.overflow = ""

    // Remove beforeunload handler since modal is closing
    this._removeBeforeUnloadHandler()

    // Stop monitoring
    this._stopMonitoring()

    // Reset modal state
    setTimeout(() => {
      this._resetModal()
    }, 300)
  }

  /**
   * Reset modal to initial state
   * @private
   */
  _resetModal() {
    document.getElementById("qrLoading").style.display = "flex"
    document.getElementById("qrContainer").style.display = "none"
    document.getElementById("statusMessage").className = "status-message"
    document.getElementById("timerContainer").classList.remove("warning")
    document.getElementById("merchantName").textContent = "Loading..."
    document.getElementById("amountValue").textContent = "0"
    
    // Reset internal state
    this.transactionId = null
    this._finalStateReceived = false
    this._qrExpired = false // Reset QR expiry state
    this._isRedirecting = false // Reset redirect flag
  }

  /**
   * Stop all monitoring
   * @private
   */
  _stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  /**
   * Destroy modal
   */
  destroy() {
    this._stopMonitoring()
    this._removeBeforeUnloadHandler()

    // Remove modal from DOM
    const modal = document.getElementById("upiPaymentModal")
    if (modal) {
      modal.remove()
    }
    
    // Reset global reference
    if (globalUpiModal === this) {
      globalUpiModal = null
    }
  }

  /**
   * Setup browser beforeunload event handler to handle browser/tab closure
   * @private
   */
  _setupBeforeUnloadHandler() {
    const handleBeforeUnload = (e) => {
      // Don't cancel transaction if we're in the middle of an intended redirect
      if (this.isOpen && this.transactionId && !this._isRedirecting) {
        // Cancel transaction immediately without confirmation
        this._cancelTransaction("Browser/tab closed during payment")
        
        // Show browser confirmation dialog
        const message = "Your payment is in progress. Are you sure you want to leave?"
        e.preventDefault()
        e.returnValue = message
        return message
      }
    }

    // Store reference to remove later
    this._beforeUnloadHandler = handleBeforeUnload
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  /**
   * Remove beforeunload event handler
   * @private
   */
  _removeBeforeUnloadHandler() {
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler)
      this._beforeUnloadHandler = null
    }
  }

  /**
   * Handle modal close with confirmation
   * @private
   * @param {string} reason - Reason for closing
   */
  _handleModalClose(reason) {
    console.log("Modal close requested:", reason)

    // If payment is completed or already cancelled, close immediately
    if (!this.transactionId || this._isTransactionFinalized()) {
      // If QR has expired, redirect to payment status instead of reloading
      if (this._qrExpired && this.transactionId) {
        this.close()
        
        setTimeout(() => {
          console.log("Redirecting to payment status after QR expiry...")
          window.location.href = "/payment/status"
        }, 500)
        return
      }
      
      this.close()
      return
    }

    // Show confirmation dialog
    this._showCloseConfirmation(reason)
  }

  /**
   * Check if transaction is in a finalized state
   * @private
   * @returns {boolean}
   */
  _isTransactionFinalized() {
    // If we have received a final state via bus, don't ask for confirmation
    return this._finalStateReceived === true
  }

  /**
   * Show close confirmation dialog
   * @private
   * @param {string} reason - Reason for closing
   */
  _showCloseConfirmation(reason) {
    const shouldConfirm = confirm(
      "Your payment is in progress. Closing this window will cancel the payment. Are you sure you want to continue?"
    )

    if (shouldConfirm) {
      console.log("User confirmed modal close")
      this._cancelTransaction(`Payment cancelled: ${reason}`)
      
      // Close modal first
      this.close()
      
      // Reload the payment page to show available payment methods
      setTimeout(() => {
        console.log("Reloading payment page after user cancellation...")
        window.location.reload()
      }, 500)
    } else {
      console.log("User cancelled modal close")
    }
  }

  /**
   * Cancel the transaction
   * @private
   * @param {string} reason - Reason for cancellation
   */
  _cancelTransaction(reason) {
    if (!this.transactionId) {
      console.warn("No transaction ID to cancel")
      return
    }

    console.log("Cancelling transaction:", this.transactionId, "Reason:", reason)

    // Cancel transaction on server
    rpc(`/payment/hdfc_upi/cancel_transaction/${this.transactionId}`, {
      reason: reason
    }).then((result) => {
      if (result.success) {
        console.log("Transaction cancelled successfully:", result)
        this._showStatus("warning", result.message || "Your payment has been cancelled.")
      } else {
        console.error("Failed to cancel transaction:", result.error)
        // Still show cancelled status to user
        this._showStatus("warning", "Your payment has been cancelled.")
      }
    }).catch((error) => {
      console.error("Error cancelling transaction:", error)
      // Still show cancelled status to user
      this._showStatus("warning", "Your payment has been cancelled.")
    })

    // Mark transaction as cancelled locally
    this._finalStateReceived = true
  }
}
