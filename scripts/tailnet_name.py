"""Print this machine's Tailscale DNS name (e.g. phillmyeol.tail580e35.ts.net); used by deploy.bat."""
import json
import subprocess
import sys

tailscale = sys.argv[1] if len(sys.argv) > 1 else "tailscale"
try:
    status = json.loads(subprocess.run([tailscale, "status", "--json"], capture_output=True, check=True).stdout)
    print(status["Self"]["DNSName"].rstrip("."))
except (OSError, subprocess.CalledProcessError, KeyError, ValueError):
    sys.exit(1)
