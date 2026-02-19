use clap::Parser as ClapParser;
use indexmap::IndexMap;
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast::visit::walk;
use oxc_ast::visit::Visit;
use oxc_parser::Parser;
use oxc_span::SourceType;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(ClapParser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Only show the filename
    #[arg(short, long)]
    filename: bool,

    /// Filter by specific action (add, remove, get, patch, access)
    #[arg(short = 'a', long, default_value = "add")]
    action: String,

    /// Output in JSON format
    #[arg(short, long)]
    json: bool,

    /// Output in Mermaid format
    #[arg(short, long)]
    mermaid: bool,

    /// Output in Graphviz DOT format
    #[arg(short = 'D', long)]
    dot: bool,
}

#[derive(Debug, Clone)]
struct ServiceResult {
    path: PathBuf,
    action: String,
    service: String,
    deps: Vec<String>,
}

#[derive(Serialize, Clone)]
struct JsonServiceInfo {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    dependencies: Vec<String>,
    #[serde(rename = "dependentsCount", skip_serializing_if = "is_zero")]
    dependents_count: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    dependents: Vec<String>,
    filenames: Vec<String>,
}

fn is_zero(n: &usize) -> bool {
    *n == 0
}

struct ServiceFinder {
    services: Vec<(String, String, Vec<String>)>, // (Action, Name, Dependencies)
    tracked_variables: HashSet<String>,
    variable_dependencies: HashMap<String, Vec<String>>,
}

impl<'a> Visit<'a> for ServiceFinder {
    fn visit_variable_declaration(&mut self, decl: &VariableDeclaration<'a>) {
        for declarator in &decl.declarations {
            if let Some(init) = &declarator.init {
                if let Expression::CallExpression(call) = init {
                    if self.is_category_services(call) {
                        if let Some(ident) = declarator.id.get_binding_identifier() {
                            self.tracked_variables.insert(ident.name.to_string());
                        }
                    }
                }

                if let Some(ident) = declarator.id.get_binding_identifier() {
                    let deps = self.extract_dependencies(init);
                    if !deps.is_empty() {
                        self.variable_dependencies
                            .insert(ident.name.to_string(), deps);
                    }
                }
            }
        }
        walk::walk_variable_declaration(self, decl);
    }

    fn visit_class(&mut self, class: &Class<'a>) {
        if let Some(ident) = &class.id {
            let deps = self.extract_dependencies_from_class(class);
            if !deps.is_empty() {
                self.variable_dependencies
                    .insert(ident.name.to_string(), deps);
            }
        }
        walk::walk_class(self, class);
    }

    fn visit_assignment_expression(&mut self, expr: &AssignmentExpression<'a>) {
        if let Some(mem) = expr.left.as_member_expression() {
            if let MemberExpression::StaticMemberExpression(static_mem) = mem {
                if static_mem.property.name == "dependencies" {
                    if let Expression::Identifier(ident) = &static_mem.object {
                        let deps = self.extract_strings_from_array(&expr.right);
                        if !deps.is_empty() {
                            self.variable_dependencies
                                .insert(ident.name.to_string(), deps);
                        }
                    }
                }
            }
        }
        walk::walk_assignment_expression(self, expr);
    }

