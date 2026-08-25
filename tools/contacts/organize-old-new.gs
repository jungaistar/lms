/**
 * 주소록 old / new 분류기 — Google Apps Script
 *
 * radical8566@gmail.com 의 Google 주소록을 "마지막 수정 시각" 기준으로
 * 자른 뒤 라벨(연락처 그룹) 두 개로 나눈다.
 *
 *   기준 시각 이전(포함) → old
 *   기준 시각 이후       → new
 *
 * 지우는 동작은 없다. 라벨만 붙인다.
 * 되돌리려면 주소록에서 라벨을 지우면 된다 — 라벨을 지워도 연락처는 남는다.
 *
 * 쓰는 법은 같은 폴더의 README.md 를 볼 것.
 */

// ── 여기만 고치면 된다 ──────────────────────────────────────────────

/** 자르는 시각. 이 시각까지가 old, 넘으면 new. (KST) */
const CUTOFF = '2026-07-31T23:59:59+09:00';

/** 붙일 라벨 이름 */
const LABEL_OLD = 'old';
const LABEL_NEW = 'new';

/**
 * true  — 세어만 보고 라벨은 안 붙인다 (첫 실행은 이걸로)
 * false — 실제로 라벨을 붙인다
 */
const DRY_RUN = true;

/** 결과를 스프레드시트로도 남길지 */
const MAKE_REPORT = true;
const REPORT_NAME = '주소록 old-new 분류 결과';

// ── 아래는 건드릴 것 없다 ───────────────────────────────────────────

const PERSON_FIELDS = [
  'names',
  'emailAddresses',
  'phoneNumbers',
  'organizations',
  'memberships',
  'metadata',
].join(',');

