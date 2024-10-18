import os
import ast
import json
from pathlib import Path
from collections import defaultdict

TOOLING_PATH = Path(os.path.abspath(__file__)).parent
ODOO_PATH = TOOLING_PATH.parent.parent.parent

def get_manifest(path):
    m_path = path.joinpath("__manifest__.py")
    if m_path.is_file():
        with open(m_path, "r") as f:
            return ast.literal_eval(f.read())
    return {}

def process_modules_dependencies(modules):
    module_depends = {}
    repo_depends = defaultdict(set)
    def get_full_depends(module_name):
        if module_name in module_depends:
            return module_depends[module_name]
        depends = set()
        module = modules[module_name]
        for dep in module["depends"]:
            if dep not in modules:
                continue
            repo_depends[module["repo"]].add(modules[dep]["repo"])
            depends.add(dep)
            depends.update(get_full_depends(dep))
        module_depends[module_name] = depends
        return depends

    for name in modules:
        get_full_depends(name)

    return repo_depends, module_depends

def _default_module_filter(path):
    return not path.name.startswith("l10n_") and not path.name.startswith("test_")

def get_odoo_modules(path, filter=_default_module_filter):
    for addon in path.iterdir():
        if not addon.is_dir():
            continue
        if not filter(addon):
            continue
        if not addon.joinpath("__manifest__.py").is_file():
            continue
        yield addon

def get_absolute_path(path):
    path_path = Path(path).expanduser()
    if path_path.is_absolute():
        return path_path
    return ODOO_PATH.joinpath(path)

def get_module_paths_aliases(path, module):
    path = str(path)
    path = path + "/" if path else ""
    if module.joinpath("static/src").is_dir():
        key_src = f"@{module.name}/*"
        src = f"{path}{module.name}/static/src/*"
        yield key_src, [src]
    if module.joinpath("static/tests").is_dir():
        key_test = f"@{module.name}/../tests/*"
        test = f"{path}{module.name}/static/tests/*"
        yield key_test, [test]

def path_relative_to_odoo(to_odoo, path):
    if path.startswith("addons/"):
        return to_odoo + "/" + path
    return path

def get_repositories(path_iterator, odoo_addons):
    repos = set()
    for path in path_iterator:
        absolute_path = get_absolute_path(path).resolve()
        yield absolute_path, { "modules": {} }
        repos.add(absolute_path)

    if odoo_addons not in repos:
        yield odoo_addons, { "modules": {} }

def get_modules_in_repository(repo_path):
    for module in sorted(get_odoo_modules(repo_path)):
        yield {
            "name": module.name,
            "path": module,
            "repo": repo_path,
            "depends": get_manifest(module).get("depends", [])
        }

def make_js_configs(addons_path, odoo=ODOO_PATH, base_jsonfig=TOOLING_PATH.joinpath("_jsconfig.json")):
    odoo_addons = odoo.joinpath("addons").resolve()
    repos = dict()
    all_modules = dict()
    for repo_path, repo_obj in get_repositories((p for p in addons_path if p), odoo_addons):
        repos[repo_path] = repo_obj
        for module in get_modules_in_repository(repo_path):
            repo_obj["modules"][module["name"]] = module
            all_modules[module["name"]] = module

    repo_depends, module_depends = process_modules_dependencies(all_modules)
    module_depends = {m: list(k) for m, k in module_depends.items()}

    jsconfig_file = None
    if base_jsonfig:
        with open(base_jsonfig) as f:
            jsconfig_file = f.read()
    if not jsconfig_file:
        jsconfig_file = """{
            "compiilerOptions": {
                "typeRoots": [],
            },
            "include": [],
            "exclude": [],
        }"""
    for abs_path, repo in repos.items():
        jsconfig_origin = json.loads(jsconfig_file)
        include = []
        exclude = []
        typeRoots = []

        if abs_path != odoo_addons:
            to_odoo = os.path.relpath(odoo_addons, start=abs_path)
            for p in jsconfig_origin["include"]:
                include.append(to_odoo + "/" + p)
            for p in jsconfig_origin["exclude"]:
                exclude.append(to_odoo + "/" + p)
            for p in jsconfig_origin["compilerOptions"]["typeRoots"]:
                typeRoots.append(to_odoo + "/" + p)
        else:
            include = jsconfig_origin.get("include", [])
            exclude = jsconfig_origin.get("exclude", [])
            typeRoots = jsconfig_origin["compilerOptions"].get("typeRoots", [])

        paths = {}
        for dep_repo_path in (repo_depends[abs_path] or {odoo_addons, abs_path}):
            repo = repos[dep_repo_path]
            if dep_repo_path == abs_path:
                path_prefix = "."
            else:
                path_prefix = os.path.relpath(dep_repo_path, start=abs_path)
            for mname, module in repo["modules"].items():
                paths.update(get_module_paths_aliases(path_prefix, module["path"]))
            if dep_repo_path != odoo_addons:
                include.extend([path_prefix + "/**/*.js", path_prefix + "/**/*.ts"])
                exclude.append(path_prefix + "/**/node_modules")
        
        jsconfig = {
            "extends": str(odoo.joinpath("addons/web/tooling/_jsconfig.json")),
            "compilerOptions": {
                "plugins": [
                    {"name": "odoo-tsserver-dependencies-completion", "depsMap": module_depends}
                ],
                "typeRoots": typeRoots,
                "paths": paths,
            },
            "include": include,
            "exclude": exclude,
        }
        yield abs_path.joinpath("jsconfig.json"), jsconfig
 