    fn visit_call_expression(&mut self, expr: &CallExpression<'a>) {
        if let Expression::StaticMemberExpression(mem) = &expr.callee {
            let action = mem.property.name.to_string();
            if action == "add" || action == "remove" || action == "get" {
                let is_service_call = match &mem.object {
                    Expression::CallExpression(inner_call) => self.is_category_services(inner_call),
                    Expression::Identifier(ident) => {
                        self.tracked_variables.contains(ident.name.as_str())
                    }
                    _ => false,
                };

                if is_service_call {
                    if let Some(arg) = expr.arguments.get(0) {
                        let mut deps = Vec::new();
                        if action == "add" {
                            if let Some(arg1) = expr.arguments.get(1) {
                                if let Some(expr1) = arg1.as_expression() {
                                    deps = self.get_dependencies(expr1);
                                }
                            }
                        }

                        if let Some(Expression::StringLiteral(s)) = arg.as_expression() {
                            self.services.push((action, s.value.to_string(), deps));
                        } else if let Some(Expression::Identifier(ident)) = arg.as_expression() {
                            self.services
                                .push((action, format!("variable:{}", ident.name), deps));
                        }
                    }
                }
            }
        } else if let Expression::Identifier(ident) = &expr.callee {
            if ident.name == "patchWithCleanup" {
                if let Some(arg0) = expr.arguments.get(0) {
                    if let Some(Expression::CallExpression(call)) = arg0.as_expression() {
                        if self.is_category_services(call) {
                            self.services.push((
                                "patch".to_string(),
                                "services".to_string(),
                                vec![],
                            ));
                        }
                    } else if let Some(Expression::Identifier(ident)) = arg0.as_expression() {
                        if self.tracked_variables.contains(ident.name.as_str()) {
                            self.services.push((
                                "patch".to_string(),
                                "services".to_string(),
                                vec![],
                            ));
                        }
                    }
                }
            }
        }
        walk::walk_call_expression(self, expr);
    }

    fn visit_member_expression(&mut self, expr: &MemberExpression<'a>) {
        if let MemberExpression::StaticMemberExpression(mem) = expr {
            if mem.property.name == "content" {
                if let Expression::CallExpression(call) = &mem.object {
                    if self.is_category_services(call) {
                        self.services
                            .push(("access".to_string(), "content".to_string(), vec![]));
                    }
                } else if let Expression::Identifier(ident) = &mem.object {
                    if self.tracked_variables.contains(ident.name.as_str()) {
                        self.services
                            .push(("access".to_string(), "content".to_string(), vec![]));
                    }
                }
            }
        }
        walk::walk_member_expression(self, expr);
    }
}

impl ServiceFinder {
    fn is_category_services(&self, call: &CallExpression) -> bool {
        if let Expression::StaticMemberExpression(mem) = &call.callee {
            if mem.property.name == "category" {
                if let Some(arg) = call.arguments.get(0) {
                    if let Some(Expression::StringLiteral(s)) = arg.as_expression() {
                        return s.value == "services";
                    }
                }
            }
        }
        false
    }

    fn extract_strings_from_array(&self, expr: &Expression) -> Vec<String> {
        if let Expression::ArrayExpression(arr) = expr {
            let mut strings = Vec::new();
            for el in &arr.elements {
                if let Some(e) = el.as_expression() {
                    if let Expression::StringLiteral(s) = e {
                        strings.push(s.value.to_string());
                    }
                } else if let ArrayExpressionElement::SpreadElement(s) = el {
                    if let Expression::StaticMemberExpression(mem) = &s.argument {
                        if mem.property.name == "dependencies" {
                            if let Expression::Identifier(ident) = &mem.object {
                                if let Some(deps) =
                                    self.variable_dependencies.get(ident.name.as_str())
                                {
                                    strings.extend(deps.clone());
                                }
                            }
                        }
                    } else if let Expression::Identifier(ident) = &s.argument {
                        if let Some(deps) = self.variable_dependencies.get(ident.name.as_str()) {
                            strings.extend(deps.clone());
                        }
                    }
                }
            }
            return strings;
        }
        vec![]
    }

