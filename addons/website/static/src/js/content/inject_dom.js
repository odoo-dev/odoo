(function () {
    'use strict';
    
    document.addEventListener('DOMContentLoaded', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const htmlEl = document.getElementsByTagName('html')[0];
        
        try {
            urlParams.forEach((param, key) => {
                htmlEl.setAttribute(`data-${key.replace('_', '-')}`, param);
            });
        } catch (e) {
            console.warn("Invalid params format");
        }

        if (!htmlEl.getAttribute('data-country')) {
            try {
                fetch('http://ip-api.com/json').then(r => r.json()).then(r => htmlEl.setAttribute(`data-country`, r.countryCode));
            } catch (e) {
                console.warn("Failed to fetch country");
            }
        }
    });
})();
