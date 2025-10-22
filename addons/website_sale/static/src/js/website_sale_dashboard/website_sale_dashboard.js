import { useService, useBus } from '@web/core/utils/hooks';
import { Component, onWillStart, onWillUpdateProps, useState } from '@odoo/owl';
import { DateFilterButton, DATE_OPTIONS } from './date_filter_button/date_filter_button';

export class WebsiteSaleDashboard extends Component {
	static template = 'website_sale.WebsiteSaleDashboard';
	static props = { list: { type: Object, optional: true } };
	static components = { DateFilterButton };

	setup() {
		this.state = useState({
			eCommerceData: {},
			selectedDateFilter: DATE_OPTIONS[0],
			selectedFilter: [],
		});
		this.orm = useService('orm');

		useBus(this.env.searchModel, 'update', () => {
			if(!this.isSameFilter(this.state.selectedFilter)) {
				this.state.selectedFilter = null;
			}
		});

		onWillStart(async () => {
			await this.updateDashboardState();
		});
		onWillUpdateProps(async () => {
			await this.updateDashboardState();
		});
	}

	async updateDashboardState(filter = false) {
		if (filter) {
			this.state.selectedDateFilter = filter;
		}
		this.state.eCommerceData = await this.orm.call('sale.order', 'retrieve_dashboard', [
			this.state.selectedDateFilter.id,
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
		this.state.selectedFilter = filters;
	}

	isSameFilter(filters) {
		if (!filters) {
			return false;
		}
		const activeSearchFilterNames = this.env.searchModel.getSearchItems(el => el.isActive && el.type === 'filter')?.map(el => el.name).sort();
		return filters.length === activeSearchFilterNames?.length && filters.sort().every((val, i) => val === activeSearchFilterNames[i]);
	}

	getPeriodCardClass(dataName) {
		if (this.state.eCommerceData['period_gain'][dataName] > 0) {
			return 'text-success';
		} else if (this.state.eCommerceData['period_gain'][dataName] < 0) {
			return 'text-danger';
		}
		return '';
	}

	getDashboardCardAdditionalClass(filterName) {
		const dashboardCardColor = {
			'to_fulfill': 'purple',
			'to_confirm': 'orange',
			'to_invoice': 'cyan',
		};
		let dashboardCardClasses = [];
		const noData = this.state.eCommerceData['overall'][filterName] == 0;
		if(noData) {
			dashboardCardClasses.push('bg-secondary text-secondary-emphasis disabled');
		} else {
			dashboardCardClasses.push('o_dashboard_card_' + dashboardCardColor[filterName]);
		}
		const filters = filterName == 'to_confirm' ? [filterName, 'from_website'] : [filterName, 'from_website','order_confirmed'];
		if(this.isSameFilter(filters)) {
			dashboardCardClasses.push('active');
		}
		return dashboardCardClasses.join(' ');
	}
}
