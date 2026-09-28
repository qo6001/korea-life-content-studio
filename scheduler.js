const fs = require('fs');
const path = require('path');

// KST는 서머타임이 없어 UTC+9 고정
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const QUEUE_FILE = path.join(__dirname, 'data', 'queue.json');

function loadSchedule(file = path.join(__dirname, 'schedule.json')) {
  const schedule = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const day of Object.keys(schedule.weekly)) {
    if (!DAYS.includes(day)) throw new Error(`Unknown day in schedule: ${day}`);
    for (const slot of schedule.weekly[day]) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time)) throw new Error(`Invalid time "${slot.time}" on ${day}`);
      if (!slot.categoryId) throw new Error(`Missing categoryId on ${day} ${slot.time}`);
    }
  }
  return schedule;
}

// 지금부터 7일 안의 모든 슬롯을 실행 시각(UTC Date) 순으로 반환
function upcomingSlots(schedule, from = new Date(), count = 20) {
  const kstNow = new Date(from.getTime() + KST_OFFSET_MS);
  const result = [];
  for (let d = 0; d <= 7; d++) {
    const kstDay = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + d));
    const day = DAYS[kstDay.getUTCDay()];
    for (const slot of schedule.weekly[day] || []) {
      const [h, m] = slot.time.split(':').map(Number);
      const runAt = new Date(kstDay.getTime() + (h * 60 + m) * 60000 - KST_OFFSET_MS);
      if (runAt > from) result.push({ ...slot, day, runAt });
    }
  }
  return result.sort((a, b) => a.runAt - b.runAt).slice(0, count);
}

function readQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); }
  catch (e) { return []; }
}

function appendQueue(job) {
  const queue = readQueue();
  queue.push(job);
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

// 한 슬롯 실행: 베스트 상품을 가져와 이전에 쓰지 않은 상품 하나를 업로드 대기열에 추가
async function runSlot(slot, fetchBestProducts, limit) {
  const used = new Set(readQueue().map(j => j.product && j.product.productId));
  const res = await fetchBestProducts(slot.categoryId, limit);
  const products = (res && res.data) || [];
  const product = products.find(p => !used.has(p.productId)) || products[0];
  const job = {
    createdAt: new Date().toISOString(),
    day: slot.day,
    time: slot.time,
    categoryId: slot.categoryId,
    category: slot.category,
    theme: slot.theme,
    status: product ? 'PENDING' : 'NO_PRODUCT',
    product: product || null,
    error: product ? undefined : (res && res.rMessage) || 'No products returned'
  };
  appendQueue(job);
  return job;
}

function startScheduler(schedule, fetchBestProducts) {
  const limit = (schedule.defaults && schedule.defaults.limit) || 5;
  let timer = null;
  const scheduleNext = () => {
    const [next] = upcomingSlots(schedule, new Date(), 1);
    if (!next) return console.log('[scheduler] No slots configured');
    // setTimeout 최대 지연(~24.8일)보다 짧게 끊어서 재계산
    const delay = Math.min(next.runAt - Date.now(), 6 * 60 * 60 * 1000);
    console.log(`[scheduler] Next: ${next.day} ${next.time} KST ${next.category} (${next.theme})`);
    timer = setTimeout(async () => {
      if (Date.now() >= next.runAt.getTime()) {
        try {
          const job = await runSlot(next, fetchBestProducts, limit);
          console.log(`[scheduler] Queued ${job.status}: ${job.product ? job.product.productName : job.error}`);
        } catch (e) {
          console.error('[scheduler] Slot failed:', e.message);
        }
      }
      scheduleNext();
    }, Math.max(delay, 0));
  };
  scheduleNext();
  return () => clearTimeout(timer);
}

module.exports = { loadSchedule, upcomingSlots, runSlot, readQueue, startScheduler };
