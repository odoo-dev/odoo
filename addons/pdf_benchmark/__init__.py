from . import models

def post_init_pdf_benchmark(env):
    env['payroll.mass.generator'].action_generate_mass_data()
    env['sale.mass.generator'].action_generate_mass_data()
