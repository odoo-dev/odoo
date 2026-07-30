import { Domain } from "@web/core/domain";
import { useSearchModel } from "@web/search/search_model";

export const ProjectModelMixin = (T) => class ProjectModelMixin extends T {
    searchModel = useSearchModel();

    _processSearchDomain(domain) {
        if (this.searchModel.context?.render_project_templates) {
            return Domain.and([
                Domain.removeDomainLeaves(domain, ['is_template']).toList(),
                [['is_template', '=', true]],
            ]).toList({});
        }
        return domain;
    }
}
