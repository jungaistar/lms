/* 창업과 기업가 정신 · 제1강 오리엔테이션 — 편집 가능한 PPTX 생성기
   week01.html 과 같은 좌표계(1280×720 px)를 그대로 쓴다. 1 px = 1/96 in.        */
const fs = require("fs"), path = require("path");
const pptxgen = require("pptxgenjs");

const ASSET = "/home/user/lms/docs/lecture/week01/assets";
const PNG   = __dirname + "/png";
const OUT   = "/home/user/lms/docs/lecture/week01/week01.pptx";

const P  = px => Math.round((px / 96) * 10000) / 10000;      // px → inch
const PT = px => Math.round(px * 0.75 * 10) / 10;            // px → pt

const C = { cyan:"00A5DE", blue:"0071CE", deep:"005BAC", navy:"17365D", yellow:"FFF100",
            red:"C00000", orange:"ED7D31", ink:"3B3838", inkSoft:"63666B",
            line:"9DC3E6", tint:"DEEBF7", tint2:"F2F7FC", bg:"EFF0F2", white:"FFFFFF" };
const KR = "맑은 고딕", NUM = "Arial";

const img = f => "image/png;base64," + fs.readFileSync(path.join(PNG, f + ".png")).toString("base64");
const jpg = f => "image/jpeg;base64," + fs.readFileSync(path.join(ASSET, f + ".jpg")).toString("base64");
const A = { cover:jpg("bg-cover"), chapter:jpg("bg-chapter"), content:jpg("bg-content"), header:jpg("bg-header"),
            logo:img("logo-dima"), logoInk:img("logo-dima-ink"), rules:img("rules-stripes"),
            avatar:img("avatar-professor"), check:img("icon-checkbox-red"), arc:img("arc-back"),
            dial:{1:img("dial-1"),2:img("dial-2"),3:img("dial-3"),4:img("dial-4"),5:img("dial-5"),next:img("dial-next")} };

const pres = new pptxgen();
pres.defineLayout({ name:"DIMA", width:13.3333, height:7.5 });
pres.layout = "DIMA";
pres.author = "정동엽"; pres.company = "동아방송예술대학교 창의융합교양학부";
pres.title  = "제1강 오리엔테이션 · 창업과 기업가 정신";

/* ── 인라인 서식: **굵게** ~~빨강~~ %%파랑%% ───────────────────────── */
function runs(md, base) {
  const out = [], re = /(\*\*[^*]+\*\*|~~[^~]+~~|%%[^%]+%%)/g;
  let last = 0, m;
  while ((m = re.exec(md))) {
    if (m.index > last) out.push({ text: md.slice(last, m.index), options: { ...base } });
    const t = m[0], inner = t.slice(2, -2);
    if (t.startsWith("**"))      out.push({ text: inner, options: { ...base, bold:true } });
    else if (t.startsWith("~~")) out.push({ text: inner, options: { ...base, bold:true, color:C.red } });
    else                         out.push({ text: inner, options: { ...base, bold:true, color:C.deep } });
    last = m.index + t.length;
  }
  if (last < md.length) out.push({ text: md.slice(last), options: { ...base } });
  return out.length ? out : [{ text: md, options: { ...base } }];
}
function para(list, base, bulletCode) {
  const out = [];
  list.forEach(md => {
    const r = runs(md, base);
    if (bulletCode) r[0].options = { ...r[0].options, bullet:{ code:bulletCode } };
    r[r.length - 1].options = { ...r[r.length - 1].options, breakLine:true };
    out.push(...r);
  });
  return out;
}
const TXT = o => ({ margin:0, fontFace:KR, color:C.ink, valign:"top", ...o });

/* ── 슬라이드 골격 ─────────────────────────────────────────────────── */
function contentSlide(tag, pageNo) {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addImage({ data:A.content, x:0, y:P(62), w:13.3333, h:P(658) });
  s.addImage({ data:A.header,  x:0, y:0,      w:13.3333, h:P(62) });
  s.addShape(pres.ShapeType.rect, { x:P(46), y:P(9), w:P(tag.length * 27 + 34), h:P(44),
                                    fill:{ color:"0B4E8A", transparency:34 }, line:{ type:"none" } });
  s.addText(tag, TXT({ x:P(46), y:P(9), w:P(tag.length * 27 + 34), h:P(44), align:"center", valign:"middle",
                       fontSize:PT(26), bold:true, color:C.yellow }));
  s.addImage({ data:A.logo, x:P(1084), y:P(8), w:P(170), h:P(46) });
  if (pageNo) s.addText(String(pageNo), TXT({ x:0, y:P(692), w:13.3333, h:P(20), align:"center",
                                              fontSize:PT(15), color:"8A8F96", fontFace:NUM }));
  return s;
}
function chapterSlide(num, title, desc, dialKey) {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addImage({ data:A.chapter, x:0, y:0, w:13.3333, h:P(374) });
  s.addImage({ data:A.rules,   x:0, y:P(376), w:P(560), h:P(46) });
  s.addImage({ data:A.dial[dialKey || num], x:P(-6), y:P(244), w:P(180), h:P(200) });
  s.addText(title, TXT({ x:P(500), y:P(390), w:P(728), h:P(64), align:"right",
                         fontSize:PT(46), bold:true, color:C.navy }));
  s.addText(desc,  TXT({ x:P(400), y:P(460), w:P(828), h:P(70), align:"right",
                         fontSize:PT(21), color:C.inkSoft, lineSpacingMultiple:1.4 }));
  s.addImage({ data:A.logoInk, x:P(1120), y:P(650), w:P(122), h:P(44) });
  return s;
}
const card = (s, x, y, w, h, o={}) => s.addShape(pres.ShapeType.rect,
  { x:P(x), y:P(y), w:P(w), h:P(h), fill:{ color:o.fill || C.white },
    line:{ color:o.stroke || "D4DCE6", width:1 } });
const leftRule = (s, x, y, h, color) => s.addShape(pres.ShapeType.rect,
  { x:P(x), y:P(y), w:P(6), h:P(h), fill:{ color }, line:{ type:"none" } });

