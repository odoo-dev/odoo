# -*- coding: utf-8 -*-

def migrate(cr, version):
    cr.execute("""
        ALTER TABLE mrp_routing_workcenter ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE
    """)
