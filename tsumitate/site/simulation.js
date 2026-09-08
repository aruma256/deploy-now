export const defaults = {years:20,initial:1000,monthly:10,rate:5,cost:0.05775,deposit:500,depositRate:0.3};
export const limits = {years:[1,60,1],initial:[0,100000,1],monthly:[0,1000,1],rate:[0,50,0.1],cost:[0,20,0.00001],deposit:[0,100000,1],depositRate:[0,20,0.01]};
export function valid(s){return s && s.rate>=s.cost && Object.entries(limits).every(([k,[min,max,step]])=>Number.isFinite(s[k])&&s[k]>=min&&s[k]<=max&&Math.abs(s[k]/step-Math.round(s[k]/step))<1e-7);}
export function simulate(s){
 if(!valid(s))throw new Error('入力値を確認してください');
 const growth=(1+(s.rate-s.cost)/100)**(1/12), grossGrowth=(1+s.rate/100)**(1/12), depositGrowth=(1+s.depositRate/100)**(1/12);
 let investment=s.initial,deposit=s.deposit,gross=s.initial;
 const rows=[{year:0,investment,deposit,principal:s.initial+s.deposit,total:investment+deposit,gross:investment+deposit}];
 for(let month=1;month<=s.years*12;month++){
 investment=investment*growth+s.monthly;gross=gross*grossGrowth+s.monthly;deposit*=depositGrowth;
 if(month%12===0)rows.push({year:month/12,investment,deposit,principal:s.initial+s.deposit+s.monthly*month,total:investment+deposit,gross:gross+deposit});
 }return rows.map(r=>({...r,initial:s.initial,contributions:s.monthly*r.year*12,investmentGain:Math.max(0,r.investment-s.initial-s.monthly*r.year*12),depositPrincipal:s.deposit,depositGain:r.deposit-s.deposit}));
}
