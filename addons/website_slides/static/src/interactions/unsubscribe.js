import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";
import { SlideUnsubscribeDialog } from "@website_slides/js/public/components/slide_unsubscribe_dialog/slide_unsubscribe_dialog";
import { rpc } from "@web/core/network/rpc";


export class CourseOptionsMenu extends Interaction {
    static selector = ".o_wslides_course_options_menu";
    dynamicContent = {
        ".o_wslides_js_notify_toggle": {
            "t-on-change": async (ev) => {
                const subscribe = ev.target.checked;
                try {
                    await this.waitFor(
                        rpc(`/slides/channel/${subscribe ? "subscribe" : "unsubscribe"}`, {
                            channel_id: Number(this.el.dataset.channelId),
                        })
                    );
                } catch {
                    ev.target.checked = !subscribe;
                }
            },
        },
        ".o_wslides_js_leave_course": {
            "t-on-click": () => {
                const data = this.el.dataset;
                this.services.dialog.add(SlideUnsubscribeDialog, {
                    channelId: Number(data.channelId),
                    enroll: data.enroll,
                    visibility: data.visibility,
                });
            },
        },
    };
}

registry.category("public.interactions").add("website_slides.courseOptionsMenu", CourseOptionsMenu);
