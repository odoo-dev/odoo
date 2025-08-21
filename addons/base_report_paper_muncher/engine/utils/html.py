# Part of Odoo. See LICENSE file for full copyright and licensing details.

"""The :mod:`odoo.addons.base_report_paper_muncher.engine.utils.html`
module provides utilities for adding CSS-based headers
and footers to HTML content.
It includes functions to format the HTML with
headers and footers using CSS rules.
"""


import re
from lxml import etree


MATCH_CLASS = "//div[contains(concat(' ', normalize-space(@class), ' '), ' {} ')]"
CSS_HEADER_FOOTER_CONTAINER = """
<style>
    %(page)s
    %(other_patch)s
</style>
"""
CSS_PAGE = """
    @page {
        %(header)s
        %(footer)s
    }
"""
CSS_HEADER = """
        @top-center {
            content: element(%(header)s);
        }
"""
CSS_FOOTER = """
        @bottom-center {
            content: element(%(footer)s);
        }
"""
FLEXBOX_FRAGMENT_PATCH = """
    .o_content > .d-flex.align-items-start {
        display: block !important;
        margin-left: auto !important;
        margin-right: auto !important;
        width: fit-content !important;
    }
"""


def patch_html_etree(
    tree: etree._ElementTree,
    header_id="",
    footer_id="",
    patch=FLEXBOX_FRAGMENT_PATCH,
):
    if footer_id or header_id:
        page = CSS_PAGE % {
            'header': CSS_HEADER % {'header': header_id} if header_id else '',
            'footer': CSS_FOOTER % {'footer': footer_id} if footer_id else '',
        }
    else:
        page = ''

    css = CSS_HEADER_FOOTER_CONTAINER % {
        'page': page,
        'other_patch': patch,
    }
    head_node = tree.find('.//head')
    if head_node is None:
        raise ValueError(
            "The HTML document does not contain a <head> element."
        )

    style_node = etree.Element('style')
    style_node.text = css
    head_node.append(style_node)
