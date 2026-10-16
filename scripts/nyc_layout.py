"""Hand-tuned layout inputs for build_nyc.py."""

# Complexes whose platforms sit on different avenues: the platforms serving
# these routes become their own node (id = complex id + suffix), linked to the
# rest of the complex by a walking transfer.
SPLITS = {
    "611": {"a": {"A", "C", "E"}},  # 42 St-Port Authority (8 Av) / Times Sq (7 Av)
    "601": {"a": {"1", "2", "3"}},  # 14 St (7 Av) / 14 St-6 Av
}

# Names for complexes whose platforms go by different names.
NODE_NAMES = {
    "601": "14 St-6 Av", "601a": "14 St", "605": "168 St", "606": "Court Sq",
    "609": "42 St-Bryant Pk", "611": "Times Sq-42 St", "611a": "42 St-Port Authority",
    "612": "Lexington Av/53 St", "613": "Lexington Av/59 St", "615": "62 St-New Utrecht Av",
    "616": "Jackson Hts-Roosevelt Av", "618": "14 St-8 Av", "619": "Broadway-Lafayette St",
    "620": "Borough Hall-Court St", "622": "Brooklyn Bridge-City Hall", "624": "Chambers St-WTC",
    "626": "Franklin Av-Botanic Garden", "629": "Lorimer St-Metropolitan Av", "635": "South Ferry",
}

# Express runs to draw alongside another corridor than the one the generator
# would infer, keyed (route, from, to) -> stations passed without stopping.
SHARED_TRACK = {
    # The Q leaves the 63 St line just short of 57 St/6 Av for the Broadway line.
    ("Q", "Lexington Av/63 St", "57 St-7 Av"): ["57 St"],
    # The R shares the 60 St tunnel with the N/W as far as Queens.
    ("R", "Lexington Av/59 St", "Queens Plaza"): ["Queensboro Plaza"],
    # The N/Q share the Manhattan Bridge with the B/D.
    ("N", "Canal St", "Atlantic Av-Barclays Ctr"): ["Grand St@B", "DeKalb Av@R"],
    ("Q", "Canal St", "DeKalb Av"): ["Grand St@B"],
}

# Grid positions for junctions (and any station worth fixing in place), keyed
# by station name, or "name@route" where a name repeats. x grows east, y south.
# Unpinned dead ends hang straight off their corridor.
PINS = {
    # --- Manhattan, Midtown ---
    "59 St-Columbus Circle": (-9, -4.5),
    "50 St@E": (-9, -2),
    "42 St-Port Authority": (-9, 0),
    "Times Sq-42 St": (-6, 0),
    "50 St@1": (-6, -1.5),
    "34 St-Hudson Yards": (-12, 2),
    "7 Av@E": (-5, -4.5),
    "57 St-7 Av": (-4, -6),
    "57 St": (-2, -8),
    "5 Av/53 St": (0, -4.5),
    "47-50 Sts-Rockefeller Ctr": (-2, -1.5),
    "42 St-Bryant Pk": (-2, 0),
    "34 St-Herald Sq": (-2, 4),
    "Grand Central-42 St": (3, 0),
    "Lexington Av/53 St": (3, -4.5),
    "Lexington Av/59 St": (3, -6),
    "Lexington Av/63 St": (5, -8),
    # --- Manhattan, Downtown ---
    "14 St-8 Av": (-9, 9),
    "14 St@1": (-6, 8),
    "14 St-6 Av": (-2, 9),
    "14 St-Union Sq": (3, 9),
    "W 4 St-Wash Sq": (-2, 12),
    "Broadway-Lafayette St": (3, 12),
    "Delancey St-Essex St": (6, 12),
    "Bowery": (5, 13),
    "York St": (9, 19.5),
    "Canal St@J": (3, 15),
    "Grand St@B": (6, 15),
    "Brooklyn Bridge-City Hall": (3, 16.5),
    "Chambers St@1": (-6, 16.5),
    "Chambers St-WTC": (-2, 16.5),
    "Fulton St@4": (3, 18),
    "Broad St": (1.5, 19.5),
    "South Ferry": (-6, 20.5),
    # --- Manhattan, Uptown ---
    "96 St@1": (-12, -11.5),
    "135 St@2": (-6, -20),
    "145 St@A": (-9, -20),
    "168 St": (-12, -24),
    "Inwood-207 St": (-15, -28),
    "96 St@Q": (5, -12.5),
    "Van Cortlandt Park-242 St": (-10, -35),
    "125 St@4": (3, -18),
    # --- Bronx ---
    "149 St-Hostos": (-2, -24),
    "161 St-Yankee Stadium": (-2, -27),
    "Bedford Park Blvd": (1, -35),
    "Woodlawn": (-5, -38),
    "E 180 St": (8, -32),
    "Eastchester-Dyre Av": (13, -37),
    "Wakefield-241 St": (8, -42),
    "Pelham Bay Park": (20, -30),
    # --- Queens ---
    "Court Sq": (10, -1),
    "Queensboro Plaza": (9, -6),
    "Astoria-Ditmars Blvd": (9, -12),
    "Queens Plaza": (12, -3),
    "36 St@M": (14, -5),
    "Jackson Hts-Roosevelt Av": (20, -5),
    "Forest Hills-71 Av": (26, -5),
    "Briarwood": (29, -5),
    "Sutphin Blvd-Archer Av-JFK Airport": (31, -3),
    "Jamaica Center-Parsons/Archer": (33, -3),
    # --- Brooklyn ---
    "Jay St-MetroTech": (9, 21),
    "Borough Hall-Court St": (6, 24),
    "Hoyt St": (7.5, 24),
    "Nevins St": (11, 24),
    "DeKalb Av@R": (12, 21),
    "Atlantic Av-Barclays Ctr": (12, 24),
    "Hoyt-Schermerhorn Sts": (10, 22),
    "Lafayette Av": (13, 22),
    "Bergen St@F": (9, 26),
    "4 Av-9 St": (12, 29),
    "36 St@D": (12, 32),
    "59 St@N": (12, 35),
    "62 St-New Utrecht Av": (15, 37),
    "Church Av@F": (15, 32),
    "Coney Island-Stillwell Av": (19, 45),
    "W 8 St-NY Aquarium": (21, 45),
    "Brighton Beach": (23, 43),
    "Prospect Park": (16, 28),
    "Franklin Av-Botanic Garden": (16, 24),
    "Franklin Av@C": (16, 22),
    "Crown Hts-Utica Av": (19, 24),
    "Flatbush Av-Brooklyn College": (21, 30),
    "Lorimer St-Metropolitan Av": (10, 9),
    # G stations clear of the lines crossing it (J/Z, Manhattan Bridge, R).
    "Flushing Av@G": (10, 13),
    "Fulton St@G": (10, 18),
    # L stations clear of the M crossing it.
    "Jefferson St": (18, 9),
    "Myrtle-Wyckoff Avs": (21, 7),
    "Myrtle Av@J": (14, 12),
    "Broadway Junction": (24, 18),
    "Euclid Av": (28, 18),
    "Rockaway Blvd": (32, 18),
    "Broad Channel": (35, 22),
}

