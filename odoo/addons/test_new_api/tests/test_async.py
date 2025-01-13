from odoo.tests import common


class TestAsync(common.TransactionCase):
    def test_async(self):
        Model = self.env['test_new_api.async.queue']
        job1, job2 = Model.create([{}, {}])
        # XXX

    def test_async_precondition(self):
        Model = self.env['test_new_api.async.queue']
        job1, job2 = Model.create([{}, {}])
        # XXX

    def test_async_run_in_postcommit(self):
        Model = self.env['test_new_api.async.queue']
        job1, job2 = Model.create([{}, {}])
        job1.future().post_commit(self.env)
        # XXX

    def test_async_controller(self):
        Model = self.env['test_new_api.async.queue']
        job1, job2 = Model.create([{}, {}])
        # XXX scheduled PDF
        f = job1.future()
        f.result()
