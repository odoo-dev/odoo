/** @odoo-module **/

import { browser } from "./browser/browser";
import { registry } from "./registry";

function parseCompanyIds(cidsFromHash) {
    const cids = [];
    if (typeof cidsFromHash === "string") {
        cids.push(...cidsFromHash.split(",").map(Number));
    } else if (typeof cidsFromHash === "number") {
        cids.push(cidsFromHash);
    }
    return cids;
}

export function computeAllowedCompanyIds(cids) {
    const { user_companies } = odoo.session_info;

    let allowedCompanies = cids || [];
    const allowedCompaniesFromSession = user_companies.allowed_companies;
    const notReallyAllowedCompanies = allowedCompanies.filter(
        (id) => !(id in allowedCompaniesFromSession)
    );

    if (!allowedCompanies.length || notReallyAllowedCompanies.length) {
        allowedCompanies = [user_companies.current_company];
    }
    return allowedCompanies;
}

function getUserObject(sessionInfo, router, cookie) {
    const {
        user_context,
        username,
        name,
        is_system,
        is_admin,
        partner_id,
        user_companies,
        home_action_id,
        show_effect: showEffect,
    } = sessionInfo;

    let cids;
    if ("cids" in router.current.hash) {
        cids = parseCompanyIds(router.current.hash.cids);
    } else if ("cids" in cookie.current) {
        cids = parseCompanyIds(cookie.current.cids);
    }
    const allowedCompanies = computeAllowedCompanyIds(cids);
    let context = {
        lang: user_context.lang,
        tz: user_context.tz,
        uid: sessionInfo.uid,
        allowed_company_ids: allowedCompanies,
    };
    return {
        context,
        get userId() {
            return context.uid;
        },
        name,
        userName: username,
        isAdmin: is_admin,
        isSystem: is_system,
        partnerId: partner_id,
        allowed_companies: user_companies.allowed_companies,
        current_company: user_companies.allowed_companies[allowedCompanies[0]],
        get lang() {
            return context.lang;
        },
        get tz() {
            return context.tz;
        },
        home_action_id,
        get db() {
            const res = {
                name: sessionInfo.db,
            };
            if ("dbuuid" in sessionInfo) {
                res.uuid = sessionInfo.dbuuid;
            }
            return res;
        },
        showEffect,
    };
}

export const userService = {
    dependencies: ["router", "cookie"],
    start(env, { router, cookie }) {
        const user = getUserObject(odoo.session_info, router, cookie);
        const allowedCompanies = user.context.allowed_company_ids;

        const stringCIds = allowedCompanies.join(",");
        router.replaceState({ "lock cids": stringCIds });
        cookie.setCookie("cids", stringCIds);

        Object.defineProperty(env, "user", {
            get() {
                return user;
            },
        });
        return {
            user,
            setCompanies: (mode, companyId) => {
                // compute next company ids
                let nextCompanyIds = allowedCompanies.slice();
                if (mode === "toggle") {
                    if (nextCompanyIds.includes(companyId)) {
                        nextCompanyIds = nextCompanyIds.filter((id) => id !== companyId);
                    } else {
                        nextCompanyIds.push(companyId);
                    }
                } else if (mode === "loginto") {
                    if (nextCompanyIds.length === 1) {
                        // 1 enabled company: stay in single company mode
                        nextCompanyIds = [companyId];
                    } else {
                        // multi company mode
                        if (nextCompanyIds.includes(companyId)) {
                            nextCompanyIds = nextCompanyIds.filter((id) => id !== companyId);
                        }
                        nextCompanyIds.unshift(companyId);
                    }
                }
                nextCompanyIds = nextCompanyIds.length ? nextCompanyIds : [companyId];

                // apply them
                router.pushState({ "lock cids": nextCompanyIds });
                cookie.setCookie("cids", nextCompanyIds);
                browser.setTimeout(() => window.location.reload()); // history.pushState is a little async
            },
        };
    },
};

registry.category("services").add("user", userService);
