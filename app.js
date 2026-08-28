
const fmt=n=>n==null?'—':'$'+Math.round(n).toLocaleString();
const range=(a,b)=>(a==null||b==null)?'—':`${fmt(a)}–${fmt(b)}`;
const pill=(text,cls='')=>`<span class="pill ${cls}">${text}</span>`;

let leads=[];

async function runSearchNow(){
  const btn=document.getElementById('runSearchBtn');
  const box=document.getElementById('searchStatus');
  btn.disabled=true;
  btn.textContent='Searching…';
  box.classList.remove('hidden','error','success');
  box.textContent='Searching live listings and verifying exact pages. This can take a minute or two.';
  try{
    const res=await fetch('/api/search/run',{method:'POST',headers:{'Content-Type':'application/json'}});
    const data=await res.json();
    if(!res.ok || !data.ok) throw new Error(data.error || `Search failed (${res.status})`);
    box.classList.add('success');
    box.textContent=`Search complete. ${data.count||0} qualifying lead${(data.count||0)===1?'':'s'} found.`;
    await loadLeads();
  }catch(e){
    box.classList.add('error');
    box.textContent=`Search error: ${e.message}`;
  }finally{
    btn.disabled=false;
    btn.textContent='Run Search Now';
  }
}

async function loadLeads(){
  document.getElementById('loading').classList.remove('hidden');
  try{
    const min = document.getElementById('showBelow80').checked ? 0 : Number(document.getElementById('minScore').value||80);
    const res = await fetch(`/api/leads?minScore=${min}`);
    if(!res.ok) throw new Error(`Could not load leads (${res.status})`);
    leads = await res.json();
    render();
  }catch(e){
    const box=document.getElementById('searchStatus');
    box.classList.remove('hidden','success');
    box.classList.add('error');
    box.textContent=`Load error: ${e.message}`;
  }finally{
    document.getElementById('loading').classList.add('hidden');
  }
}

function render(){
  const status=document.getElementById('statusFilter').value;
  const favOnly=document.getElementById('favoritesOnly').checked;
  const minScore=document.getElementById('showBelow80').checked?0:Number(document.getElementById('minScore').value||80);
  let rows=leads.filter(x=>x.deal_score>=minScore);
  if(status!=='all') rows=rows.filter(x=>(x.status||'new')===status);
  if(favOnly) rows=rows.filter(x=>x.favorite);
  rows.sort((a,b)=>b.deal_score-a.deal_score);

  document.getElementById('leadCount').textContent=rows.length;
  document.getElementById('topScore').textContent=rows.length?Math.max(...rows.map(x=>x.deal_score)):0;
  document.getElementById('empty').classList.toggle('hidden',rows.length>0);

  const list=document.getElementById('leadList'); list.innerHTML='';
  for(const x of rows){
    const node=document.getElementById('leadTemplate').content.cloneNode(true);
    node.querySelector('.eyebrow').textContent=`${x.year||''} • ${x.length_ft||'?'}' • ${x.horsepower||'?'} hp`;
    node.querySelector('.title').textContent=x.title || `${x.year||''} ${x.make||''} ${x.model||''}`.trim();
    node.querySelector('.location').textContent=`${x.location||'Location unknown'}${x.distance_miles!=null?` • ~${Math.round(x.distance_miles)} mi`:''}`;
    node.querySelector('.score').textContent=Math.round(x.deal_score||0);
    node.querySelector('.ask').textContent=fmt(x.asking_price);
    node.querySelector('.fair').textContent=range(x.fair_value_low,x.fair_value_high);
    node.querySelector('.new').textContent=range(x.estimated_new_low,x.estimated_new_high);
    node.querySelector('.acc').textContent=range(x.accessories_today_low,x.accessories_today_high);
    node.querySelector('.complete').textContent=fmt(x.cost_to_complete);
    node.querySelector('.allin').textContent=fmt(x.all_in);
    node.querySelector('.why').textContent=x.why||'';

    node.querySelector('.pills').innerHTML=[
      pill(`${x.seating||'?'} seats`,x.seating>=6?'good':'missing'),
      pill(x.has_ttop?(x.ttop_type||'T-top'):'No T-top',x.has_ttop?'good':'missing'),
      pill(x.has_trolling?'Trolling motor':'No trolling motor',x.has_trolling?'good':'missing'),
      pill(x.has_powerpole?'Power-Pole/Talon':'No shallow anchor',x.has_powerpole?'good':'missing'),
      pill(x.has_jackplate?'Jack plate':'No jack plate',x.has_jackplate?'good':'missing'),
      x.engine_hours!=null?pill(`${x.engine_hours} hrs`):''
    ].join('');

    const fav=node.querySelector('.fav'), interest=node.querySelector('.interest'), pass=node.querySelector('.pass');
    if(x.favorite){fav.classList.add('active');fav.textContent='Favorited'}
    if(x.status==='interested') interest.classList.add('active');
    if(x.status==='pass') pass.classList.add('active');

    fav.onclick=async()=>{await fetch(`/api/leads/${x.id}/favorite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({favorite:!x.favorite})});x.favorite=!x.favorite;render()};
    interest.onclick=async()=>{const s=x.status==='interested'?'new':'interested';await fetch(`/api/leads/${x.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s})});x.status=s;render()};
    pass.onclick=async()=>{const s=x.status==='pass'?'new':'pass';await fetch(`/api/leads/${x.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s})});x.status=s;render()};
    node.querySelector('.open').href=x.url;
    list.appendChild(node);
  }
}

document.getElementById('runSearchBtn').onclick=runSearchNow;
document.getElementById('refreshBtn').onclick=loadLeads;
['minScore','statusFilter','favoritesOnly','showBelow80'].forEach(id=>document.getElementById(id).addEventListener('input',()=>id==='minScore'?loadLeads():render()));
if('serviceWorker'in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js'));
loadLeads();
