const CATS = window.CATEGORIES;
// ========== كشف نوع الجهاز ==========
const isMobile = window.innerWidth <= 768;
const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
const isDesktop = window.innerWidth > 1024;

// ========== إذا كان هاتف أو آيباد، أعد ترتيب الواجهة ==========
if (isMobile || isTablet) {
  // حفظ المحتوى القديم مؤقتاً
  const oldContent = document.body.innerHTML;
  
  // إنشاء هيكل جديد للشاشات الصغيرة
  const appDiv = document.createElement('div');
  appDiv.className = 'mobile-app';
  appDiv.innerHTML = `
    <div class="globe-area">
      <div class="globe-wrap"><div id="globe"></div></div>
    </div>
    <div class="news-area">
      <div class="filter-bar" id="mobile-filter-bar"></div>
      <div class="news-list" id="mobile-news-list"></div>
      <div class="bottom-tabs">
        <div class="tab-icon active" data-tab="news">📰 الأخبار</div>
        <div class="tab-icon" data-tab="map">🗺️ الخريطة</div>
      </div>
    </div>
  `;
  
  document.body.innerHTML = '';
  document.body.appendChild(appDiv);
  document.body.style.overflow = 'hidden';
  document.body.style.background = '#02040a';
}
const CITIES = window.CITIES;
const GNEWS_API_KEY = window.GNEWS_API_KEY;
const GNEWS_BASE_URL = window.GNEWS_BASE_URL;
const COUNTRY_CODES = window.COUNTRY_CODES;
let events = [];
let activeFilters = new Set(Object.keys(CATS));
let globe = null;
let lastNewsIds = new Set();
let eventCount24h = 0;
let regionCount = 0;
let userInteracted = false;
let autoRotate = true;
let currentView = 'live';
let streamingIndex = 0;
let streamingTimer = null;
let activeFeedFilter='all';
let feedCounts={all:0,conflict:0,dispute:0,political:0,economic:0,combat:0};
let newBadgeTimers={conflict:null,dispute:null,political:null,economic:null,combat:null};
let wsConnection=null;
let activeKeywordFilter=null;
function searchByKeywords(){
const input=document.getElementById('keyword-input');
const keywords=input.value.trim().toLowerCase().split(',').map(k=>k.trim()).filter(k=>k);
if(keywords.length===0){
clearKeywordFilter();
return;
}
activeKeywordFilter=keywords;
filterFeedByKeywords();
console.log('[Keywords] البحث عن:',keywords);
}
function filterFeedByKeywords(){
const scroll=document.querySelector('.feed-scroll');
const allItems=Array.from(scroll.querySelectorAll('.feed-item'));
allItems.forEach(item=>{
const title=item.dataset.title||'';
const matchedEvent=events.find(e=>e.title===title);
if(!matchedEvent){
item.classList.add('feed-hidden');
return;
}
const text=(matchedEvent.title+' '+matchedEvent.sum).toLowerCase();
const match=activeKeywordFilter.some(kw=>text.includes(kw));
if(match){
item.classList.remove('feed-hidden');
}else{
item.classList.add('feed-hidden');
}
});
updateVisibleFeedCount();
}
function clearKeywordFilter(){
activeKeywordFilter=null;
const scroll=document.querySelector('.feed-scroll');
const allItems=Array.from(scroll.querySelectorAll('.feed-item'));
allItems.forEach(item=>item.classList.remove('feed-hidden'));
document.getElementById('keyword-input').value='';
updateVisibleFeedCount();
console.log('[Keywords] تم إلغاء البحث');
}
const LIVE_STREAMS=[
{name:'الجزيرة',url:'https://www.youtube.com/embed/bNyUyrR0PHo',type:'youtube'},
{name:'العربي مباشر',url:'https://www.youtube.com/embed/e2RgSa1Wt5o',type:'youtube'},
{name:'الميادين مباشر',url:'https://www.youtube.com/embed/Ca0fSZ2E-ZQ',type:'youtube'},
{name:'Middle East Cameras',url:'https://www.youtube.com/embed/oxT5R6I0N6E',type:'youtube'},
{name:'Israel Live Cams',url:'https://www.youtube.com/embed/KSwPNkzEgxg',type:'youtube'}
];
let currentStreamIndex=0;
function loadLiveStream(){
const stream=LIVE_STREAMS[currentStreamIndex];
const iframe=document.getElementById('youtube-player');
if(!iframe) return;
if(stream.type==='youtube'){
iframe.src=stream.url+'?autoplay=1';
}else{
iframe.src=stream.url;
}
document.querySelector('.stream-switch-btn').textContent=`${stream.name} ⟳`;
console.log('[Live Stream] تحميل:',stream.name);
}
function switchStream(){
currentStreamIndex=(currentStreamIndex+1)%LIVE_STREAMS.length;
loadLiveStream();
}
function initWebSocket(){
try{
const protocol=window.location.protocol==='https:'?'wss:':'ws:';
const WS_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `${protocol}//${window.location.host}`
  : `wss://${window.location.host}`;
wsConnection=new WebSocket(WS_BASE_URL);
wsConnection.addEventListener('open',()=>{
console.log('[WebSocket] متصل بالسيرفر');
});
wsConnection.addEventListener('message',(event)=>{
try{
const msg=JSON.parse(event.data);
if(msg.type==='news-update'){
const newArticles=msg.data||[];
if(newArticles.length>0){
const converted=convertGNewsToEvents(newArticles);
converted.forEach(e=>{
const existing=events.find(ex=>ex.title===e.title);
if(!existing){
addFeedItem(e);
updateGlobalThreatLevel();
}
});
}
}
}catch(e){
console.error('[WebSocket] خطأ في المعالجة:',e);
}
});
wsConnection.addEventListener('close',()=>{
console.log('[WebSocket] قطع الاتصال - إعادة الاتصال بعد 5 ثواني...');
setTimeout(initWebSocket,5000);
});
wsConnection.addEventListener('error',(err)=>{
console.error('[WebSocket] خطأ:',err);
});
}catch(e){
console.error('[WebSocket] خطأ في الإنشاء:',e);
}
}
const FEED_FILTER_KEYWORDS={
conflict:['invasion','war','missile','airstrike','attack','bombing','offensive','combat','troops','تنازع','صراع','حرب','هجوم','قصف','صاروخ','غارة','عسكر','معركة','اشتباك','دبابة','طائرة','جبهة','ضربة'],
dispute:['tension','dispute','border','standoff','crisis','confrontation','نزاع','توتر','أزمة','حدود','مواجهة','توتر'],
political:['sanctions','diplomatic','election','summit','government','parliament','سياسة','عقوبات','دبلوماسي','انتخاب','حكومة','قمة','وزير','رئيس','مفاوضات','اتفاق','قرار'],
economic:['oil','market','trade','economy','financial','اقتصاد','نفط','سوق','تجارة','مالي','استثمار','صادرات','بورصة','أسهم','تجارة'],
combat:['killed','wounded','casualties','clashes','firefight','assault','قتالية','قتلى','جرحى','اشتباك','هجوم','اقتحام','ضحايا','إصابات','ضربة','استهداف'],
telegram:['telegram','تليجرام','@','قناة','رسالة','منشور']
};
function matchesFeedFilter(event,filter){
if(filter==='all') return true;
const eventCategory=event.cat;
const categoryMap={
'تنازع':'conflict',
'سياسة':'political',
'اقتصاد':'economic',
'تكنولوجيا':'technology',
'مناخ':'climate'
};
const mappedCat=categoryMap[eventCategory]||eventCategory.toLowerCase();
if(filter==='conflict') return mappedCat==='تنازع'||mappedCat==='conflict'||mappedCat==='dispute';
if(filter==='dispute') return mappedCat==='تنازع'||mappedCat==='dispute';
if(filter==='political') return mappedCat==='سياسة'||mappedCat==='political';
if(filter==='economic') return mappedCat==='اقتصاد'||mappedCat==='economic';
if(filter==='combat') return event.threat==='CRITICAL'||event.threat==='HIGH'||event.threat==='ELEVATED';
if(filter==='telegram') return event.source&&event.source.includes('Telegram');
return false;
}
function updateAllFeedBadges(){
const scroll=document.querySelector('.feed-scroll');
const allItems=Array.from(scroll.querySelectorAll('.feed-item'));
feedCounts={all:0,conflict:0,dispute:0,political:0,economic:0,combat:0,telegram:0};
allItems.forEach(item=>{
const title=item.dataset.title||'';
const matchedEvent=events.find(e=>e.title===title);
if(!matchedEvent) return;
feedCounts.all++;
const eventCategory=matchedEvent.cat;
if(eventCategory==='تنازع'){
feedCounts.conflict++;
}else if(eventCategory==='سياسة'){
feedCounts.political++;
}else if(eventCategory==='اقتصاد'){
feedCounts.economic++;
}else if(eventCategory==='تكنولوجيا'){
feedCounts.combat++;
}else{
feedCounts.political++;
}
if(matchedEvent.source&&matchedEvent.source.includes('Telegram')){
feedCounts.telegram++;
}
});
Object.keys(feedCounts).forEach(key=>{
const badge=document.getElementById(`fbadge-${key}`);
if(badge){
badge.textContent=String(feedCounts[key]).padStart(2,'0');
}
});
updateVisibleFeedCount();
}
function updateVisibleFeedCount(){
const scroll=document.querySelector('.feed-scroll');
if(activeFeedFilter==='all'){
const visible=scroll.querySelectorAll('.feed-item:not(.feed-hidden)').length;
const feedCountEl=document.getElementById('feed-count');
if(feedCountEl) feedCountEl.textContent=String(visible).padStart(2,'0');
}else{
const visible=scroll.querySelectorAll('.feed-item:not(.feed-hidden)').length;
const feedCountEl=document.getElementById('feed-count');
if(feedCountEl) feedCountEl.textContent=String(visible).padStart(2,'0');
}
}
function setFeedFilter(filter){
activeFeedFilter=filter;
document.querySelectorAll('.feed-filter-btn').forEach(btn=>{
btn.classList.toggle('factive',btn.dataset.feedFilter===filter);
});
const scroll=document.querySelector('.feed-scroll');
const allItems=Array.from(scroll.querySelectorAll('.feed-item'));
allItems.forEach(item=>{
const title=item.dataset.title||'';
const matchedEvent=events.find(e=>e.title===title);
if(!matchedEvent) return;
const show=matchesFeedFilter(matchedEvent,filter);
if(show){
item.classList.remove('feed-hidden');
}else{
item.classList.add('feed-hidden');
}
});
updateVisibleFeedCount();
}
function showNewBadge(filter){
const btn=document.querySelector(`[data-feed-filter="${filter}"]`);
if(!btn) return;
btn.classList.add('has-new');
if(newBadgeTimers[filter]){
clearTimeout(newBadgeTimers[filter]);
}
newBadgeTimers[filter]=setTimeout(()=>{
btn.classList.remove('has-new');
newBadgeTimers[filter]=null;
},3000);
}
function addFeedItem(e){
const scroll=document.querySelector('.feed-scroll');
const f=CITIES[e.from]||{name:"",cc:""};
const t=CITIES[e.to]||{name:"",cc:""};
const c=CATS[e.cat]||{color:"#ff3860",label:e.threat||"MIL"};
const existingItem=scroll.querySelector(`[data-title="${CSS.escape(e.title)}"]`);
if(existingItem) return;
const div=document.createElement('div');
div.className='feed-item feed-entering';
div.dataset.title=e.title;
div.style.setProperty('--cat-color',c.color);
div.innerHTML=`
<div class="feed-head">
<span class="feed-cat">
<span class="d" style="background:${c.color};color:${c.color}"></span>
${c.label}
</span>
<span class="feed-time">${e.threat}</span>
</div>
<div class="feed-title">${e.title}</div>
<div class="feed-route">
<span>${e.source}</span>
</div>
`;
div.addEventListener('click',()=>{
showDetail(e);
if(globe){
userInteracted=true;
globe.controls().autoRotate=false;
const targetCity=CITIES[e.to];
if(targetCity){
globe.pointOfView({
lat:targetCity.lat,
lng:targetCity.lng,
altitude:1.6
},800);
}
}
});
scroll.prepend(div);
const allItems=Array.from(scroll.querySelectorAll('.feed-item'));
allItems.sort((a,b)=>{
const eventA=events.find(ev=>ev.title===a.dataset.title);
const eventB=events.find(ev=>ev.title===b.dataset.title);
return(eventB?.timestamp||0)-(eventA?.timestamp||0);
});
allItems.forEach(item=>{
scroll.appendChild(item);
});
updateAllFeedBadges();
Object.keys(FEED_FILTER_KEYWORDS).forEach(filter=>{
if(matchesFeedFilter(e,filter)){
showNewBadge(filter);
}
});
if(activeFeedFilter!=='all'){
setFeedFilter(activeFeedFilter);
}
}
const COUNTRIES = [
  { iso: 'USA', name: 'الولايات المتحدة', lat: 39.8, lng: -98.6 },
  { iso: 'CAN', name: 'كندا',        lat: 56.1, lng: -106.3 },
  { iso: 'MEX', name: 'المكسيك',        lat: 23.6, lng: -102.5 },
  { iso: 'BRA', name: 'البرازيل',        lat: -10.4, lng: -52.9 },
  { iso: 'ARG', name: 'الأرجنتين',     lat: -34.6, lng: -63.6 },
  { iso: 'UK',  name: 'المملكة المتحدة',lat: 54.0, lng: -2.0 },
  { iso: 'DE',  name: 'ألمانيا',       lat: 51.2, lng: 10.4 },
  { iso: 'FR',  name: 'فرنسا',        lat: 46.6, lng: 2.2 },
  { iso: 'ES',  name: 'إسبانيا',         lat: 40.5, lng: -3.7 },
  { iso: 'IT',  name: 'إيطاليا',        lat: 41.9, lng: 12.6 },
  { iso: 'PL',  name: 'بولندا',        lat: 51.9, lng: 19.1 },
  { iso: 'SE',  name: 'السويد',        lat: 60.1, lng: 18.6 },
  { iso: 'NO',  name: 'النرويج',        lat: 60.5, lng: 8.5 },
  { iso: 'RU',  name: 'روسيا',        lat: 61.5, lng: 95.0 },
  { iso: 'UA',  name: 'أوكرانيا',       lat: 48.4, lng: 31.2 },
  { iso: 'TR',  name: 'تركيا',        lat: 38.9, lng: 35.2 },
  { iso: 'EG',  name: 'مصر',         lat: 26.8, lng: 30.8 },
  { iso: 'SA',  name: 'المملكة العربية السعودية',  lat: 23.9, lng: 45.1 },
  { iso: 'IR',  name: 'إيران',          lat: 32.4, lng: 53.7 },
  { iso: 'IL',  name: 'إسرائيل',        lat: 31.0, lng: 34.9 },
  { iso: 'IN',  name: 'الهند',         lat: 22.3, lng: 78.9 },
  { iso: 'CN',  name: 'الصين',         lat: 35.9, lng: 104.2 },
  { iso: 'JP',  name: 'اليابان',        lat: 36.2, lng: 138.3 },
  { iso: 'KR',  name: 'كوريا الجنوبية',   lat: 36.5, lng: 127.9 },
  { iso: 'TW',  name: 'تايوان',        lat: 23.7, lng: 121.0 },
  { iso: 'VN',  name: 'فيتنام',       lat: 14.1, lng: 108.3 },
  { iso: 'TH',  name: 'تايلاند',      lat: 15.9, lng: 101.0 },
  { iso: 'ID',  name: 'إندونيسيا',     lat: -2.5, lng: 118.0 },
  { iso: 'AU',  name: 'أستراليا',     lat: -25.3, lng: 133.8 },
  { iso: 'NZ',  name: 'نيوزيلندا',   lat: -40.9, lng: 174.9 },
  { iso: 'ZA',  name: 'جنوب أفريقيا',  lat: -30.6, lng: 22.9 },
  { iso: 'NG',  name: 'نيجيريا',       lat: 9.1, lng: 8.7 },
  { iso: 'KE',  name: 'كينيا',         lat: -0.0, lng: 37.9 },
  { iso: 'ET',  name: 'إثيوبيا',      lat: 9.1, lng: 40.5 },
  { iso: 'MA',  name: 'المغرب',       lat: 31.8, lng: -7.1 },
  { iso: 'PK',  name: 'باكستان',      lat: 30.4, lng: 69.3 },
  { iso: 'BD',  name: 'بنغلاديش',    lat: 23.7, lng: 90.4 },
  { iso: 'PH',  name: 'الفلبين',   lat: 12.9, lng: 121.8 },
  { iso: 'MY',  name: 'ماليزيا',      lat: 4.2, lng: 101.9 },
  { iso: 'SG',  name: 'سنغافورة',     lat: 1.4, lng: 103.8 },
];
const bootLines = [
  'جاري التهيئة...',
  'جلب البيانات...',
  'تحميل الخريطة...',
  'الاتصال بالسيرفر...',
  'تحضير الواجهة...',
  'جاهز للعمل!',
];
async function fetchMilitaryNews() {
  try {
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://127.0.0.1:3000' 
      : `https://${window.location.hostname}`;
    const response = await fetch(`${API_BASE_URL}/api/news`);
    if (!response.ok) return [];
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("خطأ في جلب الأخبار من السيرفر المحلي:", error);
    return [];
  }
}
function categorizeByCategoryKeywords(title,description,gnewsCategory){
const text=(title+' '+description).toLowerCase();
const combatKeywords=['killed','wounded','casualties','clashes','firefight','assault','قتالية','قتلى','جرحى','اشتباك','هجوم','اقتحام','ضحايا','إصابات','ضربة','استهداف'];
const conflictKeywords=['invasion','war','missile','airstrike','attack','bombing','offensive','combat','troops','تنازع','صراع','حرب','هجوم','قصف','صاروخ','غارة','عسكر','معركة','اشتباك','دبابة','طائرة'];
const disputeKeywords=['tension','dispute','border','standoff','crisis','confrontation','نزاع','توتر','أزمة','حدود','مواجهة'];
const politicalKeywords=['sanctions','diplomatic','election','summit','government','parliament','سياسة','عقوبات','دبلوماسي','انتخاب','حكومة','قمة','وزير','رئيس','مفاوضات','اتفاق'];
const economicKeywords=['oil','market','trade','economy','financial','اقتصاد','نفط','سوق','تجارة','مالي','استثمار','صادرات','بورصة','أسهم'];
if(combatKeywords.some(kw=>text.includes(kw))) return 'تنازع';
if(conflictKeywords.some(kw=>text.includes(kw))) return 'تنازع';
if(disputeKeywords.some(kw=>text.includes(kw))) return 'تنازع';
if(politicalKeywords.some(kw=>text.includes(kw))) return 'سياسة';
if(economicKeywords.some(kw=>text.includes(kw))) return 'اقتصاد';
if(gnewsCategory==='world') return 'تنازع';
if(gnewsCategory==='nation') return 'سياسة';
if(gnewsCategory==='business') return 'اقتصاد';
if(gnewsCategory==='technology') return 'تكنولوجيا';
if(gnewsCategory==='science') return 'مناخ';
return 'سياسة';
}
function getRandomCityCode() {
  const cityCodes = Object.keys(CITIES);
  return cityCodes[Math.floor(Math.random() * cityCodes.length)];
}
function convertGNewsToEvents(articles){
  const newEvents=[];
  let idCounter=1;
  for(const article of articles){
  const category=categorizeByCategoryKeywords(
  article.title||'',
  article.description||'',
  article.gnewsCategory
  );
  const publishedAt=new Date(article.publishedAt);
  const now=new Date();
  const diffMs=now-publishedAt;
  const diffMins=Math.floor(diffMs/60000);
  const fromCity=getRandomCityCode();
  let toCity=getRandomCityCode();
  while(toCity===fromCity){
  toCity=getRandomCityCode();
  }
  newEvents.push({
  id:idCounter++,
  cat:category,
  from:fromCity,
  to:toCity,
  mins:diffMins,
  title:article.title||'خبر عاجل',
  sum:article.description||article.content||'لا يوجد ملخص متاح',
  source:article.source?.name||'مصدر إخباري',
  url:article.url||'#',
  image:article.image||null,
  _new:false,
  timestamp:publishedAt.getTime()
  });
  }
  newEvents.sort((a,b)=>b.timestamp-a.timestamp);
  return newEvents;
}
async function loadRealNews(){
  const articles=await fetchMilitaryNews();
  if(articles.length>0){
  const newConverted=convertGNewsToEvents(articles);
  const newIds=new Set(newConverted.map(e=>e.title));
  const hasNew=[...newIds].some(id=>!lastNewsIds.has(id));
  if(hasNew&&events.length>0){
  newConverted.slice(0,3).forEach((evt,idx)=>{
  setTimeout(()=>showNewsNotification(evt),idx*500);
  });
  }
  const scroll=document.querySelector('.feed-scroll');
  const existingItems=new Set(Array.from(scroll.querySelectorAll('.feed-item')).map(item=>item.dataset.title));
  newConverted.forEach(e=>{
  if(!existingItems.has(e.title)){
  addFeedItem(e);
  }
});
events=newConverted;
  updateGlobalThreatLevel();
  const hasCritical=events.some(e=>e.threat==="CRITICAL");
  const breakingBar=document.getElementById("breaking-bar");
  if(breakingBar){
  breakingBar.style.display=hasCritical?"block":"none";
  }
  lastNewsIds=newIds;
  eventCount24h=events.length;
  regionCount=new Set(events.map(e=>e.from)).size;
  startStreamingFeed();
  renderCategories();
  renderTicker();
  rebuildPoints();
  updateAllFeedBadges();
  tween(document.getElementById('stat-events'),eventCount24h);
  tween(document.getElementById('stat-regions'),regionCount);
  
  }
}
function runBoot() {
  const bar = document.querySelector('.boot-progress-bar');
  const log = document.querySelector('.boot-log');
  let i = 0;
  const tick = () => {
    if (i >= bootLines.length) {
      bar.style.width = '100%';
      setTimeout(() => {
        document.querySelector('.boot').classList.add('hide');
        initGlobe();
        startLoops();
        setTimeout(() => document.querySelector('.boot').remove(), 900);
      }, 380);
      return;
    }
    const pct = Math.round(((i + 1) / bootLines.length) * 100);
    bar.style.width = pct + '%';
    log.innerHTML = '<b>› </b>' + bootLines[i];
    i++;
    setTimeout(tick, 340 + Math.random() * 160);
  };
  tick();
}
function initGlobe() {
  const el = document.getElementById('globe');
  globe = Globe()(el)
    .width(el.clientWidth)
    .height(el.clientHeight)
    .backgroundColor('#00000000')
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
    .showAtmosphere(true)
    .atmosphereColor('#4cc9f0')
    .atmosphereAltitude(0.32);
  globe
  .hexBinPointsData([])
  .hexBinPointWeight('weight')
  .hexBinResolution(3)
  .hexTopColor(()=>'rgba(76,201,240,0.7)')
  .hexSideColor(()=>'rgba(76,201,240,0.4)')
  .hexAltitude(0.05);    
  globe
    .arcsData([])
    .arcColor('color')
    .arcStroke(0.45)
    .arcDashLength(0.4)
    .arcDashGap(0.18)
    .arcDashAnimateTime(() => 2600 + Math.random() * 1200)
    .arcAltitudeAutoScale(0.48);
  rebuildPoints();
  globe
    .pointColor('color')
    .pointAltitude(0)
    .pointRadius('radius')
    .pointsMerge(false)
    .pointLabel(d => tooltipHtml(d))
    .onPointClick(d => {
      userInteracted = true;
      globe.controls().autoRotate = false;
      globe.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.4 }, 900);
      const evt = events.find(e => e.to === d.code || e.from === d.code);
      if (evt) showDetail(evt);
    });
  const ringCities = Object.keys(CITIES).slice(0, 18).map(k => {
    const c = CITIES[k];
    return { lat: c.lat, lng: c.lng, maxR: 3.5, propagation: 2.2, repeat: 1600 + Math.random() * 1200 };
  });
  globe
    .ringsData(ringCities)
    .ringColor(() => t => `rgba(76, 201, 240, ${Math.sqrt(1 - t)})`)
    .ringMaxRadius('maxR')
    .ringPropagationSpeed('propagation')
    .ringRepeatPeriod('repeat');
  globe
    .htmlElementsData(COUNTRIES)
    .htmlAltitude(0.01)
    .htmlElement(d => {
      const el = document.createElement('div');
      el.className = 'country-label';
      el.innerHTML = `<span class="iso">${d.iso}</span><span class="cname">${d.name}</span>`;
      el.dataset.lat = d.lat;
      el.dataset.lng = d.lng;
      return el;
    })
    .htmlTransitionDuration(0);
  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.2;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 180;
  controls.maxDistance = 600;
  const killAuto = () => {
    if (userInteracted) return;
    userInteracted = true;
    autoRotate = false;
    controls.autoRotate = false;
    updateAutoBtn();
  };
  el.addEventListener('mousedown', killAuto);
  el.addEventListener('touchstart', killAuto, { passive: true });
  el.addEventListener('wheel', killAuto, { passive: true });
  const scene = globe.scene();
  scene.background = null;
  globe.pointOfView({ lat: 30, lng: 15, altitude: 2.2 }, 0);
  let lastAlt = 2.2;
  function labelZoomLoop() {
    const pov = globe.pointOfView();
    const alt = pov.altitude;
    if (Math.abs(alt - lastAlt) > 0.02) {
      lastAlt = alt;
      const op = Math.max(0.15, Math.min(1, (3.2 - alt) / 2.0));
      const scale = Math.max(0.6, Math.min(1.15, (3.2 - alt) / 1.8));
      document.querySelectorAll('.country-label').forEach(l => {
        l.style.opacity = op;
        l.style.transform = (l.style.transform || '').replace(/scale\([^)]*\)/, '') + ` scale(${scale.toFixed(2)})`;
      });
    }
    requestAnimationFrame(labelZoomLoop);
  }
  requestAnimationFrame(labelZoomLoop);
  window.addEventListener('resize', () => {
    globe.width(el.clientWidth);
    globe.height(el.clientHeight);
  });
}
function tooltipHtml(d) {
  return `
    <div class="tooltip">
      <div class="tt-city">${d.city}</div>
      <div class="tt-coord">${d.lat.toFixed(2)}° ${d.lat >= 0 ? 'شمال' : 'جنوب'} · ${d.lng.toFixed(2)}° ${d.lng >= 0 ? 'شرق' : 'غرب'}</div>
      <div class="tt-row"><span>الأحداث</span><b>${d.count}</b></div>
      <div class="tt-row"><span>السائد</span><b style="color:${d.color}">${d.cat.toUpperCase()}</b></div>
    </div>`;
}

