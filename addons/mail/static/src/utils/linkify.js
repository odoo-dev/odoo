/** @odoo-module alias=mail.utils.linkify **/

// Suggested URL Javascript regex of http://stackoverflow.com/questions/3809401/what-is-a-good-regular-expression-to-match-a-url
// Adapted to make http(s):// not required if (and only if) www. is given. So `should.notmatch` does not match.
const urlRegexp = /\b(?:https?:\/\/\d{1,3}(?:\.\d{1,3}){3}|(?:https?:\/\/|(?:www\.))[-a-z0-9@:%._+~#=]{2,256}\.[a-z]{2,13})\b(?:[-a-z0-9@:%_+.~#?&'$//=;]*)/gi;

/**
 * @param {string} text
 * @param {Object} [attrs={}]
 * @return {string} linkified text
 */
export default function linkify(text, attrs) {
    attrs = attrs || {};
    if (attrs.target === undefined) {
        attrs.target = '_blank';
    }
    if (attrs.target === '_blank') {
      attrs.rel = 'noreferrer noopener';
    }
    attrs = _.map(attrs, function (value, key) {
        return key + '="' + _.escape(value) + '"';
    }).join(' ');
    return text.replace(urlRegexp, function (url) {
        const href = (!/^https?:\/\//i.test(url)) ? "http://" + url : url;
        return '<a ' + attrs + ' href="' + href + '">' + url + '</a>';
    });
}
