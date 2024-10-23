from __future__ import annotations

import re
import typing

if typing.TYPE_CHECKING:
    from odoo.cli.upgrade_code import FileManager


def upgrade(file_manager: FileManager):
    r"""
    Map path: \.mapped\(['"]\w+\.
    Map to relation: \.mapped\(['"](\w+_ids?)['"]\)
    Other usage: \.mapped\((?!'|")
    """
    map_path_re = re.compile(r"\.mapped\((['\"])(\w+)\.")
    map_rel_re = re.compile(r"\.mapped\(['\"](\w+_ids?|order_line)['\"]\)")
    not_a_rel = {
        'res_id', 'tenor_gif_id', 'original_id',
        'google_id', 'twitter_tweet_id', 'twitter_user_id', 'youtube_video_id',
    }

    for file in file_manager:
        if file.path.suffix != '.py' or any(part in str(file.path) for part in ('test_api.py', 'upgrade_code')):
            continue
        content = file.content

        # translate: `.mapped('a.b')` into `.a.mapped('b')`
        check = ''
        while check != content:
            check = content
            content = map_path_re.sub(lambda m: f".{m.group(2)}.mapped({m.group(1)}", content)

        # translate: `mapped('abc_ids')` into `abc_ids`
        def replace_rel(m):
            name = m.group(1)
            if (
                name not in not_a_rel
                and not name.endswith('_post_id')
                and not name.endswith('_thread_id')
            ):
                return f".{name}"
            return m.group(0)

        content = map_rel_re.sub(replace_rel, content)
        file.content = content
