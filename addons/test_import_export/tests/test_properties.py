import json
from odoo.tests.common import RecordCapturer, HttpCase


class TestPropertiesExportImport(HttpCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.ModelDefinition = cls.env['import.properties.definition']
        cls.ModelProperty = cls.env['import.properties']
        cls.ModelPropertyInherits = cls.env['import.properties.inherits']
        cls.definition_records = cls.ModelDefinition.create(
            [
                {
                    'properties_definition': [
                        {'type': 'char', 'string': 'TextType', 'default': 'Def'},
                        {'type': 'separator', 'string': 'Separator'},
                        {
                            'type': 'selection',
                            'string': 'One Selection',
                            'selection': [
                                ['selection_1', 'aaaaaaa'],
                                ['selection_2', 'bbbbbbb'],
                                ['selection_3', 'ccccccc'],
                            ],
                        },
                        {
                            'type': 'many2one',
                            'string': 'many2one',
                            'comodel': 'res.partner',
                        },
                        {
                            'type': 'html',
                            'string': 'html',
                        },
                    ]
                },
                {
                    'properties_definition': [
                        {'type': 'boolean', 'string': 'CheckBox'},
                        {
                            'tags': [['aa', 'AA', 5], ['bb', 'BB', 6], ['cc', 'CC', 7]],
                            'type': 'tags',
                            'string': 'Tags',
                        },
                        {
                            'type': 'many2many',
                            'string': 'M2M',
                            'comodel': 'res.partner',
                        },
                    ]
                },
            ]
        )

        (cls.name_char, cls.name_separator, cls.name_selection, cls.name_many2one, cls.name_html,
            cls.name_bool, cls.name_tags, cls.name_many2many) = (
            d['name'] for r in cls.definition_records for d in r.properties_definition)

        cls.partners = cls.env['res.partner'].create(
            [
                {'name': 'Name Partner 1'},
                {'name': 'Name Partner 2'},
                {'name': 'Name Partner 3'},
            ]
        )

        cls.properties_records = cls.ModelProperty.create(
            [
                {
                    'record_definition_id': cls.definition_records[0].id,
                    'properties': {
                        cls.name_char: 'Not the default',
                        cls.name_selection: 'selection_2',
                    },
                },
                {
                    'record_definition_id': cls.definition_records[0].id,
                    'properties': {
                        cls.name_many2one: cls.partners[0].id,
                    },
                },
                {
                    'record_definition_id': cls.definition_records[1].id,
                    'properties': {
                        cls.name_tags: ['aa', 'bb'],
                        cls.name_bool: True,
                    },
                },
                {
                    'record_definition_id': cls.definition_records[1].id,
                    'properties': {
                        cls.name_many2many: cls.partners.ids,
                    },
                },
            ]
        )

    def test_export_get_fields(self):
        self.authenticate('admin', 'admin')

        res = self.url_open(
            "/web/export/get_fields",
            data=json.dumps({"params": {"model": 'import.properties',
                                        'import_compat': True,
                                        'domain': []}}),
            headers={"Content-Type": "application/json"}
        )
        dict_fields = json.loads(res.content)['result']
        self.assertEqual(
            [dict_field['id'] for dict_field in dict_fields], 
            [
                f'properties.{self.name_bool}',
                'id',
                f'properties.{self.name_html}',
                f'properties.{self.name_many2many}',
                f'properties.{self.name_many2one}',
                f'properties.{self.name_selection}',
                'properties',
                'record_definition_id',
                f'properties.{self.name_tags}',
                f'properties.{self.name_char}',
            ]
        )

        res = self.url_open(
            "/web/export/get_fields",
            data=json.dumps({"params": {"model": 'import.properties',
                                        'import_compat': True,
                                        'domain': [('id', 'in', self.properties_records[0].ids)]}}),
            headers={"Content-Type": "application/json"}
        )
        dict_fields = json.loads(res.content)['result']
        self.assertEqual(
            [dict_field['id'] for dict_field in dict_fields],
            [
                'id',
                f'properties.{self.name_html}',
                f'properties.{self.name_many2one}',
                f'properties.{self.name_selection}',
                'properties',
                'record_definition_id',
                f'properties.{self.name_char}',
            ]
        )
    
    def test_export_get_fields_inherits(self):
        self.authenticate('admin', 'admin')

        # FIXME: Put the creation of record here because there is a bug in create
        # for inherited properties that empties the properties source values
        inherits_records = self.ModelPropertyInherits.create([
            {'parent_id': record_parent.id}
            for record_parent in self.properties_records
        ])
        res = self.url_open(
            "/web/export/get_fields",
            data=json.dumps({"params": {"model": 'import.properties.inherits',
                                        'import_compat': True,
                                        'domain': []}}),
            headers={"Content-Type": "application/json"}
        )
        dict_fields = json.loads(res.content)['result']
        self.assertEqual(
            [dict_field['id'] for dict_field in dict_fields], 
            [
                f'properties.{self.name_bool}',
                'id',
                f'properties.{self.name_html}',
                f'properties.{self.name_many2many}',
                f'properties.{self.name_many2one}',
                f'properties.{self.name_selection}',
                'parent_id',
                'properties',
                'record_definition_id',
                f'properties.{self.name_tags}',
                f'properties.{self.name_char}',
            ]
        )

        res = self.url_open(
            "/web/export/get_fields",
            data=json.dumps({"params": {"model": 'import.properties.inherits',
                                        'import_compat': True,
                                        'domain': [('id', 'in', inherits_records[0].ids)]}}),
            headers={"Content-Type": "application/json"}
        )
        dict_fields = json.loads(res.content)['result']
        self.assertEqual(
            [dict_field['id'] for dict_field in dict_fields],
            [
                'id',
                f'properties.{self.name_html}',
                f'properties.{self.name_many2one}',
                f'properties.{self.name_selection}',
                'parent_id',
                'properties',
                'record_definition_id',
                f'properties.{self.name_char}',
            ]
        )

    def test_export_properties(self):
        all_properties = [
            [f"properties.{property_dict_type['name']}"]
            for property_dict_type in self.definition_records[0].properties_definition
            + self.definition_records[1].properties_definition
            if property_dict_type['type'] != 'separator'
        ]
        # Without import compatibility
        self.assertEqual(
            self.properties_records.with_context(import_compat=False)._export_rows(all_properties),
            [
                ['Not the default', 'bbbbbbb', '', '', '', '', ''],
                ['Def', '', 'Name Partner 1', '', '', '', ''],
                ['', '', '', '', True, 'AA,BB', ''],
                ['', '', '', '', '', '', 'Name Partner 1'],
                ['', '', '', '', '', '', 'Name Partner 2'],
                ['', '', '', '', '', '', 'Name Partner 3'],
            ],
        )
        # With import compatibility
        self.assertEqual(
            self.properties_records._export_rows(all_properties),
            [
                ['Not the default', 'bbbbbbb', '', '', '', '', ''],
                ['Def', '', 'Name Partner 1', '', '', '', ''],
                ['', '', '', '', True, 'AA,BB', ''],
                ['', '', '', '', '', '', 'Name Partner 1,Name Partner 2,Name Partner 3'],
            ],
        )

    def test_export_complex_path_properties(self):
        path_records = self.env['import.path.properties'].create([
            {
                'properties_id': self.properties_records[0].id,
                'another_properties_id': self.properties_records[1].id,  # Same definition
            },
            {
                'properties_id': self.properties_records[3].id,
                'another_properties_id': self.properties_records[2].id,
            }
        ])
        export_fields = [
            f"properties_id/properties.{self.name_many2many}/name",  # '' for [0], <All partner name> for [1]
            f"another_properties_id/properties.{self.name_many2one}/name",  # Partner Name 1 for [0], '' for [1]
            f"another_properties_id/properties.{self.name_bool}",  # '' for [0], True for [1]
            f"all_properties_ids/properties.{self.name_char}",  # 'Not the default'/'Def' for [0], '' for [1]
        ]

        self.assertEqual(
            path_records.with_context(import_compat=False).export_data(export_fields)['datas'],
            [
                ['', 'Name Partner 1', '', 'Not the default'],
                ['', '', '', 'Def'],
                ['Name Partner 1', '', True, ''],
                ['Name Partner 2', '', '', ''],
                ['Name Partner 3', '', '', ''],
                ['', '', '', ''],  # For the path_records[1] and all_properties_ids
            ]
        )

        export_fields = [
            f"properties_id/properties.{self.name_many2many}",  # '' for [0], <All partner name> for [1]
            f"another_properties_id/properties.{self.name_many2one}",  # Partner Name 1 for [0], '' for [1]
            f"another_properties_id/properties.{self.name_bool}",  # '' for [0], True for [1]
        ]
        self.assertEqual(
            path_records.export_data(export_fields)['datas'],
            [
                ['', 'Name Partner 1', ''],
                ['Name Partner 1,Name Partner 2,Name Partner 3', '', True],
            ]
        )

    def test_import_properties(self):
        # TODO: check for XSS during import
        def_record_1 = self.definition_records[0]
        def_record_2 = self.definition_records[1]
        values_list = [
            [
                "Record Definition Id",
                # Field of the first definition
                f"TextType ({def_record_1.display_name})", f"One Selection ({def_record_1.display_name})", f"many2one ({def_record_1.display_name})",
                # Field of the second definition
                f"CheckBox ({def_record_2.display_name})", f"properties.{self.name_tags}", f"M2M ({def_record_2.display_name})",
            ],
            # Record attached to the first definition record
            [
                str(def_record_1.id),
                'One Text', 'bbbbbbb', self.partners[0].display_name,
                '', '', '',
            ], [
                str(def_record_1.id),
                'One Text', 'selection_3', self.partners[1].display_name,
                '', '', '',
            ],

            # Record attached to the second definition record
            [
                str(def_record_2.id),
                '', '', '',
                'True', 'aa', ','.join(self.partners[:2].mapped('display_name')),
            ], [
                str(def_record_2.id),
                '', '', '',
                '0', 'BB', '',
            ],
        ]

        import_wizard = self.env['base_import.import'].create({
            'res_model': self.ModelProperty._name,
            'file': '\n'.join([';'.join(values) for values in values_list]),
            'file_type': 'text/csv',
        })
        opts = {'quoting': '"', 'separator': ';', 'has_headers': True}
        preview = import_wizard.parse_preview(opts)

        self.assertEqual(
            preview['matches'],
            {
                0: ['record_definition_id'],
                1: [f'properties.{self.name_char}'],
                2: [f'properties.{self.name_selection}'],
                3: [f'properties.{self.name_many2one}'],
                4: [f'properties.{self.name_bool}'],
                5: [f'properties.{self.name_tags}'],
                6: [f'properties.{self.name_many2many}'],
            },
        )

        with RecordCapturer(self.ModelProperty, []) as capture:
            results = import_wizard.execute_import(
                [fnames[0] for fnames in preview['matches'].values()],
                [],
                opts,
            )

        # if result is empty, no import error
        self.assertItemsEqual(results['messages'], [])

        records_created = capture.records
        self.assertEqual(records_created.record_definition_id, def_record_1 + def_record_2)

        self.assertEqual(records_created.mapped('properties'), [
            {self.name_char: 'One Text', self.name_selection: 'selection_2', self.name_many2one: self.partners[0].id},
            {self.name_char: 'One Text', self.name_selection: 'selection_3', self.name_many2one: self.partners[1].id},
            {self.name_bool: True, self.name_tags: ['aa'], self.name_many2many: self.partners[:2].ids},
            {self.name_bool: False, self.name_tags: ['bb'], self.name_many2many: False},
        ])

        records_created._BaseModel__ensure_xml_id()
        external_ids = [meta['xmlid'] for meta in records_created.get_metadata()]

        # Test the update flow
        values_list = [
            [
                "Id", "Record Definition Id",
                # Field of the first definition
                f"TextType ({def_record_1.display_name})", f"many2one ({def_record_1.display_name})", f"properties.{self.name_html}",
                # Field of the second definition
                f"CheckBox ({def_record_2.display_name})", f"properties.{self.name_tags}", f"M2M ({def_record_2.display_name})",
            ],
            # Record attached to the first definition record
            [
                external_ids[0], str(def_record_1.id),
                'SSBIYXRlIHRoaXMgZmVhdHVyZQ==', str(self.partners[2].id), '<img srx=x onclick="alert(1)"/>',
                '', '', '',
            ],

            # Record attached to the second definition record
            [
                external_ids[1], str(def_record_2.id),  # record that changed its parent
                 '<img srx=x onclick="alert(1)"/>',
                '', '',
                'FaLse', 'AA', f'{self.partners[1].id}',
            ],
            [
                external_ids[2], str(def_record_2.id), '<img srx=x onclick="alert(1)"/>',
                '', '',
                'false', 'bb,CC', '',
            ],
            [
                external_ids[3], str(def_record_2.id), '<img srx=x onclick="alert(1)"/>',
                '', '',
                '1', 'BB', f'{self.partners[1].id},{self.partners[2].id}',
            ],
        ]

        import_wizard = self.env['base_import.import'].create({
            'res_model': self.ModelProperty._name,
            'file': '\n'.join([';'.join(values) for values in values_list]),
            'file_type': 'text/csv',
        })
        opts = {'quoting': '"', 'separator': ';', 'has_headers': True}
        preview = import_wizard.parse_preview(opts)

        self.assertEqual(
            preview['matches'],
            {
                0: ['id'],
                1: ['record_definition_id'],
                2: [f'properties.{self.name_char}'],
                3: [f'properties.{self.name_many2one}'],
                4: [f'properties.{self.name_html}'],
                5: [f'properties.{self.name_bool}'],
                6: [f'properties.{self.name_tags}'],
                7: [f'properties.{self.name_many2many}'],
            },
        )

        results = import_wizard.execute_import(
            [
                'id',
                'record_definition_id',
                f'properties.{self.name_char}',
                f'properties.{self.name_many2one}/.id',
                f'properties.{self.name_html}',
                f'properties.{self.name_bool}',
                f'properties.{self.name_tags}',
                f'properties.{self.name_many2many}/.id',
            ],
            [],
            opts,
        )
        self.assertItemsEqual(results['messages'], [])

        # Ensure that the value is sanitized in database
        self.env.cr.execute("SELECT properties FROM import_properties WHERE id = %s", [records_created[0].id])
        result = self.env.cr.fetchone()
        self.assertEqual(result[0][self.name_html], '<img>')

        self.assertEqual(records_created.mapped('properties'), [
            {self.name_char: 'SSBIYXRlIHRoaXMgZmVhdHVyZQ==', self.name_selection: 'selection_2', self.name_many2one: self.partners[2].id, self.name_html: '<img>'},
            {self.name_bool: False, self.name_tags: ['aa'], self.name_many2many: self.partners[1].ids},
            {self.name_bool: False, self.name_tags: ['bb', 'cc'], self.name_many2many: False},
            {self.name_bool: True, self.name_tags: ['bb'], self.name_many2many: self.partners[1:].ids},
        ])