/* ══ 1. 표지 ════════════════════════════════════════════════════════ */
{
  const s = pres.addSlide(); s.background = { color:C.bg };
  s.addImage({ data:A.cover, x:0, y:0, w:13.3333, h:P(518) });
  s.addImage({ data:A.rules, x:0, y:P(461), w:P(560), h:P(46) });
  s.addImage({ data:A.logo,  x:P(878), y:P(220), w:P(394), h:P(141) });
  s.addText("창업과 기업가 정신", TXT({ x:P(56), y:P(190), w:P(700), h:P(38),
            fontSize:PT(26), bold:true, color:"D8ECF9" }));
  s.addText("제1강  오리엔테이션", TXT({ x:P(56), y:P(232), w:P(760), h:P(84),
            fontSize:PT(60), bold:true, color:C.white }));
  s.addText("창의융합교양학부", TXT({ x:P(700), y:P(566), w:P(546), h:P(32),
            align:"right", fontSize:PT(22), bold:true, color:C.navy }));
  s.addText("정동엽 교수", TXT({ x:P(700), y:P(630), w:P(546), h:P(32),
            align:"right", fontSize:PT(22), bold:true, color:C.navy }));
  s.addNotes("창업과 기업가 정신 제1강 오리엔테이션. 창의융합교양학부 정동엽 교수.");
}

/* ══ 2. 여러분과 함께 하는 저는? ═════════════════════════════════════ */
{
  const s = contentSlide("여러분과 함께 하는 저는?", 2);
  s.addImage({ data:A.avatar, x:P(82), y:P(82), w:P(176), h:P(176) });
  s.addText("정 동 엽", TXT({ x:P(52), y:P(278), w:P(236), h:P(46), align:"center",
            fontSize:PT(38), bold:true, color:C.navy, charSpacing:8 }));
  s.addText("창의융합교양학부", TXT({ x:P(52), y:P(326), w:P(236), h:P(24), align:"center",
            fontSize:PT(17), bold:true, color:C.deep }));
  s.addText("dimajob4u@gmail.com", TXT({ x:P(52), y:P(358), w:P(236), h:P(22), align:"center",
            fontSize:PT(15), color:C.deep, hyperlink:{ url:"mailto:dimajob4u@gmail.com" } }));
  const bio = [
    "아시아퓨처스그룹 사무국장",
    "아시아미래인재연구소 (前)교육실장 및 전문연구원",
    "경기대학교 일반대학원 직업학과 박사수료",
    "가천대학교 경영대학원 고용 및 직업상담학과 석사",
    "한국기술교육대학교 능력개발원 **4차 산업혁명과 일/직업의 변화** 교수",
    "**서울산업진흥원 신직업전문컨설턴트 및 자문위원, 창업 닥터(2013~2020년)**",
    "고용노동부 직업심리 전문가(성인, 청소년, 대학생)",
    "고용노동부 온라인직업심리 전문가**(청소년)**",
    "미래학기반 커리어 컨설턴트",
    "IT업계 20년 근무(교학사, 삼보컴퓨터 등에서 교육정보화 관련 컨설팅 업무 진행)",
    "**한국어교원 2급(문화체육관광부)**",
    "**고용노동부 직업훈련교사 3급(마케팅, 정보기술전략·계획)**",
    "모금전문가, 평생교육사, 사회복지사",
    "국제공인NLP Practitioner" ];
  const bb = { fontFace:KR, fontSize:PT(18), color:C.ink };
  s.addText(para(bio.slice(0, 7), bb, "2022"),
            TXT({ x:P(316), y:P(84), w:P(452), h:P(560), fontSize:PT(18), paraSpaceAfter:PT(13), lineSpacingMultiple:1.3 }));
  s.addText(para(bio.slice(7), bb, "2022"),
            TXT({ x:P(790), y:P(84), w:P(456), h:P(560), fontSize:PT(18), paraSpaceAfter:PT(13), lineSpacingMultiple:1.3 }));
}

/* ══ 3. 목차 ════════════════════════════════════════════════════════ */
{
  const s = pres.addSlide(); s.background = { color:C.bg };
  s.addImage({ data:A.content, x:0, y:0, w:13.3333, h:7.5 });
  s.addImage({ data:A.header,  x:0, y:0, w:13.3333, h:P(66) });
  s.addImage({ data:A.logo, x:P(1084), y:P(10), w:P(170), h:P(46) });
  s.addText([{ text:"목차   ", options:{ fontSize:PT(36), color:C.inkSoft } },
             { text:"|   ",   options:{ fontSize:PT(36), color:C.line } },
             { text:"CONTENTS", options:{ fontSize:PT(24), color:C.inkSoft, fontFace:NUM, charSpacing:3 } }],
            TXT({ x:P(56), y:P(96), w:P(700), h:P(48) }));
  const toc = ["강의 개요(강의계획서)","성적 평가","주 별 강의 계획","강의요구분석(설문)","창업 인식도 조사(설문)"];
  toc.forEach((t, i) => {
    const y = 168 + i * 80;
    s.addText(String(i + 1), TXT({ x:P(56), y:P(y), w:P(40), h:P(50),
              fontSize:PT(42), color:C.deep, fontFace:NUM }));
    s.addText(t, TXT({ x:P(96), y:P(y + 8), w:P(700), h:P(40), fontSize:PT(29), bold:true, color:C.navy }));
    s.addShape(pres.ShapeType.line, { x:P(56), y:P(y + 56), w:P(760), h:0, line:{ color:C.line, width:1.6 } });
  });
}

/* ══ 4. CHAPTER 1 ═══════════════════════════════════════════════════ */
chapterSlide(1, "강의 개요(강의계획서)", "교과 목표 및 교재 등에 대한 소개");

