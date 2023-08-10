/** @odoo-module alias=website.utils **/

import core from "web.core";

/**
 * Allows to load anchors from a page.
 *
 * @param {string} url
 * @param {Node} body the editable for which to recover anchors
 * @returns {Deferred<string[]>}
 */
function loadAnchors(url, body) {
    return new Promise(function (resolve, reject) {
        if (url === window.location.pathname || url[0] === '#') {
            resolve(body ? body : document.body.outerHTML);
        } else if (url.length && !url.startsWith("http")) {
            $.get(window.location.origin + url).then(resolve, reject);
        } else { // avoid useless query
            resolve();
        }
    }).then(function (response) {
        const anchors = $(response).find('[id][data-anchor=true], .modal[id][data-display="onClick"]').toArray().map((el) => {
            return '#' + el.id;
        });
        // Always suggest the top and the bottom of the page as internal link
        // anchor even if the header and the footer are not in the DOM. Indeed,
        // the "scrollTo" function handles the scroll towards those elements
        // even when they are not in the DOM.
        if (!anchors.includes('#top')) {
            anchors.unshift('#top');
        }
        if (!anchors.includes('#bottom')) {
            anchors.push('#bottom');
        }
        return anchors;
    }).catch(error => {
        console.debug(error);
        return [];
    });
}

/**
 * Allows the given input to propose existing website URLs.
 *
 * @param {ServicesMixin|Widget} self - an element capable to trigger an RPC
 * @param {jQuery} $input
 */
function autocompleteWithPages(self, $input, options) {
    $.widget("website.urlcomplete", $.ui.autocomplete, {
        options: options || {},
        _create: function () {
            this._super();
            this.widget().menu("option", "items", "> :not(.ui-autocomplete-category)");
        },
        _renderMenu: function (ul, items) {
            const self = this;
            items.forEach(item => {
                if (item.separator) {
                    self._renderSeparator(ul, item);
                }
                else {
                    self._renderItem(ul, item);
                }
            });
        },
        _renderSeparator: function (ul, item) {
            return $("<li class='ui-autocomplete-category fw-bold text-capitalize p-2'>")
                   .append(`<div>${item.separator}</div>`)
                   .appendTo(ul);
        },
        _renderItem: function (ul, item) {
            return $("<li>")
                   .data('ui-autocomplete-item', item)
                   .append(`<div>${item.label}</div>`)
                   .appendTo(ul);
        },
    });
    $input.urlcomplete({
        source: function (request, response) {
            if (request.term[0] === '#') {
                loadAnchors(request.term, options && options.body).then(function (anchors) {
                    response(anchors);
                });
            } else if (request.term.startsWith('http') || request.term.length === 0) {
                // avoid useless call to /website/get_suggested_links
                response();
            } else {
                return self._rpc({
                    route: '/website/get_suggested_links',
                    params: {
                        needle: request.term,
                        limit: 15,
                    }
                }).then(function (res) {
                    let choices = res.matching_pages;
                    res.others.forEach(other => {
                        if (other.values.length) {
                            choices = choices.concat(
                                [{separator: other.title}],
                                other.values,
                            );
                        }
                    });
                    response(choices);
                });
            }
        },
        select: function (ev, ui) {
            // choose url in dropdown with arrow change ev.target.value without trigger_up
            // so cannot check here if value has been updated
            ev.target.value = ui.item.value;
            self.trigger_up('website_url_chosen');
            ev.preventDefault();
        },
    });
}

/**
 * @param {jQuery} $element
 * @param {jQuery} [$excluded]
 */
function onceAllImagesLoaded($element, $excluded) {
    var defs = Array.from($element.find("img").addBack("img")).map((img) => {
        if (img.complete || $excluded && ($excluded.is(img) || $excluded.has(img).length)) {
            return; // Already loaded
        }
        var def = new Promise(function (resolve, reject) {
            $(img).one('load', function () {
                resolve();
            });
        });
        return def;
    });
    return Promise.all(defs);
}

function websiteDomain(self) {
    var websiteID;
    self.trigger_up('context_get', {
        callback: function (ctx) {
            websiteID = ctx['website_id'];
        },
    });
    return ['|', ['website_id', '=', false], ['website_id', '=', websiteID]];
}

/**
 * Checks if the 2 given URLs are the same, to prevent redirecting uselessly
 * from one to another.
 * It will consider naked URL and `www` URL as the same URL.
 * It will consider `https` URL `http` URL as the same URL.
 *
 * @param {string} url1
 * @param {string} url2
 * @returns {Boolean}
 */
function isHTTPSorNakedDomainRedirection(url1, url2) {
    try {
        url1 = new URL(url1).host;
        url2 = new URL(url2).host;
    } catch {
        // Incorrect URL, `false` URL..
        return false;
    }
    return url1 === url2 ||
           url1.replace(/^www\./, '') === url2.replace(/^www\./, '');
}

