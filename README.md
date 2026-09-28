# coupangautoshorts
## 업로드 스케줄

`schedule.json`에 요일별 업로드 시간(KST)과 쿠팡 카테고리가 정의되어 있습니다. 시간·카테고리·테마를 직접 수정하면 서버 재시작 시 반영됩니다.

- 서버 실행 시 스케줄러가 자동 시작됩니다 (`SCHEDULER_ENABLED=false`로 끌 수 있음).
- 각 시간이 되면 해당 카테고리 베스트 상품을 가져와, 아직 사용하지 않은 상품 1개를 `data/queue.json` 업로드 대기열에 추가합니다.
- `GET /schedule` — 전체 스케줄 + 다가오는 10개 슬롯
- `GET /schedule/queue` — 업로드 대기열
- `POST /schedule/run?day=mon&time=12:30` — 특정 슬롯 수동 실행
