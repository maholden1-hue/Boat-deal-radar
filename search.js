
const cheerio = require('cheerio');
const db = require('./db');

const Houston = {
  lat: Number(process.env.HOUSTON_LAT || 29.7604),
  lon: Number(process.env.HOUSTON_LON || -95.3698)
};

const MAX_PRICE = Number(process.env.MAX_PRICE || 50000);
const MIN_LENGTH = Number(process.env.MIN_LENGTH || 20);
const MIN_HP = Number(process.env.MIN_HP || 150);
const MIN_SEATS = Number(process.env.MIN_SEATS || 6);
const MIN_SCORE = Number(process.env.MIN_SCORE || 80);
const RADIUS = Number(process.env.SEARCH_RADIUS_MILES || 100);

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function num(s) {
  if (s == null) return null;
  const m = String(s).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function textHas(t, words){ return words.some(w => t.includes(w)); }

function parseListingText(html, url) {
  const $ = cheerio.load(html);
  const title = ($('h1').first().text() || $('title').text() || '').trim();
  const meta = [
    $('meta[name="description"]').attr('content'),
    $('meta[property="og:description"]').attr('content'),
    $('body').text()
  ].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  const full = `${title} ${meta}`;
  const lower = full.toLowerCase();

  let price = null;
  const priceMatch = full.match(/\$[\s]*([\d,]{4,})/);
  if (priceMatch) price = num(priceMatch[1]);

  let year = null;
  const yearMatch = title.match(/\b(19|20)\d{2}\b/) || full.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) year = Number(yearMatch[0]);

  let hp = null;
  const hpMatch = full.match(/(\d{2,3})\s*(?:hp|horsepower)\b/i);
  if (hpMatch) hp = Number(hpMatch[1]);

  let hours = null;
  const hoursMatch = full.match(/(?:engine\s*)?hours?\D{0,12}(\d{1,4})/i);
  if (hoursMatch) hours = Number(hoursMatch[1]);

  let length = null;
  const lengthMatch = full.match(/(?:length(?: overall)?|loa)\D{0,10}(\d{2}(?:\.\d+)?)\s*(?:ft|feet|')/i)
      || title.match(/\b(\d{2}(?:\.\d+)?)\s*(?:ft|')\b/i);
  if (lengthMatch) length = Number(lengthMatch[1]);

  let seats = null;
  const seatPatterns = [
    /(?:capacity|passenger capacity|persons?)\D{0,12}(\d{1,2})/i,
    /rated for\D{0,8}(\d{1,2})\s*(?:people|persons|passengers)/i,
    /seats?\D{0,8}(\d{1,2})/i
  ];
  for (const p of seatPatterns) {
    const m = full.match(p); if (m) { seats = Number(m[1]); break; }
  }

  let location = '';
  const locMatch = full.match(/([A-Za-z .'-]+,\s*(?:TX|Texas))\b/);
  if (locMatch) location = locMatch[1].trim();

  const hasTtop = textHas(lower, ['t-top','t top','hardtop','hard top','k-top','k top']);
  const hasTrolling = textHas(lower, ['trolling motor','minn kota','motor guide','motorguide']);
  const hasPowerPole = textHas(lower, ['power-pole','power pole','talon']);
  const hasJackPlate = textHas(lower, ['jack plate','jackplate','atlas','bob’s jack','bobs jack']);

  let ttopType = '';
  if (hasTtop) {
    if (textHas(lower, ['anodized','aluminum t-top','aluminium t-top'])) ttopType='Aluminum/anodized T-top';
    else if (textHas(lower, ['powder coated','powder-coated'])) ttopType='Powder-coated T-top';
    else ttopType='T-top';
  }

  const domain = new URL(url).hostname.replace(/^www\./,'');
  const source = domain.includes('boattrader') ? 'Boat Trader'
    : domain.includes('boats.com') ? 'Boats.com'
    : domain.includes('yachtworld') ? 'YachtWorld'
    : domain;

  return {source,url,title,year,asking_price:price,length_ft:length,horsepower:hp,
    engine_hours:hours,seating:seats,location,has_ttop:hasTtop?1:0,ttop_type:ttopType,
    has_trolling:hasTrolling?1:0,has_powerpole:hasPowerPole?1:0,has_jackplate:hasJackPlate?1:0,
    raw_excerpt: meta.slice(0,2400)
  };
}

function estimateValues(x) {
  // Heuristic valuation model intentionally conservative.
  const age = x.year ? Math.max(0, new Date().getFullYear() - x.year) : 10;
  const hp = x.horsepower || 150;
  const len = x.length_ft || 21;

  let newBase = 16000 + len*950 + hp*115;
  if (len >= 23) newBase += 5000;
  if (hp >= 200) newBase += 3500;

  let accessoriesNew = 0;
  if (x.has_ttop) accessoriesNew += 5000;
  if (x.has_trolling) accessoriesNew += 3200;
  if (x.has_powerpole) accessoriesNew += 2300;
  if (x.has_jackplate) accessoriesNew += 1800;

  const newLow = Math.round((newBase + accessoriesNew) * 0.9 / 500) * 500;
  const newHigh = Math.round((newBase + accessoriesNew) * 1.1 / 500) * 500;

  let retention;
  if (age <= 2) retention = 0.78;
  else if (age <= 5) retention = 0.65;
  else if (age <= 9) retention = 0.52;
  else if (age <= 14) retention = 0.43;
  else retention = 0.34;

  if (x.engine_hours != null) {
    if (x.engine_hours < 200) retention += 0.04;
    else if (x.engine_hours > 700) retention -= 0.05;
  }

  const fairMid = (newBase + accessoriesNew*0.45) * retention;
  const fairLow = Math.round(fairMid*0.90/500)*500;
  const fairHigh = Math.round(fairMid*1.10/500)*500;

  const accessoriesToday = accessoriesNew * (age <= 5 ? 0.55 : age <= 10 ? 0.45 : 0.35);
  const accessoriesTodayLow = Math.round(accessoriesToday*0.8/250)*250;
  const accessoriesTodayHigh = Math.round(accessoriesToday*1.2/250)*250;

  let complete = 0;
  if (!x.has_ttop) complete += 6000;
  if (!x.has_trolling) complete += 3500;
  if (!x.has_powerpole) complete += 2500;
  if (!x.has_jackplate) complete += 1800;

  return {
    estimated_new_low:newLow, estimated_new_high:newHigh,
    fair_value_low:fairLow, fair_value_high:fairHigh,
    accessories_new_low:Math.round(accessoriesNew*0.9/250)*250,
    accessories_new_high:Math.round(accessoriesNew*1.1/250)*250,
    accessories_today_low:accessoriesTodayLow,
    accessories_today_high:accessoriesTodayHigh,
    cost_to_complete:complete,
    all_in:(x.asking_price || 0)+complete
  };
}

function scoreListing(x) {
  let score = 50;
  const fv = (x.fair_value_low + x.fair_value_high)/2;
  if (x.asking_price && fv) {
    const ratio = x.asking_price/fv;
    if (ratio <= 0.80) score += 25;
    else if (ratio <= 0.90) score += 20;
    else if (ratio <= 1.00) score += 14;
    else if (ratio <= 1.08) score += 8;
    else score -= 5;
  }
  if (x.seating >= 8) score += 7;
  else if (x.seating >= 6) score += 4;
  if (x.horsepower >= 200) score += 7;
  else if (x.horsepower >= 150) score += 3;
  if (x.has_ttop) score += 4;
  if (x.has_trolling) score += 4;
  if (x.has_powerpole) score += 4;
  if (x.has_jackplate) score += 4;
  if (x.year && new Date().getFullYear()-x.year >= 8) score += 4;
  if (x.engine_hours != null && x.engine_hours < 300) score += 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function qualifies(x) {
  if (!x.asking_price || x.asking_price > MAX_PRICE) return false;
  if (!x.length_ft || x.length_ft < MIN_LENGTH) return false;
  if (!x.horsepower || x.horsepower < MIN_HP) return false;
  if (!x.seating || x.seating < MIN_SEATS) return false;
  if (x.distance_miles != null && x.distance_miles > RADIUS) return false;
  if (x.deal_score < MIN_SCORE && x.deal_score < 75) return false;
  return true;
}

async function braveSearch(q) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error('BRAVE_API_KEY is not configured');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', q);
  url.searchParams.set('count', '20');
  url.searchParams.set('country', 'US');
  const res = await fetch(url, {headers:{'Accept':'application/json','X-Subscription-Token':key}});
  if (!res.ok) throw new Error(`Brave Search error ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map(r => r.url).filter(Boolean);
}

async function geocodeLocation(location) {
  // Deliberately no third-party geocoder dependency. Known Houston-area city approximation.
  const places = {
    'houston': [29.7604,-95.3698], 'kemah':[29.5427,-95.0205], 'seabrook':[29.5633,-95.0255],
    'league city':[29.5075,-95.0949], 'friendswood':[29.5294,-95.2010], 'galveston':[29.3013,-94.7977],
    'texas city':[29.3838,-94.9027], 'baytown':[29.7355,-94.9774], 'conroe':[30.3119,-95.4561],
    'freeport':[28.9541,-95.3597], 'matagorda':[28.6919,-95.9683], 'la marque':[29.3686,-94.9713]
  };
  const l = (location||'').toLowerCase();
  for (const [k,v] of Object.entries(places)) if (l.includes(k)) return {lat:v[0],lon:v[1]};
  return null;
}

async function verifyAndParse(url) {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 12000);
  try {
    const res = await fetch(url, {signal:controller.signal, headers:{'User-Agent':'Mozilla/5.0 BoatDealRadar/1.0'}});
    if (!res.ok) return null;
    const html = await res.text();
    if (/sold|no longer available|listing unavailable|page not found|404/i.test(html.slice(0,12000))) return null;
    const x = parseListingText(html, url);
    const geo = await geocodeLocation(x.location);
    if (geo) {
      x.latitude = geo.lat; x.longitude = geo.lon;
      x.distance_miles = Math.round(haversineMiles(Houston.lat,Houston.lon,geo.lat,geo.lon));
    }
    Object.assign(x, estimateValues(x));
    x.deal_score = scoreListing(x);
    x.why = buildWhy(x);
    return x;
  } finally {
    clearTimeout(timeout);
  }
}

function buildWhy(x){
  const bits=[];
  if (x.asking_price && x.fair_value_high && x.asking_price <= x.fair_value_high) bits.push('priced within or below estimated fair value');
  if (x.seating >= 8) bits.push('real seating for eight');
  else if (x.seating >= 6) bits.push('usable seating for six');
  if (x.horsepower >= 200) bits.push(`${x.horsepower} hp`);
  if (x.has_ttop) bits.push(x.ttop_type || 'T-top');
  if (x.has_trolling) bits.push('trolling motor');
  if (x.has_powerpole) bits.push('Power-Pole/Talon');
  if (x.has_jackplate) bits.push('jack plate');
  if (x.cost_to_complete > 0) bits.push(`about $${x.cost_to_complete.toLocaleString()} to complete preferred setup`);
  return bits.join(', ') || 'Potential fit; verify details with seller.';
}

function saveListing(x){
  const now = new Date().toISOString();

  // SQLite named parameters must exist on the bound object even when the
  // value is unknown. Normalize every optional field up front.
  x = {
    source: '',
    source_id: null,
    url: '',
    title: '',
    year: null,
    make: '',
    model: '',
    location: '',
    latitude: null,
    longitude: null,
    distance_miles: null,
    asking_price: null,
    length_ft: null,
    horsepower: null,
    engine_make: '',
    engine_hours: null,
    seating: null,
    has_ttop: 0,
    ttop_type: '',
    has_trolling: 0,
    has_powerpole: 0,
    has_jackplate: 0,
    trailer: '',
    estimated_new_low: null,
    estimated_new_high: null,
    fair_value_low: null,
    fair_value_high: null,
    accessories_new_low: null,
    accessories_new_high: null,
    accessories_today_low: null,
    accessories_today_high: null,
    cost_to_complete: 0,
    all_in: null,
    deal_score: 0,
    why: '',
    raw_excerpt: '',
    ...x
  };

  const existing = db.prepare('SELECT * FROM listings WHERE url=?').get(x.url);
  if (!existing) {
    const stmt = db.prepare(`
      INSERT INTO listings (
        source,url,title,year,make,model,location,latitude,longitude,distance_miles,
        asking_price,length_ft,horsepower,engine_make,engine_hours,seating,
        has_ttop,ttop_type,has_trolling,has_powerpole,has_jackplate,
        estimated_new_low,estimated_new_high,fair_value_low,fair_value_high,
        accessories_new_low,accessories_new_high,accessories_today_low,accessories_today_high,
        cost_to_complete,all_in,deal_score,why,is_active,first_seen,last_seen,last_checked,raw_excerpt
      ) VALUES (
        @source,@url,@title,@year,@make,@model,@location,@latitude,@longitude,@distance_miles,
        @asking_price,@length_ft,@horsepower,@engine_make,@engine_hours,@seating,
        @has_ttop,@ttop_type,@has_trolling,@has_powerpole,@has_jackplate,
        @estimated_new_low,@estimated_new_high,@fair_value_low,@fair_value_high,
        @accessories_new_low,@accessories_new_high,@accessories_today_low,@accessories_today_high,
        @cost_to_complete,@all_in,@deal_score,@why,1,@first_seen,@last_seen,@last_checked,@raw_excerpt
      )
    `);
    const row = {...x, make:x.make||'', model:x.model||'', engine_make:x.engine_make||'',
      first_seen:now,last_seen:now,last_checked:now};
    const info = stmt.run(row);
    db.prepare('INSERT INTO price_history(listing_id,price,observed_at) VALUES(?,?,?)')
      .run(info.lastInsertRowid, x.asking_price, now);
  } else {
    db.prepare(`
      UPDATE listings SET
        title=@title, year=@year, location=@location, latitude=@latitude, longitude=@longitude,
        distance_miles=@distance_miles, asking_price=@asking_price, length_ft=@length_ft,
        horsepower=@horsepower, engine_hours=@engine_hours, seating=@seating, has_ttop=@has_ttop,
        ttop_type=@ttop_type, has_trolling=@has_trolling, has_powerpole=@has_powerpole,
        has_jackplate=@has_jackplate, estimated_new_low=@estimated_new_low,
        estimated_new_high=@estimated_new_high, fair_value_low=@fair_value_low,
        fair_value_high=@fair_value_high, accessories_new_low=@accessories_new_low,
        accessories_new_high=@accessories_new_high, accessories_today_low=@accessories_today_low,
        accessories_today_high=@accessories_today_high, cost_to_complete=@cost_to_complete,
        all_in=@all_in, deal_score=@deal_score, why=@why, is_active=1, last_seen=@last_seen,
        last_checked=@last_checked, raw_excerpt=@raw_excerpt
      WHERE url=@url
    `).run({...x,last_seen:now,last_checked:now});
    if (existing.asking_price !== x.asking_price) {
      db.prepare('INSERT INTO price_history(listing_id,price,observed_at) VALUES(?,?,?)')
        .run(existing.id, x.asking_price, now);
    }
  }
}

async function runSearch(){
  const queries = [
    'site:boattrader.com/boat/ Texas Houston bay boat T-top trolling motor Power-Pole jack plate 150 200',
    'site:boats.com Texas Houston bay boat T-top trolling motor Power-Pole jack plate',
    'site:yachtworld.com Texas Houston bay boat T-top trolling motor Power-Pole'
  ];
  let urls = [];
  for (const q of queries) {
    try { urls.push(...await braveSearch(q)); } catch(e) { console.error(e.message); }
  }
  urls = [...new Set(urls)].filter(u => {
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.replace(/^www\./,'');
      const path = parsed.pathname;
      if (host.includes('boattrader.com')) return /^\/boat\/.+/i.test(path);
      if (host.includes('yachtworld.com')) return /^\/yacht\/.+/i.test(path);
      if (host.includes('boats.com')) {
        // Exclude generic browse/search/category pages.
        if (/\/boats-for-sale\/?$/i.test(path)) return false;
        if (/\/boats-for-sale\//i.test(path) && !/\d{5,}/.test(path)) return false;
        return /power-boats|boat|boats-for-sale/i.test(path) && /\d{5,}/.test(path);
      }
      return false;
    } catch {
      return false;
    }
  });

  const found=[];
  for (const url of urls.slice(0,40)) {
    try {
      const x = await verifyAndParse(url);
      if (!x) continue;
      saveListing(x);
      if (qualifies(x)) found.push(x);
    } catch(e){ console.error('parse failed',url,e.message); }
  }

  // Mark stale entries inactive if not checked successfully for 7 days.
  db.prepare(`UPDATE listings SET is_active=0 WHERE last_seen < datetime('now','-7 days')`).run();

  return found.sort((a,b)=>b.deal_score-a.deal_score);
}

module.exports = { runSearch, verifyAndParse, parseListingText, estimateValues, scoreListing, qualifies };