/** 실행할 함수. 편집기에서 이걸 고르고 ▶ 를 누른다. */
function organizeContacts() {
  const cutoff = new Date(CUTOFF).getTime();
  if (isNaN(cutoff)) throw new Error('CUTOFF 를 읽을 수 없다: ' + CUTOFF);

  const people = fetchAllConnections_();
  Logger.log('주소록 %s명을 읽었다.', people.length);

  const groupNames = listGroupNames_();

  const rows = [];
  const oldIds = [];
  const newIds = [];
  let noTime = 0;

  for (const person of people) {
    const t = updatedAt_(person);
    const isOld = (t === null) || (t <= cutoff);
    if (t === null) noTime++;

    (isOld ? oldIds : newIds).push(person.resourceName);

    if (MAKE_REPORT) {
      rows.push([
        displayName_(person),
        joinField_(person.phoneNumbers, 'value'),
        joinField_(person.emailAddresses, 'value'),
        joinField_(person.organizations, 'name'),
        t === null ? '(없음)' : Utilities.formatDate(new Date(t), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
        isOld ? LABEL_OLD : LABEL_NEW,
        currentLabels_(person, groupNames),
        person.resourceName,
      ]);
    }
  }

  Logger.log(
    '기준 %s → %s %d명 / %s %d명 (수정 시각을 못 읽은 %d명은 %s 로 넣었다)',
    CUTOFF, LABEL_OLD, oldIds.length, LABEL_NEW, newIds.length, noTime, LABEL_OLD
  );

  if (MAKE_REPORT) {
    const url = writeReport_(rows);
    Logger.log('결과 시트: %s', url);
  }

  if (DRY_RUN) {
    Logger.log('DRY_RUN = true 라 라벨은 안 붙였다. 숫자가 맞으면 false 로 바꾸고 다시 돌릴 것.');
    return;
  }

  addMembers_(ensureGroup_(LABEL_OLD), oldIds);
  addMembers_(ensureGroup_(LABEL_NEW), newIds);
  Logger.log('라벨을 붙였다. contacts.google.com 왼쪽 라벨 목록에서 확인할 것.');
}

/** 주소록 전체를 페이지 넘겨가며 읽는다. */
function fetchAllConnections_() {
  const out = [];
  let pageToken = null;
  do {
    const res = People.People.Connections.list('people/me', {
      personFields: PERSON_FIELDS,
      pageSize: 1000,
      pageToken: pageToken || undefined,
    });
    if (res.connections) Array.prototype.push.apply(out, res.connections);
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * 이 연락처가 마지막으로 손댄 시각(ms). 못 읽으면 null.
 *
 * People API 는 "만든 시각" 을 주지 않는다. 주는 것은 출처별 updateTime 뿐이다.
 * 폰을 바꾸며 통째로 다시 들어온 줄은 그때 시각으로 찍히므로 이 값이 사실상
 * "언제 내 주소록에 들어왔나" 노릇을 한다 — 다만 옛 연락처를 나중에 한 번
 * 고쳤다면 그 줄은 new 로 간다. 결과 시트에서 눈으로 확인할 것.
 */
function updatedAt_(person) {
  const sources = (person.metadata && person.metadata.sources) || [];
  let latest = null;
  for (const s of sources) {
    if (!s.updateTime) continue;
    const t = new Date(s.updateTime).getTime();
    if (isNaN(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

/** 라벨 resourceName → 이름 */
function listGroupNames_() {
  const map = {};
  let pageToken = null;
  do {
    const res = People.ContactGroups.list({ pageSize: 200, pageToken: pageToken || undefined });
    for (const g of (res.contactGroups || [])) {
      map[g.resourceName] = g.formattedName || g.name;
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
  return map;
}

/** 이름의 라벨이 있으면 그 resourceName, 없으면 새로 만든다. */
function ensureGroup_(name) {
  let pageToken = null;
  do {
    const res = People.ContactGroups.list({ pageSize: 200, pageToken: pageToken || undefined });
    for (const g of (res.contactGroups || [])) {
      if (g.name === name || g.formattedName === name) return g.resourceName;
    }
    pageToken = res.nextPageToken;
  } while (pageToken);

  return People.ContactGroups.create({ contactGroup: { name: name } }).resourceName;
}

/** 라벨에 사람을 넣는다. 한 번에 최대 500명이라 200명씩 끊는다. */
function addMembers_(groupResourceName, resourceNames) {
  for (let i = 0; i < resourceNames.length; i += 200) {
    const chunk = resourceNames.slice(i, i + 200);
    People.ContactGroups.Members.modify({ resourceNamesToAdd: chunk }, groupResourceName);
    Logger.log('  %s ← %d명 (%d/%d)', groupResourceName, chunk.length,
      Math.min(i + chunk.length, resourceNames.length), resourceNames.length);
    Utilities.sleep(300);
  }
}

function displayName_(person) {
  const names = person.names || [];
  if (names.length && names[0].displayName) return names[0].displayName;
  const phones = person.phoneNumbers || [];
  if (phones.length) return '(이름없음) ' + phones[0].value;
  return '(이름없음)';
}

function joinField_(list, key) {
  return (list || []).map(function (x) { return x[key]; })
    .filter(function (v) { return !!v; })
    .join(' / ');
}

function currentLabels_(person, groupNames) {
  return (person.memberships || [])
    .map(function (m) {
      const rn = m.contactGroupMembership && m.contactGroupMembership.contactGroupResourceName;
      return rn ? (groupNames[rn] || rn) : null;
    })
    .filter(function (v) { return !!v && v !== 'myContacts'; })
    .join(', ');
}

function writeReport_(rows) {
  const ss = SpreadsheetApp.create(
    REPORT_NAME + ' ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HHmm')
  );
  const sheet = ss.getSheets()[0];
  sheet.setName('분류');

  const header = ['이름', '전화', '이메일', '소속', '마지막 수정(KST)', '분류', '지금 라벨', 'resourceName'];
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');

  // 오래된 것부터. 날짜 없는 줄은 맨 앞.
  rows.sort(function (a, b) { return String(a[4]).localeCompare(String(b[4])); });

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    sheet.getRange(i + 2, 1, chunk.length, header.length).setValues(chunk);
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
  return ss.getUrl();
}
