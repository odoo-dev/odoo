import { Component, proxy, onWillUnmount, useProps, t } from "@odoo/owl";
import { RestaurantOrderCourse } from "@pos_restaurant/app/models/restaurant_order_course";

export class OrderCourse extends Component {
    static template = "pos_restaurant.OrderCourse";
    props = useProps({
        course: t.instanceOf(RestaurantOrderCourse),
        course_index: t.number(),
        slots: t.object().optional(),
    });

    setup() {
        super.setup();

        this.state = proxy({ duration: this.course.getDuration() });
        this.timerInterval = setInterval(() => {
            this.state.duration = this.course.getDuration();
        }, 1_000);
        onWillUnmount(() => clearInterval(this.timerInterval));
    }

    get course() {
        return this.props.course;
    }

    get comboSortedLines() {
        // Keep the service fees below the products, as PosOrder.getOrderlines does.
        const regularLines = [];
        const serviceFeeLines = [];
        for (const line of this.course.lines) {
            (line.isServiceFeeLine() ? serviceFeeLines : regularLines).push(line);
        }
        return [...regularLines, ...serviceFeeLines].reduce((acc, line) => {
            if (line.combo_line_ids?.length > 0) {
                acc.push(line, ...line.combo_line_ids);
            } else if (!line.combo_parent_id) {
                acc.push(line);
            }
            return acc;
        }, []);
    }

    clickCourse(evt, course) {
        const order = course.order_id;
        order.selectCourse(course);
    }
}
