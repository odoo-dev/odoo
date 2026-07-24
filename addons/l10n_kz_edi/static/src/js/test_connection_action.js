import { Component, onMounted, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

// wss:// (not ws://): NCALayer only accepts a TLS handshake on 13579.
const NCALAYER_URL = "wss://127.0.0.1:13579";

/**
 * Sign an XML payload browser-side through NCALayer, resolving with the signed
 * XML string.
 */
export function signWithNCALayer(xml) {
    return new Promise((resolve, reject) => {
        let socket;
        try {
            socket = new WebSocket(NCALAYER_URL);
        } catch (error) {
            reject(error);
            return;
        }
        // Several frames arrive before the answer, so settling is idempotent.
        let settled = false;
        const settle = (outcome, value) => {
            if (settled) {
                return;
            }
            settled = true;
            socket.close();
            outcome(value);
        };
        socket.onerror = () => settle(reject, new Error(_t("NCALayer is not reachable.")));
        socket.onclose = () =>
            settle(reject, new Error(_t("NCALayer closed the connection before signing.")));
        socket.onopen = () => {
            // AUTHENTICATION, not SIGNATURE: createSession needs the auth key
            // (EKU 1.2.398.3.3.4.1.2), else NCALayer reports "no keys for signing".
            socket.send(
                JSON.stringify({
                    module: "kz.gov.pki.knca.commonUtils",
                    method: "signXml",
                    args: ["PKCS12", "AUTHENTICATION", xml, "", ""],
                })
            );
        };
        socket.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                settle(reject, new Error(_t("Unexpected response from NCALayer.")));
                return;
            }
            // Ignore the on-connect version frame and heartbeats; only a frame
            // carrying `code` answers signXml.
            if (!data || data.code === undefined) {
                return;
            }
            if (data.code === "200" && data.responseObject) {
                settle(resolve, data.responseObject);
            } else {
                settle(reject, new Error(data.message || _t("NCALayer refused to sign the ticket.")));
            }
        };
    });
}

export class L10nKzEdiTestConnection extends Component {
    static template = "l10n_kz_edi.TestConnection";
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            running: true,
            checks: [
                { label: _t("Check 1 — Server reachability"), message: "", status: "pending" },
                { label: _t("Check 2 — Authentication"), message: "", status: "pending" },
                { label: _t("Check 3 — Enterprise validation"), message: "", status: "pending" },
            ],
        });
        const params = (this.props.action && this.props.action.params) || {};
        this.companyId = params.company_id;

        // onMounted, not onWillStart, so the dialog renders before the checks run.
        onMounted(() => this.runChecks());
    }

    iconClass(check) {
        return {
            pending: "fa fa-fw fa-circle-o text-muted",
            running: "fa fa-fw fa-circle-o-notch fa-spin text-muted",
            success: "fa fa-fw fa-check-circle text-success",
            failure: "fa fa-fw fa-times-circle text-danger",
            skipped: "fa fa-fw fa-minus-circle text-muted",
        }[check.status];
    }

    async _signTicket(xml) {
        return signWithNCALayer(xml);
    }

    _pass(check, message) {
        check.status = "success";
        check.message = message;
    }

    _fail(check, message) {
        check.status = "failure";
        check.message = message;
    }

    _skip(check) {
        check.status = "skipped";
        check.message = _t("Not run.");
    }

    _describeError(error) {
        return error?.data?.message || error?.message || _t("An unknown error occurred.");
    }

    async runChecks() {
        const [reachability, authentication, enterprise] = this.state.checks;
        try {
            reachability.status = "running";
            try {
                await this.orm.call(
                    "res.company",
                    "l10n_kz_edi_check_reachability",
                    [[this.companyId]]
                );
                this._pass(reachability, _t("The ESF server is reachable."));
            } catch (error) {
                this._fail(reachability, this._describeError(error));
                this._skip(authentication);
                this._skip(enterprise);
                return;
            }

            // The browser only signs the ticket; the session is opened, read,
            // validated and closed server-side so a crash cannot leak a session.
            authentication.status = "running";
            let signedTicket;
            try {
                const ticket = await this.orm.call(
                    "res.company",
                    "l10n_kz_edi_create_auth_ticket",
                    [[this.companyId]]
                );
                signedTicket = await this._signTicket(ticket);
            } catch (error) {
                this._fail(
                    authentication,
                    `${_t("The ticket could not be signed.")} ${this._describeError(error)}`
                );
                this._skip(enterprise);
                return;
            }

            let result;
            try {
                result = await this.orm.call(
                    "res.company",
                    "l10n_kz_edi_run_signed_checks",
                    [[this.companyId], signedTicket]
                );
            } catch (error) {
                this._fail(authentication, this._describeError(error));
                this._skip(enterprise);
                return;
            }
            this._pass(authentication, result.summary || _t("Authentication succeeded."));

            // A soft negative comes back as a normal response, so the result
            // decides the colour rather than a raised error.
            enterprise.status = "running";
            const validation = result.enterprise_validation_result || {};
            if (validation.success) {
                this._pass(
                    enterprise,
                    validation.message || _t("Enterprise validation succeeded.")
                );
            } else {
                this._fail(
                    enterprise,
                    validation.message || _t("The enterprise could not be validated.")
                );
            }
        } finally {
            this.state.running = false;
        }
    }
}

registry.category("actions").add("l10n_kz_edi_test_connection", L10nKzEdiTestConnection);
