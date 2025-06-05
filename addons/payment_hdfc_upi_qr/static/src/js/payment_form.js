/** @odoo-module **/

import paymentForm from "@payment/js/payment_form"
import { _t } from "@web/core/l10n/translation"
import { rpc } from "@web/core/network/rpc"
import { registry } from "@web/core/registry"

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
    this.busSubscription = null
    this.busChannel = null
    this.busInstance = null
    this.timerInterval = null
    this.monitoringInterval = null
    this.remainingSeconds = 0
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
                        <div class="qr-code-container" id="qrContainer" style="display: none;">
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
                                <img src="/l10n_in/static/src/img/Google_Pay-Logo.svg" alt="Google Pay" class="upi-app-icon" />
                                <img src="/l10n_in/static/src/img/Paytm-Logo.svg" alt="Paytm" class="upi-app-icon" />
                                <img src="/l10n_in/static/src/img/PhonePe-Logo.svg" alt="PhonePe" class="upi-app-icon" />
                                <img src="/l10n_in/static/src/img/BHIM-Logo.svg" alt="BHIM" class="upi-app-icon" />
                                <img src="/l10n_in/static/src/img/Cred-Logo.svg" alt="CRED" class="upi-app-icon" />
                            </div>
                        </div>
                        
                        <div class="powered-by">
                            <p class="powered-by-text">
                                QR Code by <span class="powered-by-brand">HDFC Bank</span>
                            </p>
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
    // Close button
    document.getElementById("closeUpiModal").addEventListener("click", () => {
      this.close()
    })

    // Click outside to close
    document.getElementById("upiPaymentModal").addEventListener("click", (e) => {
      if (e.target.id === "upiPaymentModal") {
        this.close()
      }
    })

    // Escape key to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        this.close()
      }
    })
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

    rpc(`/payment/hdfc_upi/get_qr_data/${transactionId}`, {})
      .then((response) => {
        console.log("QR data response:", response)

        if (response.success) {
          this._displayQrCode(response)
        } else {
          this._showStatus("error", response.error || _t("Failed to generate QR code"))
        }
      })
      .catch((error) => {
        console.error("Error loading QR code:", error)
        this._showStatus("error", _t("Failed to load QR code. Please try again."))
      })
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

    // Setup bus service for real-time updates
    this._setupBusService(qrData.bus_channel || `payment_hdfc_upi_${this.transactionId}`)
  }

  /**
   * Setup bus service for real-time payment updates
   * @private
   * @param {string} channel - Bus channel for this transaction
   */
  _setupBusService(channel) {
    this.busChannel = channel
    console.log("Setting up bus service for channel:", channel)

    try {
      // Get the bus service from the registry
      const serviceRegistry = registry.category("services")
      if (!serviceRegistry.contains("bus_service")) {
        console.warn("Bus service not available, falling back to polling")
        this._startPaymentMonitoring(this.transactionId)
        return
      }

      // Get the bus service instance
      const busServiceFactory = serviceRegistry.get("bus_service")
      
      // Create a minimal environment and services object for the bus service
      const env = {
        services: {
          bus_service: null,
          notification: {
            add: () => {}  // Minimal notification service
          },
          'bus.parameters': {
            serverURL: window.location.origin
          },
          localization: {},
          multi_tab: {
            setSharedValue: () => {},
            getSharedValue: () => 0,
            unregister: () => {}
          }
        }
      }
      
      // Start the bus service
      const busInstance = busServiceFactory.start(env, env.services)
      
      // Add the channel to listen for payment updates
      busInstance.addChannel(channel)
      
      // Subscribe to single notification type for all payment updates
      busInstance.subscribe('payment.transaction/updated', (payload, { id: notifId }) => {
        console.log("Received payment transaction update:", payload, "notifId:", notifId)
        
        // Check if this notification is for our transaction
        if (payload.transaction_id === this.transactionId) {
          this._handleBusTransactionUpdate(payload)
        }
      })
      
      // Store the bus instance for cleanup
      this.busInstance = busInstance
      
      console.log("Bus service subscription created for channel:", channel)
    } catch (error) {
      console.error("Error setting up bus service:", error)
      console.log("Falling back to polling method")
      this._startPaymentMonitoring(this.transactionId)
    }
  }

  /**
   * Handle bus transaction updates (unified for all payment events)
   * @private
   * @param {Object} payload - Transaction update payload
   */
  _handleBusTransactionUpdate(payload) {
    console.log("Received bus transaction update:", payload)
    
    const { state, state_message, notification_type, transaction_id } = payload
    
    // Verify this update is for our transaction
    if (transaction_id && transaction_id !== this.transactionId) {
      console.log("Transaction update for different transaction, ignoring")
      return
    }

    // Stop all monitoring
    this._stopMonitoring()

    // Show appropriate status message based on state
    let statusMessage = state_message || _t("Processing payment update...")
    let statusType = "info"

    switch (state) {
      case "done":
        statusMessage = state_message || _t("Payment completed successfully! Redirecting...")
        statusType = "success"
        break
      case "cancel":
      case "error":
        statusMessage = state_message || _t("Payment failed. Redirecting...")
        statusType = "error"
        break
      case "pending":
        statusMessage = state_message || _t("Payment is being processed. Redirecting...")
        statusType = "info"
        break
      default:
        statusMessage = state_message || _t("Payment status updated. Redirecting...")
        statusType = "info"
    }

    // Show status message
    this._showStatus(statusType, statusMessage)

    // Always redirect to payment status page after a short delay
    setTimeout(() => {
      console.log("Redirecting to payment status page...")
      window.location.href = "/payment/status"
    }, 2000)
  }

  /**
   * Start payment monitoring (fallback when bus service is not available)
   * @private
   * @param {number} transactionId
   */
  _startPaymentMonitoring(transactionId) {
    console.log("Starting fallback payment monitoring for transaction:", transactionId)

    // Check every 10 seconds (less frequent since this is fallback)
    this.monitoringInterval = setInterval(() => {
      this._checkPaymentStatus(transactionId)
    }, 10000)
  }

  /**
   * Check payment status (fallback method)
   * @private
   * @param {number} transactionId
   */
  _checkPaymentStatus(transactionId) {
    rpc(`/payment/hdfc_upi/check_status/${transactionId}`, {})
      .then((result) => {
        console.log("Payment status result:", result)

        if (result.state === "done") {
          this._handlePaymentSuccess(result.message)
        } else if (result.state === "cancel" || result.state === "error") {
          this._handlePaymentFailure(result.message)
        } else if (result.expired) {
          this._handleQrExpiry(result.message)
        }
      })
      .catch((error) => {
        console.error("Error checking payment status:", error)
      })
  }

  /**
   * Handle successful payment
   * @private
   * @param {string} message
   */
  _handlePaymentSuccess(message) {
    this._stopMonitoring()

    // Show success message
    this._showStatus("success", message || _t("Payment successful! Redirecting..."))

    // Add success animation
    document.getElementById("qrContainer").classList.add("success-animation")

    // Redirect after delay
    setTimeout(() => {
      window.location.href = "/payment/status"
    }, 2000)
  }

  /**
   * Handle payment failure
   * @private
   * @param {string} message
   */
  _handlePaymentFailure(message) {
    this._stopMonitoring()
    this._showStatus("error", message || _t("Payment failed. Please try again."))
  }

  /**
   * Handle QR code expiry
   * @private
   * @param {string} message
   */
  _handleQrExpiry(message) {
    this._stopMonitoring()
    this._showStatus("error", message || _t("QR code has expired. Please close and try again."))

    // Update timer
    document.getElementById("timerValue").textContent = _t("Expired")
    document.getElementById("timerContainer").classList.add("warning")
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
      this._handleQrExpiry()
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

    if (this.busInstance && this.busChannel) {
      // Remove the bus channel when cleaning up
      try {
        this.busInstance.deleteChannel(this.busChannel)
        this.busInstance.stop()
        this.busInstance = null
        this.busChannel = null
      } catch (error) {
        console.warn("Error cleaning up bus service:", error)
      }
    }
  }

  /**
   * Destroy modal
   */
  destroy() {
    this._stopMonitoring()

    // Remove modal from DOM
    const modal = document.getElementById("upiPaymentModal")
    if (modal) {
      modal.remove()
    }
  }
}
