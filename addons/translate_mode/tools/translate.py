# Part of Odoo. See LICENSE file for full copyright and licensing details.

from __future__ import annotations

import re

import odoo.tools.translate as translate


R_CONTEXTUALIZED_TRANSLATION = re.compile(r"""
    _\(
    (?P<context>[/\w-]+),
    (?P<translated>0|1)
    \{(?P<source>.*?)\}
    \[(?P<translation>.*)\]
    \)
""")


original_CSVFileReader__iter__ = translate.CSVFileReader.__iter__
original_PoFileReader__iter__ = translate.PoFileReader.__iter__


def contextualize_entry(entry):
    translation = entry.get('value', "")
    if R_CONTEXTUALIZED_TRANSLATION.match(translation):
        return entry
    context = entry.get('module', "base")
    translated = "1" if translation else "0"
    escaped_source = entry.get('src', "").replace("%s", "%%s")
    entry['value'] = f"_({context},{translated}{{{escaped_source}}}[{translation}])"
    return entry


def CSVFileReader__iter__(self):
    for entry in original_CSVFileReader__iter__(self):
        yield contextualize_entry(entry)


def PoFileReader__iter__(self):
    for entry in original_PoFileReader__iter__(self):
        yield contextualize_entry(entry)


translate.CSVFileReader.__iter__ = CSVFileReader__iter__
translate.PoFileReader.__iter__ = PoFileReader__iter__

# Reset cached translations
translate.code_translations.python_translations.clear()
translate.code_translations.web_translations.clear()
