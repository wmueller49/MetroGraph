# MetroGraph
A fun side project with the DC Metro and the NYC Subway.

Pick a city from the menu next to the title (or open `?city=nyc` / `?city=dc`).

The NYC data in `js/data-nyc.js` is generated from the MTA's GTFS feed by
`scripts/build_nyc.py`, which lays it out as an octilinear diagram. To adjust
the layout, edit the junction positions and corridor shapes in
`scripts/nyc_layout.py` and rerun the script; it reports any stations that end
up on top of another line.