function generateHeatmapData(){
const heatPoints=[];
const regionBuckets={};
events.forEach(e=>{
if(!activeFilters.has(e.cat)) return;
const weight=e.threat==="CRITICAL"?5:e.threat==="HIGH"?3:e.threat==="ELEVATED"?2:1;
[e.from,e.to].forEach(code=>{
const city=CITIES[code];
if(!city) return;
const key=`${Math.floor(city.lat/2)}_${Math.floor(city.lng/2)}`;
if(!regionBuckets[key]){
regionBuckets[key]={lat:city.lat,lng:city.lng,weight:0,count:0};
}
regionBuckets[key].weight+=weight;
regionBuckets[key].count++;
});
});
Object.values(regionBuckets).forEach(bucket=>{
const intensity=Math.min(1,bucket.weight/20);
heatPoints.push({
lat:bucket.lat,
lng:bucket.lng,
weight:bucket.weight,
altitude:0.01,
radius:Math.min(8,2+bucket.count*0.8),
color:getHeatColor(intensity)
});
});
return heatPoints;
}
function getHeatColor(intensity){
if(intensity>0.8) return [255,20,20];
if(intensity>0.6) return [255,100,20];
if(intensity>0.4) return [255,180,20];
if(intensity>0.2) return [76,201,240];
return [6,214,160];
}
function rebuildPoints(){
  if(!globe) return;
  const buckets={};
  events.forEach(e=>{
  if(!activeFilters.has(e.cat)) return;
  [e.to,e.from].forEach(code=>{
  const c=CITIES[code];
  if(!c) return;
  if(!buckets[code]) buckets[code]={...c,code,count:0,cats:{},threats:{}};
  buckets[code].count++;
  buckets[code].cats[e.cat]=(buckets[code].cats[e.cat]||0)+1;
  buckets[code].threats[e.threat]=(buckets[code].threats[e.threat]||0)+1;
  });
  });
  const points=Object.values(buckets).map(b=>{
  const top=Object.entries(b.cats).sort((a,b)=>b[1]-a[1])[0][0];
  const hasCritical=b.threats.CRITICAL>0;
  const hasHigh=b.threats.HIGH>0;
  return{
  lat:b.lat,lng:b.lng,code:b.code,city:b.name,
  count:b.count,cat:top,color:CATS[top].color,
  radius:Math.min(0.8,0.22+b.count*0.11),
  };
  });
  globe.pointsData(points);
  const arcs=events.filter(e=>activeFilters.has(e.cat)).map(e=>{
  const f=CITIES[e.from],t=CITIES[e.to];
  return{
  startLat:f.lat,startLng:f.lng,
  endLat:t.lat,endLng:t.lng,
  color:[CATS[e.cat].color,CATS[e.cat].color],
  evt:e,
  };
  });
  globe.arcsData([]); // إخفاء الخطوط
  const heatData=generateHeatmapData();
  globe.hexBinPointsData(heatData)
  .hexBinPointWeight('weight')
  .hexBinResolution(3)
  .hexTopColor(d=>{
  const intensity=Math.min(1,d.sumWeight/30);
  const color=getHeatColor(intensity);
  return `rgba(${color[0]},${color[1]},${color[2]},0.7)`;
  })
  .hexSideColor(d=>{
  const intensity=Math.min(1,d.sumWeight/30);
  const color=getHeatColor(intensity);
  return `rgba(${color[0]},${color[1]},${color[2]},0.4)`;
  })
  .hexBinMerge(false)
  .hexAltitude(d=>Math.min(0.15,0.01+d.sumWeight*0.008));
  }
function tickClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('clock').textContent = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  document.getElementById('datecode').textContent = `${now.getUTCFullYear()}.${pad(now.getUTCMonth()+1)}.${pad(now.getUTCDate())}`;
}
function tween(el, to, dur = 900) {
  const from = parseInt(el.dataset.val || el.textContent.replace(/,/g, '') || '0', 10);
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = Math.round(from + (to - from) * e);
    el.textContent = v.toLocaleString('ar-SA');
    if (p < 1) requestAnimationFrame(step);
    else el.dataset.val = to;
  };
  requestAnimationFrame(step);
}
function relTime(mins) {
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins}د`;
  if (mins < 60 * 24) return `قبل ${Math.floor(mins / 60)}س`;
  return `قبل ${Math.floor(mins / (60 * 24))}ي`;
}
function renderFeed() {
  const scroll = document.querySelector('.feed-scroll');
  scroll.innerHTML = '';
  const filtered = events.filter(e => activeFilters.has(e.cat));
  const feedCountEl = document.getElementById('feed-count');
  if (feedCountEl) {
    feedCountEl.textContent = filtered.length.toString().padStart(2, '0');
  }
  filtered.forEach(e => {
    const f = CITIES[e.from], t = CITIES[e.to];
    const c = CATS[e.cat];
    const div = document.createElement('div');
    div.className = 'feed-item' + (e._new ? ' new' : '');
    div.style.setProperty('--cat-color', c.color);
    div.innerHTML = `
      <div class="feed-head">
        <span class="feed-cat">
          <span class="d" style="background:${c.color};color:${c.color}"></span>
          ${c.label}
        </span>
        <span class="feed-time">${relTime(e.mins)}</span>
      </div>
      <div class="feed-title">${e.title}</div>
      <div class="feed-route">
        <span class="cc">${f.cc}</span> ${f.name}
        <span class="arrow">›</span>
        <span class="cc">${t.cc}</span> ${t.name}
      </div>
    `;
    div.addEventListener('click', () => {
      showDetail(e);
      if (globe) {
        userInteracted = true;
        globe.controls().autoRotate = false;
        globe.pointOfView({ lat: t.lat, lng: t.lng, altitude: 1.6 }, 800);
      }
    });
    scroll.appendChild(div);
    if (e._new) setTimeout(() => { e._new = false; }, 2500);
  });
}
const CAT_SPARKS = {
  تنازع:    [3,5,4,6,8,7,9,11,9,10,12,14],
  سياسة:     [8,7,9,6,7,5,6,4,5,4,3,4],
  اقتصاد:  [4,5,5,6,6,7,8,9,11,13,14,15],
  تكنولوجيا: [6,7,6,8,9,10,9,11,12,13,14,15],
  مناخ:       [4,4,5,5,6,7,6,7,8,9,10,11],
};
function startStreamingFeed(){
if(streamingTimer) clearInterval(streamingTimer);
const scroll=document.querySelector('.feed-scroll');
const existingTitles=new Set(Array.from(scroll.querySelectorAll('.feed-item')).map(item=>item.dataset.title));
const newEvents=events.filter(e=>!existingTitles.has(e.title));
newEvents.sort((a,b)=>b.timestamp-a.timestamp);
if(newEvents.length===0){
updateAllFeedBadges();
return;
}
streamingIndex=0;
streamingTimer=setInterval(()=>{
if(streamingIndex>=newEvents.length){
clearInterval(streamingTimer);
updateAllFeedBadges();
updateTickerDynamic();
return;
}
const e=newEvents[streamingIndex];
streamingIndex++;
addFeedItem(e);
updateTickerDynamic();
},2000);
}
function miniSparkSvg(values, color) {
  const w = 40, h = 12;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="1" points="${pts}" style="filter:drop-shadow(0 0 2px ${color})"/></svg>`;
}
function renderCategories() {
  const host = document.getElementById('cat-list');
  host.innerHTML = '';
  const counts = {};
  Object.keys(CATS).forEach(k => counts[k] = 0);
  events.forEach(e => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
  Object.entries(CATS).forEach(([key, c], i) => {
    const row = document.createElement('div');
    row.className = 'cat-row' + (activeFilters.has(key) ? '' : ' off');
    row.innerHTML = `
      <span class="dot" style="background:${c.color};color:${c.color}"></span>
      <span class="name">${key}</span>
      <span class="cat-spark">${miniSparkSvg(CAT_SPARKS[key], c.color)}</span>
      <span class="count">${String(counts[key]).padStart(2,'0')}</span>
      <span class="kbd">${i+1}</span>
    `;
    row.addEventListener('click', () => {
      if (activeFilters.has(key)) activeFilters.delete(key);
      else activeFilters.add(key);
      if (activeFilters.size === 0) activeFilters.add(key);
      renderCategories();
      renderFeed();
      rebuildPoints();
    });
    host.appendChild(row);
  });
}
function showDetail(e) {
  const f = CITIES[e.from], t = CITIES[e.to];
  const c = CATS[e.cat];
  const el = document.getElementById('detail');
  el.innerHTML = `
    <span class="br-bl"></span><span class="br-br"></span>
    <div class="detail-cat" style="color:${c.color};border-color:${c.color}">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${c.color};box-shadow:0 0 8px ${c.color}"></span>
      ${c.label} · الحادثة #${String(e.id).padStart(4,'0')}
    </div>
    <div class="detail-title">${e.title}</div>
    <div class="detail-route">
      <span class="code">${f.cc}</span><span>${f.name}</span>
      <span class="arrow">→</span>
      <span class="code">${t.cc}</span><span>${t.name}</span>
      <span style="margin-left:auto;color:var(--ink-ghost);font-size:10px;letter-spacing:0.18em">T+${relTime(e.mins)}</span>
    </div>
    <div class="detail-summary">${e.sum}</div>
    <div class="detail-actions">
      <button class="detail-btn danger" onclick="hideDetail()">إغلاق</button>
      <button class="detail-btn" onclick="window.open('${e.url}', '_blank')">المصدر · ${e.source}</button>
      <button class="detail-btn">تتبع المنطقة</button>
    </div>
  `;
  el.classList.add('show');
}
function hideDetail() { document.getElementById('detail').classList.remove('show'); }
window.hideDetail = hideDetail;
function renderTicker(){
  const track=document.getElementById('ticker-stream');
  const latestNews=events.slice(0,25);
  const items=latestNews.map(e=>{
  const c=CATS[e.cat];
  return `<span class="ticker-item" data-ticker-title="${CSS.escape(e.title)}">
  <span class="tag" style="color:${c.color}">${c.label}</span>
  <span>${e.title.replace(/—/g,'·')}</span>
  <span class="diamond">◆</span>
  </span>`;
  }).join('');
  track.innerHTML=items;
}
function updateTickerDynamic(){
  const track=document.getElementById('ticker-stream');
  const currentItems=Array.from(track.querySelectorAll('.ticker-item')).map(item=>item.dataset.tickerTitle);
  const latestNews=events.slice(0,25);
  const newTitles=latestNews.map(e=>e.title);
  const titlesToAdd=newTitles.filter(t=>!currentItems.includes(t));
  const titlesToRemove=currentItems.filter(t=>!newTitles.includes(t));
  titlesToRemove.forEach(title=>{
  const item=track.querySelector(`[data-ticker-title="${CSS.escape(title)}"]`);
  if(item){
  item.style.animation='fadeOut 0.3s ease-out';
  setTimeout(()=>item.remove(),300);
  }
  });
  titlesToAdd.forEach(title=>{
  const event=events.find(e=>e.title===title);
  if(event){
  const c=CATS[event.cat];
  const newItem=document.createElement('span');
  newItem.className='ticker-item';
  newItem.dataset.tickerTitle=title;
  newItem.style.animation='fadeIn 0.3s ease-in';
  newItem.innerHTML=`
  <span class="tag" style="color:${c.color}">${c.label}</span>
  <span>${event.title.replace(/—/g,'·')}</span>
  <span class="diamond">◆</span>
  `;
  track.prepend(newItem);
  }
  });
}
function renderWatchlist() {
  const rows = [
    { flag: 'RU', name: 'روسيا · الجبهة الغربية', v: '+3.2', cls: 'up' },
    { flag: 'CN', name: 'الصين · مضيق تايوان',  v: '+1.1', cls: 'up' },
    { flag: 'IR', name: 'إيران · مضيق هرمز',v: '+2.8', cls: 'up' },
    { flag: 'SD', name: 'السودان · دارفور',         v: '+4.5', cls: 'up' },
  ];
  const host = document.getElementById('watchlist');
  host.innerHTML = rows.map(r => `
    <div class="watch-row">
      <span class="flag">${r.flag}</span>
      <span class="wname">${r.name}</span>
      <span class="wv ${r.cls}">${r.v}σ</span>
    </div>
  `).join('');
}
function setView(name) {
  currentView = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  const ph = document.getElementById('view-placeholder');
  if (name === 'live') {
    ph.style.display = 'none';
  } else {
    ph.style.display = 'block';
    const labels = {
      timeline:  { t: 'عرض الجدول الزمني', s: 'إعادة تشغيل الأحداث الزمنية · تمرير عبر آخر 24 ساعة' },
      network:   { t: 'شبكة الكيانات', s: 'رسم بياني للفاعلين والمصادر والمراجع المتقاطعة' },
      analytics: { t: 'مقاعد العمل التحليلية', s: 'مقارنات الأفواج والتنبؤات وتحليل المشاعر' },
    };
    const m = labels[name];
    ph.innerHTML = `<div class="v-tag">قريباً · الإصدار 0.2</div><h2>${m.t}</h2><p>${m.s}</p>`;
  }
}
function toggleAutoRotate() {
  if (!globe) return;
  autoRotate = !autoRotate;
  globe.controls().autoRotate = autoRotate;
  if (autoRotate) userInteracted = false;
  updateAutoBtn();
}
function updateAutoBtn() {
  const btn = document.getElementById('auto-btn');
  if (!btn) return;
  btn.classList.toggle('active', autoRotate && !userInteracted);
  btn.innerHTML = `<span style="display:inline-block;transform:rotate(${autoRotate ? 0 : 0}deg)">⟳</span> تلقائي <span class="caret" style="color:${autoRotate && !userInteracted ? 'var(--cyan)' : 'var(--ink-ghost)'}">${autoRotate && !userInteracted ? 'تشغيل' : 'إيقاف'}</span>`;
}
let density = 'comfortable';
function toggleDensity() {
  density = density === 'comfortable' ? 'compact' : 'comfortable';
  document.body.classList.toggle('compact', density === 'compact');
  const btn = document.getElementById('density-btn');
  btn.classList.toggle('active', density === 'compact');
}
function cityJump(q) {
  q = q.trim().toLowerCase();
  if (!q) return;
  const match = Object.values(CITIES).find(c =>
    c.name.toLowerCase().includes(q) || c.cc.toLowerCase() === q
  ) || COUNTRIES.find(c => c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q);
  if (match && globe) {
    userInteracted = true;
    globe.controls().autoRotate = false;
    updateAutoBtn();
    globe.pointOfView({ lat: match.lat, lng: match.lng, altitude: 1.4 }, 1100);
  }
}
function startLoops() {
initWebSocket();   
loadLiveStream();
document.getElementById('stream-switch-btn').addEventListener('click',switchStream);
let audioEnabled=false;
const enableAudio=()=>{
if(audioEnabled) return;
const critAudio=document.getElementById("alert-critical");
const highAudio=document.getElementById("alert-high");
if(critAudio){critAudio.play().then(()=>{critAudio.pause();critAudio.currentTime=0;}).catch(()=>{});}
if(highAudio){highAudio.play().then(()=>{highAudio.pause();highAudio.currentTime=0;}).catch(()=>{});}
audioEnabled=true;
document.removeEventListener('click',enableAudio);
document.removeEventListener('keydown',enableAudio);
};
document.addEventListener('click',enableAudio,{once:true});
document.addEventListener('keydown',enableAudio,{once:true});
if("Notification" in window){
Notification.requestPermission().then(permission=>{
if(permission==="granted"){
console.log('[Notifications] تم السماح بالإشعارات');
}
});
}
  loadRealNews();
  renderWatchlist();
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(loadRealNews, 120000);
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => setView(t.dataset.view));
  });
