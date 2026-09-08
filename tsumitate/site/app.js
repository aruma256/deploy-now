import {defaults,limits,valid,simulate} from './simulation.js';
const $=id=>document.getElementById(id), key='tsumitate-settings-v1';
const groups=[['01 / 積立投資',[['years','運用期間','年'],['initial','初期投資額','万円'],['monthly','毎月の投資額','万円'],['rate','運用利回り（年率）','%'],['cost','年間コスト率','%','信託報酬など、利回りから差し引く割合']]],['02 / 預金',[['deposit','開始時の預金額','万円'],['depositRate','預金金利（年率）','%']]]];
$('fields').innerHTML=groups.map(([title,fields])=>`<fieldset><legend>${title}</legend>${fields.map(([id,label,unit,help])=>`<div class="field"><label for="${id}">${label}</label><div class="input-wrap"><input id="${id}" name="${id}" type="number" inputmode="${limits[id][2]===1?'numeric':'decimal'}" min="${limits[id][0]}" max="${limits[id][1]}" step="${limits[id][2]}" required ${help?`aria-describedby="${id}-help"`:''}><span class="unit">${unit}</span>${id==='cost'?'<span class="cost-stepper"><button type="button" id="cost-up" aria-label="年間コスト率を0.1%刻みで増やす">▴</button><button type="button" id="cost-down" aria-label="年間コスト率を0.1%刻みで減らす">▾</button></span>':''}</div>${help?`<p class="help" id="${id}-help">${help}</p>`:''}</div>`).join('')}</fieldset>`).join('');
const fmt=n=>n.toLocaleString('ja-JP',{minimumFractionDigits:1,maximumFractionDigits:1});
let settings={...defaults};
try{const saved=JSON.parse(localStorage.getItem(key));if(valid(saved))settings=saved;else if(saved)$('save').textContent='保存された条件が現在の範囲外のため初期値を表示しています';}catch{$('save').textContent='保存データを読み込めないため初期値を表示しています';}
function fill(){for(const k of Object.keys(defaults)){$(k).value=settings[k];$(k).removeAttribute('aria-invalid');}}
function render(){const rows=simulate(settings),last=rows.at(-1);$('duration').textContent=settings.years;for(const [id,value] of Object.entries({total:last.total,principal:last.principal,gain:last.total-last.principal,investment:last.investment,depositValue:last.deposit,costValue:last.gross-last.total}))$(id).textContent=(id==='gain'&&value>0?'+':'')+fmt(value);
$('net-rate').textContent=`コスト差引後の実質年利 ${Number((settings.rate-settings.cost).toFixed(5))}% ・ 預金金利 ${settings.depositRate.toFixed(2)}% ｜ 税引前`;
$('rows').innerHTML=rows.map(r=>`<tr><th scope="row">${r.year}年</th>${[r.total,r.initial,r.contributions,r.investmentGain,r.depositPrincipal,r.depositGain].map(v=>`<td>${fmt(v)}</td>`).join('')}</tr>`).join('');
const width=Math.max(280,$('chart').clientWidth);$('chart').setAttribute('viewBox',`0 0 ${width} 340`);
const parts=[['depositPrincipal','#d6bb78'],['depositGain','#967126'],['initial','#7399b7'],['contributions','#a9c8dc'],['investmentGain','#318666']];
const max=Math.max(1,...rows.map(r=>r.total))*1.12;
const left=62,top=20,w=width-78,h=260,slot=w/rows.length,barWidth=slot*.72,x=i=>left+slot*(i+.5),y=v=>top+h-v/max*h;
let svg='<title id="chart-title">資産の内訳の推移</title><desc id="chart-desc">年ごとの積み上げ棒グラフ。下から預金元本、預金利息、初期投資、毎月の積立分、投資利益の順で、合計が棒の高さ（総資産）です。数値は年次データでも確認できます。</desc>';
const axis=v=>v>=100000?`${Number((v/10000).toPrecision(3))}億`:Number(v.toPrecision(3)).toLocaleString('ja-JP');
for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line x1="${left}" y1="${y(v)}" x2="${left+w}" y2="${y(v)}" stroke="#e7ece5"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end" fill="#788579" font-size="11">${axis(v)}</text>`;}
const tickCount=Math.min(settings.years,Math.max(2,Math.floor(w/48)));
const ticks=new Set(Array.from({length:tickCount+1},(_,i)=>Math.round(settings.years*i/tickCount)));
for(const r of rows){let base=0;svg+=`<g><title>${r.year}年後：総資産 ${fmt(r.total)}万円</title>`;for(const [key,color] of parts){const value=r[key];svg+=`<rect x="${x(r.year)-barWidth/2}" y="${y(base+value)}" width="${barWidth}" height="${value/max*h}" fill="${color}"/>`;base+=value;}svg+='</g>';if(ticks.has(r.year))svg+=`<text x="${x(r.year)}" y="${top+h+28}" text-anchor="middle" fill="#788579" font-size="11">${r.year}年</text>`;}
$('chart').innerHTML=svg;}
function save(){try{localStorage.setItem(key,JSON.stringify(settings));$('save').textContent='✓ このブラウザに条件を保存しました';}catch{$('save').textContent='保存できませんでした。この画面での計算は利用できます';}}
$('settings').addEventListener('submit',e=>e.preventDefault());
$('settings').addEventListener('input',()=>{
const next=Object.fromEntries(Object.keys(defaults).map(k=>[k,Number($(k).value)]));
const invalid=Object.keys(defaults).filter(k=>!$(k).validity.valid);
const negative=Number.isFinite(next.rate)&&Number.isFinite(next.cost)&&next.rate<next.cost;
if(negative)invalid.push('rate','cost');
for(const k of Object.keys(defaults))$(k).setAttribute('aria-invalid',String(invalid.includes(k)));
if(invalid.length||!valid(next)){$('error').textContent=negative?'運用利回りは年間コスト率以上にしてください。結果は直前の有効な条件です。':'入力途中または範囲外の値があります。万円の項目は整数で入力してください。結果は直前の有効な条件です。';$('save').textContent='入力が有効になると自動で計算・保存します';return;}
settings=next;$('error').textContent='';save();render();
});
$('reset').addEventListener('click',()=>{settings={...defaults};fill();save();render();$('error').textContent='';});
fill();render();

new ResizeObserver(()=>render()).observe(document.querySelector('.chart-panel'));

function stepCost(direction){
const input=$('cost'),value=input.valueAsNumber;
if(!Number.isFinite(value))return;
const scaled=value*10;
const next=(direction>0?Math.floor(scaled+1e-9)+1:Math.ceil(scaled-1e-9)-1)/10;
input.value=Math.max(limits.cost[0],Math.min(limits.cost[1],next)).toFixed(1);
input.dispatchEvent(new Event('input',{bubbles:true}));
}
$('cost-up').addEventListener('click',()=>stepCost(1));
$('cost-down').addEventListener('click',()=>stepCost(-1));
$('cost').addEventListener('keydown',event=>{
if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();stepCost(event.key==='ArrowUp'?1:-1);}
});
