import json
import os
from unittest import skipUnless

from odoo import models
from odoo.tests import TransactionCase
from odoo.tools import file_open

STRESS_MOCK_METHOD = 'SAVE' if os.getenv('STRESS_MOCK_SAVE') else 'ASSERT'


def stress_mock_save(function):
    @skipUnless(STRESS_MOCK_METHOD == 'SAVE', "Skipping test meant for saving to JSON.")
    def wrapper(self):
        function(self)

    return wrapper


def stress_mock_assert(function):
    @skipUnless(STRESS_MOCK_METHOD == 'ASSERT', "Skipping test meant for asserting data from JSON.")
    def wrapper(self):
        function(self)

    return wrapper


class TestAccountStressMock(TransactionCase):

    def _generate_random_move(self):
        return self.env['account.move'].create([{

        }])

    def _ensure_serializable(self, data):
        # TODO: should we keep this? or just let user handle unserializable data
        if isinstance(data, dict):
            for key, value in data.items():
                data[key] = self._ensure_serializable(value)
        elif isinstance(data, list):
            data = [self._ensure_serializable(x) for x in data]
        elif isinstance(data, models.BaseModel):
            data = f'__odoorecord__{data.__str__()}'

        return data

    def save_to_json_file(self, data, filename: str):
        with file_open(f"{self.test_module}/tests/test_files/{filename}.json", mode='w') as file:
            json.dump(data, file, indent=4)

    def assertEqualJson(self, data, filename: str):
        with file_open(f"{self.test_module}/tests/test_files/{filename}.json") as file:
            expected_data = json.load(file)
            self.assertEqual(data, expected_data)
