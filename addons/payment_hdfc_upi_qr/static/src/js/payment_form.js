import paymentForm from '@payment/js/payment_form';
import { _t } from '@web/core/l10n/translation';
import { rpc, RPCError } from '@web/core/network/rpc';

paymentForm.include({

    hdfcUpiComponents: undefined,

    // #=== DOM MANIPULATION ===#

    /**
     * Prepare the inline form of HDFC UPI for direct payment.
     *
     * @override method from payment.payment_form
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the selected payment option.
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'hdfc_upi') {
            this._super(...arguments);
            return;
        }

        this.hdfcUpiComponents ??= {};
        if (flow === 'token') {
            this._super(...arguments);
            return;
        } else if (this.hdfcUpiComponents[paymentOptionId]) {
            this._setPaymentFlow('direct');
            return;
        }

        this._setPaymentFlow('direct');
        this.hdfcUpiComponents[paymentOptionId] = true;
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
        if (providerCode !== 'hdfc_upi' || flow === 'token') {
            await this._super(...arguments);
            return;
        }

        if (!this.hdfcUpiComponents[paymentOptionId]) {
            this._enableButton();
            return;
        }

        // Basic validation
        const amount = this.paymentContext.amount;
        if (!amount || amount <= 0 || amount > 100000) {
            this._displayErrorDialog(_t("Validation Error"),
                amount <= 0 ? _t("Please enter a valid payment amount") :
                _t("Maximum UPI QR payment amount is ₹1,00,000.00"));
            this._enableButton();
            return;
        }

        // Create transaction and show UPI modal
        rpc(this.paymentContext['transactionRoute'], this._prepareTransactionRouteParams())
            .then(processingValues => {
                if (!processingValues?.transaction_id) {
                    throw new Error(_t("Invalid response from server"));
                }
                this._showUpiPayment(processingValues);
            })
            .catch(error => {
                const errorMessage = error instanceof RPCError ?
                    error.data?.message || _t("Server error occurred") :
                    error.message || _t("An unexpected error occurred");
                this._displayErrorDialog(_t("Payment Processing Failed"), errorMessage);
                this._enableButton();
            });
    },

    // #=== UPI MODAL MANAGEMENT ===#

    /**
     * Show HDFC UPI payment modal and handle QR code generation.
     *
     * @private
     * @param {object} processingValues - The processing values from transaction creation.
     * @return {void}
     */
    _showUpiPayment(processingValues) {
        this._createUpiModal();
        this._showUpiModal(processingValues);
    },

    /**
     * Create UPI modal DOM structure.
     *
     * @private
     * @return {void}
     */
    _createUpiModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById("upiPaymentModal");
        if (existingModal) {
            existingModal.remove();
        }

        // Remove existing confirmation modal if any
        const existingConfirmModal = document.getElementById("upiConfirmationModal");
        if (existingConfirmModal) {
            existingConfirmModal.remove();
        }

        const modalHtml = `
            <div class="upi-payment-modal" id="upiPaymentModal">
                <div class="upi-modal-content">
                    <div class="upi-modal-header">
                        <button class="upi-modal-close" id="closeUpiModal">&times;</button>
                        <h2 class="merchant-name" id="merchantName">Loading...</h2>
                        <p class="payment-title">${_t("Pay With UPI QR")}</p>
                    </div>
                    <div class="upi-modal-body">
                        <div class="qr-loading" id="qrLoading">
                            <div class="loading-spinner"></div>
                            <p class="mt-2">${_t("Generating QR code...")}</p>
                        </div>
                        <div id="qrContainer" style="display: none;">
                            <img class="qr-code-image" id="qrCodeImage" alt="${_t("UPI QR Code")}" />
                        </div>

                        <div class="payment-amount" id="paymentAmount">
                            ${_t("Amount")}: <span class="currency">₹</span> <span id="amountValue">0</span>
                        </div>

                        <p class="scan-instruction">
                            ${_t("Scan the QR using any UPI app on your phone.")}
                        </p>

                        <div class="timer-container" id="timerContainer">
                            <span class="timer-icon">⏰</span>
                            <span class="timer-text">${_t("Expires in")}: </span>
                            <span class="timer-value" id="timerValue">5:00</span>
                        </div>

                        <div class="status-message" id="statusMessage"></div>

                        <div class="upi-apps-container">
                            <p class="upi-apps-title">${_t("Supported UPI Apps")}</p>
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
        `;

        // Add modal to body
        document.body.insertAdjacentHTML("beforeend", modalHtml);
    },

    /**
     * Show UPI modal with transaction data.
     *
     * @private
     * @param {object} processingValues - Processing values from transaction.
     * @return {void}
     */
    _showUpiModal(processingValues) {
        if (!processingValues.transaction_id) {
            this._showUpiStatus("error", _t("Transaction ID missing. Please try again."));
            return;
        }

        this.upiTransactionId = processingValues.transaction_id;
        this.upiFinalStateReceived = false;
        this.upiModalOpen = true;

        const modal = document.getElementById("upiPaymentModal");
        modal.classList.add("show");
        document.body.style.overflow = "hidden";

        this._setupBeforeUnloadHandler();
        this._updateModalContent(processingValues);
        this._bindModalEvents();

        // Display QR code from processing values
        if (processingValues.qr_code_data) {
            this._displayQrCode(processingValues);
        } else {
            this._showUpiStatus("error", _t("Failed to generate QR code. Please try again."));
        }
    },

    /**
     * Update modal content with transaction data.
     *
     * @private
     * @param {object} processingValues - Processing values.
     * @return {void}
     */
    _updateModalContent(processingValues) {
        document.getElementById("merchantName").textContent =
            processingValues.merchant_name || "HDFC UPI";
        document.getElementById("amountValue").textContent = processingValues.amount;
    },

    // #=== QR CODE MANAGEMENT ===#

    /**
     * Display QR code in modal.
     *
     * @private
     * @param {object} processingValues - The processing values containing QR data.
     * @return {void}
     */
    _displayQrCode(processingValues) {
        document.getElementById("qrLoading").style.display = "none";

        const qrImage = document.getElementById("qrCodeImage");
        qrImage.src = processingValues.qr_code_data;
        qrImage.onload = () => {
            document.getElementById("qrContainer").style.display = "block";
            this._showUpiStatus("info", _t("Scan the QR code to complete your payment"));
            this._startTimer(processingValues.expiry_seconds || 300);
            this._startMonitoring(this.upiTransactionId);
        };
        qrImage.onerror = () => {
            this._showUpiStatus("error", _t("Failed to display QR code"));
        };
    },

    // #=== EVENT HANDLERS ===#

    /**
     * Bind events for the UPI modal.
     *
     * @private
     * @return {void}
     */
    _bindModalEvents() {
        document.getElementById("closeUpiModal").addEventListener("click", () => {
            this._handleModalClose();
        });

        document.getElementById("upiPaymentModal").addEventListener("click", (e) => {
            if (e.target.id === "upiPaymentModal") {
                this._handleModalClose();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.upiModalOpen) {
                this._handleModalClose();
            }
        });
    },

    // #=== TIMER MANAGEMENT ===#

    /**
     * Start UPI timer.
     *
     * @private
     * @param {number} seconds - Timer duration in seconds.
     * @return {void}
     */
    _startTimer(seconds) {
        this.upiRemainingSeconds = seconds;
        this._updateTimer();

        this.timerInterval = setInterval(() => {
            this._updateTimer();
        }, 1000);
    },

    /**
     * Update UPI timer display.
     *
     * @private
     * @return {void}
     */
    _updateTimer() {
        if (this.upiRemainingSeconds <= 0) {
            this.upiFinalStateReceived = true;
            this._removeBeforeUnloadHandler();
            this._stopMonitoring();
            this._showUpiStatus("error", _t("QR code has expired. Redirecting..."));

            document.getElementById("timerValue").textContent = _t("Expired");
            document.getElementById("timerContainer").classList.add("warning");

            setTimeout(() => {
                window.location = "/payment/status";
            }, 2000);
            return;
        }

        const minutes = Math.floor(this.upiRemainingSeconds / 60);
        const seconds = this.upiRemainingSeconds % 60;
        document.getElementById("timerValue").textContent =
            `${minutes}:${seconds.toString().padStart(2, "0")}`;

        if (this.upiRemainingSeconds < 60) {
            document.getElementById("timerContainer").classList.add("warning");
        }

        this.upiRemainingSeconds--;
    },

    // #=== PAYMENT MONITORING ===#

    /**
     * Start UPI payment monitoring.
     *
     * @private
     * @param {number} transactionId - The transaction ID.
     * @return {void}
     */
    _startMonitoring(transactionId) {
        this.monitoringInterval = setInterval(() => {
            this._checkPaymentStatus();
        }, 5000);
    },

    /**
     * Check UPI payment status.
     *
     * @private
     * @return {void}
     */
    _checkPaymentStatus() {
        rpc('/payment/status/poll', {})
            .then(result => {
                if (result.state && result.state !== 'draft') {
                    this._handleStateChange(result.state, result.landing_route);
                }
            })
            .catch(() => {
                // Silently continue monitoring
            });
    },

    /**
     * Handle UPI transaction state change.
     *
     * @private
     * @param {string} state - The transaction state.
     * @param {string} landingRoute - The landing route URL.
     * @return {void}
     */
    _handleStateChange(state, landingRoute) {
        this.upiFinalStateReceived = true;
        this._removeBeforeUnloadHandler();
        this._stopMonitoring();

        const messages = {
            done: _t("Payment completed successfully! Redirecting..."),
            cancel: _t("Payment failed. Redirecting..."),
            error: _t("Payment failed. Redirecting..."),
            pending: _t("Payment is being processed. Redirecting...")
        };

        const statusType = state === "done" ? "success" : state === "pending" ? "info" : "error";
        this._showUpiStatus(statusType, messages[state] || _t("Payment status updated. Redirecting..."));

        setTimeout(() => {
            window.location = landingRoute;
        }, 2000);
    },

    /**
     * Show UPI status message.
     *
     * @private
     * @param {string} type - The status type (success, error, info).
     * @param {string} message - The status message.
     * @return {void}
     */
    _showUpiStatus(type, message) {
        const statusEl = document.getElementById("statusMessage");
        if (statusEl) {
            statusEl.className = `status-message show ${type}`;
            statusEl.textContent = message;
        }
    },

    // #=== BROWSER HANDLERS ===#

    /**
     * Setup beforeunload handler.
     *
     * @private
     * @return {void}
     */
    _setupBeforeUnloadHandler() {
        this.upiBeforeUnloadHandler = (e) => {
            if (this.upiModalOpen && this.upiTransactionId && !this.upiFinalStateReceived) {
                this._cancelTransaction();
                e.preventDefault();
                e.returnValue = "Your payment is in progress. Are you sure you want to leave?";
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', this.upiBeforeUnloadHandler);
    },

    /**
     * Remove beforeunload handler.
     *
     * @private
     * @return {void}
     */
    _removeBeforeUnloadHandler() {
        if (this.upiBeforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.upiBeforeUnloadHandler);
            this.upiBeforeUnloadHandler = null;
        }
    },

    // #=== MODAL LIFECYCLE ===#

    /**
     * Handle modal close with confirmation.
     *
     * @private
     * @return {void}
     */
    _handleModalClose() {
        if (!this.upiTransactionId || this.upiFinalStateReceived) {
            this._closeModal();
            return;
        }

        // Show custom confirmation dialog
        this._showCloseConfirmation();
    },

    /**
     * Show custom close confirmation dialog.
     *
     * @private
     * @return {void}
     */
    _showCloseConfirmation() {
        // Remove existing confirmation modal if any
        const existingConfirmModal = document.getElementById("upiConfirmationModal");
        if (existingConfirmModal) {
            existingConfirmModal.remove();
        }

        // Create confirmation modal
        const confirmModalHtml = `
            <div class="upi-confirmation-modal" id="upiConfirmationModal">
                <div class="upi-confirmation-content">
                    <div class="upi-confirmation-header">
                        <div class="warning-icon">⚠️</div>
                        <h3 class="confirmation-title">${_t("Cancel Payment?")}</h3>
                    </div>
                    <div class="upi-confirmation-body">
                        <p class="confirmation-message">
                            <strong>${_t("Your UPI payment is currently in progress.")}</strong>
                        </p>
                        <p class="confirmation-details">
                            ${_t("Are you sure you want to cancel and return to the payment selection page?")}
                        </p>
                    </div>
                    <div class="upi-confirmation-actions">
                        <button class="btn-cancel-payment" data-action="confirm">
                            ${_t("Yes, Cancel Payment")}
                        </button>
                        <button class="btn-continue-payment" data-action="dismiss">
                            ${_t("Continue Payment")}
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add to DOM
        document.body.insertAdjacentHTML("beforeend", confirmModalHtml);

        // Get the modal element
        const confirmModal = document.getElementById("upiConfirmationModal");

        // Animate in
        requestAnimationFrame(() => {
            confirmModal.classList.add('show');
        });

        // Handle actions
        const handleAction = (action) => {
            confirmModal.classList.remove('show');
            
            setTimeout(() => {
                confirmModal.remove();
                
                if (action === 'confirm') {
                    this._cancelTransaction();
                    this._closeModal();
                    setTimeout(() => window.location.reload(), 500);
                }
            }, 300);
        };

        // Add event listeners
        confirmModal.querySelector('.btn-cancel-payment').addEventListener('click', () => {
            handleAction('confirm');
        });

        confirmModal.querySelector('.btn-continue-payment').addEventListener('click', () => {
            handleAction('dismiss');
        });

        // Click outside to dismiss
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                handleAction('dismiss');
            }
        });

        // Escape key to dismiss
        const handleKeyPress = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleKeyPress);
                handleAction('dismiss');
            }
        };
        document.addEventListener('keydown', handleKeyPress);
    },

    /**
     * Cancel UPI transaction.
     *
     * @private
     * @return {void}
     */
    _cancelTransaction() {
        if (this.upiTransactionId) {
            rpc(`/payment/hdfc_upi/cancel_transaction/${this.upiTransactionId}`, {
                reason: "Payment cancelled by user"
            }).catch(() => {
                // Silent fail - transaction will timeout naturally
            });
            this.upiFinalStateReceived = true;
        }
    },

    /**
     * Close UPI modal.
     *
     * @private
     * @return {void}
     */
    _closeModal() {
        const modal = document.getElementById("upiPaymentModal");
        if (modal) {
            modal.classList.remove("show");
        }

        this.upiModalOpen = false;
        document.body.style.overflow = "";
        this._removeBeforeUnloadHandler();
        this._stopMonitoring();

        setTimeout(() => {
            this._resetModal();
            this._enableButton();
        }, 300);
    },

    /**
     * Reset modal to initial state.
     *
     * @private
     * @return {void}
     */
    _resetModal() {
        const elements = {
            qrLoading: document.getElementById("qrLoading"),
            qrContainer: document.getElementById("qrContainer"),
            statusMessage: document.getElementById("statusMessage"),
            timerContainer: document.getElementById("timerContainer"),
            merchantName: document.getElementById("merchantName"),
            amountValue: document.getElementById("amountValue")
        };

        if (elements.qrLoading) elements.qrLoading.style.display = "flex";
        if (elements.qrContainer) elements.qrContainer.style.display = "none";
        if (elements.statusMessage) elements.statusMessage.className = "status-message";
        if (elements.timerContainer) elements.timerContainer.classList.remove("warning");
        if (elements.merchantName) elements.merchantName.textContent = "Loading...";
        if (elements.amountValue) elements.amountValue.textContent = "0";

        this.upiTransactionId = null;
        this.upiFinalStateReceived = false;
    },

    /**
     * Stop monitoring and timers.
     *
     * @private
     * @return {void}
     */
    _stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    },

});
