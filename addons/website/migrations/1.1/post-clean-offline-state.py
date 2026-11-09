import re

from lxml import etree, html
from psycopg2.extras import Json

from odoo.tools import SQL

OFFLINE_CLASS = "o_disabled_offline"
SELECTOR = f"//*[contains(concat(' ', normalize-space(@class), ' '), ' {OFFLINE_CLASS} ')]"


def _clean(content, parser, dumps):
    body = re.sub(r"^<\?xml .+\?>\s*", "", content.strip())
    root = html.fromstring(f"<wrap>{body}</wrap>", parser=parser)
    changed = False
    for el in root.xpath(SELECTOR):
        classes = [c for c in el.get("class", "").split() if c != OFFLINE_CLASS]
        if classes:
            el.set("class", " ".join(classes))
        else:
            del el.attrib["class"]
        el.attrib.pop("disabled", None)
        changed = True
    if not changed:
        return content
    return re.sub(r"(^<wrap>|</wrap>$|^<wrap/>$)", "", dumps(root, encoding="unicode").strip())


def _clean_column(cr, table, column, parser, dumps, where=SQL("true")):
    cr.execute(
        SQL(
            "SELECT id, %(column)s FROM %(table)s WHERE %(column)s::text LIKE %(pattern)s AND %(where)s",
            column=SQL.identifier(column),
            table=SQL.identifier(table),
            pattern=f"%{OFFLINE_CLASS}%",
            where=where,
        ),
    )
    for res_id, value in cr.fetchall():
        if isinstance(value, dict):  # translated field
            new_value = Json({lang: _clean(content, parser, dumps) for lang, content in value.items() if content})
        else:
            new_value = _clean(value, parser, dumps)
        cr.execute(
            SQL(
                "UPDATE %(table)s SET %(column)s = %(value)s WHERE id = %(id)s",
                table=SQL.identifier(table),
                column=SQL.identifier(column),
                value=new_value,
                id=res_id,
            ),
        )


def migrate(cr, version):
    """Remove the offline state (``o_disabled_offline`` and ``disabled``) saved in pages."""
    html_parser = html.HTMLParser(encoding="utf-8")
    qweb_parser = html.XHTMLParser(encoding="utf-8")
    _clean_column(cr, "ir_ui_view", "arch_db", qweb_parser, etree.tostring, SQL("type = 'qweb'"))
    cr.execute("SELECT model, name FROM ir_model_fields WHERE ttype = 'html' AND store")
    for model, field in cr.fetchall():
        table = model.replace(".", "_")
        cr.execute("SELECT to_regclass(%s)", [table])
        if cr.fetchone()[0]:
            cr.execute("SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s", [table, field])
            if cr.rowcount:
                _clean_column(cr, table, field, html_parser, html.tostring)
