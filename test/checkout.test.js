const test = require('node:test'); const assert = require('node:assert');
const { handle, hits } = require('../netlify/functions/checkout.js');
const ev = (body, ip='1.1.1.1') => ({ httpMethod:'POST', headers:{'x-forwarded-for':ip}, body: JSON.stringify(body) });
test('stub mode by default', async () => {
  const r = await handle(ev({plan:'pro'},'a'), {}); assert.equal(JSON.parse(r.body).mode,'stub');
});
test('stub when keys present but not approved', async () => {
  const env={STRIPE_SECRET_KEY:'x',STRIPE_PRICE_PRO:'p',SITE_URL:'u',LIVE_CHECKOUT_APPROVED:'no'};
  const r = await handle(ev({plan:'pro'},'b'), env, () => { throw new Error('must not call'); });
  assert.equal(JSON.parse(r.body).mode,'stub');
});
test('live only when approved', async () => {
  const env={STRIPE_SECRET_KEY:'x',STRIPE_PRICE_PRO:'p',SITE_URL:'u',LIVE_CHECKOUT_APPROVED:'yes'};
  const r = await handle(ev({plan:'pro'},'c'), env, async()=>({ok:true,json:async()=>({id:'cs',url:'https://s'})}));
  assert.equal(JSON.parse(r.body).url,'https://s');
});
test('rejects unknown plan and rate limits', async () => {
  assert.equal((await handle(ev({plan:'x'},'d'),{})).statusCode,400);
  hits.clear(); let last;
  for (let i=0;i<7;i++) last = await handle(ev({plan:'pro'},'e'),{});
  assert.equal(last.statusCode,429);
});