/* ══ 5. 교과 목표 ═══════════════════════════════════════════════════ */
{
  const s = contentSlide("강의 개요", 5);
  s.addText("교과 목표", TXT({ x:P(52), y:P(84), w:P(600), h:P(46), fontSize:PT(34), bold:true, color:C.navy }));
  s.addText([{ text:"• ", options:{ color:C.blue, fontSize:PT(23), bold:true } },
             { text:"『창업과 기업가 정신』 한 학기 수업을 마치면…", options:{ fontSize:PT(23), bold:true, color:C.ink } }],
            TXT({ x:P(52), y:P(146), w:P(900), h:P(34) }));
  const goals = [
    ["🧩", "하나의 지식을 얻으면 %%응용하여 시도해 보지 않은 방식%%에 적용할 수 있다."],
    ["🔭", "주어진 상황을 여러 관점으로 바라보고 %%새롭고 독창적인 아이디어%%를 찾을 수 있다."],
    ["🛠️", "다양한 지식, 기술, 정보를 활용하여 %%자신만의 새로운 방식%%을 찾을 수 있다."],
    ["🔗", "서로 다른 분야의 지식 및 정보들을 연결하여 %%새로운 가치를 창출%%할 수 있다."] ];
  goals.forEach(([emo, md], i) => {
    const x = 52 + (i % 2) * 588, y = 208 + Math.floor(i / 2) * 150;
    card(s, x, y, 576, 126, { fill:C.tint2, stroke:C.line });
    s.addText(emo, TXT({ x:P(x + 16), y:P(y + 40), w:P(48), h:P(48), fontSize:PT(34), align:"center" }));
    s.addText(runs(md, { fontFace:KR, fontSize:PT(19.5), color:C.ink }),
              TXT({ x:P(x + 74), y:P(y + 18), w:P(484), h:P(92), valign:"middle", lineSpacingMultiple:1.4 }));
  });
}

/* ══ 6·7. 교재 ══════════════════════════════════════════════════════ */
function bookShape(s, x, y, fill, dark, lines, sub) {
  s.addShape(pres.ShapeType.rect, { x:P(x), y:P(y), w:P(200), h:P(300), fill:{ color:fill },
             line:{ type:"none" }, shadow:{ type:"outer", color:"002A55", opacity:0.25, blur:14, offset:6, angle:90 } });
  s.addShape(pres.ShapeType.rect, { x:P(x), y:P(y), w:P(22), h:P(300), fill:{ color:dark }, line:{ type:"none" } });
  s.addShape(pres.ShapeType.line, { x:P(x + 52), y:P(y + 42), w:P(120), h:0, line:{ color:"FFFFFF", width:1.6, transparency:30 } });
  s.addText(lines.join("\n"), TXT({ x:P(x + 26), y:P(y + 88), w:P(160), h:P(100), align:"center",
            fontSize:PT(19), bold:true, color:C.white, lineSpacingMultiple:1.4 }));
  s.addText(sub, TXT({ x:P(x + 26), y:P(y + 236), w:P(160), h:P(24), align:"center",
            fontSize:PT(13), color:"E4F0FA" }));
  s.addShape(pres.ShapeType.line, { x:P(x + 52), y:P(y + 272), w:P(120), h:0, line:{ color:"FFFFFF", width:1.2, transparency:50 } });
}
{
  const s = contentSlide("강의 개요", 6);
  s.addText([{ text:"주 교재 ", options:{ fontSize:PT(34), bold:true, color:C.navy } },
             { text:"| ", options:{ fontSize:PT(34), color:C.line } },
             { text:"창업과 기업가 정신(자체 교재)", options:{ fontSize:PT(34), bold:true, color:C.navy } }],
            TXT({ x:P(52), y:P(84), w:P(1000), h:P(46) }));
  bookShape(s, 76, 196, C.deep, "003F7D", ["창업과", "기업가 정신"], "창의융합교양학부");
  s.addShape(pres.ShapeType.roundRect, { x:P(340), y:P(210), w:P(190), h:P(52), rectRadius:0.26,
             fill:{ color:C.tint }, line:{ color:C.line, width:1 } });
  s.addText("주 교재", TXT({ x:P(340), y:P(210), w:P(190), h:P(52), align:"center", valign:"middle",
            fontSize:PT(23), bold:true, color:C.navy }));
  s.addText(para(["%%『창업과 기업가 정신』%% — 자체 제작 교재",
                  "한 학기 강의 전 주차가 이 교재의 차례를 따라간다.",
                  "배포 방법과 일정은 ~~LMS 공지~~로 안내한다."],
                 { fontFace:KR, fontSize:PT(22), color:C.ink }, "27A2"),
            TXT({ x:P(340), y:P(292), w:P(840), h:P(180), paraSpaceAfter:PT(18), lineSpacingMultiple:1.35 }));
}
{
  const s = contentSlide("강의 개요", 7);
  s.addText([{ text:"부 교재 ", options:{ fontSize:PT(34), bold:true, color:C.navy } },
             { text:"| ", options:{ fontSize:PT(34), color:C.line } },
             { text:"밸류 프로포지션 디자인", options:{ fontSize:PT(34), bold:true, color:C.navy } }],
            TXT({ x:P(52), y:P(84), w:P(1000), h:P(46) }));
  bookShape(s, 76, 196, C.cyan, C.blue, ["밸류", "프로포지션", "디자인"], "Value Proposition Design");
  s.addShape(pres.ShapeType.roundRect, { x:P(340), y:P(210), w:P(190), h:P(52), rectRadius:0.26,
             fill:{ color:C.tint }, line:{ color:C.line, width:1 } });
  s.addText("부 교재", TXT({ x:P(340), y:P(210), w:P(190), h:P(52), align:"center", valign:"middle",
            fontSize:PT(23), bold:true, color:C.navy }));
  const lab = { bold:true, color:"17365D", align:"center", fill:{ color:"DEEBF7" } };
  s.addTable([
      [{ text:"도서명", options:lab }, { text:"밸류 프로포지션 디자인", options:{ fill:{ color:"FFFFFF" } } }],
      [{ text:"저자",   options:{ ...lab } }, { text:"알렉스 오스터왈더 외", options:{ fill:{ color:"FFFFFF" } } }],
      [{ text:"출판",   options:{ ...lab } }, { text:"아르고나인미디어 그룹", options:{ fill:{ color:"FFFFFF" } } }] ],
    { x:P(340), y:P(292), w:P(680), colW:[P(150), P(530)], rowH:P(56),
      fontFace:KR, fontSize:PT(21), color:C.ink, valign:"middle", margin:[0, P(14), 0, P(14)],
      border:{ type:"solid", color:C.line, pt:1 }, align:"left" });
}

/* ══ 8. CHAPTER 2 ═══════════════════════════════════════════════════ */
chapterSlide(2, "성적 평가", "출석, 중간고사, 기말고사, 과제물 등 성적 평가 방법 소개");

