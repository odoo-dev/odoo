from __future__ import annotations

import re
import typing

if typing.TYPE_CHECKING:
    from odoo.cli.upgrade_code import FileManager


def upgrade(file_manager: FileManager):
    b_re = re.compile(r'env\.user\.has_group\(')

    for file in file_manager:
        if file.path.suffix != '.py':
            continue
        content = file.content
        content = b_re.sub('env.has_group(', content)
        file.content = content
