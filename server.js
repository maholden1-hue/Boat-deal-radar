
require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const db = require('./db');
const { runSearch, verifyAndParse } = require('./search');

const app = express();
app.use(express.json({limit:'1mb'}));
app.use(express.static(__dirname));

app.get('/api/health', (req,res)=>res.json({ok:true,time:new Date().toISOString()}));

app.get('/api/leads', (req,res)=>{
  const minScore = Number(req.query.minScore || 0);
  const rows = db.prepare(`
    SELECT * FROM listings
    WHERE is_active=1 AND deal_score>=?
    ORDER BY deal_score DESC, last_seen DESC
  `).all(minScore);
  res.json(rows);
});

app.get('/api/leads/:id/history', (req,res)=>{
  const rows = db.prepare(`SELECT price,observed_at FROM price_history WHERE listing_id=? ORDER BY observed_at`)
    .all(req.params.id);
  res.json(rows);
});

app.post('/api/leads/:id/favorite', (req,res)=>{
  db.prepare('UPDATE listings SET favorite=? WHERE id=?').run(req.body.favorite?1:0, req.params.id);
  res.json({ok:true});
});

app.post('/api/leads/:id/status', (req,res)=>{
  const allowed = new Set(['new','interested','pass']);
  const status = allowed.has(req.body.status) ? req.body.status : 'new';
  db.prepare('UPDATE listings SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ok:true,status});
});

app.post('/api/search/run', async (req,res)=>{
  try {
    const found = await runSearch();
    res.json({ok:true,count:found.length,found});
  } catch(e) {
    res.status(500).json({ok:false,error:e.message});
  }
});

app.post('/api/import-url', async (req,res)=>{
  try {
    if (!req.body.url) return res.status(400).json({ok:false,error:'url required'});
    const x = await verifyAndParse(req.body.url);
    if (!x) return res.status(404).json({ok:false,error:'listing unavailable or could not be parsed'});
    res.json({ok:true,listing:x});
  } catch(e) {
    res.status(500).json({ok:false,error:e.message});
  }
});

app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, ()=>console.log(`Boat Deal Radar running on :${port}`));

const schedule = process.env.SEARCH_CRON || '0 8,16 * * *';
cron.schedule(schedule, async ()=>{
  console.log('Scheduled boat search starting', new Date().toISOString());
  try {
    const found = await runSearch();
    console.log(`Scheduled boat search complete: ${found.length} qualifying leads`);
  } catch(e) {
    console.error('Scheduled search failed:', e.message);
  }
}, {timezone:'America/Chicago'});
