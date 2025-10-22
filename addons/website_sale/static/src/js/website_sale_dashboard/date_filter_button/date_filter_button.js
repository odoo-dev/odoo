import { _t } from '@web/core/l10n/translation';
import { Component } from '@odoo/owl';
import { Dropdown } from '@web/core/dropdown/dropdown';
import { DropdownItem } from '@web/core/dropdown/dropdown_item';

export const DATE_OPTIONS = [
	{
		id: 'last_7_days',
		label: _t("Last 7 days"),
	},
	{
		id: 'last_30_days',
		label: _t("Last 30 days"),
	},
	{
		id: 'last_90_days',
		label: _t("Last 90 days"),
	},
	{
		id: 'last_365_days',
		label: _t("Last 365 days"),
	},
];

export class DateFilterButton extends Component {
	static template = 'website_sale.DateFilterButton';
	static components = { Dropdown, DropdownItem };
	static props = {
		selectedDateFilter: {
			type: Object,
			optional: true,
			shape: {
				id: String,
				label: String,
			},
		},
		update: Function,
	};

	get dateFilters() {
		return DATE_OPTIONS;
	}
}