# How a corridor bends between its ends, keyed "from>to" by station name (add
# "~name" of a station along it to pick out one of two parallel corridors): "start" (diagonal leg first), "end" (diagonal leg last), "mid"
# (straight, diagonal, straight), or a list of the corner points to pass
# through. Unlisted corridors take whichever fits geography best.
STYLES = {
    "Times Sq-42 St>34 St-Hudson Yards": "mid",
    "96 St>59 St-Columbus Circle": "end",
    "96 St>135 St": "start",
    "7 Av>50 St": "start",
    "5 Av/53 St>47-50 Sts-Rockefeller Ctr": "end",
    "Grand Central-42 St>Court Sq": "end",
    "Lexington Av/53 St>Court Sq": "start",
    "Court Sq>Queensboro Plaza": "start",
    "Queensboro Plaza>Jackson Hts-Roosevelt Av": [(10, -7), (18, -7)],
    "Lexington Av/63 St>36 St": "start",
        "Delancey St-Essex St>Jay St-MetroTech": "start",
    "Fulton St>Jay St-MetroTech": "end",
    "South Ferry>Borough Hall-Court St": "start",
    "Hoyt-Schermerhorn Sts>Bergen St": "end",
    "Bergen St>4 Av-9 St": "end",
    "Atlantic Av-Barclays Ctr>Prospect Park": "start",
    "Myrtle-Wyckoff Avs>Broadway Junction": "start",
    "Myrtle Av>Broadway Junction": "start",
    "Myrtle Av>Myrtle-Wyckoff Avs": "start",
    "Franklin Av>Broadway Junction": "end",
    "Broadway Junction>Sutphin Blvd-Archer Av-JFK Airport": "start",
    "Jefferson St>Myrtle-Wyckoff Avs": "end",
    "Times Sq-42 St>57 St-7 Av": "start",
    "14 St-Union Sq>Canal St": [(1.5, 10.5), (1.5, 13.5)],
    "14 St-8 Av>W 4 St-Wash Sq": [(-9, 10.5), (-7.5, 12)],
    "Canal St>Delancey St-Essex St": "start",
    "Chambers St-WTC>Fulton St": "end",
    "Canal St>Chambers St-WTC": "end",
    "161 St-Yankee Stadium>Woodlawn": "start",
    "161 St-Yankee Stadium>Bedford Park Blvd": "end",
    "Fulton St>Borough Hall-Court St~Clark St": "start",
    "Fulton St>Borough Hall-Court St~Bowling Green": "end",
    "62 St-New Utrecht Av>Coney Island-Stillwell Av~Bay 50 St": "start",
    "62 St-New Utrecht Av>Coney Island-Stillwell Av~86 St": "end",
    "Prospect Park>Brighton Beach": "start",
    "Franklin Av-Botanic Garden>Flatbush Av-Brooklyn College": "start",
}
