import { Component } from "@odoo/owl";

export class OrderCourse extends Component {
    static template = "pos_restaurant.OrderCourse";
    static props = {
        course: Object,
        course_index: Number,
        slots: { type: Object, optional: true },
    };

    get course() {
        return this.props.course;
    }

    get comboSortedLines() {
        return this.course.lines.reduce((acc, line) => {
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
        if (order) {
            order.selectCourse(course);
        }
    }

    async deleteCourse(evt, course) {
        const order = course.order_id;
        order.lines
            .filter((l) => l.course_id?.id == course?.id)
            .forEach((line) => {
                line.delete();
            });
        course.delete();
        order.ensureCourseSelection();
    }
}
