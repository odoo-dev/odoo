odoo.define('web_editor.convertInline', function (require) {
'use strict';

var FieldHtml = require('web_editor.field.html');

const SELECTORS_IGNORE = /(^\*$|:hover|:before|:after|:active|:link|::|'|\([^(),]+[,(])/;
/**
 * @see https://getbootstrap.com/docs/4.0/layout/grid/#grid-options
 */
const BOOTSTRAP_MAX_WIDTHS = {
    sm: 540,
    md: 720,
    lg: 960,
    xl: 1140,
};
/**
 * Returns the css rules which applies on an element, tweaked so that they are
 * browser/mail client ok.
 *
 * @param {DOMElement} a
 * @returns {Object} css property name -> css property value
 */
function getMatchedCSSRules(a) {
    var i, r, k;
    var doc = a.ownerDocument;
    var rulesCache = a.ownerDocument._rulesCache || (a.ownerDocument._rulesCache = []);

    if (!rulesCache.length) {
        var sheets = doc.styleSheets;
        for (i = sheets.length-1 ; i >= 0 ; i--) {
            var rules;
            // try...catch because browser may not able to enumerate rules for cross-domain sheets
            try {
                rules = sheets[i].rules || sheets[i].cssRules;
            } catch (e) {
                console.log("Can't read the css rules of: " + sheets[i].href, e);
                continue;
            }
            if (rules) {
                for (r = rules.length-1; r >= 0; r--) {
                    var selectorText = rules[r].selectorText;
                    if (selectorText && !SELECTORS_IGNORE.test(selectorText)) {
                        var st = selectorText.split(/\s*,\s*/);
                        for (k = 0 ; k < st.length ; k++) {
                            rulesCache.push({ 'selector': st[k], 'style': rules[r].style });
                        }
                    }
                }
            }
        }
        rulesCache.reverse();
    }

    var css = [];
    var style;
    a.matches = a.matches || a.webkitMatchesSelector || a.mozMatchesSelector || a.msMatchesSelector || a.oMatchesSelector;
    for (r = 0; r < rulesCache.length; r++) {
        if (a.matches(rulesCache[r].selector)) {
            style = rulesCache[r].style;
            if (style.parentRule) {
                var style_obj = {};
                var len;
                for (k = 0, len = style.length ; k < len ; k++) {
                    if (style[k].indexOf('animation') !== -1) {
                        continue;
                    }
                    style_obj[style[k]] = style[style[k].replace(/-(.)/g, function (a, b) { return b.toUpperCase(); })];
                    if (new RegExp(style[k] + '\s*:[^:;]+!important' ).test(style.cssText)) {
                        style_obj[style[k]] += ' !important';
                    }
                }
                rulesCache[r].style = style = style_obj;
            }
            css.push([rulesCache[r].selector, style]);
        }
    }

    function specificity(selector) {
        // http://www.w3.org/TR/css3-selectors/#specificity
        var a = 0;
        selector = selector.replace(/#[a-z0-9_-]+/gi, function () { a++; return ''; });
        var b = 0;
        selector = selector.replace(/(\.[a-z0-9_-]+)|(\[.*?\])/gi, function () { b++; return ''; });
        var c = 0;
        selector = selector.replace(/(^|\s+|:+)[a-z0-9_-]+/gi, function (a) { if (a.indexOf(':not(')===-1) c++; return ''; });
        return a*100 + b*10 + c;
    }
    css.sort(function (a, b) { return specificity(a[0]) - specificity(b[0]); });

    style = {};
    _.each(css, function (v,k) {
        _.each(v[1], function (v,k) {
            if (v && _.isString(v) && k.indexOf('-webkit') === -1 && (!style[k] || style[k].indexOf('important') === -1 || v.indexOf('important') !== -1)) {
                style[k] = v;
            }
        });
    });

    _.each(style, function (v,k) {
        if (v.indexOf('important') !== -1) {
            style[k] = v.slice(0, v.length-11);
        }
    });

    if (style.display === 'block') {
        delete style.display;
    }

    // The css generates all the attributes separately and not in simplified form.
    // In order to have a better compatibility (outlook for example) we simplify the css tags.
    // e.g. border-left-style: none; border-bottom-s .... will be simplified in border-style = none
    _.each([
        {property: 'margin'},
        {property: 'padding'},
        {property: 'border', propertyEnd: '-style', defaultValue: 'none'},
    ], function (propertyInfo) {
        var p = propertyInfo.property;
        var e = propertyInfo.propertyEnd || '';
        var defVal = propertyInfo.defaultValue || 0;

        if (style[p+'-top'+e] || style[p+'-right'+e] || style[p+'-bottom'+e] || style[p+'-left'+e]) {
            if (style[p+'-top'+e] === style[p+'-right'+e] && style[p+'-top'+e] === style[p+'-bottom'+e] && style[p+'-top'+e] === style[p+'-left'+e]) {
                // keep => property: [top/right/bottom/left value];
                style[p+e] = style[p+'-top'+e];
            }
            else {
                // keep => property: [top value] [right value] [bottom value] [left value];
                style[p+e] = (style[p+'-top'+e] || defVal) + ' ' + (style[p+'-right'+e] || defVal) + ' ' + (style[p+'-bottom'+e] || defVal) + ' ' + (style[p+'-left'+e] || defVal);
                if (style[p+e].indexOf('inherit') !== -1 || style[p+e].indexOf('initial') !== -1) {
                    // keep => property-top: [top value]; property-right: [right value]; property-bottom: [bottom value]; property-left: [left value];
                    delete style[p+e];
                    return;
                }
            }
            delete style[p+'-top'+e];
            delete style[p+'-right'+e];
            delete style[p+'-bottom'+e];
            delete style[p+'-left'+e];
        }
    });

    if (style['border-bottom-left-radius']) {
        style['border-radius'] = style['border-bottom-left-radius'];
        delete style['border-bottom-left-radius'];
        delete style['border-bottom-right-radius'];
        delete style['border-top-left-radius'];
        delete style['border-top-right-radius'];
    }

    // if the border styling is initial we remove it to simplify the css tags for compatibility.
    // Also, since we do not send a css style tag, the initial value of the border is useless.
    _.each(_.keys(style), function (k) {
        if (k.indexOf('border') !== -1 && style[k] === 'initial') {
            delete style[k];
        }
    });

    // text-decoration rule is decomposed in -line, -color and -style. This is
    // however not supported by many browser/mail clients and the editor does
    // not allow to change -color and -style rule anyway
    if (style['text-decoration-line']) {
        style['text-decoration'] = style['text-decoration-line'];
        delete style['text-decoration-line'];
        delete style['text-decoration-color'];
        delete style['text-decoration-style'];
        delete style['text-decoration-thickness'];
    }

    // text-align inheritance does not seem to get past <td> elements on some
    // mail clients
    if (style['text-align'] === 'inherit') {
        var $el = $(a).parent();
        do {
            var align = $el.css('text-align');
            if (_.indexOf(['left', 'right', 'center', 'justify'], align) >= 0) {
                style['text-align'] = align;
                break;
            }
            $el = $el.parent();
        } while ($el.length && !$el.is('html'));
    }

    // flexboxes are not supported in Windows Outlook
    for (const styleName in style) {
        if (styleName.includes('flex') || `${style[styleName]}`.includes('flex')) {
            delete style[styleName];
        }
    }

    return style;
}

/**
 * Converts font icons to images.
 *
 * @param {jQuery} $editable - the element in which the font icons have to be
 *                           converted to images
 */
function fontToImg($editable) {
    var fonts = odoo.__DEBUG__.services["wysiwyg.fonts"];

    $editable.find('.fa').each(function () {
        var $font = $(this);
        var icon, content;
        _.find(fonts.fontIcons, function (font) {
            return _.find(fonts.getCssSelectors(font.parser), function (data) {
                if ($font.is(data.selector.replace(/::?before/g, ''))) {
                    icon = data.names[0].split('-').shift();
                    content = data.css.match(/content:\s*['"]?(.)['"]?/)[1];
                    return true;
                }
            });
        });
        if (content) {
            var color = $font.css('color').replace(/\s/g, '');
            let $backgroundColoredElement = $font;
            let bg, isTransparent;
            do {
                bg = $backgroundColoredElement.css('background-color').replace(/\s/g, '');
                isTransparent = bg === 'transparent' || bg === 'rgba(0,0,0,0)';
                $backgroundColoredElement = $backgroundColoredElement.parent();
            } while (isTransparent && $backgroundColoredElement[0]);
            if (bg === 'rgba(0,0,0,0)' && isTransparent) {
                // default on white rather than black background since opacity
                // is not supported.
                bg = 'rgb(255,255,255)';
            }
            const style = $font.attr('style');
            const width = $font.width();
            const height = $font.height();
            const lineHeight = $font.css('line-height');
            // Compute the padding.
            // First get the dimensions of the icon itself (::before)
            $font.css({height: 'fit-content', width: 'fit-content', 'line-height': 'normal'});
            const hPadding = width && (width - $font.width()) / 2;
            const vPadding = height && (height - $font.height()) / 2;
            let padding = '';
            if (hPadding || vPadding) {
                padding = vPadding ? vPadding + 'px ' : '0 ';
                padding += hPadding ? hPadding + 'px' : '0';
            }
            $font.replaceWith($('<img/>', {
                src: `/web_editor/font_to_img/${content.charCodeAt(0)}/${window.encodeURI(color)}/${window.encodeURI(bg)}/${Math.max(1, $font.height())}`,
                'data-class': $font.attr('class'),
                'data-style': style,
                class: $font.attr('class').replace(new RegExp('(^|\\s+)' + icon + '(-[^\\s]+)?', 'gi'), ''), // remove inline font-awsome style
                style,
            }).css({
                'box-sizing': 'border-box', // keep the fontawesome's dimensions
                'line-height': lineHeight,
                padding, width: width + 'px', height: height + 'px',
            }));
        } else {
            $font.remove();
        }
    });
}

/*
 * Utility function to apply function over descendants elements
 *
 * This is needed until the following issue of jQuery is solved:
 *  https://github.com./jquery/sizzle/issues/403
 *
 * @param {Element} node The root Element node
 * @param {Function} func The function applied over descendants
 */
function applyOverDescendants(node, func) {
    node = node.firstChild;
    while (node) {
        if (node.nodeType === 1) {
            const newNode = func(node);
            if (newNode) {
                node = newNode;
            }
            applyOverDescendants(node, func);
        }
        var $node = $(node);
        if (node.nodeName === 'A' && $node.hasClass('btn') && !$node.children().length && $(node).parents('.o_outlook_hack').length)  {
            node = $(node).parents('.o_outlook_hack')[0];
        }
        else if (node.nodeName === 'IMG' && $node.parent('p').hasClass('o_outlook_hack')) {
            node = $node.parent()[0];
        }
        node = node.nextSibling;
    }
}

/**
 * Converts bootstrap rows and columns to actual tables.
 *
 * Note: Because of the limited support of media queries in emails, this doesn't
 * support the mixing and matching of column options (e.g., "col-4 col-sm-6" and
 * "col col-4" aren't supported).
 *
 * @param {jQuery} $editable
 */
function bootstrapToTable($editable) {
    applyOverDescendants($editable[0], function (node) {
        const $node = $(node);
        if (/(^| )container( |$|-fluid)/.test(node.className)) {
            const $table = $($node.find('.row').length ? '<table align="center"/>' : node.cloneNode());
            for (const attr of node.attributes) {
                $table.attr(attr.name, attr.value);
            }
            for (const child of [...node.childNodes]) {
                $table.append(child);
            }
            $table.removeClass('container container-fluid');
            $table.attr({
                cellspacing: 0,
                cellpadding: 0,
                border: 0,
                width: '100%',
            });
            $node.before($table);
            $node.remove();
            return $table[0];
        } else if ($node.hasClass('row')) {
            const $row = $('<tr/>');
            for (const attr of node.attributes) {
                $row.attr(attr.name, attr.value);
            }
            $row.removeClass('row');
            for (const child of [...node.childNodes]) {
                $row.append(child);
            }
            $node.before($row);
            $node.remove();
            return $row[0];
        }
        const colMatch = node.className.match(/(^| )col(-[\w\d]+)*( |$)/);
        if (colMatch) {
            const colOptions = colMatch[2] && colMatch[2].substr(1).split('-');
            const $col = $('<td/>');
            for (const attr of node.attributes) {
                $col.attr(attr.name, attr.value);
            }
            $col.removeClass(colMatch[0]);
            for (const child of [...node.childNodes]) {
                $col.append(child);
            }
            $node.before($col);
            $node.remove();
            if (colOptions) {
                const screenSize = colOptions.length === 2 && colOptions[0];
                const colSize = colOptions.length === 2 ? +colOptions[1] : +colOptions[0];
                if (screenSize in BOOTSTRAP_MAX_WIDTHS) {
                    $col.css({'max-width': BOOTSTRAP_MAX_WIDTHS[screenSize] + 'px'});
                }
                if (colSize) {
                    const width = Math.round(colSize * 100 / 12) + '%';
                    $col.attr('width', width).css('width', width);
                }
            }
            return $col[0];
        }
    });
}

/**
 * Converts css style to inline style (leave the classes on elements but forces
 * the style they give as inline style).
 *
 * @param {jQuery} $editable
 */
function classToStyle($editable) {
    applyOverDescendants($editable[0], function (node) {
        var $target = $(node);
        var css = getMatchedCSSRules(node);
        // Flexbox
        for (const styleName in node.style) {
            if (styleName.includes('flex') || `${node.style[styleName]}`.includes('flex')) {
                node.style[styleName] = '';
            }
        }

        var style = $target.attr('style') || '';
        _.each(css, function (v,k) {
            if (!(new RegExp('(^|;)\s*' + k).test(style))) {
                style = k+':'+v+';'+style;
            }
        });
        if (_.isEmpty(style)) {
            $target.removeAttr('style');
        } else {
            $target.attr('style', style);
        }
        // Apple Mail
        if (node.nodeName === 'TD' && !node.childNodes.length) {
            $(node).html('&nbsp;');
        }

        // Outlook
        if (node.nodeName === 'A' && $target.hasClass('btn') && !$target.hasClass('btn-link') && !$target.children().length) {
            $target.prepend(`<!--[if mso]><i style="letter-spacing: 25px; mso-font-width: -100%; mso-text-raise: 30pt;">&nbsp;</i><![endif]-->`);
            $target.append(`<!--[if mso]><i style="letter-spacing: 25px; mso-font-width: -100%;">&nbsp;</i><![endif]-->`);
        }
        else if (node.nodeName === 'IMG' && $target.is('.mx-auto.d-block')) {
            $target.wrap('<p class="o_outlook_hack" style="text-align:center;margin:0"/>');
        }
    });
}

/**
 * Converts css display for attachment link to real image.
 * Without this post process, the display depends on the css and the picture
 * does not appear when we use the html without css (to send by email for e.g.)
 *
 * @param {jQuery} $editable
 */
function attachmentThumbnailToLinkImg($editable) {
    $editable.find('a[href*="/web/content/"][data-mimetype]').filter(':empty, :containsExact( )').each(function () {
        var $link = $(this);
        var $img = $('<img/>')
            .attr('src', $link.css('background-image').replace(/(^url\(['"])|(['"]\)$)/g, ''))
            .css('height', Math.max(1, $link.height()) + 'px')
            .css('width', Math.max(1, $link.width()) + 'px');
        $link.prepend($img);
    });
}


//--------------------------------------------------------------------------
//--------------------------------------------------------------------------


FieldHtml.include({
    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    commitChanges: function () {
        if (this.nodeOptions['style-inline'] && this.mode === "edit") {
            this._toInline();
        }
        return this._super();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Converts CSS dependencies to CSS-independent HTML.
     * - CSS display for attachment link -> real image
     * - Font icons -> images
     * - CSS styles -> inline styles
     *
     * @private
     */
    _toInline: function () {
        var $editable = this.wysiwyg.getEditable();
        var html = this.wysiwyg.getValue();
        $editable.html(html);

        attachmentThumbnailToLinkImg($editable);
        fontToImg($editable);
        classToStyle($editable);
        bootstrapToTable($editable);

        // fix outlook image rendering bug
        _.each(['width', 'height'], function(attribute) {
            $editable.find('img[style*="width"], img[style*="height"]').attr(attribute, function(){
                return $(this)[attribute]();
            }).css(attribute, function(){
                return $(this).get(0).style[attribute] || 'auto';
            });
        });

        this.wysiwyg.setValue($editable.html(), {
            notifyChange: false,
        });
    },
});

return {
    fontToImg: fontToImg,
    bootstrapToTable: bootstrapToTable,
    classToStyle: classToStyle,
    attachmentThumbnailToLinkImg: attachmentThumbnailToLinkImg,
};
});
