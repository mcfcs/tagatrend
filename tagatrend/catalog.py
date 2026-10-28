"""The trend library: the four notebook terms plus extra Filipino viral terms.

`weekly` and `daily` override the automatic windows (peak month +/- a margin) when a term
needs a hand-picked span, as the notebook did for the original four.
"""

CORE = [
    {"slug": "sana_all", "query": "Sana All", "year": 2019,
     "blurb": "“Wish everyone had it”: the envy-joke phrase that exploded in late 2019.",
     "weekly": ("2018-01-01", None), "daily": ("2019-07-01", "2021-06-30")},
    {"slug": "pabebe_girls", "query": "Pabebe Girls", "year": 2015,
     "blurb": "A July 2015 viral clip of teens talking in a babyish “pabebe” voice.",
     "weekly": ("2015-01-01", "2017-12-31"), "daily": ("2015-05-01", "2016-04-30")},
    {"slug": "never_grow_old", "query": "Never Grow Old", "year": 2026,
     "blurb": "A September 2026 spike: sharp rise, one-week peak, fast decay.",
     "weekly": None, "daily": ("2026-07-15", None)},
    {"slug": "fox_silica", "query": "Fox Silica", "year": 2026,
     "blurb": "A one-day July 2026 burst with almost no tail; a test of noise vs. trend.",
     "weekly": None, "daily": ("2026-06-01", None)},
]

EXTRA = [
    {"slug": "jejemon", "query": "Jejemon", "year": 2010,
     "blurb": "The 2010 subculture known for mangled spelling and mixed caps."},
    {"slug": "aldub", "query": "AlDub", "year": 2015,
     "blurb": "Eat Bulaga’s split-screen love team, a 2015 TV-driven phenomenon."},
    {"slug": "pak_ganern", "query": "Pak Ganern", "year": 2016,
     "blurb": "An exclamation of approval that swept 2016 social media."},
    {"slug": "lodi", "query": "Lodi", "year": 2017,
     "blurb": "“Idol” spelled backwards, the face of the 2017 reversal slang wave."},
    {"slug": "petmalu", "query": "Petmalu", "year": 2017,
     "blurb": "“Malupet” (awesome) inverted; rose and fell with Lodi."},
    {"slug": "werpa", "query": "Werpa", "year": 2017,
     "blurb": "“Power” inverted, the third word of the 2017 reversal wave."},
    {"slug": "naol", "query": "Naol", "year": 2020,
     "blurb": "A clipped “sana all” that took over 2020 comment sections."},
    {"slug": "budol", "query": "Budol", "year": 2021,
     "blurb": "Impulse-buy slang that rode the 2020–21 online shopping boom."},
    {"slug": "marites", "query": "Marites", "year": 2021,
     "blurb": "The gossip-monger nickname (“Mare, ano’ng latest?”) that peaked in 2021."},
    {"slug": "dasurv", "query": "Dasurv", "year": 2023,
     "blurb": "“Deserve” in Gen-Z spelling, for wins and karma alike."},
    {"slug": "forda", "query": "Forda", "year": 2022,
     "blurb": "“For the”, as in “forda ferson”: 2022 TikTok gay-lingo crossover."},
    {"slug": "charot", "query": "Charot", "year": 2014,
     "blurb": "A long-running “just kidding” interjection; the evergreen control."},
    {"slug": "what_haffen_vella", "query": "What Haffen Vella", "year": 2025,
     "blurb": "A 2013 TV mispronunciation that resurfaced as a 2025 meme."},
    {"slug": "trentahin", "query": "Trentahin", "year": 2025,
     "blurb": "2025 slang for leaning into the energy of your thirties."},
]

for entry in CORE:
    entry["group"] = "core"
for entry in EXTRA:
    entry["group"] = "extra"

TRENDS = CORE + EXTRA
BY_SLUG = {entry["slug"]: entry for entry in TRENDS}


# A filesystem-safe slug for a free-text search term.
def slugify(query):
    cleaned = "".join(ch.lower() if ch.isalnum() else "_" for ch in query.strip())
    return "_".join(part for part in cleaned.split("_") if part)[:60]
