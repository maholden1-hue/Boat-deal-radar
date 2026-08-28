
require('dotenv').config();
const db=require('./db');
const fs=require('fs'), path=require('path');
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json'),'utf8'));
const now=new Date().toISOString();
for(const x of rows){
  db.prepare(`INSERT OR IGNORE INTO listings
  (source,url,title,year,location,distance_miles,asking_price,length_ft,horsepower,engine_hours,seating,
   has_ttop,ttop_type,has_trolling,has_powerpole,has_jackplate,estimated_new_low,estimated_new_high,
   fair_value_low,fair_value_high,accessories_new_low,accessories_new_high,accessories_today_low,
   accessories_today_high,cost_to_complete,all_in,deal_score,why,is_active,first_seen,last_seen,last_checked)
  VALUES(@source,@url,@title,@year,@location,@distance_miles,@asking_price,@length_ft,@horsepower,@engine_hours,@seating,
   @has_ttop,@ttop_type,@has_trolling,@has_powerpole,@has_jackplate,@estimated_new_low,@estimated_new_high,
   @fair_value_low,@fair_value_high,@accessories_new_low,@accessories_new_high,@accessories_today_low,
   @accessories_today_high,@cost_to_complete,@all_in,@deal_score,@why,1,@first_seen,@last_seen,@last_checked)`)
   .run({...x,first_seen:now,last_seen:now,last_checked:now});
}
console.log('Seed complete');
