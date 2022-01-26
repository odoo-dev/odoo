/** @odoo-module */

import { session } from '@web/session';
// import { _t } from "@web/core/l10n/translation"; // FIXME don't know why it does not work
const _t = str => str;

document.addEventListener('DOMContentLoaded', () => {
    if (session.is_website_user) {
        return;
    }

    if (!window.frameElement) {
        const websiteId = document.documentElement.dataset.websiteId;
        const {pathname, search} = window.location;
        const params = new URLSearchParams(search);

        const autoredirectToBackendAction = false;
        if (autoredirectToBackendAction) {
            document.body.innerHTML = '';
            window.location.replace(`/web#action=website.website_editor&path=${encodeURIComponent(pathname + '?' + params.toString())}&website_id=${websiteId}`);
        } else {
            const frontendToBackendNavEl = document.createElement('div');
            frontendToBackendNavEl.classList.add('o_frontend_to_backend_nav');

            const backendLogoEl = document.createElement('div');
            backendLogoEl.classList.add('o_frontend_to_backend_logo');
            frontendToBackendNavEl.appendChild(backendLogoEl);

            const backendButtonEl = document.createElement('a');
            backendButtonEl.href = `/web#action=website.website_editor&path=${encodeURIComponent(pathname + '?' + params.toString())}&website_id=${websiteId}`;
            backendButtonEl.title = _t("Configure your website");
            backendButtonEl.classList.add('o_frontend_to_backend_btn');
            frontendToBackendNavEl.appendChild(backendButtonEl);

            const backendEditButtonEl = document.createElement('a');
            backendEditButtonEl.href = `/web#action=website.website_editor&path=${encodeURIComponent(pathname + '?' + params.toString())}&website_id=${websiteId}`;
            backendEditButtonEl.title = _t("Edit your page content");
            backendEditButtonEl.classList.add('o_frontend_to_backend_edit_btn', 'fa', 'fa-pencil-square-o');
            frontendToBackendNavEl.appendChild(backendEditButtonEl);

            const backendAppsButtonEl = document.createElement('a');
            backendAppsButtonEl.href = '/web';
            backendAppsButtonEl.title = _t("Go to your Odoo Apps");
            backendAppsButtonEl.classList.add('o_frontend_to_backend_apps_btn', 'fa', 'fa-th');
            frontendToBackendNavEl.appendChild(backendAppsButtonEl);

            backendLogoEl.addEventListener('click', () => backendButtonEl.click());

            document.body.appendChild(frontendToBackendNavEl);
        }
    } else {
        document.addEventListener('click', (ev) => {
            const isEditorEnabled = document.body.classList.contains('editor_enable');
            const {href, host, target} = ev.target;
            const isNewWindow = target === '_blank';
            const isInIframe = host === window.location.host;

            if (href && !isEditorEnabled && !isNewWindow && !isInIframe) {
                window.top.location.replace(href);
            }
        });
        document.addEventListener('keydown', ev => {
            window.parent.document.dispatchEvent(new KeyboardEvent('keydown', ev));
        });
        document.addEventListener('keyup', ev => {
            window.parent.document.dispatchEvent(new KeyboardEvent('keyup', ev));
        });
    }
});
