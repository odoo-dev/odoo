#!/usr/bin/env python3
import argparse
import json
from jsconfig_tools import make_js_configs

if __name__ == "__main__":
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument("--addons-path", required=False, default="")
    args = arg_parser.parse_args()

    for path, jsconfig in make_js_configs((args.addons_path or "").split(",")):
        with open(path, "w+") as f:
            f.write(json.dumps(jsconfig, indent=2))
