from __future__ import annotations

import re
import typing

if typing.TYPE_CHECKING:
    from odoo.cli.upgrade_code import FileManager


def upgrade(file_manager: FileManager):
    now_expression_re = re.compile(r"(?:fields\.)?\b(Date(?:time)?)\.(today|now)\(\)")

    def build_sql_object(match):
        code = 'self.env.now'
        if match.group(1) == 'Date':
            code += '.date()'
        elif match.group(2) != 'now':
            code += '.replace(hour=0, minute=0, second=0)'
        return code

    for file in file_manager:
        if file.path.suffix != '.py':
            continue
        content = file.content
        content = now_expression_re.sub(build_sql_object, content)
        file.content = content
