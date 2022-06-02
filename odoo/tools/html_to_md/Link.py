# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from uuid import uuid4

from .constants import LINK_TAG_PREFIX

INLINE_FORMATS = {
    "a": "[{label}]({target})",
    "img": "![{label}]({target})",
}


class Link:
    def __init__(self, target: str = "", label: str = "", tag: str = "") -> None:
        self.target = target
        self.label = label
        self.key = LINK_TAG_PREFIX + uuid4().hex
        self.tag = tag

    def render(self, inline: bool = True, position: int = None) -> (str, str):
        """Render the link inline and footnote parts as tuple.

        :param inline:
          If `True`, the inline part will include the href:
          [label](href) and the footnote part will be empty.
          If `False`, the link will be rendered as
          [label][POSITION], with POSITION being the order of the link
          in the footnote reference table, and  the footnote part will
          be rendered as `[POSITION]: href`
        :param position: Only relevant if inline=False, the POSITION of the link
        """
        if inline:
            return INLINE_FORMATS[self.tag].format(label=self.label, target=self.target), ""

        return f"[{self.label}][{position}]", f"[{position}]: {self.target}"
