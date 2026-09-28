const express = require('express');
const crypto = require('crypto');
const https = require('https');
const { loadSchedule, upcomingSlots, runSlot, readQueue, startScheduler } = require('./scheduler');
const app = express();

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

function generateHmac(method, urlPath) {
  const now = new Date();
  const datetime = now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').slice(0,15)+'Z';
  const parts = urlPath.split('?');
  const path = parts[0];
  const query = parts[1] || '';
  const message = datetime + method + path + query;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

function fetchBestProducts(categoryId, limit) {
  const apiPath = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/${categoryId}?limit=${limit}`;
  const options = {
    hostname: 'api-gateway.coupang.com',
    path: apiPath,
    method: 'GET',
    headers: { 'Authorization': generateHmac('GET', apiPath), 'Content-Type': 'application/json' }
  };
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(Object.assign(new Error('Parse error'), { raw: data })); }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

app.get('/products/best', (req, res) => {
  fetchBestProducts(req.query.categoryId || '1016', req.query.limit || '5')
    .then(data => res.json(data))
    .catch(e => res.status(500).json({ error: e.message, raw: e.raw }));
});

const schedule = loadSchedule();

app.get('/schedule', (req, res) => {
  res.json({ ...schedule, upcoming: upcomingSlots(schedule, new Date(), 10) });
});

app.get('/schedule/queue', (req, res) => res.json(readQueue()));

// 수동 실행: /schedule/run?day=mon&time=12:30
app.post('/schedule/run', (req, res) => {
  const { day, time } = req.query;
  const slot = (schedule.weekly[day] || []).find(s => s.time === time);
  if (!slot) return res.status(404).json({ error: `No slot for ${day} ${time}` });
  runSlot({ ...slot, day }, fetchBestProducts, schedule.defaults.limit)
    .then(job => res.json(job))
    .catch(e => res.status(500).json({ error: e.message }));
});

if (process.env.SCHEDULER_ENABLED !== 'false') startScheduler(schedule, fetchBestProducts);

app.listen(process.env.PORT || 3000, () => console.log('Server running on port ' + (process.env.PORT || 3000)));