/* ══ 9. 성적평가 ════════════════════════════════════════════════════ */
{
  const s = contentSlide("성적평가", 9);
  s.addText("평가 기준에 따라 적용합니다.", TXT({ x:P(52), y:P(82), w:P(800), h:P(46),
            fontSize:PT(34), bold:true, color:C.navy }));
  s.addText("1. 성적평가", TXT({ x:P(52), y:P(142), w:P(400), h:P(30), fontSize:PT(22), bold:true, color:C.deep }));
  const th = { bold:true, color:"17365D", align:"center", valign:"middle", fill:{ color:"DEEBF7" }, fontSize:PT(17) };
  const td = { align:"center", valign:"middle", bold:true, color:"005BAC", fontFace:NUM, fontSize:PT(21), fill:{ color:"FFFFFF" } };
  s.addTable([
      [{ text:"출석", options:{ ...th } }, { text:"중간시험", options:{ ...th } },
       { text:"기말시험", options:{ ...th } }, { text:"과제물제출 및\n참여도(수업태도)", options:{ ...th } }],
      [{ text:"20%", options:{ ...td } }, { text:"30%", options:{ ...td } },
       { text:"30%", options:{ ...td } }, { text:"20%", options:{ ...td } }] ],
    { x:P(52), y:P(182), w:P(710), colW:[P(148), P(158), P(158), P(246)],
      rowH:[P(58), P(52)], fontFace:KR, valign:"middle",
      border:{ type:"solid", color:C.line, pt:1 } });
  card(s, 52, 262, 710, 152, { fill:C.tint2, stroke:C.line });
  s.addText("중간고사 : 개인별 과제 및 발표", TXT({ x:P(72), y:P(278), w:P(660), h:P(30), fontSize:PT(20), bold:true, color:C.navy }));
  s.addText("기말고사 : write-up", TXT({ x:P(72), y:P(310), w:P(660), h:P(30), fontSize:PT(20), bold:true, color:C.navy }));
  s.addText(para(["아이디어의 독창성 : ~~15점~~", "비지니스의 성공가능성 : ~~15점~~"],
                 { fontFace:KR, fontSize:PT(17), color:C.ink }, "2022"),
            TXT({ x:P(84), y:P(344), w:P(640), h:P(62), paraSpaceAfter:PT(6) }));
  card(s, 52, 434, 710, 60, { fill:C.white });
  leftRule(s, 52, 434, 60, C.orange);
  s.addText("📍", TXT({ x:P(70), y:P(450), w:P(30), h:P(28), fontSize:PT(20) }));
  s.addText(runs("%%취·창업 및 진로상담%% 참여는 과제물·수업태도 영역에 가산한다.",
                 { fontFace:KR, fontSize:PT(17), color:C.ink }),
            TXT({ x:P(106), y:P(434), w:P(640), h:P(60), valign:"middle" }));
  // 취·창업 배지
  s.addShape(pres.ShapeType.rect, { x:P(1030), y:P(136), w:P(200), h:P(44), fill:{ color:C.deep }, line:{ type:"none" } });
  s.addText([{ text:"+  ", options:{ fontFace:NUM, fontSize:PT(22), bold:true, color:C.white } },
             { text:"취·창업 및 진로상담", options:{ fontSize:PT(16), bold:true, color:C.white } }],
            TXT({ x:P(1030), y:P(136), w:P(200), h:P(44), align:"center", valign:"middle" }));
  // 네이티브 도넛 차트 — 데이터가 편집된다
  s.addChart(pres.ChartType.doughnut,
    [{ name:"성적 반영 비율", labels:["출석","중간시험 개인별 발표","기말시험 (실기)","과제물, 수업태도"], values:[20,30,30,20] }],
    { x:P(820), y:P(200), w:P(400), h:P(400), holeSize:40,
      chartColors:["005BAC","0071CE","4BA3E3","8FC7EC"],
      showLegend:false, showTitle:false, showLabel:true, showPercent:true, showValue:false,
      dataLabelColor:"FFFFFF", dataLabelFontFace:KR, dataLabelFontSize:PT(13), dataLabelFontBold:true,
      dataLabelPosition:"ctr", dataBorder:{ pct:1, color:"FFFFFF" } });
  s.addText([{ text:"100\n", options:{ fontFace:NUM, fontSize:PT(36), bold:true, color:C.navy } },
             { text:"총점", options:{ fontSize:PT(15), bold:true, color:C.inkSoft } }],
            TXT({ x:P(940), y:P(362), w:P(160), h:P(76), align:"center" }));
}

/* ══ 10. 출석 · 공결 기준 ═══════════════════════════════════════════ */
{
  const s = contentSlide("성적평가", 10);
  card(s, 52, 84, 1176, 60);
  leftRule(s, 52, 84, 60, C.deep);
  s.addText("📱", TXT({ x:P(72), y:P(100), w:P(32), h:P(30), fontSize:PT(22) }));
  s.addText(runs("**출석 :**  1. 전자출결(%%헤이영%%) — 유연한 출결 관리 불가", { fontFace:KR, fontSize:PT(21), bold:true, color:C.navy }),
            TXT({ x:P(112), y:P(84), w:P(1090), h:P(60), valign:"middle" }));
  s.addText([{ text:"2. 공결 기준 ", options:{ fontSize:PT(22), bold:true, color:C.deep } },
             { text:"(* 자세한 내용은 학교 홈페이지 참조)", options:{ fontSize:PT(15), color:C.inkSoft } }],
            TXT({ x:P(52), y:P(166), w:P(900), h:P(30) }));
  s.addText(para([
      "국가에서 부과한 의무를 이행한 경우 (예: 병무 관련 신체검사, 예비군 훈련)",
      "총장이 인정한 국제 또는 국내 행사나 각종 대회에 참가한 경우",
      "정부기관의 요청에 의한 특별회합 참가의 경우",
      "경조사의 경우",
      "본인 질병(입원) 및 감염병의 예방 및 관리에 관한 법률에 따라 격리 수용이 필요한 경우",
      "단순질병 (~~1회만 인정 가능~~)" ], { fontFace:KR, fontSize:PT(17), color:C.ink }, "27A2"),
    TXT({ x:P(52), y:P(206), w:P(1170), h:P(230), paraSpaceAfter:PT(9) }));
  card(s, 52, 460, 576, 92);
  leftRule(s, 52, 460, 92, C.orange);
  s.addText("💼", TXT({ x:P(74), y:P(492), w:P(30), h:P(28), fontSize:PT(20) }));
  s.addText(runs("취업 관련 면접(**면접확인서 필수**)은 인정함.", { fontFace:KR, fontSize:PT(17.5), color:C.ink }),
            TXT({ x:P(112), y:P(460), w:P(500), h:P(92), valign:"middle" }));
  card(s, 652, 460, 576, 92);
  leftRule(s, 652, 460, 92, C.red);
  s.addText("⚠️", TXT({ x:P(674), y:P(492), w:P(30), h:P(28), fontSize:PT(20) }));
  s.addText([...runs("~~¼ 결석자 학점 미취득(F, 1주차 포함)~~", { fontFace:KR, fontSize:PT(17.5), color:C.ink }).map((r,i,a)=>i===a.length-1?{...r,options:{...r.options,breakLine:true}}:r),
             ...runs("진단서 ~~1주 이내 제출~~만 유효", { fontFace:KR, fontSize:PT(17.5), color:C.ink })],
            TXT({ x:P(712), y:P(460), w:P(500), h:P(92), valign:"middle", lineSpacingMultiple:1.3 }));
}

