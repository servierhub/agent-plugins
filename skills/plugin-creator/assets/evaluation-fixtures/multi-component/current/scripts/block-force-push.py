#!/usr/bin/env python3
import json,sys
try:p=json.load(sys.stdin)
except Exception:raise SystemExit(0)
c=p.get("tool_input",{}).get("command","")
if "git push" in c and ("--force" in c or "-f" in c.split()):
 print("Force push blocked",file=sys.stderr);raise SystemExit(2)
