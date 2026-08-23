#!/usr/bin/env python3
import json, sys
from pathlib import Path
required={"supplier","invoice_number","invoice_date","currency","subtotal","tax","total","warnings"}
data=json.loads(Path(sys.argv[1]).read_text())
if set(data)!=required: raise SystemExit("record keys do not match the canonical contract")
if not isinstance(data["warnings"],list): raise SystemExit("warnings must be an array")
a=[data[k] for k in ("subtotal","tax","total")]
if all(isinstance(v,(int,float)) for v in a) and abs(a[0]+a[1]-a[2])>0.01: raise SystemExit("subtotal + tax does not equal total")
print("OK")