document.getElementById('auto-btn').addEventListener('click', toggleAutoRotate);
document.getElementById('density-btn').addEventListener('click', toggleDensity);
document.querySelector('.clear-feed-btn').addEventListener('click',()=>{
const scroll=document.querySelector('.feed-scroll');
scroll.innerHTML='';
feedCounts={all:0,conflict:0,dispute:0,political:0,economic:0,combat:0,telegram:0};
Object.keys(feedCounts).forEach(key=>{
const badge=document.getElementById(`fbadge-${key}`);
if(badge) badge.textContent='00';
});
const feedCountEl=document.getElementById('feed-count');
if(feedCountEl) feedCountEl.textContent='00';
console.log('[Feed] تم مسح القائمة');
});
document.getElementById('keyword-search-btn').addEventListener('click',searchByKeywords);
document.getElementById('keyword-clear-btn').addEventListener('click',clearKeywordFilter);
document.getElementById('keyword-input').addEventListener('keydown',(e)=>{
if(e.key==='Enter') searchByKeywords();
});
document.querySelector('.json-btn').addEventListener('click',exportToJSON);
document.querySelector('.csv-btn').addEventListener('click',exportToCSV);
  updateAutoBtn();
  document.querySelectorAll('.feed-filter-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
  setFeedFilter(btn.dataset.feedFilter);
  });
  });
  updateAllFeedBadges();
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { cityJump(e.target.value); e.target.blur(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideDetail();
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      searchInput.focus();
    }
    if (document.activeElement === searchInput) return;
    const num = parseInt(ev.key, 10);
    if (num >= 1 && num <= 5) {
      const key = Object.keys(CATS)[num - 1];
      if (activeFilters.has(key)) activeFilters.delete(key);
      else activeFilters.add(key);
      if (activeFilters.size === 0) activeFilters.add(key);
      renderCategories();
      renderFeed();
      rebuildPoints();
    }
  });
}
function showNewsNotification(event){
if(Notification.permission!=="granted") return;
const options={
body:event.sum.substring(0,100),
icon:"./logo.svg",
badge:"./logo.svg",
tag:`notification-${event.id}`,
requireInteraction:true,
actions:[
{action:'open',title:'فتح المصدر'},
{action:'close',title:'إغلاق'}
],
data:{
url:event.url,
title:event.title,
category:event.cat,
threat:event.threat
}
};
if(event.threat==="CRITICAL"){
options.tag='critical-alert';
options.requireInteraction=true;
options.badge="./logo.svg";
}
const notification=new Notification(`🔔 ${event.cat.toUpperCase()} - ${event.source}`,options);
notification.addEventListener('click',(e)=>{
if(e.action==='open'||!e.action){
window.focus();
window.open(event.url,'_blank');
notification.close();
}else if(e.action==='close'){
notification.close();
}
});
notification.addEventListener('close',()=>{
console.log('[Notification] تم إغلاق الإشعار');
});
setTimeout(()=>notification.close(),10000);
}
function updateGlobalThreatLevel(){
const el=document.getElementById("global-threat");
if(!el)return;
let level="LOW";
if(events.some(e=>e.threat==="CRITICAL")){
level="CRITICAL";
}else if(events.some(e=>e.threat==="HIGH")){
level="HIGH";
}else if(events.some(e=>e.threat==="ELEVATED")){
level="ELEVATED";
}
if(el.textContent===level) return;
el.textContent=level;
el.classList.remove("calm","elevated","critical","high");
if(level==="CRITICAL"){
el.classList.add("critical");
const audio=document.getElementById("alert-critical");
if(audio){
audio.volume=0.6;
audio.play().catch(()=>{});
}
}else if(level==="HIGH"){
el.classList.add("high");
const audio=document.getElementById("alert-high");
if(audio){
audio.volume=0.5;
audio.play().catch(()=>{});
}
}else if(level==="ELEVATED"){
el.classList.add("elevated");
}
}
function exportToJSON(){
const data={
exportedAt:new Date().toISOString(),
totalEvents:events.length,
filters:Array.from(activeFilters),
events:events.map(e=>{
const pubDate=e.publishedAt||e.timestamp||new Date().toISOString();
const validDate=new Date(pubDate).toISOString();
return{
id:e.id,
category:e.cat,
title:e.title,
summary:e.sum,
source:e.source,
threat:e.threat,
url:e.url,
from:e.from,
to:e.to,
publishedAt:validDate
};
})
};
const json=JSON.stringify(data,null,2);
const blob=new Blob([json],{type:'application/json'});
const url=URL.createObjectURL(blob);
const a=document.createElement('a');
a.href=url;
a.download=`global-pulse-${new Date().toISOString().slice(0,10)}.json`;
a.click();
URL.revokeObjectURL(url);
console.log('[Export] تم تصدير JSON - '+events.length+' حدث');
}
function exportToCSV(){
const headers=['ID','الفئة','العنوان','الملخص','المصدر','مستوى التهديد','الرابط','من','إلى','التاريخ'];
const rows=events.map(e=>{
const pubDate=e.publishedAt||e.timestamp||new Date().toISOString();
const validDate=new Date(pubDate).toISOString();
return[
e.id,
e.cat,
`"${e.title.replace(/"/g,'""')}"`,
`"${e.sum.replace(/"/g,'""').substring(0,100)}"`,
e.source,
e.threat,
e.url,
e.from,
e.to,
validDate
];
});
const csv=[headers.join(','),...rows.map(r=>r.join(','))].join('\n');
const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
const url=URL.createObjectURL(blob);
const a=document.createElement('a');
a.href=url;
a.download=`global-pulse-${new Date().toISOString().slice(0,10)}.csv`;
a.click();
URL.revokeObjectURL(url);
console.log('[Export] تم تصدير CSV - '+events.length+' حدث');
}
// ========== دوال خاصة بالهواتف والأجهزة اللوحية ==========
if (isMobile || isTablet) {
  function updateMobileFilters() {
    const filterBar = document.getElementById('mobile-filter-bar');
    if (!filterBar) return;
    const categories = Object.keys(CATEGORIES || {});
    filterBar.innerHTML = categories.map(cat => `
      <button class="filter-chip ${activeFilters?.has(cat) ? 'active' : ''}" data-cat="${cat}">
        ${cat}
      </button>
    `).join('');
  }

  function addMobileNews(newsItem) {
    const newsList = document.getElementById('mobile-news-list');
    if (!newsList) return;
    const card = document.createElement('div');
    card.className = 'news-card';
    card.innerHTML = `
      <div class="news-title">${newsItem.title || 'خبر عاجل'}</div>
      <div class="news-source">${newsItem.source || 'مصدر'}</div>
    `;
    card.onclick = () => window.open(newsItem.url, '_blank');
    newsList.appendChild(card);
  }

  // تعديل دالة loadRealNews لتحديث واجهة الهاتف
  const originalLoadRealNews = window.loadRealNews;
  if (originalLoadRealNews) {
    window.loadRealNews = async function() {
      await originalLoadRealNews();
      updateMobileFilters();
      if (events && events.length > 0) {
        const newsList = document.getElementById('mobile-news-list');
        if (newsList) newsList.innerHTML = '';
        events.slice(0, 20).forEach(addMobileNews);
      }
    };
  }
}
document.addEventListener('DOMContentLoaded', runBoot);
