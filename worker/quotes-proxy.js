/**
 * Cloudflare Worker — 行情代理
 * 解决 A 股/港股/美股/国内基金的 CORS 问题。
 *
 * 部署步骤：
 *   1. 登 Cloudflare Dashboard → Workers & Pages → Create → Worker
 *   2. 把这个文件粘进去 → Deploy
 *   3. 拿到 Worker URL（如 https://nestworth-quotes.you.workers.dev）
 *   4. 在 Nestworth Pages 项目 → Settings → Environment variables
 *      添加 VITE_QUOTE_PROXY = https://nestworth-quotes.you.workers.dev
 *   5. 触发 Pages 重新 build
 *
 * 接口：
 *   GET /quote?symbol=600519&type=cn-stock
 *   GET /quote?symbol=00700&type=hk-stock
 *   GET /quote?symbol=AAPL&type=us-stock
 *   GET /quote?symbol=008888&type=cn-fund
 *
 * 数据源：
 *   - A 股 / 港股 / 美股 / 指数 → 腾讯股票（qt.gtimg.cn）
 *   - 国内基金 → 天天基金 (api.fund.eastmoney.com)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/quote') return new Response('Not found', { status: 404, headers: CORS });

    const symbol = (url.searchParams.get('symbol') || '').trim();
    const type = url.searchParams.get('type') || '';
    if (!symbol) return json({ error: 'missing symbol' }, 400);

    try {
      let data;
      if (type === 'cn-stock') data = await fetchCnStock(symbol);
      else if (type === 'hk-stock') data = await fetchHkStock(symbol);
      else if (type === 'us-stock') data = await fetchUsStock(symbol);
      else if (type === 'cn-fund') data = await fetchCnFund(symbol);
      else return json({ error: 'unknown type' }, 400);

      if (!data) return json({ error: 'not found' }, 404);
      return json(data);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

/** 腾讯股票接口
 *  https://qt.gtimg.cn/q=sh600519,sz000001,r_hk00700,usAAPL.OQ
 *  返回 GBK 文本：v_sh600519="1~贵州茅台~600519~1234.56~1200.00~..."
 */
async function fetchCnStock(symbol) {
  const code = symbol.startsWith('6') ? `sh${symbol}` : `sz${symbol}`;
  return await fetchTencent(code);
}
async function fetchHkStock(symbol) {
  return await fetchTencent(`r_hk${symbol.padStart(5, '0')}`);
}
async function fetchUsStock(symbol) {
  // 美股代码格式：usAAPL.OQ (NASDAQ) / usMSFT.OQ / usSPY.P (NYSE Arca)
  // 简化：默认走 .OQ；如失败让用户在 ticker 自带后缀
  const code = symbol.includes('.') ? `us${symbol}` : `us${symbol}.OQ`;
  return await fetchTencent(code);
}

async function fetchTencent(code) {
  const r = await fetch(`https://qt.gtimg.cn/q=${code}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://stockapp.finance.qq.com/' }
  });
  if (!r.ok) return null;
  // 腾讯返回 GBK，但纯 ASCII 数字 + 部分中文（名字），用 TextDecoder GBK
  const buf = await r.arrayBuffer();
  let text;
  try {
    text = new TextDecoder('gbk').decode(buf);
  } catch {
    text = new TextDecoder('utf-8').decode(buf);
  }
  const match = text.match(/="([^"]+)"/);
  if (!match) return null;
  const parts = match[1].split('~');
  if (parts.length < 5) return null;
  // parts[1]=name, parts[2]=code, parts[3]=current, parts[4]=prevClose, parts[31]=changePct
  const price = parseFloat(parts[3]);
  const prevClose = parseFloat(parts[4]);
  const changePct = parts[32] ? parseFloat(parts[32]) : (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);
  return {
    name: parts[1],
    symbol: parts[2],
    price,
    prevClose,
    change: price - prevClose,
    changePct,
    currency: code.startsWith('us') ? 'USD' : (code.startsWith('r_hk') ? 'HKD' : 'CNY')
  };
}

/** 国内基金（天天基金 实时估值） */
async function fetchCnFund(symbol) {
  const r = await fetch(`https://fundgz.1234567.com.cn/js/${symbol}.js`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/' }
  });
  if (!r.ok) return null;
  const text = await r.text();
  // jsonpgz({"fundcode":"008888","name":"...","jzrq":"2024-XX-XX","dwjz":"1.234","gsz":"1.235","gszzl":"0.08",...})
  const m = text.match(/\{[^}]+\}/);
  if (!m) return null;
  const obj = JSON.parse(m[0]);
  const price = parseFloat(obj.gsz || obj.dwjz);
  if (!Number.isFinite(price)) return null;
  return {
    name: obj.name,
    symbol: obj.fundcode,
    price,
    changePct: obj.gszzl ? parseFloat(obj.gszzl) : 0,
    currency: 'CNY'
  };
}
