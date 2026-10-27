// SSI CW quote snapshot via Netlify Functions. No credentials, no request-side endpoint or arbitrary URL.
// This is an experimental adapter to a public website endpoint, not a licensed live exchange feed.
const SOURCE = 'https://iboard-query.ssi.com.vn/stock/cw/hose';
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const reply = (payload, status=200) => new Response(JSON.stringify(payload), {status,headers});

export default async function handler(request) {
  if(request.method !== 'GET') return reply({ok:false,error:'METHOD_NOT_ALLOWED',message:'Chỉ hỗ trợ GET'},405);
  let resp;
  try {
    resp = await fetch(SOURCE, {
      method:'GET',
      headers:{'Accept':'application/json'},
      cache:'no-store',
      signal:AbortSignal.timeout(8500)
    });
  } catch(e) {
    return reply({ok:false,error:'UPSTREAM_UNREACHABLE',message:'Không kết nối được SSI từ Netlify: '+String(e?.message||e)},502);
  }
  if(!resp.ok){
    return reply({ok:false,error:'UPSTREAM_HTTP_'+resp.status,message:`SSI trả HTTP ${resp.status}. Nếu 401/403/429, nguồn có thể yêu cầu cấp quyền hoặc giới hạn truy cập; không nên tìm cách vượt hạn chế.`},502);
  }
  let raw;
  try {raw=await resp.json()} catch(e){return reply({ok:false,error:'NOT_JSON',message:'SSI không trả dữ liệu JSON hợp lệ'},502)}
  if(raw?.code && String(raw.code).toUpperCase()!=='SUCCESS'){
    return reply({ok:false,error:'SSI_NOT_SUCCESS',message:'SSI trả code '+String(raw.code).slice(0,80)},502);
  }
  const v=raw?.data??raw;
  const rows=v?.coveredWarrantData??v?.data??v;
  if(!Array.isArray(rows))return reply({ok:false,error:'SCHEMA_CHANGED',message:'Không tìm thấy trường coveredWarrantData[] trong dữ liệu SSI'},502);
  const selected=rows.slice(0,2000).filter(r=>r&&typeof r==='object').map(r=>({
    stockSymbol:String(r.stockSymbol??r.symbol??'').trim().slice(0,20),
    tradingDate:String(r.tradingDate??''),
    best1Bid:Object.prototype.hasOwnProperty.call(r,'best1Bid') ? r.best1Bid : undefined,
    best1Offer:Object.prototype.hasOwnProperty.call(r,'best1Offer') ? r.best1Offer : undefined
  }));
  return reply({ok:true,source:'SSI_iBoard_public_web_endpoint_UNVERIFIED',fetchedAt:new Date().toISOString(),count:selected.length,data:{coveredWarrantData:selected}});
}
