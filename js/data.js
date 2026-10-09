// Station coordinates are a stylized schematic (grid units, not geographic),
// in the spirit of the official WMATA diagram rather than a literal map.
// Unit spacing is scaled up to pixels at render time (see render.js).
//
// Plain scripts (not ES modules) wrapped in an IIFE, so the page also works
// opened directly via file:// (module scripts are blocked there by CORS),
// and so each file's top-level names don't collide in the shared script scope.
(function () {

// Every edge between consecutive stops is horizontal, vertical, or exactly
// 45°, like WMATA's diagram, so lines run straight and only bend at a few
// deliberate corners. Downtown stops are spaced 1.5 units apart (vs ~1-1.4 in
// the suburbs) because that's where the lines and labels converge.
const STATIONS = {
  // Red line NW arm (diagonal down to Woodley Park, then straight down to Metro Center)
  shady_grove:      { name: "Shady Grove",              x: -10, y: -14.5 },
  rockville:        { name: "Rockville",                x: -9,  y: -13.5 },
  twinbrook:        { name: "Twinbrook",                x: -8,  y: -12.5 },
  white_flint:      { name: "White Flint",              x: -7,  y: -11.5 },
  grosvenor:        { name: "Grosvenor-Strathmore",     x: -6,  y: -10.5 },
  medical_center:   { name: "Medical Center",           x: -5,  y: -9.5  },
  bethesda:         { name: "Bethesda",                 x: -4,  y: -8.5  },
  friendship_hts:   { name: "Friendship Heights",       x: -3,  y: -7.5  },
  tenleytown:       { name: "Tenleytown-AU",            x: -2,  y: -6.5  },
  van_ness:         { name: "Van Ness-UDC",             x: -1,  y: -5.5  },
  cleveland_park:   { name: "Cleveland Park",           x: 0,   y: -4.5  },
  woodley_park:     { name: "Woodley Park",             x: 0,   y: -3.5  },
  dupont_circle:    { name: "Dupont Circle",            x: 0,   y: -2.5  },
  farragut_north:   { name: "Farragut North",           x: 0,   y: -1.25 },

  // Core interchanges
  metro_center:     { name: "Metro Center",             x: 0,   y: 0   },
  gallery_pl:       { name: "Gallery Pl-Chinatown",     x: 3,   y: 0   },

  // Red line east, then north from Union Station to Glenmont
  judiciary_sq:     { name: "Judiciary Square",         x: 4.5, y: 0    },
  union_station:    { name: "Union Station",            x: 6,   y: 0    },
  noma:             { name: "NoMa-Gallaudet U",         x: 6,   y: -1.5 },
  rhode_island_ave: { name: "Rhode Island Ave",         x: 6,   y: -3.5 },
  brookland:        { name: "Brookland-CUA",            x: 6,   y: -5.5 },
  fort_totten:      { name: "Fort Totten",              x: 6,   y: -7.5 },
  takoma:           { name: "Takoma",                   x: 6,   y: -9   },
  silver_spring:    { name: "Silver Spring",            x: 6,   y: -10.5 },
  forest_glen:      { name: "Forest Glen",              x: 6,   y: -12  },
  wheaton:          { name: "Wheaton",                  x: 6,   y: -13.5 },
  glenmont:         { name: "Glenmont",                 x: 6,   y: -15  },

  // Orange/Blue/Silver trunk west of Metro Center
  mcpherson_sq:     { name: "McPherson Square",         x: -1.5, y: 0  },
  farragut_west:    { name: "Farragut West",            x: -3,   y: 0  },
  foggy_bottom:     { name: "Foggy Bottom-GWU",         x: -4.5, y: 0  },
  rosslyn:          { name: "Rosslyn",                  x: -6,   y: 0  },

  // Orange/Silver west of Rosslyn
  court_house:      { name: "Court House",              x: -7.5,  y: 0 },
  clarendon:        { name: "Clarendon",                x: -9,    y: 0 },
  virginia_sq:      { name: "Virginia Square",          x: -10.5, y: 0 },
  ballston:         { name: "Ballston-MU",              x: -12,   y: 0 },
  east_falls_church:{ name: "East Falls Church",        x: -13.5, y: 0 },

  // Orange line western branch
  west_falls_church:{ name: "West Falls Church",        x: -15,   y: 0 },
  dunn_loring:      { name: "Dunn Loring",              x: -16.5, y: 0 },
  vienna:           { name: "Vienna",                   x: -18,   y: 0 },

  // Silver line western branch
  mclean:           { name: "McLean",                   x: -14.5, y: -1  },
  tysons:           { name: "Tysons",                   x: -15.5, y: -2  },
  greensboro:       { name: "Greensboro",               x: -16.5, y: -3  },
  spring_hill:      { name: "Spring Hill",              x: -17.5, y: -4  },
  wiehle_reston:    { name: "Wiehle-Reston East",       x: -18.5, y: -5  },
  reston_town_ctr:  { name: "Reston Town Center",       x: -19.5, y: -6  },
  herndon:          { name: "Herndon",                  x: -20.5, y: -7  },
  innovation_ctr:   { name: "Innovation Center",        x: -21.5, y: -8  },
  dulles_airport:   { name: "Dulles Airport",           x: -22.5, y: -9  },
  loudoun_gateway:  { name: "Loudoun Gateway",          x: -23.5, y: -10 },
  ashburn:          { name: "Ashburn",                  x: -24.5, y: -11 },

  // Orange/Blue/Silver trunk east of Metro Center (diagonal down to L'Enfant, then east)
  federal_triangle: { name: "Federal Triangle",         x: 1,    y: 1 },
  smithsonian:      { name: "Smithsonian",              x: 2,    y: 2 },
  lenfant_plaza:    { name: "L'Enfant Plaza",           x: 3,    y: 3 },
  federal_ctr_sw:   { name: "Federal Center SW",        x: 4.5,  y: 3 },
  capitol_south:    { name: "Capitol South",            x: 6,    y: 3 },
  eastern_market:   { name: "Eastern Market",           x: 7.5,  y: 3 },
  potomac_ave:      { name: "Potomac Ave",              x: 9,    y: 3 },
  stadium_armory:   { name: "Stadium-Armory",           x: 10.5, y: 3 },

  // Orange line eastern branch
  minnesota_ave:    { name: "Minnesota Ave",            x: 11.5, y: 2  },
  deanwood:         { name: "Deanwood",                 x: 12.5, y: 1  },
  cheverly:         { name: "Cheverly",                 x: 13.5, y: 0  },
  landover:         { name: "Landover",                 x: 14.5, y: -1 },
  new_carrollton:   { name: "New Carrollton",           x: 15.5, y: -2 },

  // Blue/Silver eastern branch
  benning_rd:       { name: "Benning Rd",               x: 11.5, y: 4 },
  capitol_heights:  { name: "Capitol Heights",          x: 12.5, y: 5 },
  addison_rd:       { name: "Addison Rd",               x: 13.5, y: 6 },
  morgan_blvd:      { name: "Morgan Blvd",              x: 14.5, y: 7 },
  largo:            { name: "Largo Town Center",        x: 15.5, y: 8 },

  // Blue line south (Rosslyn -> Franconia-Springfield)
  arlington_cemetery:{ name: "Arlington Cemetery",      x: -6, y: 1.5  },
  pentagon:         { name: "Pentagon",                 x: -6, y: 3    },
  pentagon_city:    { name: "Pentagon City",            x: -6, y: 4.5  },
  crystal_city:     { name: "Crystal City",             x: -6, y: 6    },
  reagan_airport:   { name: "Ronald Reagan Airport",    x: -6, y: 7.5  },
  braddock_rd:      { name: "Braddock Rd",              x: -6, y: 9    },
  king_st:          { name: "King St-Old Town",         x: -6, y: 10.5 },
  van_dorn_st:      { name: "Van Dorn St",              x: -7, y: 11.5 },
  franconia:        { name: "Franconia-Springfield",    x: -8, y: 12.5 },

  // Yellow line south (King St -> Huntington)
  eisenhower_ave:   { name: "Eisenhower Ave",           x: -6, y: 12   },
  huntington:       { name: "Huntington",               x: -6, y: 13.5 },

  // Green/Yellow trunk (L'Enfant Plaza north to Fort Totten)
  archives:         { name: "Archives",                 x: 3,   y: 1.5  },
  mt_vernon_sq:     { name: "Mt Vernon Sq",             x: 3,   y: -1.5 },
  shaw_howard:      { name: "Shaw-Howard U",            x: 3,   y: -3   },
  u_street:         { name: "U Street",                 x: 3,   y: -4.5 },
  columbia_heights: { name: "Columbia Heights",         x: 3,   y: -6   },
  georgia_ave:      { name: "Georgia Ave-Petworth",     x: 4.5, y: -7.5 },

  // Green/Yellow north (Fort Totten -> Greenbelt)
  west_hyattsville: { name: "West Hyattsville",         x: 7,   y: -8.5  },
  pg_plaza:         { name: "Prince George's Plaza",    x: 8,   y: -9.5  },
  college_park:     { name: "College Park-U of Md",     x: 9,   y: -10.5 },
  greenbelt:        { name: "Greenbelt",                x: 10,  y: -11.5 },

  // Green line south (L'Enfant Plaza -> Branch Ave)
  waterfront:       { name: "Waterfront",               x: 3, y: 4.5 },
  navy_yard:        { name: "Navy Yard-Ballpark",       x: 3, y: 6   },
  anacostia:        { name: "Anacostia",                x: 4, y: 7   },
  congress_heights: { name: "Congress Heights",         x: 5, y: 8   },
  southern_ave:     { name: "Southern Ave",             x: 6, y: 9   },
  naylor_rd:        { name: "Naylor Rd",                x: 7, y: 10  },
  suitland:         { name: "Suitland",                 x: 8, y: 11  },
  branch_ave:       { name: "Branch Ave",               x: 9, y: 12  },
};

const LINES = [
  {
    id: "red",
    name: "Red",
    color: "#bf0d3e",
    stops: [
      "shady_grove", "rockville", "twinbrook", "white_flint", "grosvenor",
      "medical_center", "bethesda", "friendship_hts", "tenleytown", "van_ness",
      "cleveland_park", "woodley_park", "dupont_circle", "farragut_north",
      "metro_center", "gallery_pl", "judiciary_sq", "union_station", "noma",
      "rhode_island_ave", "brookland", "fort_totten", "takoma", "silver_spring",
      "forest_glen", "wheaton", "glenmont",
    ],
  },
  {
    id: "orange",
    name: "Orange",
    color: "#ed8b00",
    stops: [
      "vienna", "dunn_loring", "west_falls_church", "east_falls_church",
      "ballston", "virginia_sq", "clarendon", "court_house", "rosslyn",
      "foggy_bottom", "farragut_west", "mcpherson_sq", "metro_center",
      "federal_triangle", "smithsonian", "lenfant_plaza", "federal_ctr_sw",
      "capitol_south", "eastern_market", "potomac_ave", "stadium_armory",
      "minnesota_ave", "deanwood", "cheverly", "landover", "new_carrollton",
    ],
  },
  {
    id: "blue",
    name: "Blue",
    color: "#0077c0",
    stops: [
      "franconia", "van_dorn_st", "king_st", "braddock_rd", "reagan_airport",
      "crystal_city", "pentagon_city", "pentagon", "arlington_cemetery",
      "rosslyn", "foggy_bottom", "farragut_west", "mcpherson_sq", "metro_center",
      "federal_triangle", "smithsonian", "lenfant_plaza", "federal_ctr_sw",
      "capitol_south", "eastern_market", "potomac_ave", "stadium_armory",
      "benning_rd", "capitol_heights", "addison_rd", "morgan_blvd", "largo",
    ],
  },
  {
    id: "silver",
    name: "Silver",
    color: "#a1a3a2",
    stops: [
      "ashburn", "loudoun_gateway", "dulles_airport", "innovation_ctr",
      "herndon", "reston_town_ctr", "wiehle_reston", "spring_hill",
      "greensboro", "tysons", "mclean", "east_falls_church", "ballston",
      "virginia_sq", "clarendon", "court_house", "rosslyn", "foggy_bottom",
      "farragut_west", "mcpherson_sq", "metro_center", "federal_triangle",
      "smithsonian", "lenfant_plaza", "federal_ctr_sw", "capitol_south",
      "eastern_market", "potomac_ave", "stadium_armory", "benning_rd",
      "capitol_heights", "addison_rd", "morgan_blvd", "largo",
    ],
  },
  {
    id: "yellow",
    name: "Yellow",
    color: "#ffd200",
    stops: [
      "huntington", "eisenhower_ave", "king_st", "braddock_rd", "reagan_airport",
      "crystal_city", "pentagon_city", "pentagon", "lenfant_plaza", "archives",
      "gallery_pl", "mt_vernon_sq", "shaw_howard", "u_street", "columbia_heights",
      "georgia_ave", "fort_totten", "west_hyattsville", "pg_plaza",
      "college_park", "greenbelt",
    ],
  },
  {
    id: "green",
    name: "Green",
    color: "#00a94f",
    stops: [
      "branch_ave", "suitland", "naylor_rd", "southern_ave", "congress_heights",
      "anacostia", "navy_yard", "waterfront", "lenfant_plaza", "archives",
      "gallery_pl", "mt_vernon_sq", "shaw_howard", "u_street", "columbia_heights",
      "georgia_ave", "fort_totten", "west_hyattsville", "pg_plaza",
      "college_park", "greenbelt",
    ],
  },
];

window.MetroData = { STATIONS, LINES };

})();
