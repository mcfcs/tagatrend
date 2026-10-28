"""Pull and stitch every catalog term into data/processed.

    python scripts/build_dataset.py            # every term (cached pulls are reused)
    python scripts/build_dataset.py lodi naol  # only these slugs
"""
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tagatrend.catalog import TRENDS  # noqa: E402
from tagatrend.series import build_term  # noqa: E402

wanted = set(sys.argv[1:])
failed = []
for entry in TRENDS:
    if wanted and entry["slug"] not in wanted:
        continue
    try:
        built = build_term(entry)
        print(f"{entry['query']}: built {', '.join(k for k in built if k != 'regions')}", flush=True)
    except Exception as error:
        traceback.print_exc()
        failed.append((entry["query"], str(error)))

for query, error in failed:
    print(f"FAILED {query}: {error}")
