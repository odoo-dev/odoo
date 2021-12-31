/** @odoo-module */
import { session } from '@web/session';

document.addEventListener('DOMContentLoaded', () => {
    if (session.is_website_user) {
        return;
    }

    if (!window.frameElement) {
        const websiteId = document.documentElement.dataset.websiteId;
        const {pathname, search} = window.location;
        const params = new URLSearchParams(search);
        document.body.innerHTML = '';

        window.location.replace(`/web#action=website.website_editor&path=${encodeURIComponent(pathname + '?' + params.toString())}&website_id=${websiteId}`);
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

    }
});