/* ══ 11. CHAPTER 3 ══════════════════════════════════════════════════ */
chapterSlide(3, "주차 별 강의 계획", "주차 별 강의 계획을 통해 한 학기 교수-학습의 흐름 파악");

/* ══ 12. 주차 별 강의 계획 ══════════════════════════════════════════ */
{
  const s = contentSlide("주차 별 강의 계획", 12);
  s.addText([{ text:"📅  ", options:{ fontSize:PT(20) } },
             { text:"강의계획서에 따라 진행합니다.", options:{ fontSize:PT(21), bold:true, color:C.navy } }],
            TXT({ x:P(46), y:P(78), w:P(700), h:P(30) }));
  const plan = [
    ["1","오리엔테이션","강좌요구분석, 창업교육영향조사"],
    ["2","창업과 기업가 정신 (기업가정신의 개념, 기업가 정신의 구성요소)",""],
    ["3","달라진 일자리 세계 이해 (인공지능 혁명의 시대와 일자리 변화, 미래 직업세계의 이해)",""],
    ["4","새로운 미래 인재의 조건 (미래 인재의 조건, 자기다움의 발견)","창업적성검사 결과지 제출"],
    ["5","창업과 창업절차 이해 (창업의 개념, 창업의 유형 및 절차)",""],
    ["6","기업가정신의 경영관리 (창업경영의 성공 요인, 창업기업의 경영 관리)",""],
    ["7","비즈니스 기회를 찾는 법 (창업 기회의 의미, 창업 기회의 원천 발견)",""],
    ["8","중간고사 (과제물 발표 및 피드백)",""],
    ["9","창업아이디어 발굴 (아이디어의 의미, 아이디어 발굴 방법)",""],
    ["10","창업아이템 개발 (창업 아이템 선정, 창업 아이템 개발)","활동 결과물 제출"],
    ["11","사업타당성 분석 (사업타당성의 개념, 사업타당성의 분석 방법)","활동 결과물 제출"],
    ["12","비즈니스 모델과 린 스타트업 (비즈니스 모델의 개념, 린 스타트업의 이해)",""],
    ["13","사업계획서 작성법 (사업계획서의 개념, 사업계획서 작성 방법)",""],
    ["14","기업가정신의 현재와 미래 (기업가정신의 배경, 기업가정신의 유형)",""],
    ["15","기말고사","창업 계획서 제출 및 발표"] ];
  const rows = [[
    { text:"주", options:{ bold:true, color:C.navy, align:"center", fill:{ color:C.tint }, fontSize:PT(15) } },
    { text:"주차 별 강의 주제", options:{ bold:true, color:C.navy, align:"center", fill:{ color:C.tint }, fontSize:PT(15) } },
    { text:"과제물", options:{ bold:true, color:C.navy, align:"center", fill:{ color:C.tint }, fontSize:PT(15) } } ]];
  plan.forEach(([w, t, h], i) => {
    const exam = (w === "8" || w === "15");
    const bg = exam ? "FDF3F3" : (i % 2 ? "F2F7FC" : "FFFFFF");
    rows.push([
      { text:w, options:{ align:"center", bold:true, color:C.deep, fontFace:NUM, fill:{ color:bg } } },
      { text:t, options:{ bold:exam, fill:{ color:bg } } },
      { text:h, options:{ bold:true, color:C.red, fill:{ color:bg } } } ]);
  });
  s.addTable(rows, { x:P(46), y:P(112), w:P(1188), colW:[P(48), P(880), P(260)],
    rowH:P(33), fontFace:KR, fontSize:PT(13.5), color:C.ink, valign:"middle",
    margin:[0, P(9), 0, P(9)], border:{ type:"solid", color:C.line, pt:1 }, autoPage:false });
}

