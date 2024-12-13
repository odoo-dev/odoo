import { Interaction } from "@web/public/interaction";

import { session } from "@web/session";
import { renderToElement } from "@web/core/utils/render";
import { rpc } from "@web/core/network/rpc";

export class WebsiteSlidesPage extends Interaction {
    dynamicContent = {
        "button.o_wslides_button_complete": { "t-on-click.stop.prevent": this.onClickComplete },
        _root: {
            "t-on-slide_completed": this.onSlideCompleted,
            "t-on-slide_mark_completed": this.onSlideMarkCompleted,
        }
    }

    collapseNextCategory(nextCategoryId) {
        const categorySection = document.getElementById(`category-collapse-${nextCategoryId}`);
        if (categorySection?.getAttribute('aria-expanded') === 'false') {
            categorySection.setAttribute('aria-expanded', true);
            document.querySelector(`ul[id=collapse-${nextCategoryId}]`).classList.add('show');
        }
    }

    toggleCompletionButton(slide, completed = true) {
        const button = this.el.querySelector(`.o_wslides_sidebar_done_button[data-id="${slide.id}"]`);

        if (!!button) {
            return;
        }

        const newButton = renderToElement('website.slides.sidebar.done.button', {
            slideId: slide.id,
            uncompletedIcon: button.getAttribute('uncompletedIcon') ?? 'fa-circle-thin',
            slideCompleted: completed ? 1 : 0,
            canSelfMarkUncompleted: slide.canSelfMarkUncompleted,
            canSelfMarkCompleted: slide.canSelfMarkCompleted,
            isMember: slide.isMember,
        });

        button.outerHTML = newButton;
    }

    updateProgressbar(channelCompletion) {
        const completion = Math.min(100, channelCompletion);

        const completed = document.querySelector('.o_wslides_channel_completion_completed');
        const progressbar = document.querySelector('.o_wslides_channel_completion_progressbar');

        if (completion < 100) {
            // Hide the "Completed" text and show the progress bar
            completed.classList.add('d-none');
            progressbar.classList.add('d-flex')
            progressbar.classList.remove('d-none');
        } else {
            // Hide the progress bar and show the "Completed" text
            completed.classList.remove('d-none');
            progressbar.classList.remove('d-flex')
            progressbar.classList.add('d-none');
        }

        progressbar.querySelector('.progress-bar')?.style.width = `${completion}%`;
        progressbar.querySelector('.o_wslides_progress_percentage')?.textContent = completion;
    }

    async toggleSlideCompleted(slide, completed = true) {
        if (
            !!slide.completed === !!completed
            || !slide.isMember
            || !slide.canSelfMarkCompleted
        ) {
            // no useless RPC call
            return;
        }
        const data = await rpc(
            `/slides/slide/${completed ? 'set_completed' : 'set_uncompleted'}`,
            { slide_id: slide.id },
        );
        this.toggleCompletionButton(slide, completed);
        this.updateProgressbar(data.channel_completion);
        if (data.next_category_id) {
            this.collapseNextCategory(data.next_category_id);
        }
    }

    getSlide(slideId) {
        return document.querySelector(`.o_wslides_sidebar_done_button[data-id="${slideId}"]`).dataset;
    }

    onClickComplete(ev) {
        const button = ev.currentTarget.closest('.o_wslides_sidebar_done_button');
        const slideData = button.dataset;
        const isCompleted = Boolean(slideData.completed);
        this.toggleSlideCompleted(slideData, !isCompleted);
    }

    onSlideCompleted(ev) {
        const slideId = ev.data.slideId;
        const completed = ev.data.completed;
        const slide = this._getSlide(slideId);
        if (slide) {
            // Just joined the course (e.g. When "Submit & Join" action), update the UI
            this.toggleCompletionButton(slide, completed);
        }
        this.updateProgressbar(ev.data.channelCompletion);
    }

    onSlideMarkCompleted(ev) {
        if (!session.is_website_user) {
            const slide = this.getSlide(ev.data.id);
            this.toggleSlideCompleted(slide, true);
        }
    }
}
