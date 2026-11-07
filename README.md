# 🇹🇭 ThaiMap: family trip planner

A Thailand travel app built around the map. Browse hand-picked hotels, restaurants, beaches, islands, hikes and must-see sights. Plan each day on the map, and share comments and notes with your family as you go.

## Run it

```bash
npm start            # or: node server.js   (no npm install needed)
# → http://localhost:3000
```

It needs Node 18 or newer and has no dependencies. Set `PORT=8080` to change the port and `DATA_DIR=/path` to choose where family data is stored. By default it goes in `./data`.

## Features

- **The map:** about 150 curated places in Thailand, grouped into clusters. Choose between an English street map, satellite, terrain (for hiking) and OSM with Thai names.
- **Categories:** must-see, beaches, islands, hiking & nature, hotels (with price level), restaurants, and **Thai airports only**. There are 31 airports, and each one is marked as international or domestic.
- **Search and regions:** search by name, then jump to Bangkok, the North, the Andaman coast, the Gulf islands, the East, Central or the Deep South.
- **Place details:** each place has tips, typical visit time, hike difficulty, and links to Google Maps directions and reviews.
- **Trips & timeline:** create a trip with dates, travellers and your flights out and home. Then add the places you'll stay (Bangkok 3 nights, Chiang Mai 4, Krabi 6…) and get a day-by-day timeline:
  - travel days with a suggested domestic flight or ferry/bus, including a rough price;
  - a rough flight budget for the whole family;
  - Google Flights / Skyscanner buttons with the right route and dates;
  - Booking/Agoda and GetYourGuide/Klook/Viator searches for each stop's dates;
  - "Things to do near…" ideas from the curated places and ready-made days.

  Tap a day to plan it. Prices are **rough guide prices** (see `DESTINATIONS`, `DOMESTIC_FARES` and `INTL_FARES` in `public/data.js`), not live fares.
- **Day planner:** build a day from places or from custom stops you tap on the map. You can reorder stops, set times and add notes. The route is drawn on the map with the walking, driving or boat distance for each leg. You can also share a day as text for WhatsApp.
- **Ready-made days:** two Bangkok city days, Krabi 4-island, Phi Phi, Samui→Phangan→Tao, the Chiang Mai Monk's Trail, Doi Inthanon, Krabi hikes and Kanchanaburi. Preview one on the map, then add it as a day with one tap.
- **Family sharing:** everyone who enters the same **family code** shares:
  - comments and replies on any place
  - free notes dropped anywhere on the map (note / idea / heads-up / must do)
  - day plans
  - Changes reach everyone instantly over Server-Sent Events, and an activity feed shows what's new.
- **Find each other:** each person can switch on *Share me* (Family tab) to appear live on the map, with a last-seen time and their distance from you. 👪 shows everyone at once.
- **Meetup points:** if you split up, tap 🚩 Meet and choose a spot on the map, use *Meet here* on a place, or let *Meet in the middle* pick a point between everyone. You can set a time. Everyone gets notified and can answer on my way / running late / I'm here / can't make it, and sees each person's distance and walking ETA. People are marked as arrived automatically when they reach the spot.
- Works on phones, where the panel becomes a bottom sheet.
- **English / Svenska:** the app follows the browser language and has a 🇸🇪/🇬🇧 switch in the header. UI texts are in `public/i18n.sv.js` (the key is the English text), and the Swedish place and day texts are in `public/data.sv.js`.

## Sharing with family

The invite link (Family tab → *Copy invite*) adds `?family=<code>` to the address. Your family has to be able to reach your server:

- **Same Wi-Fi:** use the network address printed in the terminal, e.g. `http://192.168.1.20:3000`.
- **Anywhere:** deploy it to any Node host (Render, Railway or Fly.io; start command `node server.js`, with a persistent disk for `DATA_DIR`). For a quick test you can use a tunnel such as `cloudflared tunnel --url http://localhost:3000`. Use HTTPS when you can, because "Where am I?" geolocation needs it.

The family code acts as the password, so pick one that's hard to guess (the 🎲 button makes one). There are no user accounts, and anyone who has the code can read and edit.

If you open `public/index.html` directly without the server, the app still works but saves everything only on that device.

## Live location: what to know

- Locations are only shared **while ThaiMap is open** on that phone. Browsers don't allow web pages to track you in the background. If someone's phone locks, their marker shows "last seen".
- Positions are kept in server memory only. They are never written to disk, and they disappear when someone turns sharing off.
- Phones only give a web page the location over **HTTPS** (or on `localhost`). A plain `http://merguez.local:3000` or `http://192.168…` address works for everything except location sharing. In Thailand everyone is on mobile data anyway, so deploy the server to a host with HTTPS (see above).

## Project layout

```
server.js         static server + family API (notes, plans, live events) — JSON files in data/
public/index.html
public/styles.css
public/app.js     map, panels, planner, comments, sync
public/neighbors.js  neighbouring-country shapes (Natural Earth 10m, public domain) for the grey mask
public/data.js    places, categories, regions, ready-made day templates  ← edit to add places
public/data.sv.js Swedish texts for places, days and destinations
public/i18n.sv.js Swedish UI texts
```

To add a place, add an entry to `PLACES` in `public/data.js` (`id`, `cat`, `region`, `name`, `lat`, `lng`, `desc`, `tip`, …).

Opening hours, seasons and prices change, so check before you go.