/* ══ 13. 과제물 제출 안내 ═══════════════════════════════════════════ */
{
  const s = contentSlide("과제 제출", 13);
  s.addText("과제물 제출 안내", TXT({ x:P(52), y:P(84), w:P(700), h:P(46), fontSize:PT(34), bold:true, color:C.navy }));
  card(s, 52, 148, 998, 104);
  leftRule(s, 52, 148, 104, C.deep);
  s.addText("📨", TXT({ x:P(76), y:P(168), w:P(32), h:P(30), fontSize:PT(22) }));
  s.addText([...runs("과제물은 %%‘LMS’ 과제방%% 혹은 저의 메일로 해당 주차 **강의일 하루 전 23:59:59**까지 이 메일 주소로",
                     { fontFace:KR, fontSize:PT(22), color:C.ink }).map((r,i,a)=>i===a.length-1?{...r,options:{...r.options,breakLine:true}}:r),
             { text:"dimajob4u@gmail.com", options:{ fontFace:KR, fontSize:PT(22), bold:true, color:C.deep, hyperlink:{ url:"mailto:dimajob4u@gmail.com" } } },
             { text:" 으로 제출하시면 됩니다.", options:{ fontFace:KR, fontSize:PT(22), color:C.ink } }],
            TXT({ x:P(114), y:P(148), w:P(918), h:P(104), valign:"middle", lineSpacingMultiple:1.35 }));
  // 타임라인 — 전부 네이티브 도형
  const T = 380;                                       // 타임라인 기준 y
  s.addShape(pres.ShapeType.rightArrow, { x:P(300), y:P(T - 14), w:P(660), h:P(28),
             fill:{ color:"DCE6F1" }, line:{ type:"none" } });
  s.addShape(pres.ShapeType.ellipse, { x:P(400), y:P(T - 19), w:P(38), h:P(38), fill:{ color:"C0504D" }, line:{ type:"none" } });
  s.addShape(pres.ShapeType.ellipse, { x:P(858), y:P(T - 19), w:P(38), h:P(38), fill:{ color:"D9A441" }, line:{ type:"none" } });
  s.addText("3.15, 23:59:59", TXT({ x:P(300), y:P(T - 76), w:P(238), h:P(34), align:"center", fontFace:NUM, fontSize:PT(26), bold:true, color:C.red }));
  s.addText("3.16, 14:00",    TXT({ x:P(758), y:P(T - 76), w:P(238), h:P(34), align:"center", fontFace:NUM, fontSize:PT(26), color:C.ink }));
  s.addText("과제물 제출 일시", TXT({ x:P(300), y:P(T + 34), w:P(238), h:P(32), align:"center", fontSize:PT(23), bold:true, color:C.red }));
  s.addText("본 강의",        TXT({ x:P(758), y:P(T + 34), w:P(238), h:P(32), align:"center", fontSize:PT(23), bold:true, color:C.ink }));
  s.addImage({ data:A.arc, x:P(392), y:P(T + 78), w:P(500), h:P(110) });
  s.addText("강의일 하루 전까지", TXT({ x:P(500), y:P(T + 96), w:P(280), h:P(26), align:"center", fontSize:PT(18), bold:true, color:"8A6C6A" }));
  s.addShape(pres.ShapeType.star12, { x:P(190), y:P(T - 40), w:P(80), h:P(80), fill:{ color:"5B7FBF" }, line:{ type:"none" } });
  s.addText("ex", TXT({ x:P(190), y:P(T - 40), w:P(80), h:P(80), align:"center", valign:"middle", fontFace:NUM, fontSize:PT(18), color:C.white }));
}

/* ══ 14. CHAPTER 4 ══════════════════════════════════════════════════ */
chapterSlide(4, "강의 요구 분석", "강의를 통해 무엇을 얻고자 하는지 설문조사로 알아보기");

/* ══ 15. 강의 요구 분석 ═════════════════════════════════════════════ */
{
  const s = contentSlide("강의 요구 분석", 15);
  s.addText("이번 강의를 통해 무엇을 얻고 싶은가요?", TXT({ x:P(52), y:P(82), w:P(900), h:P(46),
            fontSize:PT(34), bold:true, color:C.navy }));
  const qs = [["🧭","나의 진로 및 취업/창업 준비 정도는?"],
              ["❓","‘창업과 기업가정신’ 교과목을 수강하게 된 이유는? (중복응답 가능)"],
              ["📚","‘창업과 기업가정신’ 교과목을 통해 배웠으면 하는 내용은 무엇인가요?"],
              ["💬","‘창업과 기업가정신’ 교과목 담당 교수에게 바라는 점이 있다면?"]];
  qs.forEach(([emo, t], i) => {
    const x = 52 + (i % 2) * 588, y = 148 + Math.floor(i / 2) * 140;
    card(s, x, y, 576, 118, { fill:C.tint2, stroke:C.line });
    s.addText(emo, TXT({ x:P(x + 16), y:P(y + 40), w:P(44), h:P(40), fontSize:PT(30), align:"center" }));
    s.addText(t, TXT({ x:P(x + 70), y:P(y + 12), w:P(490), h:P(94), valign:"middle",
              fontSize:PT(18.5), color:C.ink, lineSpacingMultiple:1.35 }));
  });
  card(s, 52, 436, 1176, 100);
  leftRule(s, 52, 436, 100, C.deep);
  s.addText("설문 방법 안내", TXT({ x:P(80), y:P(452), w:P(500), h:P(30), fontSize:PT(20), bold:true, color:C.deep }));
  s.addText([{ text:"✅  ", options:{ fontSize:PT(16) } },
             ...runs("구글 설문지 링크 주소는 %%‘LMS의 과제방’%%에 게시함", { fontFace:KR, fontSize:PT(17), color:C.ink })],
            TXT({ x:P(80), y:P(488), w:P(600), h:P(30) }));
  s.addText([{ text:"강의 요구 분석 구글 설문지 주소  ", options:{ fontFace:KR, fontSize:PT(16), color:C.ink } },
             { text:"https://forms.gle/MFzxxUcyqWbqU7tr6", options:{ fontFace:KR, fontSize:PT(16), bold:true, color:C.deep, hyperlink:{ url:"https://forms.gle/MFzxxUcyqWbqU7tr6" } } }],
            TXT({ x:P(660), y:P(472), w:P(552), h:P(30), align:"right" }));
}

/* ══ 16. CHAPTER 5 ══════════════════════════════════════════════════ */
chapterSlide(5, "창업 인식도 조사", "창업에 대한 학습자들의 인식 정도를 파악하여 수업에 반영");

