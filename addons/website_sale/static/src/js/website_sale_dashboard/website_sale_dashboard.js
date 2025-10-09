import { useService } from '@web/core/utils/hooks';
import { Component, onWillStart, onWillUpdateProps, useState } from '@odoo/owl';
import { DateFilterButton, DATE_OPTIONS } from './date_filter_button/date_filter_button';

export class WebsiteSaleDashboard extends Component {
	static template = 'website_sale.WebsiteSaleDashboard';
	static props = { list: { type: Object, optional: true } };
	static components = { DateFilterButton };

	setup() {
		this.state = useState({
			eCommerceData: {},
			selectedFilter: DATE_OPTIONS[0],
		});
		this.orm = useService('orm');

		onWillStart(async () => {
			await this.updateDashboardState();
		});
		onWillUpdateProps(async () => {
			await this.updateDashboardState();
		});
	}

	async updateDashboardState(filter = false) {
		if (filter) {
			this.state.selectedFilter = filter;
		}
		this.state.eCommerceData = await this.orm.call('sale.order', 'retrieve_dashboard', [
			this.state.selectedFilter.id,
		]);
	}

	/**
	 * This method clears the current search query and activates
	 * the filters found in `filter_name` attibute from card clicked
	 */
	setSearchContext(ev) {
		const filter_name = ev.currentTarget.getAttribute('filter_name');
		const filters = filter_name.split(',');
		const searchItems = this.env.searchModel.getSearchItems((item) =>
			filters.includes(item.name)
		);
		this.env.searchModel.query = [];
		for (const item of searchItems) {
			this.env.searchModel.toggleSearchItem(item.id);
		}
	}

	getPeriodCardClass(dataName) {
		if (this.state.eCommerceData['period_gain'][dataName] > 0) {
			return 'text-success';
		} else if (this.state.eCommerceData['period_gain'][dataName] < 0) {
			return 'text-danger';
		}
		return 'text-muted';
	}
}
