import { Plugin } from "@odoo/owl";

import { Domain } from "@web/core/domain";
import { services } from "@web/core/services";

export class ProjectModelPlugin extends Plugin {
    processSearchDomain(domain, context) {
        if (context?.render_project_templates) {
            return Domain.and([
                Domain.removeDomainLeaves(domain, ['is_template']).toList(),
                [['is_template', '=', true]],
            ]).toList({});
        }
        return domain;
    }
}

services.add(ProjectModelPlugin);
