import { Component, useState } from "@odoo/owl";
import { AWAY_DELAY } from "@bus/im_status_service";
import { Dialog } from "@web/core/dialog/dialog"
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { redirect } from "@web/core/utils/urls";
import { user } from "@web/core/user";
import { session } from "@web/session";

import { startAuthentication } from "../../../../../auth_passkey/static/lib/simplewebauthn.js";

export class CheckIdentityForm extends Component {
    static template = "auth_timeout.CheckIdentityForm";
    static props = {
        redirect: {type: String, optional: true},
    };

    setup() {
        super.setup();
        this.user = {
            userId: user.userId,
            login: user.login,
            authMethods: session.auth_methods,
        };
        this.state = useState({
            error: false,
            authMethod: this.user.authMethods[0],
        });
    }

    async onSubmit(ev) {
        const form = ev.target;
        if (form.querySelector('input[name="type"]').value === 'webauthn'){
            const serverOptions = await rpc("/auth/passkey/start-auth");
            const auth = await startAuthentication(serverOptions).catch(e => console.log(e));
            if(!auth) return false;
            form.querySelector('input[name="webauthn_response"]').value = JSON.stringify(auth);
        }
        const formData = new FormData(form);
        const formValues = Object.fromEntries(formData.entries());
        try {
            await rpc("/auth-timeout/session/check-identity", formValues);
            this.close();
        } catch (error) {
            if (error.data){
                this.state.error = error.data.message;
            }
            else{
                this.state.error = "Your identity could not be confirmed";
            }
        }
    }

    close(){
        redirect(this.props.redirect);
    }

    onChangeAuthMethod(ev){
        this.state.authMethod = ev.target.dataset.authMethod;
        this.state.error = false;
    }

}

export class CheckIdentityDialog extends CheckIdentityForm {
    static template = "auth_timeout.CheckIdentityDialog";
    static components = { Dialog };
    static props = {
        ...CheckIdentityForm.props,
        close: Function, // prop added by the Dialog service
    };

    close(){
        this.props.close();
    }
}

export class CheckIdentity {
    constructor(env) {
        this.env = env;
        /** @protected */
        this._promise = false;
    }
    run() {
        if (!this._promise) {
            this._promise = new Promise(async (resolve) => {
                this.env.services.dialog.add(CheckIdentityDialog, {}, {
                    onClose: () => {
                        resolve();
                        this._promise = false;
                    },
                });
            });
        }
        return this._promise;
    }
}

export const checkIdentity = {
    dependencies: ["presence"],
    start(env, { presence }) {
        patch(rpc, {
            _rpc(url, params, settings) {
                // `rpc._rpc` returns a promise with an additional attribute `.abort`
                // It needs to be forwarded to the new promise as some feature requires it.
                // e.g.
                // `record_autocomplete.js`
                // ```js
                // if (this.lastProm) {
                //     this.lastProm.abort(false);
                // }
                // this.lastProm = this.search(name, SEARCH_LIMIT + 1);
                // ```
                const rpcPromises = [];
                const rpcPromise = super._rpc(url, params, settings);
                rpcPromises.push(rpcPromise);
                const newPromise = rpcPromise.catch(error => {
                    if (error.data && error.data.name === "odoo.addons.auth_timeout.models.ir_http.CheckIdentityException"){
                        return env.services.check_identity.run().then(() => {
                            const rpcPromise = rpc._rpc(url, params, settings);
                            rpcPromises.push(rpcPromise);
                            return rpcPromise;
                        });
                    }
                    return Promise.reject(error);
                });
                newPromise.abort = function(rejectError = true){
                    for (const promise of rpcPromises) {
                        promise.abort(rejectError);
                    }
                };
                return newPromise;
            },
        });

        let inactivityTimer;

        const startInactivityTimer = () => {
            inactivityTimer = setTimeout(async () => {
                // Empty the current view, to not let any confidential data displayed
                // not even inspecting the dom or through the console using Javascript.
                env.services.action && env.bus.trigger("ACTION_MANAGER:UPDATE", {});
                // Display the check identity dialog
                await env.services.check_identity.run(["password"]);
                // Reload the view to display back the data that was displayed before.
                env.services.action && env.services.action.doAction("soft_reload");
                startInactivityTimer();
            }, AWAY_DELAY);
        }

        presence.bus.addEventListener("presence", () => {
            if (!env.services.check_identity._promise){
                clearTimeout(inactivityTimer);
                startInactivityTimer();
            }
        });

        startInactivityTimer();

        return new CheckIdentity(env);
    },
};

registry.category("public_components").add("auth_timeout.check_identity_form", CheckIdentityForm);
registry.category("services").add("check_identity", checkIdentity);
