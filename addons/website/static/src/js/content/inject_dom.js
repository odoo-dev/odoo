(function () {
    'use strict';
    const getCookieValue = (name) => (
        document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')?.pop().replace(/"/g, '') || ''
    );
    document.addEventListener('DOMContentLoaded', () => {
        const htmlEl = document.getElementsByTagName('html')[0];
        const cookieNames = ['utm_source', 'utm_medium', 'utm_campaign'];
        for (const name of cookieNames) {
            const cookie = getCookieValue(`odoo_${name}`);
            if (cookie !== '') {
                htmlEl.setAttribute(`data-${name.replace('_', '-')}`, cookie);
            }
        }
    });
})();
