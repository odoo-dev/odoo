import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog"
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { redirect } from "@web/core/utils/urls";
import { user } from "@web/core/user";

import { startAuthentication } from "../../../../../auth_passkey/static/lib/simplewebauthn.js";

export class CheckIdentityForm extends Component {
    static template = "auth_timeout.CheckIdentityForm";
    static props = {
        uid: {type: "integer"},
        login: {type: String},
        authMethods: { type: Array, element: String },
        redirect: {type: String, optional: true},
    };

    setup() {
        super.setup();
        this.state = useState({
            error: false,
            authMethod: this.props.authMethods[0],
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
    run(authMethods) {
        if (!this._promise) {
            this._promise = new Promise(async (resolve) => {
                this.env.services.dialog.add(CheckIdentityDialog, {
                    uid: user.userId,
                    login: user.login,
                    authMethods: authMethods,
                }, {
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
    start(env) {
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
                        const authMethods = error.data.arguments[1];
                        return env.services.check_identity.run(authMethods).then(() => {
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
        return new CheckIdentity(env);
    },
};

registry.category("public_components").add("auth_timeout.check_identity_form", CheckIdentityForm);
registry.category("services").add("check_identity", checkIdentity);
