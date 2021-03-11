(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const htmlEl = document.getElementsByTagName('html')[0];
        const cookieNames = ['utm_source', 'utm_medium', 'utm_campaign'];
        const cookies = document.cookie.split('; ').map(cookie => cookie.split('=')).reduce((acc, cookie) => ({ ...acc, [cookie[0]]: cookie[1].replace(/"/g, '') }), {});
        for (const name of cookieNames) {
            const cookie = cookies[`odoo_${name}`];
            if (cookie) {
                htmlEl.setAttribute(`data-${name.replace('_', '-')}`, cookie);
            }
        }
    });
})();
