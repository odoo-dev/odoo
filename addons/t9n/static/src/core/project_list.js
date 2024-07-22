import { Component, useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

export class ProjectList extends Component {
    static props = {};
    static template = "t9n.ProjectList";

    setup() {
        this.state = useState({
            filters: {
                searchText: "",
            },
            sorting: {
                column: "name",
                order: "asc",
            },
        });
        this.store = useState(useService("mail.store"));
        this.fetchProjects();
    }

    async fetchProjects() {
        const projects = await this.env.services.orm.call("t9n.project", "get_projects");
        this.store["t9n.project"].insert(projects);
    }

    get projects() {
        const searchTerms = this.state.filters.searchText.trim().toUpperCase();
        const allProjects = Object.values(this.store["t9n.project"].records);
        const projects = searchTerms
            ? allProjects.filter((p) => p.name.toUpperCase().includes(searchTerms))
            : allProjects;
        projects.sort((p1, p2) => {
            let p1Col = p1[this.state.sorting.column];
            let p2Col = p2[this.state.sorting.column];

            if (this.state.sorting.column !== "resource_count") {
                p1Col = p1Col.toLowerCase();
                p2Col = p2Col.toLowerCase();
            }

            if (p1Col < p2Col) {
                return this.state.sorting.order === "asc" ? -1 : 1;
            }
            if (p1Col > p2Col) {
                return this.state.sorting.order === "asc" ? 1 : -1;
            }
            return 0;
        });
        return projects;
    }

    onClickColumnName(column) {
        if (this.state.sorting.column === column) {
            this.state.sorting.order = this.state.sorting.order === "asc" ? "desc" : "asc";
        } else {
            this.state.sorting.column = column;
            this.state.sorting.order = "asc";
        }
    }

    onClickProject(project) {
        this.store.t9n.activeProject = project;
        this.store.t9n.activeView = "LanguageList";
    }
}