/* ══ 17. 창업 인식도 조사 ═══════════════════════════════════════════ */
{
  const s = contentSlide("창업 인식도 조사", 17);
  s.addText("창업교육 정책에 반영하고자 합니다.", TXT({ x:P(52), y:P(82), w:P(900), h:P(42),
            fontSize:PT(30), bold:true, color:C.navy }));
  s.addText("대학생 창업교육이 창업가 정신 및 진로준비행동에 미치는 영향에 대한 조사",
            TXT({ x:P(52), y:P(128), w:P(1000), h:P(28), fontSize:PT(19), bold:true, color:C.deep }));
  s.addText("* 본 설문은 통계법 33조(비밀의 보호)에 따라 개인정보는 통계목적으로만 사용·보호됩니다.",
            TXT({ x:P(52), y:P(164), w:P(1000), h:P(24), fontSize:PT(15), color:C.red }));
  s.addShape(pres.ShapeType.rect, { x:P(1146), y:P(160), w:P(82), h:P(28),
             fill:{ color:C.white }, line:{ color:C.line, width:1 } });
  s.addText("ID", TXT({ x:P(1146), y:P(160), w:P(82), h:P(28), align:"center", valign:"middle",
            fontFace:NUM, fontSize:PT(15), color:C.inkSoft, charSpacing:2 }));
  card(s, 52, 200, 1176, 320);
  s.addText([
    { text:"안녕하십니까? 귀하의 행복과 발전을 기원합니다.", options:{ breakLine:true } },
    { text:"4차 산업혁명시대의 도래와 함께 방송·예술분야에 대한 사회적 관심이 날로 확대되고 있습니다. 특히 4차 산업혁명은 방송(미디어)기술과 예술콘텐츠의 결합을 통한 신산업 창출을 가속화 할 것으로 예상됩니다.", options:{ breakLine:true } },
    { text:"이에 본교에서는 학생들의 취업 및 창업역량강화를 위해 LINC+ 사업의 일환으로 다양한 창업교육지원사업(방송예술 창업가 양성특강, 방송예술 창업가 양성 캠프, 지적재산권반 운영, 1인 예술가 양성 강좌 운영 등)과 창업보육지원사업(문화콘텐츠창업가육성, 창업교육센터 구축, 창업경진대회 등), 창업사업화지원사업(창업가 양성 정부사업 참여지원, 1인 예술가 벤치마킹지원, 창업교육센터활성화 등), 취업교육 및 취업지원사업(문화예술인 양성 강좌운영, 1인 예술가 채용오디션 등)을 전개하고 있습니다.", options:{ breakLine:true } },
    { text:"이에 본 설문은 창업 교과목이 창업가 정신 및 진로역량 강화에 미치는 효과를 측정하기 위해 작성되었습니다. 본 연구를 통해 도출된 결과물은 학생들의 창업교육 정책 결정에 의미 있게 활용될 것입니다. 여러분의 소중한 의견 주시면 감사하겠습니다." } ],
    TXT({ x:P(74), y:P(216), w:P(1132), h:P(292), fontSize:PT(16.5), color:C.ink,
          lineSpacingMultiple:1.5, paraSpaceAfter:PT(10) }));
  s.addText([{ text:"연구책임자 : 동아방송예술대학교 김성길 교수  ", options:{ fontFace:KR, fontSize:PT(16.5), bold:true, color:C.navy } },
             { text:"careerdima@gmail.com", options:{ fontFace:KR, fontSize:PT(16.5), color:C.deep, hyperlink:{ url:"mailto:careerdima@gmail.com" } } }],
            TXT({ x:P(400), y:P(532), w:P(828), h:P(28), align:"right" }));
}

/* ══ 18. 설문 방법 안내 ═════════════════════════════════════════════ */
{
  const s = contentSlide("창업 인식도 조사", 18);
  s.addText("설문 방법 안내", TXT({ x:P(52), y:P(88), w:P(700), h:P(46), fontSize:PT(34), bold:true, color:C.navy }));
  s.addImage({ data:A.check, x:P(52), y:P(164), w:P(32), h:P(32) });
  s.addText([...runs("구글 설문지 링크 주소는 %%‘LMS의 과제방’%%에 게시함 ", { fontFace:KR, fontSize:PT(23), bold:true, color:C.ink }),
             { text:"(OT 종결 후 업로드)", options:{ fontFace:KR, fontSize:PT(15), color:C.inkSoft } }],
            TXT({ x:P(98), y:P(158), w:P(1100), h:P(40) }));
  card(s, 52, 250, 940, 116);
  leftRule(s, 52, 250, 116, C.deep);
  s.addText("📝", TXT({ x:P(80), y:P(288), w:P(48), h:P(44), fontSize:PT(30) }));
  s.addText("Y4반 창업교육 영향 조사 구글 설문지 주소", TXT({ x:P(146), y:P(272), w:P(800), h:P(30),
            fontSize:PT(20), bold:true, color:C.navy }));
  s.addText("https://forms.gle/puGT1NQXUyzc8ASeA", TXT({ x:P(146), y:P(310), w:P(800), h:P(30),
            fontSize:PT(18), bold:true, color:C.deep, hyperlink:{ url:"https://forms.gle/puGT1NQXUyzc8ASeA" } }));
}