    fn extract_dependencies_from_class(&self, class: &Class) -> Vec<String> {
        for element in &class.body.body {
            match element {
                ClassElement::PropertyDefinition(prop) if prop.r#static => {
                    if let Some(name) = prop.key.static_name() {
                        if name == "dependencies" {
                            if let Some(value) = &prop.value {
                                return self.extract_strings_from_array(value);
                            }
                        }
                    }
                }
                ClassElement::MethodDefinition(method)
                    if method.r#static && method.kind == MethodDefinitionKind::Get =>
                {
                    if let Some(name) = method.key.static_name() {
                        if name == "dependencies" {
                            if let Some(body) = &method.value.body {
                                if let Some(Statement::ReturnStatement(ret)) =
                                    body.statements.first()
                                {
                                    if let Some(arg) = &ret.argument {
                                        return self.extract_strings_from_array(arg);
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        vec![]
    }

    fn extract_dependencies(&self, expr: &Expression) -> Vec<String> {
        match expr {
            Expression::ObjectExpression(obj) => {
                for prop in &obj.properties {
                    if let ObjectPropertyKind::ObjectProperty(p) = prop {
                        if let Some(name) = p.key.static_name() {
                            if name == "dependencies" {
                                if p.kind == PropertyKind::Init {
                                    return self.extract_strings_from_array(&p.value);
                                } else if p.kind == PropertyKind::Get {
                                    if let Expression::FunctionExpression(f) = &p.value {
                                        if let Some(body) = &f.body {
                                            if let Some(Statement::ReturnStatement(ret)) =
                                                body.statements.first()
                                            {
                                                if let Some(arg) = &ret.argument {
                                                    return self.extract_strings_from_array(arg);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Expression::ClassExpression(class) => {
                return self.extract_dependencies_from_class(class);
            }
            _ => {}
        }
        vec![]
    }

    fn get_dependencies(&self, expr: &Expression) -> Vec<String> {
        match expr {
            Expression::ObjectExpression(_) => self.extract_dependencies(expr),
            Expression::ClassExpression(_) => self.extract_dependencies(expr),
            Expression::Identifier(ident) => self
                .variable_dependencies
                .get(ident.name.as_str())
                .cloned()
                .unwrap_or_default(),
            Expression::StaticMemberExpression(mem) => {
                if mem.property.name == "dependencies" {
                    if let Expression::Identifier(ident) = &mem.object {
                        return self
                            .variable_dependencies
                            .get(ident.name.as_str())
                            .cloned()
                            .unwrap_or_default();
                    }
                }
                vec![]
            }
            _ => vec![],
        }
    }
}

fn main() {
    let args = Args::parse();
    let current_dir = std::env::current_dir().expect("Failed to get current directory");
    let base_root = current_dir
        .parent()
        .and_then(|p| p.parent())
        .unwrap_or(&current_dir);

    let roots = vec!["odoo", "enterprise"];
    let mut files = Vec::new();

    for root in roots {
        let root_path = base_root.join(root);
        if !root_path.exists() {
            continue;
        }
        for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            if entry.path().extension().map_or(false, |ext| ext == "js") {
                files.push(entry.path().to_path_buf());
            }
        }
    }

    let all_results: Vec<ServiceResult> = files
        .par_iter()
        .flat_map(|path| process_file(path, &args))
        .collect();

    let mut consolidated_deps: HashMap<String, HashSet<String>> = HashMap::new();
    let mut all_nodes: HashSet<String> = HashSet::new();

    for res in &all_results {
        if res.action == "add" {
            all_nodes.insert(res.service.clone());
            let entry = consolidated_deps.entry(res.service.clone()).or_default();
            for dep in &res.deps {
                entry.insert(dep.clone());
                all_nodes.insert(dep.clone());
            }
        }
    }

    let mut rev_graph: HashMap<String, HashSet<String>> = HashMap::new();
    for (service, deps) in &consolidated_deps {
        for dep in deps {
            rev_graph
                .entry(dep.clone())
                .or_default()
                .insert(service.clone());
        }
    }

    let dependent_map: HashMap<String, Vec<String>> = rev_graph
        .into_iter()
        .map(|(k, v)| (k, v.into_iter().collect()))
        .collect();

    if args.json {
        print_json(all_results, &args, &dependent_map);
    } else if args.mermaid {
        print_mermaid(all_results, &args);
    } else if args.dot {
        print_dot(all_results, &args);
    } else {
        perform_topo_sort(all_results, &args, &dependent_map, &consolidated_deps);
    }
}

fn process_file(path: &Path, args: &Args) -> Vec<ServiceResult> {
    let Ok(source_text) = std::fs::read_to_string(path) else {
        return vec![];
    };
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(path)
        .unwrap_or_default()
        .with_module(true);
    let ret = Parser::new(&allocator, &source_text, source_type).parse();

    let services = if !ret.errors.is_empty() {
        // Fallback to script mode
        let source_type_script = SourceType::from_path(path)
            .unwrap_or_default()
            .with_module(false);
        let ret_script = Parser::new(&allocator, &source_text, source_type_script).parse();
        if ret_script.errors.is_empty() {
            let mut finder = ServiceFinder {
                services: vec![],
                tracked_variables: HashSet::new(),
                variable_dependencies: HashMap::new(),
            };
            finder.visit_program(&ret_script.program);
            finder.services
        } else {
            return vec![];
        }
    } else {
        let mut finder = ServiceFinder {
            services: vec![],
            tracked_variables: HashSet::new(),
            variable_dependencies: HashMap::new(),
        };
        finder.visit_program(&ret.program);
        finder.services
    };

    services
        .into_iter()
        .filter(|(action, _, _)| action == &args.action)
        .map(|(action, service, deps)| ServiceResult {
            path: path.to_path_buf(),
            action,
            service,
            deps,
        })
        .collect()
}

fn print_result(
    result: &ServiceResult,
    args: &Args,
    dependents: &[String],
    consolidated_deps: &HashMap<String, HashSet<String>>,
) {
    let mut output = if args.filename {
        format!("{}: {}", result.path.display(), result.service)
    } else {
        result.service.clone()
    };

    if !dependents.is_empty() {
        let mut sorted_dependents = dependents.to_vec();
        sorted_dependents.sort();
        output.push_str(&format!(
            " (dependents ({}: {}))",
            dependents.len(),
            sorted_dependents.join(", ")
        ));
    }

    if let Some(deps) = consolidated_deps.get(&result.service) {
        if !deps.is_empty() {
            let mut s: Vec<_> = deps.iter().cloned().collect();
            s.sort();
            output.push_str(&format!(
                " (dependencies ({}: {}))",
                deps.len(),
                s.join(", ")
            ));
        }
    }

    println!("{}", output);
}

fn print_json(
    results: Vec<ServiceResult>,
    _args: &Args,
    dependent_map: &HashMap<String, Vec<String>>,
) {
    let mut consolidated_deps: HashMap<String, HashSet<String>> = HashMap::new();
    for res in &results {
        if res.action == _args.action {
            let entry = consolidated_deps.entry(res.service.clone()).or_default();
            for dep in &res.deps {
                entry.insert(dep.clone());
            }
        }
    }

    let mut services_data: HashMap<String, JsonServiceInfo> = HashMap::new();
    for res in &results {
        if res.action == _args.action {
            let entry = services_data
                .entry(res.service.clone())
                .or_insert(JsonServiceInfo {
                    dependencies: Vec::new(),
                    dependents_count: dependent_map.get(&res.service).map_or(0, |v| v.len()),
                    dependents: dependent_map.get(&res.service).cloned().unwrap_or_default(),
                    filenames: Vec::new(),
                });

            if let Some(deps) = consolidated_deps.get(&res.service) {
                let mut sorted_deps: Vec<_> = deps.iter().cloned().collect();
                sorted_deps.sort();
                entry.dependencies = sorted_deps;
            }

            let filename = res.path.display().to_string();
            if !entry.filenames.contains(&filename) {
                entry.filenames.push(filename);
            }
        }
    }

    let mut output_map: IndexMap<String, JsonServiceInfo> = IndexMap::new();

    if _args.json {
        // Note: using _args here as the function parameter name or ensuring it's used
        let order = get_topo_order(&results);
        for service_name in order {
            if let Some(data) = services_data.get(&service_name) {
                output_map.insert(service_name, data.clone());
            } else if _args.action != "add" {
                output_map.insert(
                    service_name.clone(),
                    JsonServiceInfo {
                        dependencies: Vec::new(),
                        dependents_count: dependent_map.get(&service_name).map_or(0, |v| v.len()),
                        dependents: dependent_map
                            .get(&service_name)
                            .cloned()
                            .unwrap_or_default(),
                        filenames: vec!["(external)".to_string()],
                    },
                );
            }
        }
    } else {
        let mut keys: Vec<_> = services_data.keys().cloned().collect();
        keys.sort();
        for key in keys {
            output_map.insert(key.clone(), services_data.get(&key).unwrap().clone());
        }
    }

    if let Ok(json) = serde_json::to_string_pretty(&output_map) {
        println!("{}", json);
    }
}

fn perform_topo_sort(
    results: Vec<ServiceResult>,
    args: &Args,
    dependent_map: &HashMap<String, Vec<String>>,
    consolidated_deps: &HashMap<String, HashSet<String>>,
) {
    let sorted_names = get_topo_order(&results);
    let mut service_map: HashMap<String, &ServiceResult> = HashMap::new();
    for res in &results {
        if res.action == args.action {
            service_map.insert(res.service.clone(), res);
        }
    }

    for service_name in sorted_names {
        let empty_vec = Vec::new();
        let dependents = dependent_map.get(&service_name).unwrap_or(&empty_vec);
        if let Some(res) = service_map.get(&service_name) {
            print_result(res, args, dependents, consolidated_deps);
        } else if args.action != "add" {
            println!("{}", service_name);
        }
    }
}

fn get_topo_order(results: &[ServiceResult]) -> Vec<String> {
    let mut consolidated_deps: HashMap<String, HashSet<String>> = HashMap::new();
    let mut all_nodes: HashSet<String> = HashSet::new();

    for res in results {
        if res.action == "add" {
            all_nodes.insert(res.service.clone());
            let entry = consolidated_deps.entry(res.service.clone()).or_default();
            for dep in &res.deps {
                entry.insert(dep.clone());
                all_nodes.insert(dep.clone());
            }
        }
    }

    let mut in_degree: HashMap<String, usize> = HashMap::new();
    let mut rev_graph: HashMap<String, Vec<String>> = HashMap::new();
    let mut original_deps_count: HashMap<String, usize> = HashMap::new();

    for node in &all_nodes {
        let deps = consolidated_deps.get(node);
        let count = deps.map(|d| d.len()).unwrap_or(0);
        original_deps_count.insert(node.clone(), count);
        in_degree.insert(node.clone(), count);

        if let Some(deps) = deps {
            for dep in deps {
                rev_graph.entry(dep.clone()).or_default().push(node.clone());
            }
        }
    }

    let mut dependent_count: HashMap<String, usize> = HashMap::new();
    for node in &all_nodes {
        let count = rev_graph.get(node).map_or(0, |v| v.len());
        dependent_count.insert(node.clone(), count);
    }

    let mut ready: Vec<String> = all_nodes
        .iter()
        .filter(|&n| in_degree[n] == 0)
        .cloned()
        .collect();

    let mut sorted = Vec::new();

    while !ready.is_empty() {
        ready.sort_by(|a, b| {
            let a_deps = original_deps_count[a];
            let b_deps = original_deps_count[b];
            a_deps
                .cmp(&b_deps)
                .then_with(|| {
                    let a_dependents = dependent_count[a];
                    let b_dependents = dependent_count[b];
                    a_dependents.cmp(&b_dependents)
                })
                .then_with(|| a.cmp(b))
        });

        let node = ready.remove(0);
        sorted.push(node.clone());

        if let Some(dependents) = rev_graph.get(&node) {
            for dep in dependents {
                if let Some(degree) = in_degree.get_mut(dep) {
                    *degree -= 1;
                    if *degree == 0 {
                        ready.push(dep.clone());
                    }
                }
            }
        }
    }

    sorted
}

fn get_module_hierarchy(path: &Path) -> Vec<String> {
    let components: Vec<_> = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();

    let mut root_idx = None;
    for i in (0..components.len()).rev() {
        let comp = &components[i];
        if comp == "addons" || comp == "enterprise" || comp == "odoo" {
            root_idx = Some(i);
            if i + 1 < components.len() && components[i + 1] == "addons" {
                // skip
            } else {
                break;
            }
        }
    }

    if let Some(idx) = root_idx {
        let mut hierarchy = Vec::new();
        hierarchy.push(components[idx].clone());

        let mut found_src = false;
        for i in (idx + 1)..components.len() {
            let comp = &components[i];
            if i == components.len() - 1 {
                break;
            }
            if comp == "static" || comp == "src" {
                found_src = true;
                continue;
            }
            if !found_src && comp == "addons" {
                continue;
            }
            hierarchy.push(comp.clone());
        }
        return hierarchy;
    }

    vec!["unknown".to_string()]
}

struct DiagramNode<'a> {
    name: String,
    subgraphs: BTreeMap<String, DiagramNode<'a>>,
    services: Vec<&'a ServiceResult>,
}

impl<'a> DiagramNode<'a> {
    fn new(name: String) -> Self {
        Self {
            name,
            subgraphs: BTreeMap::new(),
            services: Vec::new(),
        }
    }

    fn add_service(&mut self, hierarchy: &[String], service: &'a ServiceResult) {
        if hierarchy.is_empty() {
            self.services.push(service);
        } else {
            let next_name = &hierarchy[0];
            let child = self
                .subgraphs
                .entry(next_name.clone())
                .or_insert_with(|| DiagramNode::new(next_name.clone()));
            child.add_service(&hierarchy[1..], service);
        }
    }
}

fn print_mermaid(results: Vec<ServiceResult>, _args: &Args) {
    println!("graph TD");
    let mut root = DiagramNode::new("".to_string());
    let mut seen_services = HashSet::new();

    for res in &results {
        if res.action == "add" && !seen_services.contains(&res.service) {
            let hierarchy = get_module_hierarchy(&res.path);
            root.add_service(&hierarchy, res);
            seen_services.insert(res.service.clone());
        }
    }

    fn render_mermaid_recursive(node: &DiagramNode, indent: usize, path: &str) {
        let indent_str = "    ".repeat(indent);
        let is_root = node.name.is_empty();

        let current_path = if is_root {
            "".to_string()
        } else if path.is_empty() {
            node.name.clone()
        } else {
            format!("{}_{}", path, node.name)
        };

        if !is_root {
            println!(
                "{}subgraph cluster_{} [\"{}\"]",
                indent_str,
                sanitize_id(&current_path),
                node.name
            );
        }

        for res in &node.services {
            println!(
                "{}    id_{}[\"{}\"]",
                indent_str,
                sanitize_id(&res.service),
                res.service
            );
        }

        for child in node.subgraphs.values() {
            render_mermaid_recursive(child, indent + 1, &current_path);
        }

        if !is_root {
            println!("{}}}", indent_str);
        }
    }

    render_mermaid_recursive(&root, 1, "");

    let mut seen_edges = HashSet::new();
    for res in &results {
        if res.action == "add" {
            for dep in &res.deps {
                let edge = format!("{}->{}", res.service, dep);
                if !seen_edges.contains(&edge) {
                    println!(
                        "    id_{} --> id_{}",
                        sanitize_id(&res.service),
                        sanitize_id(dep)
                    );
                    seen_edges.insert(edge);
                }
            }
        }
    }
}

fn print_dot(results: Vec<ServiceResult>, _args: &Args) {
    println!("digraph G {{");
    println!("    compound=true;");
    let mut root = DiagramNode::new("".to_string());
    let mut seen_services = HashSet::new();

    for res in &results {
        if res.action == "add" && !seen_services.contains(&res.service) {
            let hierarchy = get_module_hierarchy(&res.path);
            root.add_service(&hierarchy, res);
            seen_services.insert(res.service.clone());
        }
    }

    fn render_dot_recursive(node: &DiagramNode, indent: usize, path: &str) {
        let indent_str = "    ".repeat(indent);
        let is_root = node.name.is_empty();

        let current_path = if is_root {
            "".to_string()
        } else if path.is_empty() {
            node.name.clone()
        } else {
            format!("{}_{}", path, node.name)
        };

        if !is_root {
            println!(
                "{}subgraph cluster_{} {{",
                indent_str,
                sanitize_id(&current_path)
            );
            println!("{}    label=\"{}\";", indent_str, node.name);
        }

        for res in &node.services {
            println!("{}    \"{}\";", indent_str, res.service);
        }

        for child in node.subgraphs.values() {
            render_dot_recursive(child, indent + 1, &current_path);
        }

        if !is_root {
            println!("{}}}", indent_str);
        }
    }

    render_dot_recursive(&root, 1, "");

    let mut seen_edges = HashSet::new();
    for res in &results {
        if res.action == "add" {
            for dep in &res.deps {
                let edge = format!("{}->{}", res.service, dep);
                if !seen_edges.contains(&edge) {
                    println!("    \"{}\" -> \"{}\";", res.service, dep);
                    seen_edges.insert(edge);
                }
            }
        }
    }
    println!("}}");
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}
