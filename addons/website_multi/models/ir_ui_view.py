from lxml import etree

from openerp import tools
from openerp.osv import osv, fields


class view(osv.osv):

    _inherit = "ir.ui.view"

    _columns = {
        'website_id': fields.many2one('website', ondelete='cascade', string="Website", copy=False),
        'key': fields.char('Key')
    }

    _sql_constraints = [(
        'key_website_id_unique',
        'unique(key, website_id)',
        'Key must be unique per website.'
    )]

    @tools.ormcache_context(accepted_keys=('website_id',))
    def get_view_id(self, cr, uid, xml_id, context=None):
        if context and 'website_id' in context and not isinstance(xml_id, (int, long)):
            domain = [
                ('key', '=', xml_id),
                '|',
                ('website_id', '=', context['website_id']),
                ('website_id', '=', False)
            ]
            xml_ids = self.search(cr, uid, domain, order='website_id', limit=1, context=context)
            if not xml_ids:
                xml_id = self.pool['ir.model.data'].xmlid_to_res_id(cr, uid, xml_id, raise_if_not_found=True)
                if self.read(cr, uid, xml_id, ['page'], context=context)['page']:
                    raise ValueError('Invalid template id: %r' % (xml_id,))
            else:
                xml_id = xml_ids[0]
        else:
            xml_id = self.pool['ir.model.data'].xmlid_to_res_id(cr, uid, xml_id, raise_if_not_found=True)
        return xml_id

    _read_template_cache = dict(accepted_keys=('lang', 'inherit_branding', 'editable', 'translatable', 'website_id'))

    @tools.ormcache_context(**_read_template_cache)
    def _read_template(self, cr, uid, view_id, context=None):
        arch = self.read_combined(cr, uid, view_id, fields=['arch'], context=context)['arch']
        arch_tree = etree.fromstring(arch)

        if 'lang' in context:
            arch_tree = self.translate_qweb(cr, uid, view_id, arch_tree, context['lang'], context)

        self.distribute_branding(arch_tree)
        root = etree.Element('templates')
        root.append(arch_tree)
        arch = etree.tostring(root, encoding='utf-8', xml_declaration=True)
        return arch

    @tools.ormcache(size=0)
    def read_template(self, cr, uid, xml_id, context=None):
        if isinstance(xml_id, (int, long)):
            view_id = xml_id
        else:
            if '.' not in xml_id:
                raise ValueError('Invalid template id: %r' % (xml_id,))
            view_id = self.get_view_id(cr, uid, xml_id, context=context)
        return self._read_template(cr, uid, view_id, context=context)

    def clear_cache(self):
        self._read_template.clear_cache(self)
        self.get_view_id.clear_cache(self)
        
    def get_inheriting_views_arch(self, cr, uid, view_id, model, context=None):
        arch = super(view, self).get_inheriting_views_arch(cr, uid, view_id, model, context=context)
        if context and 'website_id' in context:
            view_arch = dict([(v, a) for a, v in arch])
            for view_rec in self.browse(cr, 1, view_arch.keys(), context):
                if view_rec.website_id and view_rec.website_id.id != context['website_id']:
                    view_arch.pop(view_rec.id)
            return [(arch, view_id) for view_id, arch in view_arch.items()]
        else:
            return arch