function sendRequest(route, params) {
    function _addInput(form, name, value) {
        let param = document.createElement('input');
        param.setAttribute('type', 'hidden');
        param.setAttribute('name', name);
        param.setAttribute('value', value);
        form.appendChild(param);
    }

    let form = document.createElement('form');
    form.setAttribute('action', route);
    form.setAttribute('method', params.method || 'POST');
    // This is an exception for the 404 page create page button, in backend we
    // want to open the response in the top window not in the iframe.
    if (params.forceTopWindow) {
        form.setAttribute('target', '_top');
    }

    if (core.csrf_token) {
        _addInput(form, 'csrf_token', core.csrf_token);
    }

    for (const key in params) {
        const value = params[key];
        if (Array.isArray(value) && value.length) {
            for (const val of value) {
                _addInput(form, key, val);
            }
        } else {
            _addInput(form, key, value);
        }
    }

    document.body.appendChild(form);
    form.submit();
}

/**
 * Converts a base64 SVG into a base64 PNG.
 *
 * @param {string|HTMLImageElement} src - an URL to a SVG or a *loaded* image
 *      with such an URL. This allows the call to potentially be a bit more
 *      efficient in that second case.
 * @returns {Promise<string>} a base64 PNG (as result of a Promise)
 */
async function svgToPNG(src) {
    function checkImg(imgEl) {
        // Firefox does not support drawing SVG to canvas unless it has width
        // and height attributes set on the root <svg>.
        return (imgEl.naturalHeight !== 0);
    }
    function toPNGViaCanvas(imgEl) {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.width;
        canvas.height = imgEl.height;
        canvas.getContext('2d').drawImage(imgEl, 0, 0);
        return canvas.toDataURL('image/png');
    }

    // In case we receive a loaded image and that this image is not problematic,
    // we can convert it to PNG directly.
    if (src instanceof HTMLImageElement) {
        const loadedImgEl = src;
        if (checkImg(loadedImgEl)) {
            return toPNGViaCanvas(loadedImgEl);
        }
        src = loadedImgEl.src;
    }

    // At this point, we either did not receive a loaded image or the received
    // loaded image is problematic => we have to do some asynchronous code.
    return new Promise(resolve => {
        const imgEl = new Image();
        imgEl.onload = () => {
            if (checkImg(imgEl)) {
                resolve(imgEl);
                return;
            }

            // Set arbitrary height on image and attach it to the DOM to force
            // width computation.
            imgEl.height = 1000;
            imgEl.style.opacity = 0;
            document.body.appendChild(imgEl);

            const request = new XMLHttpRequest();
            request.open('GET', imgEl.src, true);
            request.onload = () => {
                // Convert the data URI to a SVG element
                const parser = new DOMParser();
                const result = parser.parseFromString(request.responseText, 'text/xml');
                const svgEl = result.getElementsByTagName("svg")[0];

                // Add the attributes Firefox needs and remove the image from
                // the DOM.
                svgEl.setAttribute('width', imgEl.width);
                svgEl.setAttribute('height', imgEl.height);
                imgEl.remove();

                // Convert the SVG element to a data URI
                const svg64 = btoa(new XMLSerializer().serializeToString(svgEl));
                const finalImg = new Image();
                finalImg.onload = () => {
                    resolve(finalImg);
                };
                finalImg.src = `data:image/svg+xml;base64,${svg64}`;
            };
            request.send();
        };
        imgEl.src = src;
    }).then(loadedImgEl => toPNGViaCanvas(loadedImgEl));
}

/**
 * Bootstraps an "empty" Google Maps iframe.
 *
 * @returns {HTMLIframeElement}
 */
function generateGMapIframe() {
    const iframeEl = document.createElement('iframe');
    iframeEl.classList.add('s_map_embedded', 'o_not_editable');
    iframeEl.setAttribute('width', '100%');
    iframeEl.setAttribute('height', '100%');
    iframeEl.setAttribute('frameborder', '0');
    iframeEl.setAttribute('scrolling', 'no');
    iframeEl.setAttribute('marginheight', '0');
    iframeEl.setAttribute('marginwidth', '0');
    iframeEl.setAttribute('src', 'about:blank');
    return iframeEl;
}

/**
 * Generates a Google Maps URL based on the given parameter.
 *
 * @param {DOMStringMap} dataset
 * @returns {string} a Google Maps URL
 */
function generateGMapLink(dataset) {
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(dataset.mapAddress)
        + '&t=' + encodeURIComponent(dataset.mapType)
        + '&z=' + encodeURIComponent(dataset.mapZoom)
        + '&ie=UTF8&iwloc=&output=embed';
}

export default {
    loadAnchors: loadAnchors,
    autocompleteWithPages: autocompleteWithPages,
    onceAllImagesLoaded: onceAllImagesLoaded,
    sendRequest: sendRequest,
    websiteDomain: websiteDomain,
    isHTTPSorNakedDomainRedirection: isHTTPSorNakedDomainRedirection,
    svgToPNG: svgToPNG,
    generateGMapIframe: generateGMapIframe,
    generateGMapLink: generateGMapLink,
};