/* ══ 19. 생성형 AI 사용 지침 (신설) ═════════════════════════════════ */
{
  const s = contentSlide("생성형 AI 사용 지침", 19);
  s.addShape(pres.ShapeType.rect, { x:P(46), y:P(80), w:P(1188), h:P(52), fill:{ color:C.deep }, line:{ type:"none" } });
  s.addText("📚", TXT({ x:P(68), y:P(93), w:P(34), h:P(30), fontSize:PT(22) }));
  s.addText([{ text:"0. ", options:{ fontFace:NUM, fontSize:PT(19), bold:true, color:C.yellow } },
             { text:"모든 과제 및 발표자료, 팀프로젝트", options:{ fontSize:PT(19), bold:true, color:C.yellow } },
             { text:"에 적용한다.", options:{ fontSize:PT(19), bold:true, color:C.white } }],
            TXT({ x:P(112), y:P(80), w:P(1000), h:P(52), valign:"middle" }));
  const rules = [
    ["1","📝","초안 작성","초안본 작성에는 %%생성형 AI 사용을 허용%%한다.", null],
    ["2","✍️","사람의 몫","~~핵심 아이디어, 최종 분석과 결론~~은 반드시 사람이 직접 작성해야 한다.", null],
    ["3","🔍","출처 표기","생성형 AI 사용 시 %%서비스 종류 · 활용 목적 · 활용 범위%%를 명시하고 출처를 표기한다.",
      "사용한 ~~프롬프트를 반드시 제시~~해야 한다 (메타 프롬프트 포함)."],
    ["4","🔄","재해석","AI 답변을 그대로 쓰지 않고 %%재해석 · 변형하여 발전%%시킨다.", null],
    ["5","⚠️","책임 고지","지침 위반 시 ~~모든 불이익은 작성자인 담당자~~에게 있음을 고지한다.", null] ];
  let y = 146;
  rules.forEach(([n, emo, tag, body, sub]) => {
    const h = sub ? 106 : 78;
    card(s, 46, y, 654, h);
    leftRule(s, 46, y, h, C.deep);
    s.addShape(pres.ShapeType.ellipse, { x:P(64), y:P(y + 12), w:P(28), h:P(28), fill:{ color:C.deep }, line:{ type:"none" } });
    s.addText(n, TXT({ x:P(64), y:P(y + 12), w:P(28), h:P(28), align:"center", valign:"middle",
              fontFace:NUM, fontSize:PT(15), bold:true, color:C.white }));
    s.addText(tag, TXT({ x:P(102), y:P(y + 9), w:P(300), h:P(20), fontSize:PT(13), bold:true, color:C.deep }));
    s.addText(runs(body, { fontFace:KR, fontSize:PT(16.5), color:C.ink }),
              TXT({ x:P(102), y:P(y + 30), w:P(520), h:P(42), lineSpacingMultiple:1.3 }));
    if (sub) {
      s.addShape(pres.ShapeType.rect, { x:P(116), y:P(y + 74), w:P(2), h:P(22), fill:{ color:C.line }, line:{ type:"none" } });
      s.addText(runs("• " + sub, { fontFace:KR, fontSize:PT(15), color:C.ink }),
                TXT({ x:P(126), y:P(y + 74), w:P(500), h:P(24) }));
    }
    s.addText(emo, TXT({ x:P(636), y:P(y + 14), w:P(40), h:P(32), fontSize:PT(22), align:"center" }));
    y += h + 9;
  });
  // 3단계 흐름 — 네이티브 도형
  const FX = 724, FY = 176, BW = 148, BH = 104;
  const steps = [
    ["STEP 1", "AI 초안", "생성형 AI 사용", "허용", "DEEBF7", C.line, C.navy, C.ink, C.blue],
    ["STEP 2", "재해석 · 변형", "그대로 쓰지 않는다", "필수", "4BA3E3", "2E8BD4", C.white, "EAF4FC", C.white],
    ["STEP 3", "핵심 · 결론", "아이디어 · 최종 분석", "사람이 직접 작성", "005BAC", "003F7D", C.white, "D6E8F7", C.yellow] ];
  steps.forEach(([st, t1, t2, t3, fill, stroke, c1, c2, c3], i) => {
    const x = FX + i * 180;
    s.addText(st, TXT({ x:P(x), y:P(FY - 24), w:P(BW), h:P(20), align:"center",
              fontFace:NUM, fontSize:PT(13), bold:true, color:C.blue, charSpacing:1 }));
    s.addShape(pres.ShapeType.roundRect, { x:P(x), y:P(FY), w:P(BW), h:P(BH), rectRadius:0.08,
               fill:{ color:fill }, line:{ color:stroke, width:1.5 } });
    s.addText(t1, TXT({ x:P(x), y:P(FY + 16), w:P(BW), h:P(28), align:"center", fontSize:PT(19), bold:true, color:c1 }));
    s.addText(t2, TXT({ x:P(x), y:P(FY + 48), w:P(BW), h:P(22), align:"center", fontSize:PT(14), color:c2 }));
    s.addText(t3, TXT({ x:P(x), y:P(FY + 72), w:P(BW), h:P(24), align:"center", fontSize:PT(15), bold:true, color:c3 }));
    if (i < 2) s.addShape(pres.ShapeType.rightArrow, { x:P(x + BW + 6), y:P(FY + 42), w:P(20), h:P(20),
                          fill:{ color:C.blue }, line:{ type:"none" } });
  });
  s.addShape(pres.ShapeType.roundRect, { x:P(FX), y:P(FY + 128), w:P(508), h:P(72), rectRadius:0.08,
             fill:{ color:C.white }, line:{ color:C.red, width:1.5, dashType:"dash" } });
  s.addText("전 과정 기록 · 출처 표기", TXT({ x:P(FX), y:P(FY + 138), w:P(508), h:P(24), align:"center", fontSize:PT(15), bold:true, color:C.red }));
  s.addText("서비스 종류 · 활용 목적 · 활용 범위", TXT({ x:P(FX), y:P(FY + 162), w:P(508), h:P(20), align:"center", fontSize:PT(14), color:C.ink }));
  s.addText("사용한 프롬프트(메타 프롬프트 포함)", TXT({ x:P(FX), y:P(FY + 180), w:P(508), h:P(20), align:"center", fontSize:PT(14), bold:true, color:C.ink }));
  // 출처 표기 양식
  card(s, FX, 410, 508, 160, { fill:C.tint2, stroke:C.line });
  s.addText([{ text:"📋  ", options:{ fontSize:PT(15) } },
             { text:"출처 표기 양식 ", options:{ fontFace:KR, fontSize:PT(14.5), bold:true, color:C.navy } },
             { text:"(과제 끝에 붙여 제출)", options:{ fontFace:KR, fontSize:PT(14.5), color:C.inkSoft } }],
            TXT({ x:P(FX + 17), y:P(420), w:P(474), h:P(22) }));
  s.addText("[생성형 AI 활용 표기]\n· 사용 서비스 : [서비스명 / 모델명]\n· 활용 목적   : [자료 조사 · 초안 작성 · 문장 다듬기 …]\n· 활용 범위   : [예: 2장 초안, 전체의 약 20%]\n· 사용 프롬프트 : [입력한 프롬프트 전문 · 메타 프롬프트 포함]",
            TXT({ x:P(FX + 17), y:P(448), w:P(474), h:P(116), fontFace:"Consolas", fontSize:PT(13.5),
                  color:C.ink, lineSpacingMultiple:1.32 }));
  s.addNotes("원본 1주차 자료에는 없던 신설 페이지. 학생 생성형 AI 사용 지침 6개 항(0~5)을 한 장에 담았다.");
}

/* ══ 20. 다음 차시 안내 ═════════════════════════════════════════════ */
{
  const s = chapterSlide(null, "다음 차시 안내",
                         "제1강 창업과 기업가 정신\n(기업가정신의 개념, 기업가 정신의 구성요소)", "next");
  s.addText("미래의 세대는 창업으로 기업가 정신이 필요하다.\n기업가 정신의 개념과 기업가 정신의 구성요소를 확인한다.",
            TXT({ x:P(512), y:P(78), w:P(716), h:P(120), align:"right", fontSize:PT(23),
                  bold:true, italic:true, color:C.white, lineSpacingMultiple:1.9 }));
}

pres.writeFile({ fileName: OUT }).then(() => console.log("wrote", OUT));
