# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, tools
from odoo.exceptions import UserError
from odoo.tools import SQL


class MrpWorkorderAnalysis(models.Model):
    """ Work orders to process, and the ones still to come: work orders are created one at a
    time (as the previous ones are done), so the open manufacturing orders also
    count the operations of their bill of materials without work order yet.

    The upcoming ones are approximate: kit operations and variant-specific
    operations are left out, they are at the work center of their operation,
    and their duration is estimated from the operation's fixed duration. They are
    scheduled one after the other, after the last planned work order of their
    manufacturing order (and not before now), during the working hours of their
    work center (time off excluded), but regardless of its other work orders.

    The dates are computed in SQL (see `_init_planning_functions`), to be
    searchable as the Gantt view needs. """
    _name = 'mrp.workorder.analysis'
    _description = 'Work Orders Analysis'
    _auto = False
    _order = 'date_start, production_id, id'
    _rec_name = 'name'
    # flushed before reading the view
    _depends = {
        'mrp.workorder': [
            'name', 'production_id', 'workcenter_id', 'operation_id', 'state', 'date_start',
            'date_finished', 'duration_expected', 'duration', 'sequence',
        ],
        'mrp.production': ['product_id', 'company_id', 'state', 'product_qty', 'bom_id'],
        'mrp.bom': ['product_qty', 'allow_operation_dependencies'],
        'mrp.routing.workcenter': [
            'name', 'bom_id', 'active', 'workcenter_id', 'sequence', 'time_cycle_manual',
            'bom_product_template_attribute_value_ids',
        ],
        'mrp.workcenter': ['time_start', 'time_stop', 'time_efficiency', 'resource_calendar_id', 'resource_id'],
        'resource.resource': ['tz'],
        'resource.calendar': ['calendar_type'],
        'resource.calendar.attendance': [
            'calendar_id', 'dayofweek', 'hour_from', 'hour_to', 'duration_based', 'duration_hours',
            'sequence', 'date', 'recurrency', 'recurrency_type', 'recurrency_interval',
            'recurrency_until', 'recurrency_excluded_occurences',
        ],
        'resource.calendar.leaves': ['calendar_id', 'resource_id', 'date_from', 'date_to', 'count_as'],
    }

    name = fields.Char('Work Order', readonly=True)
    workorder_id = fields.Many2one('mrp.workorder', 'Work Order Record', readonly=True)
    production_id = fields.Many2one('mrp.production', 'Manufacturing Order', readonly=True)
    product_id = fields.Many2one('product.product', 'Product', readonly=True)
    workcenter_id = fields.Many2one('mrp.workcenter', 'Work Center', readonly=True,
                                    group_expand='_read_group_workcenter_id')
    operation_id = fields.Many2one('mrp.routing.workcenter', 'Operation', readonly=True)
    company_id = fields.Many2one('res.company', 'Company', readonly=True)
    state = fields.Selection([
        ('upcoming', 'Upcoming'),
        ('blocked', 'Waiting'),
        ('ready', 'To Do'),
        ('progress', 'In Progress')], string='Status', readonly=True)
    date_start = fields.Datetime('Start', readonly=True,
                                 help="Estimated for the upcoming ones (see the model)")
    date_finished = fields.Datetime('End', readonly=True,
                                    help="Estimated for the upcoming ones (see the model)")
    qty_production = fields.Float('Quantity to Produce', readonly=True)
    duration_expected = fields.Float('Expected Duration', readonly=True, aggregator='sum',
                                     help="Expected duration (in minutes)")
    duration = fields.Float('Real Duration', readonly=True, aggregator='sum',
                            help="Real duration (in minutes)")
    progress = fields.Float('Progress (%)', readonly=True, aggregator='avg',
                            help="Real duration against the expected one (none for the upcoming ones)")

    def _upcoming_duration_sql(self):
        """ Approximate duration (in minutes) of an operation without work order:
        its fixed duration per cycle, cycles to produce the quantity of the order
        with the default capacity, setup and cleanup times of the work center. """
        return SQL("""
            COALESCE(wc.time_start, 0) + COALESCE(wc.time_stop, 0)
            + CEIL(mo.product_qty / NULLIF(bom.product_qty, 0)) * op.time_cycle_manual
              * 100.0 / NULLIF(COALESCE(wc.time_efficiency, 100), 0)
        """)

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self._init_planning_functions()
        self.env.cr.execute(SQL("CREATE OR REPLACE VIEW %s AS (%s)", SQL.identifier(self._table), self._query()))

    def _init_planning_functions(self):
        """ SQL functions scheduling a duration in the working hours of a calendar:

        - ``mrp_calendar_work_ranges(calendar, resource, tz, day)``: the working
          time of the local ``day``, in UTC, without the time off of the calendar
          and of the resource. As ``resource.calendar._attendance_intervals_batch``:
          the attendances of the day of week (fixed calendars) or of the date
          (variable ones, recurrent or not), the duration-based ones centered on noon;
        - ``mrp_workorder_analysis_plan(calendar, resource, tz, start, minutes)``:
          the first working moment from ``start``, and the end of ``minutes`` of
          working time from there. Flexible calendars (or none) count all the time.
        """
        self.env.cr.execute("""
            CREATE OR REPLACE FUNCTION mrp_calendar_work_ranges(
                p_calendar integer, p_resource integer, p_tz varchar, p_day date)
            RETURNS tsmultirange LANGUAGE sql STABLE AS $$
                WITH attendances AS (
                    SELECT a.id, a.sequence, a.hour_from, a.hour_to, a.duration_based,
                           COALESCE(a.duration_hours, 0) AS duration_hours
                      FROM resource_calendar_attendance a
                     WHERE a.calendar_id = p_calendar
                       AND (
                            (a.date IS NULL AND a.dayofweek = (EXTRACT(ISODOW FROM p_day)::integer - 1)::varchar)
                         OR (a.date IS NOT NULL AND a.recurrency IS NOT TRUE AND a.date = p_day)
                         OR (a.date IS NOT NULL AND a.recurrency IS TRUE AND a.recurrency_interval > 0
                             AND a.date <= p_day AND (a.recurrency_until IS NULL OR p_day <= a.recurrency_until)
                             AND NOT COALESCE(a.recurrency_excluded_occurences, '[]'::jsonb) ? p_day::text
                             AND (
                                  (a.recurrency_type = 'days' AND (p_day - a.date) %% a.recurrency_interval = 0)
                               OR (a.recurrency_type = 'weeks' AND (p_day - a.date) %% 7 = 0
                                   AND ((p_day - a.date) / 7) %% a.recurrency_interval = 0)))
                       )
                ), hours AS (
                    -- duration-based attendances follow each other, centered on noon
                    SELECT CASE WHEN duration_based
                                THEN 12 - SUM(duration_hours) FILTER (WHERE duration_based) OVER () / 2
                                     + COALESCE(SUM(duration_hours) FILTER (WHERE duration_based) OVER (
                                           ORDER BY sequence, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
                                ELSE hour_from END AS hour_from,
                           duration_based, duration_hours, hour_to
                      FROM attendances
                ), ranges AS (
                    SELECT tsrange(
                               ((p_day + hour_from * interval '1 hour') AT TIME ZONE p_tz) AT TIME ZONE 'UTC',
                               ((p_day + (CASE WHEN duration_based THEN hour_from + duration_hours ELSE hour_to END)
                                 * interval '1 hour') AT TIME ZONE p_tz) AT TIME ZONE 'UTC'
                           ) AS work
                      FROM hours
                )
                SELECT COALESCE(range_agg(work), '{}'::tsmultirange) - COALESCE((
                           SELECT range_agg(tsrange(l.date_from, l.date_to))
                             FROM resource_calendar_leaves l
                            WHERE (l.calendar_id IS NULL OR l.calendar_id = p_calendar)
                              AND (l.resource_id IS NULL OR l.resource_id = p_resource)
                              AND l.count_as IS DISTINCT FROM 'working_time'
                              AND l.date_from < ((p_day + 1)::timestamp AT TIME ZONE p_tz) AT TIME ZONE 'UTC'
                              AND l.date_to > (p_day::timestamp AT TIME ZONE p_tz) AT TIME ZONE 'UTC'
                       ), '{}'::tsmultirange)
                  FROM ranges
            $$;

            CREATE OR REPLACE FUNCTION mrp_workorder_analysis_plan(
                p_calendar integer, p_resource integer, p_tz varchar, p_start timestamp,
                p_minutes double precision, OUT date_start timestamp, OUT date_finished timestamp)
            LANGUAGE plpgsql STABLE AS $$
            DECLARE
                v_tz varchar := COALESCE(NULLIF(p_tz, ''), 'UTC');
                v_remaining interval := make_interval(secs => GREATEST(COALESCE(p_minutes, 0), 0) * 60);
                v_day date;
                v_range tsrange;
                v_length interval;
            BEGIN
                IF p_calendar IS NULL
                   OR NOT EXISTS (SELECT 1 FROM resource_calendar c WHERE c.id = p_calendar AND c.calendar_type != 'undefined')
                   OR NOT EXISTS (SELECT 1 FROM resource_calendar_attendance a WHERE a.calendar_id = p_calendar) THEN
                    date_start := p_start;
                    date_finished := p_start + v_remaining;
                    RETURN;
                END IF;
                v_day := ((p_start AT TIME ZONE 'UTC') AT TIME ZONE v_tz)::date;
                -- at most a year ahead
                FOR i IN 0..366 LOOP
                    FOR v_range IN
                        SELECT r FROM unnest(
                            mrp_calendar_work_ranges(p_calendar, p_resource, v_tz, v_day)
                            * tsmultirange(tsrange(p_start, NULL))) r
                         ORDER BY lower(r)
                    LOOP
                        date_start := COALESCE(date_start, lower(v_range));
                        v_length := upper(v_range) - lower(v_range);
                        IF v_length >= v_remaining THEN
                            date_finished := lower(v_range) + v_remaining;
                            RETURN;
                        END IF;
                        v_remaining := v_remaining - v_length;
                    END LOOP;
                    v_day := v_day + 1;
                END LOOP;
                -- not enough working time: the rest without calendar
                date_start := COALESCE(date_start, p_start);
                date_finished := date_start + v_remaining;
            END
            $$;
        """.replace('%%', '%'))

    def _query(self):
        return SQL("""
            WITH RECURSIVE upcoming AS (
                -- the operations without work order of the open manufacturing orders, in order
                SELECT (mo.id::bigint * 2147483648 + op.id) * 2 + 1 AS id,
                       op.name AS name,
                       mo.id AS production_id,
                       mo.product_id AS product_id,
                       op.workcenter_id AS workcenter_id,
                       op.id AS operation_id,
                       mo.company_id AS company_id,
                       mo.product_qty AS qty_production,
                       %(duration)s AS duration_expected,
                       op.sequence AS sequence,
                       COALESCE(wc.resource_calendar_id, company.resource_calendar_id) AS calendar_id,
                       wc.resource_id AS resource_id,
                       COALESCE(resource.tz, 'UTC') AS tz,
                       ROW_NUMBER() OVER (PARTITION BY mo.id ORDER BY op.sequence, op.id) AS rank,
                       -- after the planned work orders of the order, and not in the past
                       GREATEST(
                           NOW() AT TIME ZONE 'UTC',
                           COALESCE((SELECT MAX(wo.date_finished) FROM mrp_workorder wo
                                      WHERE wo.production_id = mo.id AND wo.state != 'cancel'), mo.date_start)
                       ) AS date_from,
                       -- and after the remaining time of its unplanned work orders
                       COALESCE((SELECT SUM(GREATEST(wo.duration_expected - wo.duration, 0)) FROM mrp_workorder wo
                                  WHERE wo.production_id = mo.id AND wo.date_finished IS NULL
                                    AND wo.state NOT IN ('done', 'cancel')), 0) AS pending_minutes
                  FROM mrp_production mo
                  JOIN mrp_bom bom ON bom.id = mo.bom_id
                  JOIN mrp_routing_workcenter op ON op.bom_id = bom.id AND op.active IS TRUE
                  JOIN mrp_workcenter wc ON wc.id = op.workcenter_id
                  JOIN res_company company ON company.id = mo.company_id
                  LEFT JOIN resource_resource resource ON resource.id = wc.resource_id
                 WHERE mo.state IN ('draft', 'confirmed', 'progress', 'to_close')
                   AND bom.allow_operation_dependencies IS NOT TRUE
                   AND NOT EXISTS (
                        SELECT 1 FROM mrp_routing_workcenter_product_template_attribute_value_rel variant
                         WHERE variant.mrp_routing_workcenter_id = op.id)
                   AND NOT EXISTS (
                        SELECT 1 FROM mrp_workorder wo
                         WHERE wo.production_id = mo.id AND wo.operation_id = op.id)
            ), planned AS (
                -- each one in the working hours of its work center, after the previous one
                SELECT upcoming.*, plan.date_start, plan.date_finished
                  FROM upcoming
                 CROSS JOIN LATERAL mrp_workorder_analysis_plan(
                       upcoming.calendar_id, upcoming.resource_id, upcoming.tz,
                       upcoming.date_from, upcoming.pending_minutes) pending
                 CROSS JOIN LATERAL mrp_workorder_analysis_plan(
                       upcoming.calendar_id, upcoming.resource_id, upcoming.tz,
                       pending.date_finished, upcoming.duration_expected) plan
                 WHERE upcoming.rank = 1
                UNION ALL
                SELECT upcoming.*, plan.date_start, plan.date_finished
                  FROM planned previous
                  JOIN upcoming ON upcoming.production_id = previous.production_id
                               AND upcoming.rank = previous.rank + 1
                 CROSS JOIN LATERAL mrp_workorder_analysis_plan(
                       upcoming.calendar_id, upcoming.resource_id, upcoming.tz,
                       previous.date_finished, upcoming.duration_expected) plan
            )
            -- stable ids: even ones for work orders, odd ones for the upcoming operations
            SELECT wo.id::bigint * 2 AS id,
                   wo.id AS workorder_id,
                   wo.name AS name,
                   wo.production_id AS production_id,
                   mo.product_id AS product_id,
                   wo.workcenter_id AS workcenter_id,
                   wo.operation_id AS operation_id,
                   mo.company_id AS company_id,
                   wo.state AS state,
                   wo.date_start AS date_start,
                   wo.date_finished AS date_finished,
                   mo.product_qty AS qty_production,
                   wo.duration_expected AS duration_expected,
                   wo.duration AS duration,
                   CASE WHEN wo.duration_expected > 0 THEN LEAST(wo.duration * 100.0 / wo.duration_expected, 100.0)
                        ELSE 0.0 END AS progress,
                   wo.sequence AS sequence
              FROM mrp_workorder wo
              JOIN mrp_production mo ON mo.id = wo.production_id
             WHERE wo.state NOT IN ('done', 'cancel')
            UNION ALL
            SELECT id,
                   NULL AS workorder_id,
                   name,
                   production_id,
                   product_id,
                   workcenter_id,
                   operation_id,
                   company_id,
                   'upcoming' AS state,
                   date_start,
                   date_finished,
                   qty_production,
                   duration_expected,
                   0.0 AS duration,
                   0.0 AS progress,
                   sequence
              FROM planned
        """, duration=self._upcoming_duration_sql())

    def _read_group_workcenter_id(self, workcenters, domain):
        # all the work centers, as in the planning of the work orders
        return self.env['mrp.workorder']._read_group_workcenter_id(workcenters, domain)

    def write(self, vals):
        """ Moving a line in the planning (Gantt view) moves its work order. The
        upcoming lines have none yet: they follow the work orders of their order. """
        if self.filtered(lambda line: line.state == 'upcoming'):
            raise UserError(self.env._(
                "This operation has no work order yet: its dates are estimated after the "
                "previous work orders of its manufacturing order. Plan the manufacturing "
                "order to create all its work orders."))
        if unknown := set(vals) - self._get_workorder_writable_fields():
            raise UserError(self.env._("You can only change the dates and the work center of a work order here (not %s).", ", ".join(sorted(unknown))))
        self.workorder_id.write(vals)
        self.invalidate_recordset()
        return True

    def _get_workorder_writable_fields(self):
        return {'date_start', 'date_finished', 'workcenter_id'}

    def action_open_record(self):
        """ The work order, or the manufacturing order of an upcoming one. """
        self.ensure_one()
        record = self.workorder_id or self.production_id
        return {
            'type': 'ir.actions.act_window',
            'res_model': record._name,
            'res_id': record.id,
            'views': [(False, 'form')],
        }
