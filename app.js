const $=s=>document.querySelector(s);
const SETTINGS_KEY='triple20_settings';
const TOURNAMENT_HISTORY_KEY='triple20_tournaments';
const CLUB_DUELS_KEY='triple20_club_duels';
const TV_SETTINGS_KEY='triple20_tv_settings';
const MEMBER_TOURNAMENT_KEY='triple20_member_tournament';
const LIVE_RECOVERY_KEY='triple20_live_recovery';
const STATS_STATION_TOKEN_KEY='triple20_stats_station_token';
const DARTVISION_LAB_KEY='triple20_dartvision_lab_local';
const APP_ANALYTICS_DEVICE_KEY='triple20_analytics_device';
const APP_ANALYTICS_LAST_KEY='triple20_analytics_last_visit';
let applyingRoute=false;
let resultGraphicBlob=null,resultGraphicFilename='Triple20_Ergebnis.png';
let tournamentRegistrationCounts={},tournamentRegistrations=[],registrationsLoading=false,registrationsLoadedAt=0;
const CHECKIN_STORAGE_KEY='triple20_admin_checkins';
let adminCheckInEventKey='';
let statsStationMatches=[],statsStationImageUrl='',statsStationPending=null,statsStationAuthorizationStatus=null,statsStationStations=[],statsStationAuthorizationBusy=false,statsStationAuthorizationError='';
const SUPABASE_URL='https://bskoltagzvoidekifyrz.supabase.co';
const TRIPLE20_PUBLIC_URL='https://burkertmarkus-prog.github.io/triple20-test/';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_DYeubwt-wgvp07btU65fLA_tex_xGuq';
const PUSH_FUNCTION_NAME='triple20-push';
// Lokale Entwicklungsadressen bleiben vollständig von der produktiven Cloud
// getrennt. So können Oberfläche und lokal gespeicherte Testdaten gefahrlos
// verändert werden, ohne Vereinsdaten, Konten oder Push-Nachrichten anzutasten.
const T20_LOCAL_PREVIEW=['localhost','127.0.0.1','::1'].includes(location.hostname);
// Die geöffnete Saison ist eine persönliche Browser-Auswahl und darf nicht
// durch den regelmäßigen Cloud-Abgleich anderer Geräte überschrieben werden.
const CLOUD_DATA_KEYS=['dartTournament','tripleTwentySeasons','triple20_settings','triple20_tournaments',CLUB_DUELS_KEY,TV_SETTINGS_KEY];
const PARTITIONED_CLOUD_KEYS=[T20CloudPartitions.SEASONS_KEY,T20CloudPartitions.TOURNAMENTS_KEY];
const CLOUD_MANIFEST_KEYS=Object.values(T20CloudPartitions.MANIFEST_KEYS);
const CLOUD_UNPARTITIONED_KEYS=CLOUD_DATA_KEYS.filter(key=>!PARTITIONED_CLOUD_KEYS.includes(key));
const CLOUD_SNAPSHOT_KEYS=[...CLOUD_UNPARTITIONED_KEYS,...CLOUD_MANIFEST_KEYS];
const CLOUD_METADATA_KEYS=[...CLOUD_SNAPSHOT_KEYS,...PARTITIONED_CLOUD_KEYS];
const CLOUD_USAGE_KEY='triple20_cloud_usage_today';
let supabaseClient=null;
let T20_SUPPRESS_SYNC=false;
const nativeSetItem=window.T20BrowserStorage.setItem.bind(window.T20BrowserStorage),nativeRemoveItem=window.T20BrowserStorage.removeItem.bind(window.T20BrowserStorage);
function emptyCloudUsage(){return{date:new Date().toLocaleDateString('en-CA'),requests:0,metadataBytes:0,dataBytes:0}}
function loadCloudUsage(){const stored=safeJsonParse(window.T20BrowserStorage.getItem(CLOUD_USAGE_KEY)||'null',null),today=emptyCloudUsage().date;return stored?.date===today?{...emptyCloudUsage(),...stored}:emptyCloudUsage()}
function formatCloudBytes(bytes=0){if(bytes<1024)return`${bytes} B`;if(bytes<1048576)return`${(bytes/1024).toFixed(bytes<10240?1:0)} KB`;return`${(bytes/1048576).toFixed(2)} MB`}
window.T20BrowserStorage.setItem=(key,value)=>{nativeSetItem(key,value);if(!T20_SUPPRESS_SYNC&&CLOUD_DATA_KEYS.includes(key)&&window.T20Cloud)window.T20Cloud.queueSync(key)};
window.T20BrowserStorage.removeItem=key=>{nativeRemoveItem(key);if(!T20_SUPPRESS_SYNC&&CLOUD_DATA_KEYS.includes(key)&&window.T20Cloud)window.T20Cloud.queueSync(key)};
let dataSchemaCompatibilityError=null;
function rememberDataSchemaError(error){if(error?.code==='UNSUPPORTED_SCHEMA_VERSION')dataSchemaCompatibilityError=error;return error}
function currentDataDocument(key,value){try{return T20DataSchema.toCurrent(key,value)}catch(error){throw rememberDataSchemaError(error)}}
function logicalDataValue(key,value){try{return T20DataSchema.toLogical(key,value)}catch(error){throw rememberDataSchemaError(error)}}
function storedDataValue(key,fallback=null){const raw=window.T20BrowserStorage.getItem(key);if(raw===null)return fallback;return logicalDataValue(key,JSON.parse(raw))}
function safeInitialData(key,fallback){try{return storedDataValue(key,fallback)}catch(error){if(error?.code!=='UNSUPPORTED_SCHEMA_VERSION')throw error;return fallback}}
function schemaWritesAllowed(){if(!dataSchemaCompatibilityError)return true;setSyncStatus?.('App-Update erforderlich – neuere Datenversion erkannt','conflict');return false}
function writeDataDocument(key,value,{native=false}={}){if(!schemaWritesAllowed())return value;const encoded=JSON.stringify(currentDataDocument(key,value));(native?nativeSetItem:window.T20BrowserStorage.setItem)(key,encoded);return value}
function writeLogicalData(key,value,{native=false}={}){if(!schemaWritesAllowed())return value;let current;try{current=T20DataSchema.fromLogical(key,value)}catch(error){rememberDataSchemaError(error);return value}const encoded=JSON.stringify(current);(native?nativeSetItem:window.T20BrowserStorage.setItem)(key,encoded);return value}
const defaultSettings={
  appName:'Triple20',
  mode:'club',
  pushNotificationsEnabled:true,
  tyrolDartsAdEnabled:true,
  home:{news:{eyebrow:'DCA NEWS',title:'',text:'',imagePath:'',imagePosition:'center',imageLayout:'right',items:[]},info:{eyebrow:'TERMINE',title:'Als Nächstes',mode:'auto',items:[]}},
  clubInfo:{tagline:'Sport. Gemeinschaft. Good Darts.',description:'',venue:'',address:'',hours:'',contactName:'',email:'',phone:'',mapsUrl:'',imagePath:'',imagePosition:'center',imageLayout:'right'},
  club:{enabled:true,name:'',logo:'',seasonMode:'halfyear',pointSystem:{5:25,4:20,3:15,2:10,1:7,0:5},dropResults:4,color:'#0E6BFF'},
  tournament:{defaultMode:'swiss',defaultFormat:'single',defaultLegs:2},
  themeMode:'light',
  theme:{background:'#EEF5FF',card:'#FFFFFF',primary:'#0E6BFF',accent:'#55A7FF',text:'#122033'}
};
let appSettings=loadSettings();
const emptyInitialTournament=T20DataSchema.toLogical('dartTournament',{players:[],started:false,matches:[],settings:{}}),state=safeInitialData('dartTournament',emptyInitialTournament);
const TV_SETTING_FIELDS=['tvDisplayMode','tvDisplayCompetition','tvDisplayChangedAt','tvBracketPages','tvPausedCompetitions','tvBoardAssignments'];
function applyStoredTvSettings(){const stored=safeInitialData(TV_SETTINGS_KEY,{});for(const field of TV_SETTING_FIELDS)if(stored[field]!==undefined)state[field]=structuredClone(stored[field])}
function persistTvSettings({queueCloud=true}={}){const value=Object.fromEntries(TV_SETTING_FIELDS.filter(field=>state[field]!==undefined).map(field=>[field,state[field]]));writeLogicalData(TV_SETTINGS_KEY,value,{native:!queueCloud})}
const liveRecoveryRaw=safeJsonParse(window.T20BrowserStorage.getItem(LIVE_RECOVERY_KEY)||'null'),liveRecovery=liveRecoveryRaw?(()=>{try{return logicalDataValue('dartTournament',liveRecoveryRaw)}catch{return null}})():null;
const stateHasLive=!!(state.started||Object.values(state.competitions||{}).some(competition=>competition?.started)),recoveryHasLive=!!(liveRecovery?.started||Object.values(liveRecovery?.competitions||{}).some(competition=>competition?.started));
if(!stateHasLive&&recoveryHasLive){Reflect.ownKeys(state).forEach(key=>delete state[key]);Object.assign(state,liveRecovery)}
applyStoredTvSettings();
const SEASON_KEY='tripleTwentySeasons';
const SEASON_STANDINGS_LOCK_MESSAGE='Die Herbstliga ist abgeschlossen. Der Endstand wird bei der Jahreshauptversammlung bekannt gegeben.';
const seasonStore=loadSeasons();
let selectedSeasonId=window.T20BrowserStorage.getItem('tripleTwentySelectedSeason')||'';
let seasonRankingMode=window.T20BrowserStorage.getItem('triple20_season_ranking_mode')==='total'?'total':'clean';
let manualTournamentOpen=false;
let seasonFormOpen=false;
let seasonFormCreating=false;
let editingSeasonTournamentId='';
let publicPastExpanded=false;
let editingHomeNewsId='main';
let publicHomeNewsIndex=0;
let publicHomeNewsTimer=null;
let publicHomeNewsPast=[];
let currentShellMode='public';
let resultsViewMode='leagues';
const expandedStandaloneTournamentIds=new Set();
let clubDuelSetupOpen=false;
let selectedClubDuelId='';
const expandedSeasonTournamentIds=new Set();
const COMPETITION_KEYS=['players','playerIds','playerProfileIds','started','liveSessionId','liveStartedAt','matches','settings','groups','withdrawn','endedEarly','savedToHistory','seasonImportedTo','seasonTournamentId','scheduledEventId','scheduledSeasonId','scheduledStandalone','scheduledCompetition','scheduledViaTournamentManagement','groupStage','scoreAudit','scoreUndoStack','seedingDraft'];
function emptyCompetition(){return{players:[],playerIds:{},playerProfileIds:{},started:false,matches:[],settings:{}}}
function competitionSnapshot(source=state){const out={};for(const key of COMPETITION_KEYS)if(source[key]!==undefined)out[key]=structuredClone(source[key]);return{...emptyCompetition(),...out}}
function bindActiveCompetitionAccessors(target=state){
  for(const key of COMPETITION_KEYS){
    const current=Object.getOwnPropertyDescriptor(target,key);if(current?.get?.t20CompetitionKey===key)continue;
    const getter=function(){const active=['men','women'].includes(target.activeCompetition)?target.activeCompetition:'men';return target.competitions?.[active]?.[key]};getter.t20CompetitionKey=key;
    Object.defineProperty(target,key,{configurable:true,enumerable:false,get:getter,set(value){const active=['men','women'].includes(target.activeCompetition)?target.activeCompetition:'men';target.competitions=target.competitions||{men:emptyCompetition(),women:emptyCompetition()};target.competitions[active]=target.competitions[active]||emptyCompetition();if(value===undefined)delete target.competitions[active][key];else target.competitions[active][key]=value}});
  }
}
function ensureTournamentDayState(target=state){
  if(!target.competitions)throw new Error('Turnierdaten wurden nicht über das versionierte Datenschema geladen.');
  const viewCompetition=['men','women'].includes(target.activeCompetition)?target.activeCompetition:'men';
  target.competitions.men=target.competitions.men||emptyCompetition();
  target.competitions.women=target.competitions.women||emptyCompetition();
  target.activeCompetition=viewCompetition;
  target.eventName=target.eventName||'Freitag-Abend-Cup';
  if(target===state)bindActiveCompetitionAccessors(target);
  return target;
}
function syncActiveCompetition(){ensureTournamentDayState();state.settings={...(state.settings||{}),competition:state.activeCompetition}}
function loadActiveCompetition(){syncActiveCompetition()}
function replaceActiveCompetition(next=emptyCompetition()){ensureTournamentDayState();state.competitions[state.activeCompetition]=competitionSnapshot(next);loadActiveCompetition()}
function competitionLabel(key=state.activeCompetition){return key==='women'?'Damen':key==='men'?'Herren':'Offen'}
function normalizedCompetition(value){return T20DataSchema.normalizeCompetition(value)}
function seasonCompetition(season){return normalizedCompetition(season?.competition)}
function seasonOptionLabel(season){return `${season?.name||'Wertung'} · ${competitionLabel(seasonCompetition(season))}${season?.archived?' · Archiv':''}`}
function playerCompetition(playerId=''){return normalizedCompetition(seasonStore.playerCompetitions?.[playerId])}
function competitionCompatible(playerId,competition){const assigned=playerCompetition(playerId),target=normalizedCompetition(competition);return assigned==='open'||target==='open'||assigned===target}
function setPlayerCompetition(playerId,competition){if(!canManageClubData()||!playerId)return;seasonStore.playerCompetitions=seasonStore.playerCompetitions||{};seasonStore.playerCompetitionUpdatedAt=seasonStore.playerCompetitionUpdatedAt||{};seasonStore.playerCompetitions[playerId]=normalizedCompetition(competition);seasonStore.playerCompetitionUpdatedAt[playerId]=new Date().toISOString();persistSeasons();renderRegisteredPlayerChoices();renderMemberSuggestions();renderSeasonView()}
function baseCompetitionEventName(value=''){return String(value||'').replace(/\s+[–-]\s+(Herren|Damen)$/i,'').trim()}
function competitionEventName(source=state){
  const direct=baseCompetitionEventName(source?.settings?.eventName||source?.eventName||'');if(direct)return direct;
  const competition=normalizedCompetition(source?.settings?.competition||source?.competition||(source===state?state.activeCompetition:'men')),assigned=assignedSeasonForTournament(source),season=assigned||(seasonStore.seasons||[]).find(item=>!item.archived&&seasonCompetition(item)===competition),seasonName=baseCompetitionEventName(season?.name||'');
  return seasonName||baseCompetitionEventName(state.eventName)||'Spieltag';
}
function competitionTitle(){return `${competitionEventName()} – ${competitionLabel()}`}
function competitionAlreadyInSeason(source){if(!source)return false;if(source.seasonImportedTo||source.seasonTournamentId)return true;const history=source.savedToHistory?loadTournamentHistory().find(record=>String(record.id)===String(source.savedToHistory)):null,competition=source.competition||source.settings?.competition||'',participants=container=>(container?.players||[]).map(name=>playerIdFor(container,name)).sort().join('|'),players=participants(source);return (seasonStore.seasons||[]).some(season=>(season.tournaments||[]).some(record=>{if(record.planned)return false;if(source.scheduledEventId&&String(record.scheduledEventId||'')===String(source.scheduledEventId))return true;if(!history||record.date!==history.date||(record.competition||record.settings?.competition||'')!==competition)return false;return participants(record)===players}))}
function competitionIsLive(source){return !!source?.started&&!competitionAlreadyInSeason(source)}
function replaceTournamentState(next){const current=T20DataSchema.toLogical('dartTournament',next||emptyCompetition());Reflect.ownKeys(state).forEach(key=>delete state[key]);Object.assign(state,current);ensureTournamentDayState();loadActiveCompetition()}
ensureTournamentDayState();loadActiveCompetition();
function emptyMemberTournament(){return{players:[],playerIds:{},playerProfileIds:{},started:false,matches:[],settings:{},memberLocal:true}}
function loadMemberTournament(){const value=safeJsonParse(window.T20BrowserStorage.getItem(MEMBER_TOURNAMENT_KEY)||'null');if(!value)return T20DataSchema.toLogical('dartTournament',emptyMemberTournament());try{return logicalDataValue('dartTournament',value)}catch{return T20DataSchema.toLogical('dartTournament',emptyMemberTournament())}}
function save({queueCloud=true}={}){
  if(!schemaWritesAllowed())return;
  if(isMember()&&T20Cloud.tournamentViewMode==='live')return;
  syncActiveCompetition();
  if(isMember()){state.memberLocal=true;window.T20BrowserStorage.setItem(MEMBER_TOURNAMENT_KEY,JSON.stringify(state));return}
  if(isAdmin()){delete state.memberLocal;delete state.guestLocal}
  // Eine noch nicht gestartete Turniervorbereitung ist ein lokaler Entwurf.
  // Teilnehmer hinzufügen oder entfernen darf deshalb weder den veröffentlichten
  // Live-Stand verändern noch einen Cloud-Konflikt mit einem anderen Gerät auslösen.
  const hasLiveCompetition=Object.values(state.competitions||{}).some(competitionIsLive);
  writeDataDocument('dartTournament',state,{native:isAdmin()&&(!hasLiveCompetition||!queueCloud)});
  if(isAdmin()){const live=Object.values(state.competitions||{}).some(competitionIsLive);if(live)window.T20BrowserStorage.setItem(LIVE_RECOVERY_KEY,JSON.stringify(state));else window.T20BrowserStorage.removeItem(LIVE_RECOVERY_KEY)}
}
async function publishLiveTournament({notifyOnError=false,additionalKeys=[]}={}){
  if(!isAdmin()||!schemaWritesAllowed())return false;
  // Die Boardbelegung wird gemeinsam mit jedem Ergebnis aktualisiert, aber in
  // einem getrennten Cloud-Bereich gespeichert. So kann eine TV-Umschaltung
  // niemals einen älteren Turnierstand zurückschreiben.
  syncActiveCompetition();writeDataDocument('dartTournament',state,{native:true});
  tvBoardAssignments(liveTvCompetitions());persistTvSettings({queueCloud:false});
  const publishKeys=['dartTournament',TV_SETTINGS_KEY,...additionalKeys];
  publishKeys.forEach(key=>T20Cloud.pendingKeys.add(key));T20Cloud.persistPendingKeys();
  if(T20Cloud.client&&navigator.onLine)await T20Cloud.syncAll({keys:publishKeys});
  else setSyncStatus('Offline – sicher auf diesem Gerät gespeichert','offline');
  const published=publishKeys.every(key=>!T20Cloud.pendingKeys.has(key));
  if(!published&&notifyOnError)appAlert('Das Turnier wurde auf diesem PC gestartet, konnte aber nicht in die Cloud veröffentlicht werden. Bitte prüfe die Internetverbindung und den Statusbalken.');
  return published;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function mergeSettings(base,stored){const out={...base,...(stored||{})};delete out.recommendations;out.club={...base.club,...(stored?.club||{}),pointSystem:{...base.club.pointSystem,...(stored?.club?.pointSystem||{})}};out.clubInfo={...base.clubInfo,...(stored?.clubInfo||{})};out.tournament={...base.tournament,...(stored?.tournament||{})};out.theme={...base.theme,...(stored?.theme||{})};out.home={...base.home,...(stored?.home||{}),news:{...base.home.news,...(stored?.home?.news||{})},info:{...base.home.info,...(stored?.home?.info||{})}};out.club.enabled=out.mode==='club';return out}
function loadSettings(){try{return mergeSettings(defaultSettings,storedDataValue(SETTINGS_KEY,{}))}catch(error){rememberDataSchemaError(error);return mergeSettings(defaultSettings,{})}}
function saveSettings(){writeLogicalData(SETTINGS_KEY,appSettings)}
function updateSettings(patch){appSettings=mergeSettings(appSettings,patch);saveSettings();applyTheme();renderNavigation();renderSettingsForm();renderSeasonView();return appSettings}
function setAppMode(mode){updateSettings({mode,club:{...appSettings.club,enabled:mode==='club'}})}
function isClubMode(){return true}
const themeModes={
  light:{label:'Hell & freundlich',theme:{background:'#EEF5FF',card:'#FFFFFF',primary:'#0E6BFF',accent:'#55A7FF',text:'#122033'}},
  classic:{label:'Triple20 Blau',theme:{background:'#05070A',card:'#111820',primary:'#0E6BFF',accent:'#55A7FF',text:'#F7F7F7'}},
  midnight:{label:'Mitternacht',theme:{background:'#07111F',card:'#101B2A',primary:'#1683FF',accent:'#8FC4FF',text:'#F4F8FF'}},
  steel:{label:'Stahlgrau',theme:{background:'#E9EEF5',card:'#F9FBFF',primary:'#245B9A',accent:'#6D93C7',text:'#172233'}},
  warm:{label:'Warmup',theme:{background:'#FFF4E8',card:'#FFFFFF',primary:'#F97316',accent:'#FDBA74',text:'#23170F'}}
};
function themeModeForTheme(theme=appSettings.theme){return Object.entries(themeModes).find(([,m])=>Object.keys(m.theme).every(k=>String(m.theme[k]).toLowerCase()===String(theme?.[k]).toLowerCase()))?.[0]||appSettings.themeMode||'light'}
function applyTheme(){const t=appSettings.theme||defaultSettings.theme,r=document.documentElement;r.style.setProperty('--cream',t.background);r.style.setProperty('--paper',`${t.card}f2`);r.style.setProperty('--blue',t.primary);r.style.setProperty('--blue-2',t.primary);r.style.setProperty('--green',t.primary);r.style.setProperty('--orange',t.primary);r.style.setProperty('--accent',t.accent);r.style.setProperty('--ink',t.text);r.style.setProperty('--line','#CAD8EA');if(document.body)document.body.style.background=`radial-gradient(circle at 15% 0%, ${t.primary}22, transparent 34%), linear-gradient(180deg, #F8FBFF 0%, ${t.background} 48%, #FFFFFF 100%)`;const clubBrand=$('.public-brand-copy strong');if(clubBrand)clubBrand.textContent=appSettings.club.name||'Dartclub Achensee';const footer=$('#footerAppName');if(footer)footer.textContent=appSettings.appName||'Triple20';updatePageMetadata(new URLSearchParams(location.search).get('bereich')||'start')}
function shuffle(values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function todayIso(){return new Date().toISOString().slice(0,10)}
function currentHalfYear(date=new Date()){const y=date.getFullYear(),h=date.getMonth()<6?'H1':'H2';return{year:y,half:h,name:`${y} ${h}`,start:`${y}-${h==='H1'?'01-01':'07-01'}`,end:`${y}-${h==='H1'?'06-30':'12-31'}`}}
function currentLeaguePeriod(date=new Date()){const half=currentHalfYear(date),spring=half.half==='H1';return{...half,name:`${spring?'Frühjahrsliga':'Herbstliga'} ${half.year}`}}
function analyticsDeviceId(){let id=window.T20BrowserStorage.getItem(APP_ANALYTICS_DEVICE_KEY)||'';if(!/^[0-9a-f-]{36}$/i.test(id)){id=crypto.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:r&3|8).toString(16)});window.T20BrowserStorage.setItem(APP_ANALYTICS_DEVICE_KEY,id)}return id}
function registerAccess(){
  if(!['triple20.at','www.triple20.at'].includes(location.hostname))return;
  let timer=0;
  const schedule=()=>{clearTimeout(timer);if(document.visibilityState==='hidden')return;const last=Number(window.T20BrowserStorage.getItem(APP_ANALYTICS_LAST_KEY)||0);if(Date.now()-last<30*60*1000)return;timer=setTimeout(()=>T20Cloud.recordAppVisit().catch(error=>console.warn('App-Nutzung konnte nicht erfasst werden:',error)),10000)};
  schedule();document.addEventListener('visibilitychange',schedule);
}
function localDateKey(date=new Date()){const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}
function renderAccessStats(){
  if(!isFullAdmin())return'';
  const stats=T20Cloud.analyticsStats;if(!stats)return `<section class="access-stats" aria-label="Zugriffsstatistik"><h3>App-Nutzung</h3><p class="view-note">Die zentrale Nutzungsstatistik wird geladen …</p></section>`;
  return `<section class="access-stats" aria-label="Zugriffsstatistik"><h3>App-Nutzung</h3><div class="access-stat-grid"><article><span>Heute</span><b>${stats.today_sessions||0}</b></article><article><span>Diese Woche</span><b>${stats.week_sessions||0}</b></article><article><span>Dieser Monat</span><b>${stats.month_sessions||0}</b></article><article><span>Insgesamt</span><b>${stats.total_sessions||0}</b></article></div><p class="view-note">Heute ${stats.today_devices||0} unterschiedliche Geräte · ${stats.today_members||0} angemeldete Mitglieder. Gezählt wird eine aktive Nutzung ab 10 Sekunden, höchstens einmal je Gerät innerhalb von 30 Minuten.</p></section>`;
}
function downloadFile(name,type,content){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove()}
function requireSupabaseClient(){const client=window.T20Cloud?.client||supabaseClient;if(!client)throw new Error('Supabase-Client wurde nicht initialisiert.');return client}
function setLoginError(message=''){const box=$('#loginError');if(box){box.textContent=message;box.classList.toggle('hidden',!message)}}
function withTimeout(promise,ms,message){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),ms))])}
function loadScript(src){return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.src===src&&s.dataset.loaded==='1');if(existing){resolve();return}const s=document.createElement('script');s.src=src;s.async=true;s.dataset.dynamic='1';s.onload=()=>{s.dataset.loaded='1';resolve()};s.onerror=()=>reject(new Error(`Bibliothek konnte nicht geladen werden: ${src}`));document.head.appendChild(s)})}
async function ensureSupabaseLibrary(){
  if(window.supabase?.createClient)return;
  const sources=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','https://unpkg.com/@supabase/supabase-js@2'];
  let lastError=null;
  for(const src of sources){
    try{await withTimeout(loadScript(`${src}?t20=${Date.now()}`),8000,'Supabase-Bibliothek lädt zu lange.');if(window.supabase?.createClient)return}
    catch(e){lastError=e}
  }
  throw lastError||new Error('Die Supabase-Bibliothek konnte nicht geladen werden.');
}
function safeJsonParse(value,fallback=null){try{return JSON.parse(value)}catch{return fallback}}
function localValueForKey(key){const raw=window.T20BrowserStorage.getItem(key);if(raw===null)return null;return currentDataDocument(key,safeJsonParse(raw,raw))}
function canonicalCloudValue(value){if(Array.isArray(value))return value.map(canonicalCloudValue);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalCloudValue(value[key])]));return value}
function comparableCloudValue(key,value){const normalized=value===null||value===undefined?value:currentDataDocument(key,value),copy=normalized&&typeof normalized==='object'?structuredClone(normalized):normalized;if(key==='dartTournament'&&copy)for(const field of TV_SETTING_FIELDS)delete copy[field];return JSON.stringify(canonicalCloudValue(copy))}
function hasMeaningfulLocalData(){return !!(state.players?.length||state.matches?.length||seasonStore.seasons?.length||loadTournamentHistory().length||loadClubDuels().duels.length)}
function collectTriple20Data(){return Object.fromEntries(CLOUD_DATA_KEYS.map(k=>[k,localValueForKey(k)]))}
function backupTriple20Data(prefix='triple20_backup'){const data={createdAt:new Date().toISOString(),app:'Triple20',data:collectTriple20Data()};downloadFile(`${prefix}_${new Date().toISOString().slice(0,19).replaceAll(':','-')}.json`,'application/json',JSON.stringify(data,null,2));return data}
function applyTriple20Data(data,{mergeClubDuels=true}={}){
  const visibleSection=['tvSection','clubDuelTvSection','publicHomeSection','clubInfoSection','authSection','settingsSection','seasonSection','clubDuelsSection','statsStationSection','setupSection','tournamentSection'].find(id=>!$('#'+id)?.classList.contains('hidden'))||'';
  if(!data)return;
  const prepared={};
  for(const key of CLOUD_DATA_KEYS){
    if(!(key in data))continue;
    let value=data[key];
    if(mergeClubDuels&&key===CLUB_DUELS_KEY&&value!==null&&value!==undefined)value=mergeClubDuelStores(localValueForKey(key),value);
    prepared[key]=value===null||value===undefined?value:currentDataDocument(key,value);
  }
  T20_SUPPRESS_SYNC=true;
  try{
    for(const [key,value] of Object.entries(prepared)){
      if(value===null||value===undefined)window.T20BrowserStorage.removeItem(key);
      else writeDataDocument(key,value);
    }
  }finally{T20_SUPPRESS_SYNC=false}
  const incomingState=storedDataValue('dartTournament',T20DataSchema.toLogical('dartTournament',emptyCompetition()));
  Reflect.ownKeys(state).forEach(k=>delete state[k]);Object.assign(state,incomingState);applyStoredTvSettings();ensureTournamentDayState();loadActiveCompetition();
  const seasons=loadSeasons();Object.keys(seasonStore).forEach(key=>delete seasonStore[key]);Object.assign(seasonStore,seasons);
  selectedSeasonId=window.T20BrowserStorage.getItem('tripleTwentySelectedSeason')||'';
  appSettings=loadSettings();
  T20Cloud.loadHomeNewsImage?.().catch(error=>console.warn('Startseitenbild konnte nicht geladen werden:',error));
  T20Cloud.loadClubInfoImage?.().catch(error=>console.warn('Vereinsseitenbild konnte nicht geladen werden:',error));
  applyTheme();applyTournamentDefaults();renderPlayers();renderSettingsForm();renderSeasonView();renderTournament();
  if(visibleSection==='tvSection')refreshVisibleTv();
  else if(visibleSection==='clubDuelTvSection')renderClubDuelTv();
  else if(visibleSection==='publicHomeSection')showHome(false);
  else if(visibleSection==='clubInfoSection')showClubInfo(false);
  else if(visibleSection==='authSection')showLogin();
  else if(visibleSection==='settingsSection')showSettings();
  else if(visibleSection==='seasonSection')showSeason();
  else if(visibleSection==='clubDuelsSection')showClubDuels(false);
  else if(visibleSection==='statsStationSection')showStatsStation(false,true);
  else if(visibleSection==='tournamentSection'||visibleSection==='setupSection')showTournament();
}
function cloudDataFromRows(rows=[]){return Object.fromEntries(CLOUD_DATA_KEYS.map(key=>{let value=null;if(PARTITIONED_CLOUD_KEYS.includes(key)){const partitioned=T20CloudPartitions.reconstructDocument(key,rows);if(partitioned.found&&partitioned.complete)value=partitioned.value}if(value===null){const row=rows.find(item=>item.data_key===key);value=row?row.data:null}return[key,value===null||value===undefined?value:currentDataDocument(key,value)]}))}
const CLOUD_DATA_LABELS={dartTournament:'laufendes Turnier',tripleTwentySeasons:'Wertungen und Saisonen',triple20_settings:'App-Einstellungen',triple20_tournaments:'gespeicherte Turniere',triple20_tv_settings:'TV-Einstellungen',triple20_club_duels:'Vereinsduelle'};
function cloudConflictTime(rows,keys=[]){const stamps=rows.filter(row=>keys.includes(T20CloudPartitions.logicalKeyForPhysical(row.data_key))&&row.updated_at).map(row=>Date.parse(row.updated_at)).filter(Number.isFinite);return stamps.length?new Date(Math.max(...stamps)).toLocaleString('de-AT'):'unbekannt'}
function openCloudConflictDialog({rows=[],conflictingKeys=[],lastSyncAt=''}={}){
  $('#cloudConflictOverlay')?.remove();
  const overlay=document.createElement('div');overlay.id='cloudConflictOverlay';overlay.className='cloud-conflict-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','cloudConflictTitle');
  const affected=conflictingKeys.map(key=>CLOUD_DATA_LABELS[key]||key).join(', ')||'Triple20-Daten';
  overlay.innerHTML=`<div class="cloud-conflict-dialog"><p class="eyebrow">Datenkonflikt</p><h2 id="cloudConflictTitle">Online und dieses Gerät wurden geändert</h2><p>Betroffen: <strong>${esc(affected)}</strong></p><div class="cloud-conflict-times"><span>Online geändert</span><strong>${esc(cloudConflictTime(rows,conflictingKeys))}</strong><span>Zuletzt bestätigt</span><strong>${lastSyncAt?esc(new Date(lastSyncAt).toLocaleString('de-AT')):'noch nie'}</strong></div><p class="view-note">Nichts wird automatisch überschrieben. Sichere im Zweifel zuerst die lokale Version.</p><div class="cloud-conflict-actions"><button type="button" class="primary" data-cloud-conflict="cloud">Online-Version verwenden</button><button type="button" data-cloud-conflict="backup">Lokale Version sichern</button><button type="button" class="danger" data-cloud-conflict="overwrite">Lokale Version hochladen</button><button type="button" class="ghost" data-cloud-conflict="cancel">Abbrechen</button></div><p class="cloud-conflict-feedback" aria-live="polite"></p></div>`;
  document.body.appendChild(overlay);
  return new Promise(resolve=>{
    const finish=choice=>{document.removeEventListener('keydown',onKey);overlay.remove();resolve(choice)},onKey=event=>{if(event.key==='Escape')finish('cancel')};
    document.addEventListener('keydown',onKey);
    overlay.addEventListener('click',event=>{if(event.target===overlay)finish('cancel')});
    overlay.querySelectorAll('[data-cloud-conflict]').forEach(button=>button.addEventListener('click',()=>{const choice=button.dataset.cloudConflict;if(choice==='backup'){backupTriple20Data('triple20_konflikt_lokal');overlay.querySelector('.cloud-conflict-feedback').textContent='Lokale Sicherung wurde heruntergeladen. Du kannst jetzt sicher entscheiden.';return}finish(choice)}));
    overlay.querySelector('[data-cloud-conflict="cloud"]')?.focus();
  });
}
function applyLiveTournamentData(value){
  if(!value||T20Cloud.pendingKeys.has('dartTournament'))return;const current=T20DataSchema.toLogical('dartTournament',value);T20_SUPPRESS_SYNC=true;try{writeDataDocument('dartTournament',current)}finally{T20_SUPPRESS_SYNC=false}
  Reflect.ownKeys(state).forEach(key=>delete state[key]);Object.assign(state,current);applyStoredTvSettings();ensureTournamentDayState();loadActiveCompetition();if(!$('#tvSection')?.classList.contains('hidden')){renderTvView();renderTvDisplayControls()}if(!$('#statsStationSection')?.classList.contains('hidden'))renderStatsStation(true);
}
function applyLiveTvSettings(value){if(!value)return;T20_SUPPRESS_SYNC=true;try{writeDataDocument(TV_SETTINGS_KEY,value,{native:true})}finally{T20_SUPPRESS_SYNC=false}applyStoredTvSettings();renderTvDisplayControls();if(!$('#tvSection')?.classList.contains('hidden'))renderTvView()}
function mergeRemoteStationSuggestions(remote){
  if(!remote)return 0;remote=T20DataSchema.toLogical('dartTournament',remote);ensureTournamentDayState();let changed=0;
  for(const key of ['men','women']){const localCompetition=key===state.activeCompetition?state:state.competitions?.[key],remoteCompetition=remote.competitions?.[key];if(!localCompetition?.matches||!remoteCompetition?.matches)continue;localCompetition.matches.forEach((match,index)=>{if(match.sa!==null)return;const incoming=(match.nodeId?remoteCompetition.matches.find(item=>item.nodeId===match.nodeId):null)||remoteCompetition.matches[index];if(!incoming||incoming.a!==match.a||incoming.b!==match.b||(+incoming.round||1)!==(+match.round||1))return;for(const field of ['suggestedScore','autodartsStats'])if(incoming[field]&&JSON.stringify(match[field])!==JSON.stringify(incoming[field])){match[field]=structuredClone(incoming[field]);changed++}})}
  if(changed){T20_SUPPRESS_SYNC=true;try{syncActiveCompetition();writeDataDocument('dartTournament',state);if(!$('#tournamentSection')?.classList.contains('hidden'))renderTournament();if(!$('#statsStationSection')?.classList.contains('hidden'))renderStatsStation(false,true)}finally{T20_SUPPRESS_SYNC=false}}
  return changed;
}
function backupPreview(data=collectTriple20Data()){const seasons=logicalDataValue(SEASON_KEY,data[SEASON_KEY])?.seasons||[],tournaments=logicalDataValue(TOURNAMENT_HISTORY_KEY,data[TOURNAMENT_HISTORY_KEY])||[],duels=logicalDataValue(CLUB_DUELS_KEY,data[CLUB_DUELS_KEY])?.duels||[],current=logicalDataValue('dartTournament',data.dartTournament)||{},active=current.competitions?.[current.activeCompetition||'men']||current;return `${seasons.length} Saison(en), ${tournaments.length} gespeicherte Turnier(e), ${duels.length} Vereinsduell(e), aktuelles Turnier: ${active.started?'läuft':'nicht gestartet'}${active.players?.length?`, ${active.players.length} Spieler`:''}`;}
function setSyncStatus(text,cls='view-only'){const bar=$('#syncStatusBar'),label=$('#syncStatusText');if(!bar||!label)return;bar.className=`sync-status ${cls}`;label.textContent=text;const last=$('#syncLastSaved');if(last)last.textContent=T20Cloud?.lastSyncAt?`Letzte Synchronisierung: ${new Date(T20Cloud.lastSyncAt).toLocaleString('de-AT')}`:'Noch nicht synchronisiert'}
function isAdmin(){return !!window.T20Cloud?.isAdmin}
function isFullAdmin(){return window.T20Cloud?.role==='admin'}
function canManageTournament(){return isAdmin()}
function canManageClubData(){return isFullAdmin()}
function isMember(){return !!window.T20Cloud?.user&&!isAdmin()}
function accountMenuLabel(){return T20Cloud?.user?(T20Cloud.profile?.nickname?'Mein Profil':'Konto'):'Anmelden'}
function assertAdminAction(){if(isAdmin())return true;appAlert('Nur die Turnierleitung darf Daten ändern. Du bist aktuell im Nur-Ansicht-Modus.');return false}
function canEditCurrentTournament(){return isAdmin()}
function assertTournamentAction(){if(canEditCurrentTournament())return true;appAlert('Dieses Vereinsturnier kann nur von der Turnierleitung geändert werden.');return false}
function renderReadonlyMode(){
  const admin=isAdmin(),member=isMember(),guest=!admin&&!member,schemaLocked=!!dataSchemaCompatibilityError,readonly=!admin||schemaLocked;
  document.body.classList.toggle('view-only',readonly);
  document.body.classList.toggle('admin-mode',admin);
  document.body.classList.toggle('member-mode',member);
  document.body.classList.toggle('guest-mode',guest);
  for(const id of ['setupSection','tournamentSection','settingsSection','seasonSection','clubDuelsSection']){const section=$('#'+id);if(section){section.inert=!!T20Cloud.resumeBusy||schemaLocked;section.setAttribute('aria-busy',String(!!T20Cloud.resumeBusy||schemaLocked))}}
  $('#seasonActionSelect')?.closest('label')?.classList.toggle('hidden',!canManageClubData());
  $('#addToSeasonBtn')?.classList.toggle('hidden',!canManageTournament());
  document.querySelectorAll('#setupSection input,#setupSection select,#setupSection button').forEach(control=>{const disabled=schemaLocked||!!T20Cloud.resumeBusy||!T20Cloud.authResolved||(member&&!state.memberLocal);control.disabled=disabled;control.setAttribute('aria-disabled',String(disabled))});
  document.querySelectorAll('.score-controls select,.score-controls button').forEach(control=>{const disabled=!!T20Cloud.resumeBusy||!canEditCurrentTournament()||!!state.endedEarly;control.disabled=disabled;control.setAttribute('aria-disabled',String(disabled))});
  document.querySelectorAll('#withdrawCard input,#withdrawCard select,#withdrawCard button,#qualificationCard button,#undoLastScoreBtn,#endTournamentBtn,#finishReset,#seasonImportCard input,#seasonImportCard select,#seasonImportCard button').forEach(control=>{const disabled=!canEditCurrentTournament();control.disabled=disabled;control.setAttribute('aria-disabled',String(disabled))});
  $('#showSettingsBtn')?.classList.toggle('hidden',!isFullAdmin());
  $('#showTournamentBtn')?.classList.toggle('hidden',!canManageTournament());
  $('#showSeasonBtn')?.classList.remove('hidden');
  const loginBtn=$('#showLoginBtn');if(loginBtn)loginBtn.textContent=accountMenuLabel();
  renderNavigation();
  // Die Adminrolle wird asynchron geladen. Deshalb die TV-Steuerung auch hier
  // erneut auswerten, damit sie nicht im vorigen Gast-/Mitgliedsstatus verborgen bleibt.
  renderTvDisplayControls();
  if(schemaLocked)setSyncStatus('App-Update erforderlich – neuere Datenversion erkannt','conflict');
  if(readonly&&$('#settingsSection')&&!$('#settingsSection').classList.contains('hidden'))showLogin();
}
function replaceCloudPanelHtml(panel,html){
  const active=document.activeElement,activeId=active?.id||'',selection=active&&typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
  const values=Object.fromEntries([...panel.querySelectorAll('input[id],textarea[id],select[id]')].filter(input=>input.type!=='file').map(input=>[input.id,input.value]));
  const openDetails=new Set([...panel.querySelectorAll('details[id][open]')].map(details=>details.id));
  panel.innerHTML=html.replaceAll('sechsstelligen','achtstelligen').replaceAll('sechsstellige','achtstellige');
  const otpInput=panel.querySelector('#memberOtpCode');if(otpInput){otpInput.maxLength=8;otpInput.pattern='[0-9]{8}';otpInput.placeholder='8-stelliger Code'}
  Object.entries(values).forEach(([id,value])=>{const input=panel.querySelector(`#${id}`);if(input)input.value=value});
  openDetails.forEach(id=>{const details=panel.querySelector(`#${id}`);if(details)details.open=true});
  const nextActive=activeId?panel.querySelector(`#${activeId}`):null;
  if(nextActive){nextActive.focus({preventScroll:true});if(selection&&typeof nextActive.setSelectionRange==='function')nextActive.setSelectionRange(selection[0],selection[1])}
}
function renderAdminMembers(){
  if(!isFullAdmin())return'';
  const c=T20Cloud,profiles=[...(c.adminProfiles||[])].sort((a,b)=>{
    const aOnline=c.onlineUserIds?.has(a.id)?1:0,bOnline=c.onlineUserIds?.has(b.id)?1:0;
    if(aOnline!==bOnline)return bOnline-aOnline;
    const aLastSeen=Date.parse(a.last_seen_at||'')||0,bLastSeen=Date.parse(b.last_seen_at||'')||0;
    if(aLastSeen!==bLastSeen)return bLastSeen-aLastSeen;
    const aName=a.nickname||a.display_name||'',bName=b.nickname||b.display_name||'';
    return aName.localeCompare(bName,'de',{sensitivity:'base'});
  });
  const cards=profiles.map(profile=>{
    const ownProfile=profile.id===c.user?.id,role=c.memberRoles?.[profile.id]||'member',roleLabel=role==='admin'?'Vereinsadministrator':role==='tournament_manager'?'Turnierleitung':'Mitglied',name=profile.display_name||(ownProfile?'Eigenes Konto':'Name noch nicht eingetragen'),nickname=profile.nickname||(ownProfile?'Eigenes Konto':'Spitzname fehlt'),initial=esc((profile.nickname||profile.display_name||(ownProfile?'A':'?')).trim().charAt(0).toUpperCase()||'?'),photo=c.adminProfileAvatars?.[profile.id],avatar=photo?`<img src="${esc(photo)}" alt="">`:initial,competition=playerCompetition(profilePlayerId(profile.id));
    const joined=profile.created_at?new Date(profile.created_at).toLocaleDateString('de-AT'):'–';
    const online=c.onlineUserIds?.has(profile.id);
    const lastSeen=online?'Jetzt online':profile.last_seen_at?`Zuletzt online: ${new Intl.DateTimeFormat('de-AT',{dateStyle:'medium',timeStyle:'short'}).format(new Date(profile.last_seen_at))}`:'Zuletzt online: noch nicht erfasst';
    const roleControl=isFullAdmin()?`<label class="member-role-control">Berechtigung<select data-member-role="${esc(profile.id)}" ${ownProfile?'disabled':''}><option value="member" ${role==='member'?'selected':''}>Mitglied</option><option value="tournament_manager" ${role==='tournament_manager'?'selected':''}>Turnierleitung</option><option value="admin" ${role==='admin'?'selected':''}>Vereinsadministrator</option></select></label>`:`<small>${esc(roleLabel)}</small>`,competitionControl=isFullAdmin()?`<label class="member-role-control">Bewerbszuordnung<select data-member-competition="${esc(profilePlayerId(profile.id))}"><option value="open" ${competition==='open'?'selected':''}>Offen / noch nicht festgelegt</option><option value="men" ${competition==='men'?'selected':''}>Herren</option><option value="women" ${competition==='women'?'selected':''}>Damen</option></select></label>`:'';
    return `<article class="admin-member-card ${role!=='member'?'admin-account':''}"><span class="profile-avatar">${avatar}</span><div><strong>${esc(nickname)} <i class="online-dot ${online?'is-online':''}" title="${online?'Online':'Offline'}"></i></strong><span>${esc(name)}</span><small>${esc(roleLabel)} · Registriert seit ${esc(joined)}</small><small>${esc(lastSeen)}</small>${roleControl}${competitionControl}</div></article>`;
  }).join('');
  return `<details id="adminMembersDetails" class="admin-members admin-collapsible"><summary><span><b>Registrierte Mitglieder</b><small>${profiles.length} Profil${profiles.length===1?'':'e'} vorhanden</small></span><i aria-hidden="true">⌄</i></summary><div class="admin-collapsible-body"><div class="admin-members-toolbar"><p class="view-note">Profile, Aktivität und Berechtigungen verwalten. Jedes Konto bleibt gleichzeitig ein persönliches Mitgliedskonto.</p><button id="refreshMembersBtn" class="secondary" type="button" ${c.adminProfilesBusy?'disabled':''}>${c.adminProfilesBusy?'Wird geladen …':'Aktualisieren'}</button></div><div class="admin-member-grid">${cards||'<p class="view-note">Noch keine Mitgliederprofile vorhanden.</p>'}</div></div></details>`;
}
const PushNotifications={
  supported:'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window,
  busy:false,enabled:false,error:'',message:'',subscriberCount:null,
  async registration(){return withTimeout(navigator.serviceWorker.ready,10000,'Die installierte App konnte den Push-Dienst nicht starten. Bitte Triple20 vollständig schließen, neu öffnen und das Update bestätigen.')},
  async invoke(body){const client=requireSupabaseClient(),result=await withTimeout(client.functions.invoke(PUSH_FUNCTION_NAME,{body}),15000,'Die Supabase-Push-Funktion antwortet nicht. Bitte die Function-Logs prüfen.');const {data,error}=result;if(error){let detail='';try{detail=await error.context?.json?.()}catch{}throw new Error(detail?.error||error.message||'Fehler in der Supabase-Push-Funktion.')}return data||{}},
  async refresh({render=true}={}){
    this.error='';
    if(!this.supported||!T20Cloud.user){this.enabled=false;if(render)renderCloudPanel();return}
    try{const registration=await this.registration(),subscription=await registration.pushManager.getSubscription();this.enabled=!!subscription;if(isAdmin()){const config=await this.invoke({action:'config'});this.subscriberCount=Number.isFinite(+config.subscriberCount)?+config.subscriberCount:null}}
    catch(error){console.warn('Push-Status konnte nicht geladen werden:',error);this.error='Push-Dienst ist noch nicht vollständig eingerichtet.'}
    if(render)renderCloudPanel();
  },
  async enable(){
    if(this.busy||!T20Cloud.user)return;this.busy=true;this.error='';this.message='';renderCloudPanel();
    try{if(!this.supported)throw new Error('Push-Nachrichten werden von diesem Browser nicht unterstützt.');const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Benachrichtigungen wurden nicht erlaubt. Du kannst die Freigabe in den Browser-Einstellungen ändern.');const {publicKey}=await this.invoke({action:'config'});if(!publicKey)throw new Error('Der Push-Dienst ist noch nicht fertig eingerichtet.');const registration=await this.registration();let subscription=await withTimeout(registration.pushManager.getSubscription(),8000,'Vorhandene Push-Anmeldung konnte nicht geprüft werden.');if(!subscription)subscription=await withTimeout(registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)}),15000,'Das Gerät konnte nicht für Push registriert werden. Bitte Benachrichtigungen in den iPhone-Einstellungen erlauben.');const json=subscription.toJSON(),client=requireSupabaseClient(),result=await withTimeout(client.from('triple20_push_subscriptions').upsert({user_id:T20Cloud.user.id,endpoint:json.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()},{onConflict:'endpoint'}),12000,'Die Geräteanmeldung konnte nicht online gespeichert werden.'),{error}=result;if(error)throw error;this.enabled=true;this.message='Push-Nachrichten sind auf diesem Gerät aktiviert.'}
    catch(error){console.error('Push aktivieren fehlgeschlagen:',error);this.error=error?.message||'Push-Nachrichten konnten nicht aktiviert werden.'}
    finally{this.busy=false;renderCloudPanel()}
  },
  async disable(){
    if(this.busy||!T20Cloud.user)return;this.busy=true;this.error='';this.message='';renderCloudPanel();
    try{const registration=await this.registration(),subscription=await registration.pushManager.getSubscription();if(subscription){const client=requireSupabaseClient();await client.from('triple20_push_subscriptions').delete().eq('endpoint',subscription.endpoint);await subscription.unsubscribe()}this.enabled=false;this.message='Push-Nachrichten wurden auf diesem Gerät deaktiviert.'}
    catch(error){this.error=error?.message||'Push-Nachrichten konnten nicht deaktiviert werden.'}
    finally{this.busy=false;renderCloudPanel()}
  },
  async send(title,body,url){
    if(this.busy||!isAdmin())return;if(appSettings.pushNotificationsEnabled===false){this.error='Pushnachrichten sind derzeit vollständig ausgeschaltet.';renderCloudPanel();return}this.busy=true;this.error='';this.message='';renderCloudPanel();
    try{const result=await this.invoke({action:'send',title:title.trim(),body:body.trim(),url:url?.trim()||'/'});this.message=`Nachricht versendet: ${result.sent||0} Geräte erreicht${result.removed?`, ${result.removed} alte Anmeldung entfernt`:''}.`;this.subscriberCount=result.subscriberCount??this.subscriberCount}
    catch(error){console.error('Push-Versand fehlgeschlagen:',error);this.error=error?.context?.message||error?.message||'Nachricht konnte nicht versendet werden.'}
    finally{this.busy=false;renderCloudPanel()}
  },
  async sendLiveTournament(){
    // Nur ein über den offiziellen Admin-Check-in übernommener Termin besitzt
    // eine scheduledEventId. Frei gestartete Trainings- und Testturniere lösen
    // bewusst keine Nachricht an alle Mitglieder aus.
    if(!isAdmin()||!state.scheduledEventId||state.scheduledViaTournamentManagement!==true||appSettings.pushNotificationsEnabled===false)return false;
    const eventKey=`${state.scheduledEventId}|${state.activeCompetition||'open'}`;
    const title=`Jetzt live: ${state.eventName||'Dartturnier'}`,body=`Der Bewerb ${competitionLabel()} wurde gestartet. Spielplan und Ergebnisse sind jetzt live verfügbar.`;
    try{await this.invoke({action:'live',eventKey,title,body,url:'/?bereich=live'});return true}
    catch(error){console.warn('Automatische Live-Nachricht konnte nicht versendet werden:',error);this.error='Das Turnier läuft, aber die automatische Pushnachricht konnte nicht versendet werden.';renderCloudPanel();return false}
  }
};
window.PushNotifications=PushNotifications;
function urlBase64ToUint8Array(value){const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)))}
function renderMemberPush(){const p=PushNotifications,ios=/iphone|ipad|ipod/i.test(navigator.userAgent),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(!p.supported)return `<section class="push-card"><div><span class="eyebrow">BENACHRICHTIGUNGEN</span><h3>Auf diesem Browser nicht verfügbar</h3><p>Bitte verwende einen aktuellen Browser.${ios&&!standalone?' Auf iPhone und iPad muss Triple20 zuerst zum Home-Bildschirm hinzugefügt werden.':''}</p></div></section>`;return `<section class="push-card ${p.enabled?'is-enabled':''}"><div><span class="eyebrow">BENACHRICHTIGUNGEN</span><h3>${p.enabled?'Push ist aktiviert':'Nichts mehr verpassen'}</h3><p>${p.enabled?'Dieses Gerät erhält Hinweise zu Spieltagen und wichtigen Vereinsmeldungen.':'Erhalte Hinweise zu neuen Spieltagen, Änderungen und wichtigen Vereinsmeldungen.'}</p>${ios&&!standalone?'<small>Auf iPhone/iPad: Triple20 zuerst über „Teilen → Zum Home-Bildschirm“ installieren und dort öffnen.</small>':''}</div><button id="${p.enabled?'disablePushBtn':'enablePushBtn'}" class="${p.enabled?'secondary':'primary'}" type="button" ${p.busy?'disabled':''}>${p.busy?'BITTE WARTEN …':p.enabled?'Deaktivieren':'PUSH AKTIVIEREN'}</button>${p.error?`<p class="login-error">${esc(p.error)}</p>`:''}${p.message?`<p class="login-success">${esc(p.message)}</p>`:''}</section>`}
function renderAdminPush(){if(!isAdmin())return'';const p=PushNotifications,count=p.subscriberCount===null?'–':p.subscriberCount,on=appSettings.pushNotificationsEnabled!==false,form=isFullAdmin()?`<form id="adminPushForm" class="admin-push-form ${on?'':'is-disabled'}"><div class="admin-push-meta"><label>Titel<input id="pushTitle" maxlength="60" value="Triple20" required ${on?'':'disabled'}></label><label>Ziel in der App<select id="pushUrl" ${on?'':'disabled'}><option value="/">Startseite</option><option value="/?bereich=saison">Saisonwertung</option><option value="/?bereich=live">Live-Turnier</option><option value="/?bereich=konto">Konto</option></select></label></div><label class="admin-push-message">Nachricht<textarea id="pushBody" maxlength="180" placeholder="Was sollen die Mitglieder wissen?" required ${on?'':'disabled'}></textarea></label><div class="admin-push-footer"><small>Kurz und eindeutig formulieren · maximal 180 Zeichen</small><button class="primary" type="submit" ${p.busy||!on?'disabled':''}>${p.busy?'WIRD GESENDET …':'NACHRICHT SENDEN'}</button></div></form>`:'<p class="view-note">Als Turnierleitung kannst du den gesamten Pushversand für Testturniere pausieren. Einzelne Rundnachrichten bleiben dem Vereinsadministrator vorbehalten.</p>';return `<details id="adminPushDetails" class="admin-push admin-collapsible"><summary><span><b>Pushnachrichten</b><small>${on?'Eingeschaltet':'Vollständig ausgeschaltet'} · ${count} ${count===1?'Gerät':'Geräte'} erreichbar</small></span><i aria-hidden="true">⌄</i></summary><div class="admin-collapsible-body"><div class="push-master-control ${on?'is-on':'is-off'}"><div><b>Pushversand</b><small>${on?'Manuelle und automatische Nachrichten sind aktiv.':'Beim Testen werden keine Nachrichten verschickt.'}</small></div><label class="push-switch"><input id="globalPushToggle" type="checkbox" ${on?'checked':''} ${p.busy?'disabled':''}><span aria-hidden="true"></span><em>${on?'EIN':'AUS'}</em></label></div>${form}${p.error?`<p class="login-error">${esc(p.error)}</p>`:''}${p.message?`<p class="login-success">${esc(p.message)}</p>`:''}</div></details>`}
async function setGlobalPushEnabled(enabled){
  if(!isAdmin()||PushNotifications.busy)return;
  const previous=appSettings.pushNotificationsEnabled!==false;PushNotifications.busy=true;PushNotifications.error='';PushNotifications.message='';renderCloudPanel();
  try{
    const client=requireSupabaseClient(),{data,error}=await client.rpc('triple20_set_push_enabled',{enabled:!!enabled});if(error)throw error;
    appSettings=mergeSettings(appSettings,data||{pushNotificationsEnabled:!!enabled});
    T20_SUPPRESS_SYNC=true;try{writeLogicalData(SETTINGS_KEY,appSettings,{native:true})}finally{T20_SUPPRESS_SYNC=false}
    if(T20Cloud.loadedCloudData)T20Cloud.loadedCloudData[SETTINGS_KEY]=structuredClone(appSettings);
    T20Cloud.pendingKeys.delete(SETTINGS_KEY);T20Cloud.persistPendingKeys();
    PushNotifications.message=enabled?'Pushnachrichten sind wieder eingeschaltet.':'Pushnachrichten sind vollständig ausgeschaltet.';
  }catch(error){
    appSettings=mergeSettings(appSettings,{pushNotificationsEnabled:previous});PushNotifications.error=`Pushversand konnte nicht umgeschaltet werden: ${error?.message||'Bitte das aktuelle Rechte-SQL in Supabase ausführen.'}`;
  }finally{PushNotifications.busy=false;renderCloudPanel()}
}
function renderAdminAdvertising(){if(!isFullAdmin())return'';const on=appSettings.tyrolDartsAdEnabled!==false;return `<details id="adminAdvertisingDetails" class="admin-advertising admin-collapsible"><summary><span><b>TyrolDarts-Werbung</b><small>${on?'Auf der Startseite sichtbar':'Ausgeblendet'}</small></span><i aria-hidden="true">⌄</i></summary><div class="admin-collapsible-body"><div class="push-master-control ${on?'is-on':'is-off'}"><div><b>Werbung auf der Startseite</b><small>Die Karte erscheint zwischen zukünftigen und vergangenen Spielen. Turnier- und TV-Ansicht bleiben werbefrei.</small></div><label class="push-switch"><input id="tyrolDartsAdToggle" type="checkbox" ${on?'checked':''}><span aria-hidden="true"></span><em>${on?'EIN':'AUS'}</em></label></div></div></details>`}
async function setTyrolDartsAdEnabled(enabled){if(!isFullAdmin())return;appSettings=mergeSettings(appSettings,{tyrolDartsAdEnabled:!!enabled});saveSettings();renderPublicHome({refreshRegistrations:false});renderCloudPanel();await T20Cloud.syncAll({force:true,keys:[SETTINGS_KEY]});renderCloudPanel()}
function upcomingAdminEvents(){
  const today=todayIso(),activeScheduleIds=new Set([state.scheduledEventId,...Object.values(state.competitions||{}).map(competition=>competition?.scheduledEventId)].filter(Boolean));return publicTournamentRecords().filter(item=>item.planned&&!activeScheduleIds.has(item.id)&&item.date>=today).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.startTime||'').localeCompare(b.startTime||'')||(a.name||'').localeCompare(b.name||'','de'));
}
function checkInData(event){
  const eventKey=registrationEventKey(event),registered=tournamentRegistrations.filter(row=>row.event_key===eventKey);
  return{ids:registered.map(row=>row.user_id)};
}
function renderAdminCheckIn(){
  if(!adminCheckInEventKey)return'';
  const event=upcomingAdminEvents().find(item=>registrationEventKey(item)===adminCheckInEventKey);if(!event)return'';
  const data=checkInData(event),registeredCount=data.ids.length;
  return `<section class="admin-checkin"><div class="admin-section-heading"><div><span class="eyebrow">AUSGEWÄHLTES TURNIER</span><h3>${esc(event.name||'Spieltag')}</h3><p class="view-note">${publicDate(event.date)}${publicStartTime(event)?` · ${esc(publicStartTime(event))}`:''} · ${esc(event.competitionLabel||'Offen')}</p></div><button class="secondary" type="button" data-checkin-close>Schließen</button></div><div class="checkin-summary"><b>${registeredCount}</b><span>${registeredCount===1?'Anmeldung':'Anmeldungen'}</span><small>werden automatisch übernommen</small></div><p class="view-note">Danach kannst du gespeicherte Mitglieder und Gäste ergänzen oder abwesende Teilnehmende entfernen.</p><button class="primary checkin-transfer" type="button" data-checkin-transfer>TURNIER VORBEREITEN <span>→</span></button></section>`;
}
function tournamentScheduleFormHtml(){
  return `<details class="public-admin-schedule tournament-schedule-create card slim-card"><summary><span><b>Neues Turnier ankündigen</b><small>Termin, Bewerb und optionale Wertung festlegen</small></span><i aria-hidden="true">⌄</i></summary><div class="tournament-schedule-create-body"><div><span class="eyebrow">TURNIERLEITUNG</span><h3>Turnier ankündigen</h3><p>Der Termin erscheint sofort im öffentlichen Zuschauerbereich.</p></div><form id="publicScheduleForm"><label>Datum<input id="publicScheduleDate" type="date" required></label><label>Startzeit<input id="publicScheduleTime" type="time" value="19:00" required></label><label>Bezeichnung<input id="publicScheduleName" maxlength="60" placeholder="z. B. Dienstagsturnier" required></label><label>Bewerb<select id="publicScheduleCompetition"><option value="men">Herren</option><option value="women">Damen</option><option value="open">Offen</option></select></label><label>Wertung (optional)<select id="publicScheduleSeason"></select></label><button class="primary" type="submit">TURNIER ANKÜNDIGEN <span>→</span></button><p id="publicScheduleStatus" class="public-schedule-status hidden" role="status" aria-live="assertive"></p></form></div></details>`;
}
function prepareTournamentScheduleForm(){
  const select=$('#publicScheduleSeason');if(select)select.innerHTML='<option value="">Keine Wertung – eigenständiges Turnier</option>'+sortedSeasons().map(season=>`<option value="${esc(season.id)}">${esc(seasonOptionLabel(season))}</option>`).join('');
  const date=$('#publicScheduleDate');if(date&&!date.value)date.value=todayIso();
}
function adminMemberAssignmentHtml(){
  if(!isFullAdmin())return'';return `<details class="admin-member-assignment admin-collapsible"><summary><span><b>Mitglieder-Zuordnung</b><small>Spielernamen mit registrierten Benutzerkonten verbinden</small></span><i aria-hidden="true">⌄</i></summary><div class="admin-collapsible-body"><label>Wertung auswählen<select id="adminMemberSeasonSelect"></select></label><div id="tournamentMemberAssignment"></div></div></details>`;
}
function renderAdminMemberAssignment(){
  const box=$('#tournamentMemberAssignment'),select=$('#adminMemberSeasonSelect');if(!box||!select||!isFullAdmin())return;const seasons=sortedSeasons(),season=seasons.find(item=>item.id===selectedSeasonId)||seasons[0];select.innerHTML=seasons.map(item=>`<option value="${esc(item.id)}" ${item.id===season?.id?'selected':''}>${esc(seasonOptionLabel(item))}</option>`).join('')||'<option value="">Keine Wertung vorhanden</option>';if(!season){box.innerHTML='<div class="empty-card">Für die Zuordnung muss zuerst eine Liga-Wertung erstellt werden.</div>';return}renderSeasonMembers(season,calculateSeasonStandings(season),'#tournamentMemberAssignment');
}
function renderAdminDashboard({account=false}={}){
  const upcoming=upcomingAdminEvents(),live=Object.values(state.competitions||{}).filter(competitionIsLive).length,online=T20Cloud.onlineUserIds?.size||0,lastSync=T20Cloud.lastSyncAt?new Intl.DateTimeFormat('de-AT',{dateStyle:'short',timeStyle:'short'}).format(new Date(T20Cloud.lastSyncAt)):'–',registrationTotal=upcoming.reduce((sum,event)=>sum+(tournamentRegistrationCounts[registrationEventKey(event)]||0),0);
  const events=upcoming.length?`<div class="admin-event-grid">${upcoming.map(event=>{const key=registrationEventKey(event),count=tournamentRegistrationCounts[key]||0,selected=key===adminCheckInEventKey;return `<button class="admin-event-card ${selected?'is-selected':''}" type="button" data-admin-checkin="${esc(key)}" aria-expanded="${selected}"><time>${publicDate(event.date)}${publicStartTime(event)?`<b>${esc(publicStartTime(event))}</b>`:''}</time><span><b>${esc(event.name||'Spieltag')}</b><small>${esc(event.competitionLabel||'Offen')}${event.seasonName?` · ${esc(event.seasonName)}`:''}</small></span><strong>${count}<small>${count===1?' Anmeldung':' Anmeldungen'}</small></strong><i>›</i></button>`}).join('')}</div>`:`<div class="admin-next-empty"><div><h3>Kein kommendes Turnier</h3><p>Lege oben unter „Neues Turnier ankündigen“ den nächsten Termin an.</p></div></div>`;
  const body=`${account?'':tournamentScheduleFormHtml()}<div class="admin-compact-stats"><span><small>Mitglieder</small><b>${T20Cloud.adminProfiles?.length||0}</b></span><span><small>Online</small><b>${online}</b></span><span><small>Live</small><b>${live}</b></span><span class="admin-last-sync"><small>Abgleich</small><b>${esc(lastSync)}</b></span></div><div class="admin-prep-heading"><div><span class="eyebrow">TURNIERLEITUNG</span><h3>Angekündigte Turniere vorbereiten</h3></div></div>${events}${renderAdminCheckIn()}${account?'':adminMemberAssignmentHtml()}`;
  return account?`<details id="adminDashboardDetails" class="admin-dashboard-compact admin-collapsible"><summary><span><b>Turnierleitung</b><small>${upcoming.length} kommende${upcoming.length===1?'s Turnier':' Turniere'} · ${registrationTotal} Anmeldung${registrationTotal===1?'':'en'}</small></span><i aria-hidden="true">⌄</i></summary><div class="admin-collapsible-body">${body}</div></details>`:`<section class="admin-dashboard-compact tournament-management-dashboard"><div class="tournament-management-heading"><div><span class="eyebrow">GESCHÜTZTER BEREICH</span><h2>Turnierleitung</h2><p>Angekündigte Turniere vorbereiten, Teilnehmende übernehmen und Turniere starten.</p></div></div><div class="admin-collapsible-body">${body}</div></section>`;
}
function renderTournamentManagement(){const panel=$('#tournamentManagementPanel');if(!panel)return;panel.classList.toggle('hidden',!canManageTournament());panel.innerHTML=canManageTournament()?renderAdminDashboard():'';prepareTournamentScheduleForm();renderAdminMemberAssignment()}
function renderPersonalMemberOverview(){
  const c=T20Cloud,userId=c.user?.id||'',nickname=c.profile?.nickname?.trim()||'',seasons=[...(seasonStore.seasons||[])].sort((a,b)=>Number(!!a.archived)-Number(!!b.archived)||(b.startDate||'').localeCompare(a.startDate||''));
  const ownRows=seasons.map(season=>{const rows=calculateSeasonStandings(season),row=rows.find(item=>(userId&&item.profileId===userId)||(nickname&&normalizedPlayerName(item.name)===normalizedPlayerName(nickname)));return row?{season,row,rank:rows.indexOf(row)+1}:null}).filter(Boolean);
  const current=ownRows.find(item=>!item.season.archived&&(!item.season.startDate||item.season.startDate<=todayIso())&&(!item.season.endDate||item.season.endDate>=todayIso()))||ownRows.find(item=>!item.season.archived)||ownRows[0];
  const next=publicTournamentRecords().filter(item=>item.planned&&item.date>=todayIso()).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.startTime||'').localeCompare(b.startTime||''))[0];
  if(!current)return `<section class="personal-overview personal-overview-empty"><div><span class="eyebrow">MEINE ÜBERSICHT</span><h3>Noch keine Saisonzuordnung</h3><p>Dein Profil ist noch mit keinem Spieler in einer Saison verknüpft. Bitte die Turnierleitung, dein Mitgliederprofil einmalig zuzuordnen.</p></div>${next?`<aside><small>Nächster Spieltag</small><b>${esc(next.name||next.eventName||'Spieltag')}</b><span>${publicDate(next.date)}${publicStartTime(next)?` · ${esc(publicStartTime(next))}`:''}</span></aside>`:''}</section>`;
  const {season,row,rank}=current;if(!canViewSeasonStandings(season))return `<section class="personal-overview personal-overview-locked"><div><span class="eyebrow">MEINE ÜBERSICHT</span><h3>${esc(season.name)}</h3><p>${esc(SEASON_STANDINGS_LOCK_MESSAGE)}</p></div>${next?`<aside><small>Nächster Spieltag</small><b>${esc(next.name||next.eventName||'Spieltag')}</b><span>${publicDate(next.date)}${publicStartTime(next)?` · ${esc(publicStartTime(next))}`:''}</span></aside>`:''}</section>`;
  const recent=row.entries.filter(entry=>entry.present).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,3),balance=row.wins+row.losses?`${row.wins} : ${row.losses}`:'0 : 0';
  return `<section class="personal-overview"><div class="personal-overview-head"><div><span class="eyebrow">MEINE ÜBERSICHT</span><h3>${esc(season.name)}</h3><p>${esc(row.name)} · Persönliche Saisonwerte</p></div><div class="personal-overview-actions"><button class="secondary" type="button" data-member-profile="${esc(playerProfileReference(row))}">Mein öffentliches Profil</button><button class="secondary" type="button" data-member-season="${esc(season.id)}">Rangliste öffnen</button></div></div><div class="personal-stat-grid"><article><small>Rang</small><b>${rank}</b></article><article><small>Punkte</small><b>${row.cleanPoints}</b></article><article><small>Turniere</small><b>${row.played}</b></article><article><small>Siege : Niederlagen</small><b>${balance}</b></article></div><div class="personal-overview-detail"><section><h4>Letzte Ergebnisse</h4>${recent.length?`<div class="personal-results">${recent.map(entry=>`<div><span><b>${publicDate(entry.date)}</b>${esc(entry.name||'Spieltag')}</span><strong>${entry.rank?`${entry.rank}. Platz · `:''}${entry.points} Pkt.</strong></div>`).join('')}</div>`:'<p class="view-note">Noch kein gespielter Termin vorhanden.</p>'}</section><section class="personal-next-event"><h4>Nächster Spieltag</h4>${next?`<b>${esc(next.name||next.eventName||'Spieltag')}</b><p>${publicDate(next.date)}${publicStartTime(next)?` · ${esc(publicStartTime(next))}`:''}</p><small>${esc([next.competitionLabel,next.seasonName].filter(Boolean).join(' · ')||'Weitere Informationen folgen')}</small><button class="link-btn" type="button" data-member-home>Alle Termine öffnen</button>`:'<p class="view-note">Derzeit ist kein zukünftiger Spieltag eingetragen.</p>'}</section></div></section>`;
}
function renderStaffMemberIdentity(){
  const c=T20Cloud,p=c.profile||{},roleLabel=c.role==='admin'?'Vereinsadministrator':'Turnierleitung',initial=esc((p.nickname||p.display_name||c.user?.email||'?').trim().charAt(0).toUpperCase()||'?'),avatar=c.avatarSignedUrl?`<img src="${esc(c.avatarSignedUrl)}" alt="Profilfoto">`:initial,nickname=p.nickname||'Spitzname noch nicht eingetragen';
  const lab=isFullAdmin()?'<button id="openDartVisionLabBtn" class="secondary dartvision-account-link" type="button">DartVision-Labor öffnen</button>':'';
  return `<section class="staff-member-identity"><div class="profile-heading"><div><span class="profile-avatar">${avatar}</span><div><span class="eyebrow">MITGLIED &amp; ${esc(roleLabel.toUpperCase())}</span><h3>${esc(nickname)}</h3><p class="view-note">${esc(p.display_name||'Vor- und Zuname fehlen')} · ${esc(c.user?.email||'')}</p></div></div><button id="adminLogoutBtn" class="secondary" type="button">Abmelden</button></div>${renderPersonalMemberOverview()}${lab}<details id="staffProfileSettings" class="member-account-settings"><summary><span><b>Profil &amp; Benachrichtigungen</b><small>Push, Profilfoto und persönliche Angaben verwalten</small></span><i aria-hidden="true">⌄</i></summary><div class="member-account-settings-body">${renderMemberPush()}<section class="member-profile-settings"><div class="member-settings-heading"><span class="eyebrow">PROFIL</span><h3>Persönliche Angaben</h3></div><div class="avatar-actions"><label class="secondary avatar-upload">${c.avatarBusy?'Bild wird verarbeitet …':'Profilfoto auswählen'}<input id="profileAvatarInput" type="file" accept="image/*" ${c.avatarBusy?'disabled':''}></label>${p.avatar_url?`<button id="removeAvatarBtn" class="danger" type="button" ${c.avatarBusy?'disabled':''}>Foto entfernen</button>`:''}<small>Profilfoto, Spitzname und vollständigen Namen hier verwalten.</small></div><p id="loginError" class="login-error">${esc(c.authError||'')}</p><p class="login-success ${c.authMessage?'':'hidden'}">${esc(c.authMessage||'')}</p><form id="memberProfileForm" class="profile-form"><label>Spitzname<input id="profileNickname" maxlength="30" value="${esc(p.nickname||'')}" required></label><label>Vor- und Zuname<input id="profileDisplayName" maxlength="60" value="${esc(p.display_name||'')}" autocomplete="name" required></label><button class="primary" type="submit">${c.profileBusy?'Wird gespeichert …':'PROFIL SPEICHERN'}</button></form></section></div></details></section>`;
}
function renderCloudPanel(){
  const panel=$('#cloudAdminPanel');if(!panel||!window.T20Cloud)return;
  const c=T20Cloud,summary=backupPreview();
  if(T20_LOCAL_PREVIEW&&!c.session){replaceCloudPanelHtml(panel,`<div class="account-grid unified-login"><section><span class="eyebrow">SICHERER TESTBETRIEB</span><h3>Lokaler Testmodus</h3><p class="view-note">Anmeldung und Cloud-Speicherung sind in dieser Vorschau ausgeschaltet. Änderungen bleiben ausschließlich in diesem Browser auf diesem Mac.</p><p class="login-success">Die produktiven Vereinsdaten und Mitgliederkonten werden nicht verändert.</p><button id="enterLocalAdminPreviewBtn" class="primary" type="button">VERWALTUNG LOKAL TESTEN</button></section></div>`);return}
  if(c.authHandoffActive){panel.innerHTML=`<section class="auth-handoff"><span>✓</span><h3>Anmeldung erfolgreich</h3><p>Triple20 ist bereits in einem anderen Tab geöffnet. Dieser Tab wird geschlossen.</p><div><button id="closeAuthTabBtn" class="primary" type="button">DIESES FENSTER SCHLIESSEN</button><button id="continueAuthTabBtn" class="secondary" type="button">HIER WEITER</button></div></section>`;return}
  if(!c.session){const testPasswordLogin=`<form id="testPasswordLoginForm" class="member-login"><input id="testLoginEmail" type="email" placeholder="E-Mail-Adresse" autocomplete="email" required><input id="testLoginPassword" type="password" placeholder="Testpasswort" autocomplete="current-password" required><button class="primary" type="submit">${c.loginBusy?'Wird angemeldet …':'MIT TESTPASSWORT ANMELDEN'}</button></form>`;replaceCloudPanelHtml(panel,`<div class="account-grid unified-login"><section><span class="eyebrow">TESTVERSION</span><h3>Anmeldung mit Testpasswort</h3><p class="view-note">Nur für die getrennte Testumgebung. Es wird keine E-Mail versendet.</p><p id="loginError" class="login-error">${esc(c.authError||'')}</p><p class="login-success ${c.authMessage?'':'hidden'}">${esc(c.authMessage||'')}</p>${testPasswordLogin}</section></div>`);return}if(!c.session){const memberLogin=c.otpEmail?`<form id="memberCodeForm" class="member-code-form"><label>Anmeldecode für <b>${esc(c.otpEmail)}</b><input id="memberOtpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-stelliger Code" required></label><button class="primary" type="submit">${c.otpVerifyBusy?'Wird geprüft …':'CODE BESTÄTIGEN'}</button><button id="changeMemberEmailBtn" class="secondary" type="button">Andere E-Mail</button><button id="resendMemberCodeBtn" class="link-btn" type="button" ${c.magicLinkBusy?'disabled':''}>${c.magicLinkBusy?'Code wird gesendet …':'Neuen Code senden'}</button></form>`:`<form id="memberLoginForm" class="member-login"><input id="memberEmail" type="email" placeholder="E-Mail-Adresse" autocomplete="email" required><button class="primary" type="submit">${c.magicLinkBusy?'Code wird gesendet …':'ANMELDECODE ANFORDERN'}</button></form>`;replaceCloudPanelHtml(panel,`<div class="account-grid unified-login"><section><h3>Anmeldung</h3><p class="view-note">Mitglieder, Turnierleitungen und Vereinsadministrator melden sich hier gleich an. Die hinterlegte Berechtigung wird danach automatisch geladen.</p><p id="loginError" class="login-error">${esc(c.authError||'')}</p><p class="login-success ${c.authMessage?'':'hidden'}">${esc(c.authMessage||'')}</p>${memberLogin}</section></div>`);return}
  if(!c.isAdmin){
    const p=c.profile||{},initial=esc((p.nickname||p.display_name||c.user?.email||'?').trim().charAt(0).toUpperCase()||'?'),avatar=c.avatarSignedUrl?`<img src="${esc(c.avatarSignedUrl)}" alt="Profilfoto">`:initial,nickname=p.nickname||'Spitzname noch nicht eingetragen';
    replaceCloudPanelHtml(panel,`<section class="member-profile"><div class="profile-heading"><div><span class="profile-avatar">${avatar}</span><div><h3>${esc(nickname)}</h3><p class="view-note">${esc(p.display_name||'Vor- und Zuname fehlen')} · ${esc(c.user?.email||'')}</p></div></div><button id="memberLogoutBtn" class="secondary" type="button">Abmelden</button></div>${renderPersonalMemberOverview()}<details id="memberAccountSettings" class="member-account-settings"><summary><span><b>Profil &amp; Benachrichtigungen</b><small>Push, Profilfoto und persönliche Daten verwalten</small></span><i aria-hidden="true">⌄</i></summary><div class="member-account-settings-body">${renderMemberPush()}<section class="member-profile-settings"><div class="member-settings-heading"><span class="eyebrow">PROFIL</span><h3>Persönliche Angaben</h3></div><div class="avatar-actions"><label class="secondary avatar-upload">${c.avatarBusy?'Bild wird verarbeitet …':'Profilfoto auswählen'}<input id="profileAvatarInput" type="file" accept="image/*" ${c.avatarBusy?'disabled':''}></label>${p.avatar_url?`<button id="removeAvatarBtn" class="danger" type="button" ${c.avatarBusy?'disabled':''}>Foto entfernen</button>`:''}<small>iPhone-Fotos, JPEG, PNG oder WebP · wird auf 512 × 512 Pixel verkleinert · maximal 1 MB</small></div><p id="loginError" class="login-error">${esc(c.authError||'')}</p><p class="login-success ${c.authMessage?'':'hidden'}">${esc(c.authMessage||'')}</p><form id="memberProfileForm" class="profile-form"><label>Spitzname<input id="profileNickname" maxlength="30" value="${esc(p.nickname||'')}" placeholder="Öffentlicher Spielname" required></label><label>Vor- und Zuname<input id="profileDisplayName" maxlength="60" value="${esc(p.display_name||'')}" placeholder="z. B. Markus Mustermann" autocomplete="name" required></label><button class="primary" type="submit">${c.profileBusy?'Wird gespeichert …':'PROFIL SPEICHERN'}</button></form><p class="view-note">Der Spitzname wird bei Turnieren und Ranglisten angezeigt. Der vollständige Name bleibt im geschützten Profil.</p></section></div></details></section>`);return
  }
  const usage=c.cloudUsage||emptyCloudUsage(),cloudTools=isFullAdmin()?`<h3>Online-Speicherung</h3><p class="view-note">${esc(summary)}</p><p class="view-note"><b>Heute auf diesem Gerät:</b> ${esc(formatCloudBytes(usage.dataBytes))} App-Daten + ${esc(formatCloudBytes(usage.metadataBytes))} Änderungsprüfungen bei ${usage.requests} Cloud-Abfragen. Das ist eine Näherung für <code>triple20_data</code>, nicht der gesamte Supabase-Verbrauch inklusive Bilder und technischer Übertragung.</p><div class="cloud-actions"><button id="backupDownloadBtn" class="cloud-action-btn" type="button">Backup herunterladen</button><label class="cloud-action-btn backup-file">Backup einspielen<input id="backupImportInput" type="file" accept="application/json"></label><button id="uploadLocalBtn" class="cloud-action-btn" type="button">Lokale Daten in die Cloud übernehmen</button><button id="loadCloudBtn" class="cloud-action-btn" type="button">Cloud-Daten laden</button><button id="forceCloudBtn" class="cloud-action-btn danger-cloud" type="button">Cloud überschreiben</button></div>`:'';
  replaceCloudPanelHtml(panel,`${renderStaffMemberIdentity()}${renderAdminPush()}${renderAdminAdvertising()}${renderAdminMembers()}${renderAccessStats()}${cloudTools}`);
}
async function handleBackupImport(file){
  if(!file||!isAdmin())return;
  const text=await file.text();let parsed;
  try{parsed=JSON.parse(text)}catch{appAlert('Die Backup-Datei ist kein gültiges JSON.');return}
  const data=parsed.data||parsed;
  if(!data||!CLOUD_DATA_KEYS.some(k=>k in data)){appAlert('Das Backup enthält keine erkennbaren Triple20-Daten.');return}
  const preview=backupPreview(data);
  backupTriple20Data('triple20_vor_import');
  if(!await appConfirm(`Backup einspielen?\n\nInhalt: ${preview}\n\nDie aktuellen lokalen Daten wurden vorher als JSON gesichert.`))return;
  applyTriple20Data(data);
  await T20Cloud.syncAll({force:true});
  appAlert('Backup wurde lokal eingespielt und online gespeichert.');
}
const AvatarCrop={bitmap:null,zoom:1,panX:0,panY:0,drag:null};
function closeAvatarCrop(){AvatarCrop.bitmap?.close?.();Object.assign(AvatarCrop,{bitmap:null,zoom:1,panX:0,panY:0,drag:null});$('#avatarCropOverlay')?.remove()}
async function decodeAvatarImage(file){
  const asImage=blob=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Bild konnte nicht direkt geöffnet werden.'))};image.src=url});
  try{return await createImageBitmap(file)}catch{}
  try{return await asImage(file)}catch{}
  const sources=['https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js','https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js'];let loadError=null;
  if(typeof window.heic2any!=='function')for(const source of sources){try{await loadScript(source);if(typeof window.heic2any==='function')break}catch(error){loadError=error}}
  if(typeof window.heic2any!=='function')throw loadError||new Error('Die iPhone-Fotokonvertierung konnte nicht geladen werden.');
  const converted=await window.heic2any({blob:file,toType:'image/jpeg',quality:.9}),jpeg=Array.isArray(converted)?converted[0]:converted;
  try{return await createImageBitmap(jpeg)}catch{return await asImage(jpeg)}
}
function drawAvatarCrop(){
  const canvas=$('#avatarCropCanvas'),bitmap=AvatarCrop.bitmap;if(!canvas||!bitmap)return;
  const size=canvas.width,scale=Math.max(size/bitmap.width,size/bitmap.height)*AvatarCrop.zoom,maxX=Math.max(0,(bitmap.width*scale-size)/2),maxY=Math.max(0,(bitmap.height*scale-size)/2);
  AvatarCrop.panX=Math.max(-maxX,Math.min(maxX,AvatarCrop.panX));AvatarCrop.panY=Math.max(-maxY,Math.min(maxY,AvatarCrop.panY));
  const context=canvas.getContext('2d');context.clearRect(0,0,size,size);context.drawImage(bitmap,(size-bitmap.width*scale)/2+AvatarCrop.panX,(size-bitmap.height*scale)/2+AvatarCrop.panY,bitmap.width*scale,bitmap.height*scale);
}
async function openAvatarCrop(file){
  if(!file||(!file.type.startsWith('image/')&&!/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name||''))){T20Cloud.authError='Bitte eine Bilddatei auswählen.';renderCloudPanel();return}
  if(file.size>50*1024*1024){T20Cloud.authError='Das Ausgangsbild ist größer als 50 MB.';renderCloudPanel();return}
  closeAvatarCrop();AvatarCrop.bitmap=await decodeAvatarImage(file);AvatarCrop.zoom=1;AvatarCrop.panX=0;AvatarCrop.panY=0;
  document.body.insertAdjacentHTML('beforeend',`<div id="avatarCropOverlay" class="avatar-crop-overlay" role="dialog" aria-modal="true" aria-labelledby="avatarCropTitle"><section class="avatar-crop-dialog"><h3 id="avatarCropTitle">Profilbild ausrichten</h3><p>Verschiebe das Bild mit dem Finger oder der Maus. Mit dem Regler kannst du hineinzoomen.</p><div class="avatar-crop-frame"><canvas id="avatarCropCanvas" width="512" height="512"></canvas></div><label>Bildgröße<input id="avatarCropZoom" type="range" min="1" max="3" value="1" step="0.01"></label><div class="avatar-crop-actions"><button id="cancelAvatarCropBtn" class="secondary" type="button">Abbrechen</button><button id="saveAvatarCropBtn" class="primary" type="button">AUSSCHNITT ÜBERNEHMEN</button></div></section></div>`);
  const canvas=$('#avatarCropCanvas');drawAvatarCrop();
  canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);AvatarCrop.drag={id:event.pointerId,x:event.clientX,y:event.clientY}});
  canvas.addEventListener('pointermove',event=>{if(AvatarCrop.drag?.id!==event.pointerId)return;const ratio=canvas.width/canvas.getBoundingClientRect().width;AvatarCrop.panX+=(event.clientX-AvatarCrop.drag.x)*ratio;AvatarCrop.panY+=(event.clientY-AvatarCrop.drag.y)*ratio;AvatarCrop.drag.x=event.clientX;AvatarCrop.drag.y=event.clientY;drawAvatarCrop()});
  const end=event=>{if(AvatarCrop.drag?.id===event.pointerId)AvatarCrop.drag=null};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  $('#avatarCropZoom').addEventListener('input',event=>{AvatarCrop.zoom=+event.target.value;drawAvatarCrop()});
}
async function saveAvatarCrop(){
  const canvas=$('#avatarCropCanvas');if(!canvas||!AvatarCrop.bitmap)return;
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob)return;
  closeAvatarCrop();await T20Cloud.uploadAvatar(new File([blob],'avatar.webp',{type:'image/webp'}));
}
const T20TabCoord={
  id:globalThis.crypto?.randomUUID?.()||`tab-${Date.now()}-${Math.random()}`,channel:null,pendingResolve:null,pendingTimer:null,
  init(){
    if(typeof BroadcastChannel==='undefined')return;
    this.channel=new BroadcastChannel('triple20-auth-tabs');
    this.channel.onmessage=event=>{const message=event.data||{};if(message.id===this.id)return;if(message.type==='probe')this.channel.postMessage({type:'alive',id:this.id});if(message.type==='alive'&&this.pendingResolve){clearTimeout(this.pendingTimer);const resolve=this.pendingResolve;this.pendingResolve=null;resolve(true)}if(message.type==='cloud-saved')window.T20Cloud?.resumeCloudState?.('anderer Tab')};
  },
  hasOtherTab(){
    if(!this.channel)return Promise.resolve(false);
    return new Promise(resolve=>{this.pendingResolve=resolve;this.channel.postMessage({type:'probe',id:this.id});this.pendingTimer=setTimeout(()=>{if(this.pendingResolve===resolve)this.pendingResolve=null;resolve(false)},700)});
  },
  notifyCloudSaved(keys=[]){this.channel?.postMessage({type:'cloud-saved',id:this.id,keys,at:new Date().toISOString()})}
};
T20TabCoord.init();
function authRedirectErrorMessage(){
  const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.replace(/^#/,'')),description=query.get('error_description')||hash.get('error_description'),code=query.get('error_code')||hash.get('error_code')||query.get('error')||hash.get('error');
  if(!description&&!code)return'';
  return `Der Anmeldelink ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.${description?` (${description.replaceAll('+',' ')})`:''}`;
}
function cleanAuthRedirectUrl(){
  const url=new URL(location.href),authKeys=['code','token_hash','type','error','error_code','error_description'];
  authKeys.forEach(key=>url.searchParams.delete(key));
  if(/[=#&](access_token|refresh_token|expires_in|token_type|error|error_code|error_description)=/.test(url.hash))url.hash='';
  history.replaceState({},document.title,url.pathname+(url.searchParams.size?`?${url.searchParams}`:'')+url.hash);
}
window.T20Cloud={
  authResolved:false,analyticsStats:null,cloudUsage:loadCloudUsage(),partitionRowCache:new Map(),
  stationTournamentUpdatedAt:'',
  publicMemberAvatarExpiresAt:{},
  liveTournamentState:null,tournamentViewMode:'local',
  client:null,ready:false,initPromise:null,authListenerStarted:false,session:null,user:null,isAdmin:false,role:'guest',memberRoles:{},profile:null,avatarSignedUrl:'',homeNewsImageSignedUrl:'',homeNewsImageSignedUrls:{},clubInfoImageSignedUrl:'',homeImageBusy:false,clubInfoImageBusy:false,membershipApplications:[],membershipApplicationsBusy:false,membershipApplicationSubmitting:false,online:false,syncing:false,authBusy:false,sessionProcessingPromise:null,authRedirectSessionPromise:null,authRedirectSessionResolve:null,loginBusy:false,magicLinkBusy:false,otpVerifyBusy:false,otpEmail:'',profileBusy:false,avatarBusy:false,authHandoffActive:false,authHandoffCloseTimer:null,adminProfilesBusy:false,adminProfiles:[],adminProfileAvatars:{},publicMembers:[],publicMemberAvatars:{},presenceChannel:null,onlineUserIds:new Set(),onlineDeviceCount:0,lastSeenTimer:null,lastSeenVisibilityBound:false,connectivityBound:false,backgroundedAt:0,lastResumeCheckAt:0,resumeBusy:false,resumePromise:null,authMessage:'',authError:'',loadBusy:false,stationSuggestionBusy:false,liveTournamentUpdatedAt:'',tvSettingsUpdatedAt:'',pendingSync:window.T20BrowserStorage.getItem('triple20_pending_sync')==='1',pendingKeys:new Set(safeJsonParse(window.T20BrowserStorage.getItem('triple20_pending_keys')||'[]',[])),lastSyncAt:window.T20BrowserStorage.getItem('triple20_last_sync')||'',cloudUpdated:{},loadedCloudData:null,pollTimer:null,memberPollTimer:null,stationPollTimer:null,authRedirectPending:/[?#&](code|token_hash|access_token|refresh_token|error|error_code|error_description)=/.test(location.href),
  startLocalAdminPreview(){
    if(!T20_LOCAL_PREVIEW)return;
    const user={id:'local-preview-admin',email:'lokale-vorschau@triple20.test'};
    this.session={localPreview:true,user};this.user=user;this.authResolved=true;this.ready=false;this.online=false;this.role='admin';this.isAdmin=true;this.profile={id:user.id,nickname:'Lokale Vorschau',display_name:'DCA Testbetrieb'};this.adminProfiles=[this.profile];this.memberRoles={[user.id]:'admin'};
    setSyncStatus('Lokaler Testmodus · keine Cloud','offline');renderReadonlyMode();renderCloudPanel();showDashboard();
  },
  async finishAuthRedirect(){cleanAuthRedirectUrl();this.authHandoffActive=false;this.authMessage='Anmeldung erfolgreich. Du kannst diesen Tab weiterverwenden.';showLogin();renderCloudPanel()},
  async init(){
    if(this.initPromise)return this.initPromise;
    this.initPromise=(async()=>{
      if(T20_LOCAL_PREVIEW){this.authResolved=true;this.ready=false;this.online=false;this.session=null;this.user=null;this.isAdmin=false;this.role='guest';setSyncStatus('Lokaler Testmodus','offline');renderReadonlyMode();renderCloudPanel();return}
      try{
        await ensureSupabaseLibrary();
        if(!SUPABASE_PUBLISHABLE_KEY||SUPABASE_PUBLISHABLE_KEY.includes('HIER_'))throw new Error('Supabase Publishable Key fehlt.');
        if(!this.client){
          this.client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.T20BrowserStorage,storageKey:'triple20-test-auth'}});
          supabaseClient=this.client;
        }
        if(!this.authListenerStarted){
          if(this.authRedirectPending)this.authRedirectSessionPromise=new Promise(resolve=>{this.authRedirectSessionResolve=resolve});
          this.client.auth.onAuthStateChange((event,session)=>{if(session&&this.authRedirectSessionResolve){this.authRedirectSessionResolve(session);this.authRedirectSessionResolve=null}setTimeout(()=>this.setSession(session||null,{authEvent:event}),0)});
          this.authListenerStarted=true;
        }
        this.ready=true;
        renderCloudPanel();
        await this.restoreSessionAfterInit();
        try{await this.loadPublicMembers()}catch(error){console.warn('Öffentliche Spielerprofile konnten nicht geladen werden:',error)}
        this.startPolling();this.bindConnectivityTracking();
        setLoginError('');
      }catch(error){
        console.error('Supabase-Initialisierung fehlgeschlagen:',error);
        this.client=null;supabaseClient=null;this.ready=false;this.authResolved=true;this.initPromise=null;
        setSyncStatus('Offline – lokale Kopie','offline');
        renderReadonlyMode();renderCloudPanel();setLoginError(error.message);
      }
    })();
    return this.initPromise;
  },
  async restoreSessionAfterInit(){
    try{
      let session=null,lastError=null;
      for(let attempt=0;attempt<3;attempt++){try{const result=await withTimeout(this.client.auth.getSession(),10000,'Gespeicherte Sitzung konnte nicht rechtzeitig geladen werden.');if(result.error)throw result.error;session=result.data.session;lastError=null;break}catch(error){lastError=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,600))}}
      if(lastError&&!session)throw lastError;
      if(!session&&this.authRedirectPending){
        session=await Promise.race([this.authRedirectSessionPromise||Promise.resolve(null),new Promise(resolve=>setTimeout(()=>resolve(null),8000))]);
        if(!session){const result=await this.client.auth.getSession();if(result.error)throw result.error;session=result.data.session}
        if(!session){this.authError=authRedirectErrorMessage()||'Der Anmeldelink konnte nicht bestätigt werden. Er ist möglicherweise abgelaufen oder bereits verwendet. Bitte fordere einen neuen Link an.';this.authMessage='';this.authRedirectPending=false;cleanAuthRedirectUrl();await this.setSession(null);showLogin();renderCloudPanel();return}
      }
      await this.setSession(session||null);
      renderCloudPanel();
      // Nach dem Login niemals einen eventuell alten lokalen Turnierstand
      // automatisch veröffentlichen. Zuerst und ausschließlich den zentralen
      // Cloud-Stand laden; ein Turnier wird nur durch eine bewusste Startaktion
      // der Turnierleitung veröffentlicht.
      try{await this.loadCloud({initial:true})}catch(e){console.warn('Cloud-Startladen fehlgeschlagen',e)}
    }catch(error){
      console.warn('Session nach Start konnte nicht geladen werden:',error);
      this.authError=authRedirectErrorMessage()||`Anmeldung konnte nicht abgeschlossen werden: ${error?.message||'Bitte fordere einen neuen Link an.'}`;this.authMessage='';this.authRedirectPending=false;cleanAuthRedirectUrl();setSyncStatus('Nur Ansicht','view-only');showLogin();renderCloudPanel();
    }
  },
  setSession(session,options={}){
    if(!session&&options.authEvent==='INITIAL_SESSION'&&this.session)return Promise.resolve();
    if(session?.access_token&&this.session?.access_token===session.access_token&&this.authResolved)return this.sessionProcessingPromise||Promise.resolve();
    const previous=this.sessionProcessingPromise||Promise.resolve();
    const current=previous.catch(error=>console.warn('Vorherige Sitzungsverarbeitung fehlgeschlagen:',error)).then(()=>this.processSession(session,options));
    this.sessionProcessingPromise=current;
    return current.finally(()=>{if(this.sessionProcessingPromise===current)this.sessionProcessingPromise=null});
  },
  async processSession(session,{loadCloud=false}={}){
    this.authBusy=true;
    try{
      if(!session&&this.presenceChannel)await this.stopPresence();
      this.session=session;this.user=session?.user||null;this.authResolved=true;this.isAdmin=false;this.role=this.user?'member':'guest';this.memberRoles={};this.profile=null;this.avatarSignedUrl='';
      if(this.user){
        this.authMessage=this.authRedirectPending?'Anmeldung erfolgreich. Dein Profil wird geladen …':'';
        renderReadonlyMode();renderCloudPanel();setSyncStatus('Anmeldung bestätigt …','saving');
        if(this.authRedirectPending){this.authRedirectPending=false;cleanAuthRedirectUrl();showLogin();renderCloudPanel()}
      }
      if(this.user){this.role=await this.loadOwnRole(this.user.id);this.isAdmin=['tournament_manager','admin'].includes(this.role)}
      if(this.role==='tournament_manager'&&this.pendingKeys.has(SETTINGS_KEY)){this.pendingKeys.delete(SETTINGS_KEY);this.persistPendingKeys()}
      if(this.isAdmin){
        // Ein zuvor auf diesem Gerät gespieltes privates Mitgliederturnier darf
        // beim späteren Login als Turnierleitung niemals zum Vereinsturnier werden.
        // Der zentrale Cloud-Stand wird direkt danach geladen.
        if(state.memberLocal||state.guestLocal)replaceTournamentState(emptyCompetition());
      }
      if(this.user&&!this.isAdmin&&state.guestLocal){replaceTournamentState(emptyCompetition());window.T20BrowserStorage.removeItem('dartTournament');window.T20BrowserStorage.removeItem('triple20_pending_sync');this.pendingSync=false}
      if(this.user&&!this.isAdmin)this.tournamentViewMode='live';
      if(this.user&&this.isAdmin)try{await this.loadAdminProfiles();if(isFullAdmin())await this.loadMemberRoles();else this.memberRoles={[this.user.id]:this.role}}catch(error){console.warn('Mitgliederprofile oder Rollen konnten nach der Anmeldung nicht geladen werden:',error)}
      if(isFullAdmin())this.loadAppAnalyticsStats().catch(error=>console.warn('Nutzungsstatistik konnte nicht geladen werden:',error));
      if(this.user)try{await loadTournamentRegistrations({force:true})}catch(error){console.warn('Turnieranmeldungen konnten nach der Anmeldung nicht geladen werden:',error)}
      if(this.user)try{this.profile=await this.loadProfile()}catch(error){console.warn('Profil konnte nach der Anmeldung nicht geladen werden:',error);this.profile={id:this.user.id,display_name:'',nickname:'',avatar_url:null};this.authError='Du bist angemeldet, aber dein Profil konnte noch nicht geladen werden. Bitte aktualisiere die Seite.'}
      if(this.user){this.startPresence();this.startLastSeenTracking()}
      renderReadonlyMode();renderCloudPanel();
      if(this.user)PushNotifications.refresh().catch(error=>console.warn('Push-Status konnte nicht geprüft werden:',error));
      if(!$('#setupSection')?.classList.contains('hidden')||!$('#tournamentSection')?.classList.contains('hidden'))showTournament();
      if(this.user&&!this.isAdmin){this.authMessage='';setSyncStatus('Angemeldet – Mitglied','view-only');renderCloudPanel();return}
      setSyncStatus(this.isAdmin?'Online – aktuell':'Nur Ansicht',this.isAdmin?'online':'view-only');
      if(loadCloud)await this.loadCloud({initial:true});
    }catch(e){console.warn('Session-Verarbeitung fehlgeschlagen',e);this.session=null;this.user=null;this.isAdmin=false;renderReadonlyMode();renderCloudPanel();setSyncStatus('Nur Ansicht','view-only');setLoginError('Anmeldung konnte nicht vollständig geprüft werden. Bitte später erneut versuchen.')}
    finally{this.authBusy=false}
  },
  async startPresence(){
    if(!this.client||!this.user)return;
    if(this.presenceChannel)await this.client.removeChannel(this.presenceChannel);
    const channel=this.client.channel('triple20-online',{config:{presence:{key:`${this.user.id}:${T20TabCoord.id}`}}});this.presenceChannel=channel;
    channel.on('presence',{event:'sync'},()=>{const presence=channel.presenceState(),entries=Object.values(presence).flat();this.onlineDeviceCount=Object.keys(presence).length;this.onlineUserIds=new Set(entries.map(entry=>entry.user_id).filter(Boolean));if(this.isAdmin)renderCloudPanel()});
    channel.subscribe(async status=>{if(status==='SUBSCRIBED')await channel.track({user_id:this.user.id,device_id:analyticsDeviceId(),tab_id:T20TabCoord.id,nickname:this.profile?.nickname||this.user.email||'',online_at:new Date().toISOString()})});
  },
  async stopPresence(){clearInterval(this.lastSeenTimer);this.lastSeenTimer=null;if(this.presenceChannel&&this.client)await this.client.removeChannel(this.presenceChannel);this.presenceChannel=null;this.onlineUserIds=new Set();this.onlineDeviceCount=0},
  bindConnectivityTracking(){
    if(this.connectivityBound)return;this.connectivityBound=true;
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){this.backgroundedAt=Date.now();return}const away=Date.now()-(this.backgroundedAt||0);if(away>=2000)this.resumeCloudState('App wieder aktiv')});
    window.addEventListener('online',()=>this.resumeCloudState('Verbindung wiederhergestellt',{force:true}));
  },
  resumeCloudState(reason='Aktualisierung',{force=false}={}){
    if(!this.user||!this.client||document.visibilityState==='hidden')return Promise.resolve(false);if(this.resumePromise)return this.resumePromise;
    const now=Date.now();if(!force&&now-this.lastResumeCheckAt<5000)return Promise.resolve(false);this.lastResumeCheckAt=now;this.resumeBusy=true;setSyncStatus(`${reason} – Online-Stand wird geprüft …`,'saving');renderReadonlyMode();
    const current=(async()=>{if(force&&this.user&&!this.isAdmin){this.role=await this.loadOwnRole(this.user.id);this.isAdmin=['tournament_manager','admin'].includes(this.role);if(this.isAdmin){if(isFullAdmin())await this.loadMemberRoles();else this.memberRoles={[this.user.id]:this.role};renderReadonlyMode();renderCloudPanel()}}if(this.isAdmin&&this.pendingSync)await this.syncAll();else{for(let attempt=0;this.loadBusy&&attempt<40;attempt++)await new Promise(resolve=>setTimeout(resolve,100));await this.loadCloud()}return true})().catch(error=>{console.warn('Sicherheitsabgleich nach Gerätewechsel fehlgeschlagen',error);setSyncStatus('Offline – lokale Kopie','offline');return false}).finally(()=>{this.resumeBusy=false;renderReadonlyMode();if(this.resumePromise===current)this.resumePromise=null});this.resumePromise=current;return current;
  },
  async touchLastSeen(){
    if(!this.client||!this.user||document.visibilityState==='hidden')return;
    const {error}=await this.client.rpc('triple20_touch_last_seen_v1');
    if(error)console.warn('„Zuletzt online“ konnte nicht aktualisiert werden:',error);
  },
  async recordAppVisit(){
    if(!this.client||document.visibilityState==='hidden')return;
    const last=Number(window.T20BrowserStorage.getItem(APP_ANALYTICS_LAST_KEY)||0);if(Date.now()-last<30*60*1000)return;
    const {error}=await this.client.rpc('triple20_record_app_visit',{visitor_device:analyticsDeviceId()});if(error)throw error;
    window.T20BrowserStorage.setItem(APP_ANALYTICS_LAST_KEY,String(Date.now()));if(isFullAdmin())await this.loadAppAnalyticsStats();
  },
  async loadAppAnalyticsStats(){
    if(!this.client||!isFullAdmin())return;const {data,error}=await this.client.rpc('triple20_app_usage_stats');if(error)throw error;this.analyticsStats=data||{};renderCloudPanel();
  },
  startLastSeenTracking(){
    clearInterval(this.lastSeenTimer);this.touchLastSeen();
    this.lastSeenTimer=setInterval(()=>this.touchLastSeen(),5*60*1000);
    if(!this.lastSeenVisibilityBound){document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&this.user)this.touchLastSeen()});this.lastSeenVisibilityBound=true}
  },
  async loadOwnRole(uid){
    try{const client=requireSupabaseClient(),{data,error}=await withTimeout(client.rpc('triple20_my_role'),10000,'Berechtigungsprüfung dauert zu lange.');if(error)throw error;const role=['admin','tournament_manager'].includes(data)?data:'member';if(role!=='member')window.T20BrowserStorage.setItem('triple20_admin_uid',uid);else window.T20BrowserStorage.removeItem('triple20_admin_uid');return role}
    catch(error){
      console.warn('Berechtigungsprüfung fehlgeschlagen',error);window.T20BrowserStorage.removeItem('triple20_admin_uid');return'member'
    }
  },
  async loadPublicMembers(){
    if(!this.client)return[];
    const {data,error}=await this.client.rpc('triple20_public_members');
    if(error)throw error;
    this.publicMembers=(data||[]).filter(member=>member.id&&member.nickname);const now=Date.now();
    await Promise.all(this.publicMembers.filter(member=>(this.publicMemberAvatarExpiresAt[member.id]||0)<now+5*60*1000).map(async member=>{const {data:signed,error:signedError}=await this.client.storage.from('triple20-avatars').createSignedUrl(`${member.id}/avatar.webp`,3600);this.publicMemberAvatarExpiresAt[member.id]=now+55*60*1000;if(!signedError&&signed?.signedUrl)this.publicMemberAvatars[member.id]=signed.signedUrl;else delete this.publicMemberAvatars[member.id]}));
    return this.publicMembers;
  },
  async loadAdminProfiles(){
    if(!this.isAdmin||!this.user)return[];
    const client=requireSupabaseClient(),{data,error}=await client.rpc('triple20_management_roster');
    if(error)throw error;
    this.adminProfiles=data||[];this.adminProfileAvatars={};
    await Promise.all(this.adminProfiles.filter(profile=>profile.avatar_url).map(async profile=>{
      const {data:signed,error:signedError}=await client.storage.from('triple20-avatars').createSignedUrl(profile.avatar_url,3600);
      if(!signedError&&signed?.signedUrl)this.adminProfileAvatars[profile.id]=signed.signedUrl;
    }));
    renderMemberSuggestions();renderRegisteredPlayerChoices();
    return this.adminProfiles;
  },
  async loadMemberRoles(){
    if(!this.isAdmin)return{};
    try{const client=requireSupabaseClient(),{data,error}=await client.rpc('triple20_list_member_roles');if(error)throw error;this.memberRoles=Object.fromEntries((data||[]).map(item=>[item.user_id,item.role]));if(this.user)this.memberRoles[this.user.id]=this.role;return this.memberRoles}
    catch(error){console.warn('Mitgliederrollen konnten noch nicht geladen werden:',error);this.memberRoles=this.user?{[this.user.id]:this.role}:{};return this.memberRoles}
  },
  async setMemberRole(userId,role){
    if(!isFullAdmin()||!userId||userId===this.user?.id)return;
    const previous=this.memberRoles[userId]||'member';this.memberRoles[userId]=role;renderCloudPanel();
    try{const client=requireSupabaseClient(),{error}=await client.rpc('triple20_set_member_role',{target_user_id:userId,new_role:role});if(error)throw error;await this.loadMemberRoles();this.authMessage='Berechtigung wurde gespeichert.';this.authError=''}
    catch(error){this.memberRoles[userId]=previous;this.authMessage='';this.authError=`Berechtigung konnte nicht gespeichert werden: ${error?.message||'Bitte das Rollen-SQL in Supabase ausführen.'}`}
    renderCloudPanel();
  },
  async refreshAdminProfiles(){
    if(!this.isAdmin||this.adminProfilesBusy)return;
    this.adminProfilesBusy=true;this.authError='';renderCloudPanel();
    try{await this.loadAdminProfiles()}catch(error){console.error('Mitglieder laden fehlgeschlagen:',error);this.authError='Mitglieder konnten nicht aktualisiert werden.'}
    finally{this.adminProfilesBusy=false;renderCloudPanel()}
  },
  async submitMembershipApplication(payload){
    if(this.membershipApplicationSubmitting)return false;this.membershipApplicationSubmitting=true;
    try{if(!this.ready||!this.client)await this.init();if(!this.client)throw new Error('Die Online-Verbindung ist derzeit nicht verfügbar.');const {error}=await this.client.rpc('triple20_submit_membership_application',{applicant_name:payload.name,applicant_birth_date:payload.birthDate,applicant_address:payload.address,applicant_phone:payload.phone,applicant_email:payload.email,declaration_accepted:payload.accepted,website:payload.website||''});if(error)throw error;return true}
    finally{this.membershipApplicationSubmitting=false}
  },
  async loadMembershipApplications(){
    if(!isFullAdmin()||!this.client)return[];this.membershipApplicationsBusy=true;renderClubInfo();
    try{const {data,error}=await this.client.rpc('triple20_list_membership_applications');if(error)throw error;this.membershipApplications=data||[];return this.membershipApplications}
    finally{this.membershipApplicationsBusy=false;renderClubInfo()}
  },
  async setMembershipApplicationStatus(id,status){
    if(!isFullAdmin()||!this.client||this.membershipApplicationsBusy)return;this.membershipApplicationsBusy=true;renderClubInfo();
    try{const {error}=await this.client.rpc('triple20_set_membership_application_status',{target_id:Number(id),new_status:status});if(error)throw error;this.membershipApplicationsBusy=false;await this.loadMembershipApplications()}
    catch(error){this.membershipApplicationsBusy=false;renderClubInfo();appAlert(`Status konnte nicht gespeichert werden: ${error?.message||'Bitte später erneut versuchen.'}`)}
  },
  async deleteMembershipApplication(id){
    if(!isFullAdmin()||!this.client||this.membershipApplicationsBusy||!await appConfirm('Diese Mitgliedsanfrage mit allen persönlichen Daten endgültig löschen?'))return;this.membershipApplicationsBusy=true;renderClubInfo();
    try{const {error}=await this.client.rpc('triple20_delete_membership_application',{target_id:Number(id)});if(error)throw error;this.membershipApplicationsBusy=false;await this.loadMembershipApplications()}
    catch(error){this.membershipApplicationsBusy=false;renderClubInfo();appAlert(`Anfrage konnte nicht gelöscht werden: ${error?.message||'Bitte später erneut versuchen.'}`)}
  },
  async loadProfile(){const client=requireSupabaseClient();const {data,error}=await client.from('triple20_profiles').select('id,display_name,nickname,avatar_url,updated_at').eq('id',this.user.id).maybeSingle();if(error)throw error;const profile=data||{id:this.user.id,display_name:'',nickname:'',avatar_url:null};this.avatarSignedUrl='';if(profile.avatar_url){const {data:signed,error:signedError}=await client.storage.from('triple20-avatars').createSignedUrl(profile.avatar_url,3600);if(!signedError)this.avatarSignedUrl=signed?.signedUrl||''}return profile},
  async prepareAvatar(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file?.type))throw new Error('Bitte ein JPEG-, PNG- oder WebP-Bild auswählen.');
    if(file.size>10*1024*1024)throw new Error('Das Ausgangsbild ist größer als 10 MB.');
    const bitmap=await createImageBitmap(file),scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
    const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));let blob=await encode(.84);if(blob?.size>1048576)blob=await encode(.68);if(!blob||blob.size>1048576)throw new Error('Das Bild konnte nicht auf unter 1 MB verkleinert werden.');return blob;
  },
  async uploadAvatar(file){
    if(!this.user||this.avatarBusy)return;this.avatarBusy=true;this.authMessage='';this.authError='';renderCloudPanel();
    try{const blob=await this.prepareAvatar(file),path=`${this.user.id}/avatar.webp`,client=requireSupabaseClient(),{error:uploadError}=await client.storage.from('triple20-avatars').upload(path,blob,{contentType:'image/webp',upsert:true,cacheControl:'3600'});if(uploadError)throw uploadError;const {data,error}=await client.from('triple20_profiles').update({avatar_url:path}).eq('id',this.user.id).select('id,display_name,nickname,avatar_url,updated_at').single();if(error)throw error;this.profile=data;const {data:signed,error:signedError}=await client.storage.from('triple20-avatars').createSignedUrl(path,3600);if(signedError)throw signedError;this.avatarSignedUrl=signed?.signedUrl||'';this.authMessage='Profilfoto wurde gespeichert.'}
    catch(error){console.error('Profilfoto hochladen fehlgeschlagen:',error);this.authError=`Profilfoto konnte nicht gespeichert werden: ${error?.message||'Bitte später erneut versuchen.'}`}
    finally{this.avatarBusy=false;renderCloudPanel()}
  },
  async removeAvatar(){
    if(!this.user||this.avatarBusy||!this.profile?.avatar_url)return;this.avatarBusy=true;this.authMessage='';this.authError='';renderCloudPanel();
    try{const client=requireSupabaseClient(),path=this.profile.avatar_url,{error:removeError}=await client.storage.from('triple20-avatars').remove([path]);if(removeError)throw removeError;const {data,error}=await client.from('triple20_profiles').update({avatar_url:null}).eq('id',this.user.id).select('id,display_name,nickname,avatar_url,updated_at').single();if(error)throw error;this.profile=data;this.avatarSignedUrl='';this.authMessage='Profilfoto wurde entfernt.'}
    catch(error){console.error('Profilfoto entfernen fehlgeschlagen:',error);this.authError=`Profilfoto konnte nicht entfernt werden: ${error?.message||'Bitte später erneut versuchen.'}`}
    finally{this.avatarBusy=false;renderCloudPanel()}
  },
  async loadHomeNewsImage(){
    this.homeNewsImageSignedUrl='';this.homeNewsImageSignedUrls={};const items=homeNewsItems();if(!this.client){renderHomeNewsImage();return''}
    await Promise.all(items.filter(item=>item.imagePath).map(async item=>{const {data,error}=await this.client.storage.from('triple20-avatars').createSignedUrl(item.imagePath,86400);if(!error&&data?.signedUrl)this.homeNewsImageSignedUrls[item.id]=data.signedUrl}));this.homeNewsImageSignedUrl=this.homeNewsImageSignedUrls.main||'';renderHomeNewsSlide();renderHomeEditor();return this.homeNewsImageSignedUrl
  },
  async uploadHomeNewsImage(file){
    if(!isFullAdmin()||!this.user||this.homeImageBusy)return;syncHomeNewsEditorFields();this.homeImageBusy=true;renderHomeEditor();
    try{const id=homeNewsItem(editingHomeNewsId).id,safeId=id.replace(/[^a-z0-9-]/gi,'').slice(0,80)||'news',blob=await prepareHomeNewsImage(file),path=id==='main'?`${this.user.id}/homepage-news.webp`:`${this.user.id}/homepage-news-${safeId}.webp`,{error}=await this.client.storage.from('triple20-avatars').upload(path,blob,{contentType:'image/webp',upsert:true,cacheControl:'86400'});if(error)throw error;updateHomeNewsItem(id,{imagePath:path},true);await this.loadHomeNewsImage();appAlert('Das Hintergrundbild wurde gespeichert.')}
    catch(error){console.error('Startseitenbild konnte nicht gespeichert werden:',error);appAlert(`Das Hintergrundbild konnte nicht gespeichert werden: ${error?.message||'Bitte später erneut versuchen.'}`)}
    finally{this.homeImageBusy=false;renderHomeEditor()}
  },
  async removeHomeNewsImage(){
    if(!isFullAdmin()||this.homeImageBusy)return;syncHomeNewsEditorFields();const item=homeNewsItem(editingHomeNewsId),path=item.imagePath||'';if(!path)return;if(!await appConfirm('Das Hintergrundbild dieser DCA-News wirklich entfernen?'))return;this.homeImageBusy=true;renderHomeEditor();
    try{if(this.client){const {error}=await this.client.storage.from('triple20-avatars').remove([path]);if(error)throw error}updateHomeNewsItem(item.id,{imagePath:''},true);delete this.homeNewsImageSignedUrls[item.id];if(item.id==='main')this.homeNewsImageSignedUrl='';renderHomeNewsSlide();renderHomeEditor()}
    catch(error){console.error('Startseitenbild konnte nicht entfernt werden:',error);appAlert(`Das Hintergrundbild konnte nicht entfernt werden: ${error?.message||'Bitte später erneut versuchen.'}`)}
    finally{this.homeImageBusy=false;renderHomeEditor()}
  },
  async deleteHomeNewsItem(id=editingHomeNewsId){
    if(!isFullAdmin()||id==='main'||this.homeImageBusy)return;const item=homeNewsItem(id);if(!item||!await appConfirm(`News „${item.title||'Ohne Titel'}“ wirklich löschen?`))return;this.homeImageBusy=true;renderHomeEditor();
    try{if(item.imagePath&&this.client){const {error}=await this.client.storage.from('triple20-avatars').remove([item.imagePath]);if(error)throw error}const news=appSettings.home?.news||defaultSettings.home.news;appSettings=mergeSettings(appSettings,{home:{news:{...news,items:(Array.isArray(news.items)?news.items:[]).filter(entry=>String(entry.id)!==String(id))}}});saveSettings();delete this.homeNewsImageSignedUrls[id];editingHomeNewsId='main';publicHomeNewsIndex=0;renderHomeEditor();renderPublicHome({refreshRegistrations:false})}
    catch(error){console.error('DCA-News konnte nicht gelöscht werden:',error);appAlert(`Die DCA-News konnte nicht gelöscht werden: ${error?.message||'Bitte später erneut versuchen.'}`)}
    finally{this.homeImageBusy=false;renderHomeEditor()}
  },
  async loadClubInfoImage(){
    const path=appSettings.clubInfo?.imagePath||'';this.clubInfoImageSignedUrl='';if(!path||!this.client){renderClubInfoImage();return''}
    const {data,error}=await this.client.storage.from('triple20-avatars').createSignedUrl(path,86400);if(error)throw error;this.clubInfoImageSignedUrl=data?.signedUrl||'';renderClubInfoImage();renderHomeEditor();return this.clubInfoImageSignedUrl
  },
  async uploadClubInfoImage(file){
    if(!isFullAdmin()||!this.user||this.clubInfoImageBusy)return;this.clubInfoImageBusy=true;renderHomeEditor();
    try{const blob=await prepareHomeNewsImage(file),path=`${this.user.id}/club-info-hero.webp`,{error}=await this.client.storage.from('triple20-avatars').upload(path,blob,{contentType:'image/webp',upsert:true,cacheControl:'86400'});if(error)throw error;appSettings=mergeSettings(appSettings,{clubInfo:{...appSettings.clubInfo,imagePath:path}});saveSettings();await this.loadClubInfoImage();appAlert('Das Hintergrundbild der Vereinsseite wurde gespeichert.')}
    catch(error){console.error('Vereinsseitenbild konnte nicht gespeichert werden:',error);appAlert(`Das Hintergrundbild der Vereinsseite konnte nicht gespeichert werden: ${error?.message||'Bitte später erneut versuchen.'}`)}
    finally{this.clubInfoImageBusy=false;renderHomeEditor()}
  },
  async removeClubInfoImage(){
    if(!isFullAdmin()||this.clubInfoImageBusy)return;const path=appSettings.clubInfo?.imagePath||'';if(!path)return;if(!await appConfirm('Das Hintergrundbild der Vereinsseite wirklich entfernen?'))return;this.clubInfoImageBusy=true;renderHomeEditor();
    try{if(this.client){const {error}=await this.client.storage.from('triple20-avatars').remove([path]);if(error)throw error}appSettings=mergeSettings(appSettings,{clubInfo:{...appSettings.clubInfo,imagePath:''}});saveSettings();this.clubInfoImageSignedUrl='';renderClubInfoImage();renderHomeEditor()}
    catch(error){console.error('Vereinsseitenbild konnte nicht entfernt werden:',error);appAlert(`Das Hintergrundbild der Vereinsseite konnte nicht entfernt werden: ${error?.message||'Bitte später erneut versuchen.'}`)}
    finally{this.clubInfoImageBusy=false;renderHomeEditor()}
  },
  async sendLoginCode(email=this.otpEmail){
    if(this.magicLinkBusy)return;const cleanEmail=email.trim().toLowerCase();if(!cleanEmail)return;
    this.magicLinkBusy=true;this.authMessage='';this.authError='';renderCloudPanel();
    try{if(!this.ready||!this.client)await this.init();if(!this.client)throw new Error('Supabase konnte nicht initialisiert werden.');const {error}=await withTimeout(this.client.auth.signInWithOtp({email:cleanEmail,options:{shouldCreateUser:false}}),15000,'Der Anmeldecode konnte nicht rechtzeitig versendet werden.');if(error)throw error;this.otpEmail=cleanEmail;this.authMessage='Der sechsstellige Anmeldecode wurde versendet. Bitte prüfe auch den Spam-Ordner.'}
    catch(error){console.error('Mitglieder-Anmeldecode fehlgeschlagen:',error);this.authMessage='';this.authError=`Anmeldecode konnte nicht gesendet werden: ${error?.message||'Bitte später erneut versuchen.'}`}
    finally{this.magicLinkBusy=false;renderCloudPanel();setTimeout(()=>$('#memberOtpCode')?.focus(),0)}
  },
  async verifyLoginCode(token){
    if(this.otpVerifyBusy||!this.otpEmail)return;const cleanToken=String(token||'').replace(/\D/g,'');if(cleanToken.length!==8){this.authError='Bitte den vollständigen achtstelligen Code eingeben.';this.authMessage='';renderCloudPanel();return}
    this.otpVerifyBusy=true;this.authError='';this.authMessage='Code wird geprüft …';renderCloudPanel();
    try{if(!this.ready||!this.client)await this.init();const {data,error}=await withTimeout(this.client.auth.verifyOtp({email:this.otpEmail,token:cleanToken,type:'email'}),15000,'Die Prüfung dauert zu lange. Bitte erneut versuchen.');if(error)throw error;if(!data?.session)throw new Error('Keine gültige Anmeldung erhalten.');this.otpEmail='';this.authMessage='Anmeldung erfolgreich.';await this.setSession(data.session)}
    catch(error){console.error('Anmeldecode prüfen fehlgeschlagen:',error);this.authMessage='';this.authError=`Code ungültig oder abgelaufen: ${error?.message||'Bitte einen neuen Code anfordern.'}`}
    finally{this.otpVerifyBusy=false;renderCloudPanel()}
  },
  async saveProfile(displayName,nickname){
    if(!this.user||this.profileBusy)return;
    const cleanName=displayName.trim().replace(/\s+/g,' '),cleanNickname=nickname.trim().replace(/\s+/g,' ');
    if(!cleanNickname){this.authError='Bitte einen Spitznamen eintragen.';this.authMessage='';renderCloudPanel();return}
    if(cleanName.split(' ').length<2){this.authError='Bitte Vor- und Zunamen vollständig eintragen.';this.authMessage='';renderCloudPanel();return}
    this.profileBusy=true;this.authMessage='';this.authError='';renderCloudPanel();
    try{const client=requireSupabaseClient();const {data,error}=await client.from('triple20_profiles').update({display_name:cleanName,nickname:cleanNickname}).eq('id',this.user.id).select('id,display_name,nickname,avatar_url,updated_at').single();if(error)throw error;this.profile=data;await this.loadPublicMembers();this.authMessage='Profil wurde gespeichert.'}
    catch(error){console.error('Profil speichern fehlgeschlagen:',error);this.authMessage='';this.authError=error?.code==='23505'?'Dieser Spitzname wird bereits verwendet. Bitte wähle einen anderen.':`Profil konnte nicht gespeichert werden: ${error?.message||'Bitte später erneut versuchen.'}`}
    finally{this.profileBusy=false;renderCloudPanel()}
  },
  async signIn(email,password){
    const loginError=$('#loginError');
    if(this.loginBusy)return;
    this.loginBusy=true;
    let failed=false;
    renderCloudPanel();
    try{
      if(loginError)loginError.textContent='';
      if(!this.ready||!this.client)await this.init();
      if(!this.client)throw new Error('Supabase konnte nicht initialisiert werden.');
      setSyncStatus('Wird angemeldet …','saving');
      const {data,error}=await withTimeout(this.client.auth.signInWithPassword({email,password}),15000,'Anmeldung dauert zu lange. Bitte Verbindung prüfen und erneut versuchen.');
      if(error)throw error;
      if(!data?.session?.user)throw new Error('Keine gültige Sitzung erhalten.');
      await this.setSession(data.session||null);
      this.loadCloud({initial:true}).catch(e=>console.warn('Cloud nach Login konnte nicht geladen werden',e));
    }catch(error){
      failed=true;
      console.error('Anmeldung fehlgeschlagen:',error);
      this.session=null;this.user=null;this.isAdmin=false;renderReadonlyMode();renderCloudPanel();setSyncStatus('Nur Ansicht','view-only');
      setLoginError(`Anmeldung fehlgeschlagen: ${error?.message||'Bitte E-Mail und Passwort prüfen.'}`);
    }
    finally{this.loginBusy=false;if(!failed)renderCloudPanel();if(!this.isAdmin&&$('#syncStatusText')?.textContent==='Wird angemeldet …')setSyncStatus('Nur Ansicht','view-only')}
  },
  async signOut(){
    if(this.isAdmin&&this.client){clearTimeout(this.syncTimer);await this.syncAll();if(this.pendingSync){appAlert('Abmeldung abgebrochen: Die letzten Änderungen konnten noch nicht sicher mit dem aktuellen Cloud-Stand abgeglichen werden. Bitte löse zuerst den Konflikt oder prüfe die Internetverbindung.');return}}
    try{await this.stopPresence();if(this.client)await this.client.auth.signOut({scope:'local'})}catch(e){console.warn('Abmeldung fehlgeschlagen',e)}
    window.T20BrowserStorage.removeItem('triple20_admin_uid');tournamentRegistrationCounts={};tournamentRegistrations=[];registrationsLoadedAt=0;
    this.session=null;this.user=null;this.isAdmin=false;this.role='guest';this.memberRoles={};this.profile=null;this.avatarSignedUrl='';this.authMessage='';this.authError='';
    if(state.memberLocal)replaceTournamentState({players:[],playerIds:{},playerProfileIds:{},started:false,matches:[],settings:{},guestLocal:true});
    renderReadonlyMode();renderCloudPanel();setSyncStatus('Nur Ansicht','view-only');showHome();
  },
  recordCloudRead(rows=[],metadata=false){const today=emptyCloudUsage().date;if(this.cloudUsage?.date!==today)this.cloudUsage=emptyCloudUsage();const bytes=new Blob([JSON.stringify(rows||[])]).size;this.cloudUsage.requests++;this.cloudUsage[metadata?'metadataBytes':'dataBytes']+=bytes;nativeSetItem(CLOUD_USAGE_KEY,JSON.stringify(this.cloudUsage))},
  async fetchCloudRows(keys=[],{metadata=false}={}){const client=requireSupabaseClient(),rows=[];for(let index=0;index<keys.length;index+=25){const batch=keys.slice(index,index+25),{data,error}=await client.from('triple20_data').select(metadata?'data_key,updated_at':'data_key,data,updated_at').in('data_key',batch);if(error)throw error;this.recordCloudRead(data||[],metadata);rows.push(...(data||[]))}return rows},
  cachePartitionRows(rows=[]){for(const row of rows)if(PARTITIONED_CLOUD_KEYS.includes(T20CloudPartitions.logicalKeyForPhysical(row.data_key))&&!CLOUD_MANIFEST_KEYS.includes(row.data_key)&&!PARTITIONED_CLOUD_KEYS.includes(row.data_key))this.partitionRowCache.set(row.data_key,row)},
  async partitionRowsForManifests(manifestRows=[]){const references=T20CloudPartitions.referencedKeys(manifestRows),missing=references.filter(key=>!this.partitionRowCache.has(key));if(missing.length)this.cachePartitionRows(await this.fetchCloudRows(missing));return references.map(key=>this.partitionRowCache.get(key)).filter(Boolean)},
  async fetchCloud(){
    const base=await this.fetchCloudRows(CLOUD_SNAPSHOT_KEYS),rows=[...base];this.cachePartitionRows(base);
    for(const logicalKey of PARTITIONED_CLOUD_KEYS){const manifestKey=T20CloudPartitions.MANIFEST_KEYS[logicalKey],manifest=base.find(row=>row.data_key===manifestKey);if(manifest){const parts=await this.partitionRowsForManifests([manifest]);rows.push(...parts);if(!T20CloudPartitions.reconstructDocument(logicalKey,[manifest,...parts]).complete)rows.push(...await this.fetchCloudRows([logicalKey]))}else rows.push(...await this.fetchCloudRows([logicalKey]))}
    this.online=true;return[...new Map(rows.map(row=>[row.data_key,row])).values()]
  },
  async fetchCloudChanges(){
    const metadata=await this.fetchCloudRows(CLOUD_METADATA_KEYS,{metadata:true}),meta=new Map(metadata.map(row=>[row.data_key,row])),rows=[],logicalKeys=new Set();
    const changedPlain=CLOUD_UNPARTITIONED_KEYS.filter(key=>meta.has(key)&&meta.get(key).updated_at!==this.cloudUpdated[key]);if(changedPlain.length){rows.push(...await this.fetchCloudRows(changedPlain));changedPlain.forEach(key=>logicalKeys.add(key))}
    for(const logicalKey of PARTITIONED_CLOUD_KEYS){const manifestKey=T20CloudPartitions.MANIFEST_KEYS[logicalKey],manifestMeta=meta.get(manifestKey);if(manifestMeta){if(manifestMeta.updated_at===this.cloudUpdated[manifestKey])continue;const manifestRows=await this.fetchCloudRows([manifestKey]),manifest=manifestRows[0];if(!manifest)continue;const parts=await this.partitionRowsForManifests(manifestRows);rows.push(manifest,...parts);if(!T20CloudPartitions.reconstructDocument(logicalKey,[manifest,...parts]).complete)rows.push(...await this.fetchCloudRows([logicalKey]));logicalKeys.add(logicalKey)}else{const legacyMeta=meta.get(logicalKey);if(legacyMeta&&legacyMeta.updated_at!==this.cloudUpdated[logicalKey]){rows.push(...await this.fetchCloudRows([logicalKey]));logicalKeys.add(logicalKey)}}}
    this.online=true;return{rows:[...new Map(rows.map(row=>[row.data_key,row])).values()],logicalKeys:[...logicalKeys]}
  },
  async loadLiveTournament(){
    if(this.loadBusy||!this.client||document.visibilityState==='hidden')return false;this.loadBusy=true;
    try{const keys=['dartTournament',TV_SETTINGS_KEY],metadata=await this.fetchCloudRows(keys,{metadata:true}),changedKeys=metadata.filter(row=>row.updated_at!==(row.data_key==='dartTournament'?this.liveTournamentUpdatedAt:this.tvSettingsUpdatedAt)).map(row=>row.data_key);if(!changedKeys.length)return false;const data=await this.fetchCloudRows(changedKeys);this.online=true;let changed=false;const tournament=data.find(row=>row.data_key==='dartTournament'),tv=data.find(row=>row.data_key===TV_SETTINGS_KEY);if(tournament){this.liveTournamentUpdatedAt=tournament.updated_at||'';this.cloudUpdated.dartTournament=tournament.updated_at||this.cloudUpdated.dartTournament;applyLiveTournamentData(tournament.data);changed=true}if(tv){this.tvSettingsUpdatedAt=tv.updated_at||'';this.cloudUpdated[TV_SETTINGS_KEY]=tv.updated_at||this.cloudUpdated[TV_SETTINGS_KEY];applyLiveTvSettings(tv.data);changed=true}if(changed){this.lastSyncAt=new Date().toISOString();nativeSetItem('triple20_last_sync',this.lastSyncAt)}return changed}catch(error){console.warn('Schlanker TV-Abgleich fehlgeschlagen',error);this.online=false;return false}finally{this.loadBusy=false}
  },
  async loadStationSuggestions(){
    if(!this.isAdmin||this.stationSuggestionBusy||!this.client||document.visibilityState==='hidden'||!$('#tvSection')?.classList.contains('hidden'))return 0;this.stationSuggestionBusy=true;
    try{const metadata=(await this.fetchCloudRows(['dartTournament'],{metadata:true}))[0];if(!metadata||metadata.updated_at===this.stationTournamentUpdatedAt)return 0;const row=(await this.fetchCloudRows(['dartTournament']))[0];if(!row)return 0;this.stationTournamentUpdatedAt=row.updated_at||'';return mergeRemoteStationSuggestions(row.data)}catch(error){console.warn('Ergebnisvorschläge konnten nicht abgeglichen werden',error);return 0}finally{this.stationSuggestionBusy=false}
  },
  rememberCloudRows(rows=[]){for(const row of rows)if(row?.data_key&&row?.updated_at)this.cloudUpdated[row.data_key]=row.updated_at},
  persistPendingKeys(){this.pendingSync=this.pendingKeys.size>0;if(this.pendingSync){nativeSetItem('triple20_pending_sync','1');nativeSetItem('triple20_pending_keys',JSON.stringify([...this.pendingKeys]))}else{nativeRemoveItem('triple20_pending_sync');nativeRemoveItem('triple20_pending_keys')}},
  rowsToObject(rows){this.rememberCloudRows(rows);return cloudDataFromRows(rows)},
  applyFreshCloudRows(rows,keys=CLOUD_DATA_KEYS){
    const fresh=cloudDataFromRows(rows),selected=Object.fromEntries(keys.map(key=>[key,fresh[key]]));
    this.loadedCloudData=fresh;applyTriple20Data(selected,{mergeClubDuels:false});this.rememberCloudRows(rows.filter(row=>keys.includes(T20CloudPartitions.logicalKeyForPhysical(row.data_key))));
    keys.forEach(key=>this.pendingKeys.delete(key));this.persistPendingKeys();this.lastSyncAt=new Date().toISOString();nativeSetItem('triple20_last_sync',this.lastSyncAt);
    return fresh;
  },
  async loadCloud({initial=false}={}){
    if(this.loadBusy)return;
    if(!this.isAdmin&&this.pendingKeys.has('dartTournament')){setSyncStatus('Lokales Ergebnis wartet auf bestätigte Turnierberechtigung','offline');return}
    this.loadBusy=true;
    try{
      const previousCloudUpdated={...this.cloudUpdated},changes=!initial&&!this.pendingSync?await this.fetchCloudChanges():null;
      if(changes&&!changes.logicalKeys.length){this.lastSyncAt=new Date().toISOString();nativeSetItem('triple20_last_sync',this.lastSyncAt);setSyncStatus(this.user&&!this.isAdmin?'Angemeldet – Mitglied':this.user?'Online – aktuell':'Öffentliche Daten aktuell',this.user&&this.isAdmin?'online':'view-only');return}
      const rows=changes?changes.rows:await this.fetchCloud(),remoteChanged=new Set(changes?.logicalKeys||rows.filter(row=>previousCloudUpdated[row.data_key]&&row.updated_at&&row.updated_at!==previousCloudUpdated[row.data_key]).map(row=>T20CloudPartitions.logicalKeyForPhysical(row.data_key))),incoming=this.rowsToObject(rows),cloud=changes?{...(this.loadedCloudData||{}),...Object.fromEntries(changes.logicalKeys.map(key=>[key,incoming[key]]))}:incoming,hasCloud=Object.values(cloud).some(v=>v!==null&&v!==undefined);
      if(!this.isAdmin&&this.pendingKeys.has('dartTournament')){setSyncStatus('Lokales Ergebnis wartet auf bestätigte Turnierberechtigung','offline');return}
      this.loadedCloudData=cloud;this.lastSyncAt=new Date().toISOString();window.T20BrowserStorage.setItem('triple20_last_sync',this.lastSyncAt);
      if(this.user&&!this.isAdmin){const selectedCompetition=state.activeCompetition||'men';this.liveTournamentState=structuredClone(cloud.dartTournament||{players:[],playerIds:{},playerProfileIds:{},started:false,matches:[],settings:{}});if(this.liveTournamentState.competitions?.[selectedCompetition])this.liveTournamentState.activeCompetition=selectedCompetition;applyTriple20Data({...cloud,dartTournament:this.liveTournamentState});setSyncStatus('Angemeldet – Mitglied','view-only');return}
      if(this.isAdmin&&this.pendingSync){
        // Alte App-Versionen kannten noch keine Liste geänderter Bereiche. Ein
        // bloß übrig gebliebenes Flag darf daher keinen kompletten Altstand hochladen.
        if(!this.pendingKeys.size){this.pendingSync=false;nativeRemoveItem('triple20_pending_sync');applyTriple20Data(cloud);setSyncStatus('Online – aktuell','online');return}
        for(const key of this.pendingKeys){if(previousCloudUpdated[key])this.cloudUpdated[key]=previousCloudUpdated[key];else delete this.cloudUpdated[key]}
        await this.syncAll();return
      }
      // Ohne konkret vorgemerkte lokale Änderungen ist beim ersten Laden die
      // Cloud maßgeblich. Echte Offline-Änderungen wurden oben bereits zuerst
      // hochgeladen und dürfen hier nicht mehr verworfen werden.
      if(initial&&this.isAdmin&&hasCloud){
        this.pendingKeys.clear();this.pendingSync=false;nativeRemoveItem('triple20_pending_sync');nativeRemoveItem('triple20_pending_keys');
        applyTriple20Data(cloud);setSyncStatus('Online – aktuell','online');return;
      }
      if(!hasCloud){setSyncStatus(this.isAdmin&&hasMeaningfulLocalData()?'Online – Cloud leer, lokale Daten vorhanden':'Online – aktuell','online');renderCloudPanel();return}
      if(!this.user){applyTriple20Data(cloud);setSyncStatus('Öffentliche Daten aktuell','view-only');return}
      if(!this.isAdmin&&(state.started||state.players?.length||state.matches?.length)){setSyncStatus('Offline – lokales Turnier','offline');renderCloudPanel();return}
      // Für Administrator und Turnierleitung ist nach der Anmeldung die Cloud
      // maßgeblich. Sonst startet ein zweites Gerät mit seinem alten Browserstand
      // und kann Termine und Saisonzuordnungen unbemerkt zurücksetzen.
      if(initial&&!hasMeaningfulLocalData()){applyTriple20Data(cloud);setSyncStatus(this.isAdmin?'Online – aktuell':'Nur Ansicht',this.isAdmin?'online':'view-only');return}
      if(!this.isAdmin){applyTriple20Data(cloud);setSyncStatus('Nur Ansicht','view-only');return}
      const safeRemoteKeys=[...remoteChanged].filter(key=>!this.pendingKeys.has(key));
      if(safeRemoteKeys.length)applyTriple20Data(Object.fromEntries(safeRemoteKeys.map(key=>[key,cloud[key]])));
      setSyncStatus('Online – aktuell','online');renderCloudPanel();
    }catch(e){console.warn('Cloud laden fehlgeschlagen',e);this.online=false;if(e?.code==='UNSUPPORTED_SCHEMA_VERSION'){rememberDataSchemaError(e);setSyncStatus('App-Update erforderlich – Online-Daten sind neuer','conflict');renderReadonlyMode()}else setSyncStatus('Offline – lokale Kopie','offline')}
    finally{this.loadBusy=false}
  },
  queueSync(key){if(!schemaWritesAllowed()||!this.isAdmin||(this.role==='tournament_manager'&&key===SETTINGS_KEY))return;if(CLOUD_DATA_KEYS.includes(key))this.pendingKeys.add(key);this.pendingSync=true;nativeSetItem('triple20_pending_sync','1');nativeSetItem('triple20_pending_keys',JSON.stringify([...this.pendingKeys]));clearTimeout(this.syncTimer);if(!this.client||!navigator.onLine){setSyncStatus('Offline – sicher auf diesem Gerät gespeichert','offline');return}setSyncStatus('Änderungen werden gespeichert …','saving');this.syncTimer=setTimeout(()=>this.syncAll(),700)},
  async resolveCloudConflict(rows,conflictingKeys){
    setSyncStatus('Konflikt erkannt','conflict');const choice=await openCloudConflictDialog({rows,conflictingKeys,lastSyncAt:this.lastSyncAt});
    if(choice==='cloud'){
      backupTriple20Data('triple20_vor_konflikt_cloud');this.applyFreshCloudRows(rows,conflictingKeys);setSyncStatus(this.pendingSync?'Weitere lokale Änderungen warten':'Online-Version übernommen',this.pendingSync?'saving':'online');renderCloudPanel();
      if(this.pendingSync){clearTimeout(this.syncTimer);this.syncTimer=setTimeout(()=>this.syncAll(),700)}
      return'handled';
    }
    if(choice!=='overwrite'){setSyncStatus('Konflikt offen – nichts überschrieben','conflict');return'handled'}
    try{nativeSetItem('triple20_conflict_upload_backup',JSON.stringify({createdAt:new Date().toISOString(),app:'Triple20',data:collectTriple20Data()}))}
    catch(error){console.warn('Lokale Konfliktsicherung fehlgeschlagen',error);setSyncStatus('Sicherung fehlgeschlagen – nichts hochgeladen','conflict');return'handled'}
    return'overwrite';
  },
  async writePartitionedDocument(logicalKey,value,rows,{force=false}={}){
    const split=T20CloudPartitions.partitionDocument(logicalKey,value);if(!split)return{status:'skipped',written:[]};
    const client=requireSupabaseClient(),written=[],existing=new Map(rows.map(row=>[row.data_key,row])),remoteManifest=existing.get(split.manifestKey),remoteDocument=T20CloudPartitions.reconstructDocument(logicalKey,rows);
    if(!force&&logicalKey===TOURNAMENT_HISTORY_KEY&&remoteManifest&&remoteManifest.updated_at!==this.cloudUpdated[split.manifestKey]&&remoteDocument.complete&&!T20CloudPartitions.sameData(remoteDocument.value,value)){
      const resolution=await this.resolveCloudConflict(rows,[logicalKey]);if(resolution!=='overwrite')return{status:'handled',written};force=true;
    }
    const updatedAt=new Date().toISOString();
    for(const part of split.rows){
      const known=existing.get(part.data_key);if(known){if(!T20CloudPartitions.sameData(known.data,part.data))throw new Error(`Cloud-Teil ${part.data_key} hat trotz gleicher Prüfsumme einen anderen Inhalt.`);written.push(known);continue}
      let response=await client.from('triple20_data').insert({...part,updated_at:updatedAt}).select('data_key,updated_at');
      if(response?.error?.code==='23505'){
        const fresh=(await this.fetchCloudRows([part.data_key]))[0];if(!fresh||!T20CloudPartitions.sameData(fresh.data,part.data))throw response.error;response={data:[fresh],error:null};
      }
      if(response?.error)throw response.error;written.push(...(response?.data||[]));
    }
    if(remoteManifest&&T20CloudPartitions.sameData(remoteManifest.data,split.manifest)){written.push(remoteManifest);return{status:'written',written}}
    const manifestItem={data_key:split.manifestKey,data:split.manifest,updated_at:updatedAt};let response;
    if(!force&&remoteManifest)response=await client.from('triple20_data').update({data:manifestItem.data,updated_at:manifestItem.updated_at}).eq('data_key',manifestItem.data_key).eq('updated_at',remoteManifest.updated_at).select('data_key,updated_at');
    else if(!force)response=await client.from('triple20_data').insert(manifestItem).select('data_key,updated_at');
    else response=await client.from('triple20_data').upsert([manifestItem],{onConflict:'data_key'}).select('data_key,updated_at');
    const collision=!force&&(response?.error?.code==='23505'||(!response?.error&&!(response?.data||[]).length));
    if(collision){
      const freshRows=await this.fetchCloud(),freshManifest=freshRows.find(row=>row.data_key===split.manifestKey),freshDocument=T20CloudPartitions.reconstructDocument(logicalKey,freshRows);
      if(freshManifest&&freshDocument.complete&&T20CloudPartitions.sameData(freshDocument.value,value)){written.push(freshManifest);return{status:'written',written}}
      const resolution=await this.resolveCloudConflict(freshRows,[logicalKey]);if(resolution!=='overwrite')return{status:'handled',written};
      response=await client.from('triple20_data').upsert([manifestItem],{onConflict:'data_key'}).select('data_key,updated_at');
    }
    if(response?.error)throw response.error;written.push(...(response?.data||[]));return{status:'written',written};
  },
  async syncAll({force=false,keys=null,all=false}={}){
    if(!schemaWritesAllowed()||!this.isAdmin||!this.client)return;
    const targetKeys=[...new Set(keys?.filter(key=>CLOUD_DATA_KEYS.includes(key))||(all?CLOUD_DATA_KEYS:[...this.pendingKeys]))].filter(key=>this.role!=='tournament_manager'||key!==SETTINGS_KEY);
    if(!targetKeys.length){this.pendingSync=false;nativeRemoveItem('triple20_pending_sync');nativeRemoveItem('triple20_pending_keys');return}
    if(this.syncing){try{await this.syncing}catch{}return this.syncAll({force,keys:targetKeys,all:false})}
    let finishSync;this.syncing=new Promise(resolve=>{finishSync=resolve});
    try{
      clearTimeout(this.syncTimer);
      this.pendingSync=true;nativeSetItem('triple20_pending_sync','1');
      setSyncStatus('Wird gespeichert …','saving');
      try{
      const rows=await this.fetchCloud();
      if(targetKeys.includes(CLUB_DUELS_KEY)){
        const remote=rows.find(row=>row.data_key===CLUB_DUELS_KEY)?.data;
        const merged=mergeClubDuelStores(localValueForKey(CLUB_DUELS_KEY),remote);
        T20_SUPPRESS_SYNC=true;
        try{writeDataDocument(CLUB_DUELS_KEY,merged,{native:true})}finally{T20_SUPPRESS_SYNC=false}
      }
      if(targetKeys.includes(SEASON_KEY)){
        const remote=cloudDataFromRows(rows)[SEASON_KEY],merged=mergeSeasonStores(localValueForKey(SEASON_KEY),remote);
        T20_SUPPRESS_SYNC=true;
        try{writeDataDocument(SEASON_KEY,merged,{native:true});Object.keys(seasonStore).forEach(key=>delete seasonStore[key]);Object.assign(seasonStore,logicalDataValue(SEASON_KEY,merged))}finally{T20_SUPPRESS_SYNC=false}
      }
      if(!force){
        const conflictingKeys=rows.filter(r=>!PARTITIONED_CLOUD_KEYS.includes(T20CloudPartitions.logicalKeyForPhysical(r.data_key))&&![CLUB_DUELS_KEY,SEASON_KEY,TV_SETTINGS_KEY].includes(r.data_key)&&targetKeys.includes(r.data_key)&&r.updated_at&&r.updated_at!==this.cloudUpdated[r.data_key]&&comparableCloudValue(r.data_key,r.data)!==comparableCloudValue(r.data_key,localValueForKey(r.data_key))).map(r=>r.data_key);
        if(conflictingKeys.length){
          const resolution=await this.resolveCloudConflict(rows,conflictingKeys);if(resolution!=='overwrite')return;
        }
      }
      const updatedAt=new Date().toISOString(),payload=targetKeys.filter(key=>!PARTITIONED_CLOUD_KEYS.includes(key)).map(k=>({data_key:k,data:localValueForKey(k),updated_at:updatedAt}));
      const client=requireSupabaseClient();
      const written=[];
      for(const logicalKey of targetKeys.filter(key=>PARTITIONED_CLOUD_KEYS.includes(key))){const result=await this.writePartitionedDocument(logicalKey,localValueForKey(logicalKey),rows,{force});written.push(...result.written);if(result.status==='handled')return}
      for(const item of payload){
        const guarded=!force&&![TV_SETTINGS_KEY,SETTINGS_KEY].includes(item.data_key),remoteRow=rows.find(row=>row.data_key===item.data_key);let response;
        if(guarded&&remoteRow){response=await client.from('triple20_data').update({data:item.data,updated_at:item.updated_at}).eq('data_key',item.data_key).eq('updated_at',remoteRow.updated_at).select('data_key,updated_at')}
        else if(guarded){response=await client.from('triple20_data').insert(item).select('data_key,updated_at')}
        else response=await client.from('triple20_data').upsert([item],{onConflict:'data_key'}).select('data_key,updated_at');
        const collision=guarded&&(response?.error?.code==='23505'||(!response?.error&&!(response?.data||[]).length));
        if(collision){
          const freshRows=await this.fetchCloud(),fresh=freshRows.find(row=>row.data_key===item.data_key);
          if(fresh&&comparableCloudValue(item.data_key,fresh.data)===comparableCloudValue(item.data_key,item.data)){written.push(fresh);continue}
          const resolution=await this.resolveCloudConflict(freshRows,[item.data_key]);if(resolution!=='overwrite')return;
          response=await client.from('triple20_data').upsert([item],{onConflict:'data_key'}).select('data_key,updated_at');
        }
        if(response?.error)throw response.error;written.push(...(response?.data||[]));
      }
      written.forEach(r=>this.cloudUpdated[r.data_key]=r.updated_at);
      targetKeys.forEach(key=>this.pendingKeys.delete(key));this.pendingSync=this.pendingKeys.size>0;if(this.pendingSync){nativeSetItem('triple20_pending_sync','1');nativeSetItem('triple20_pending_keys',JSON.stringify([...this.pendingKeys]));clearTimeout(this.syncTimer);this.syncTimer=setTimeout(()=>this.syncAll(),700)}else{nativeRemoveItem('triple20_pending_sync');nativeRemoveItem('triple20_pending_keys')}this.lastSyncAt=new Date().toISOString();nativeSetItem('triple20_last_sync',this.lastSyncAt);T20TabCoord.notifyCloudSaved(targetKeys);setSyncStatus(this.pendingSync?'Weitere Änderungen werden gespeichert …':'Online gespeichert',this.pendingSync?'saving':'saved');renderCloudPanel();
      }catch(e){console.warn('Cloud speichern fehlgeschlagen',e);targetKeys.forEach(key=>this.pendingKeys.add(key));this.pendingSync=true;nativeSetItem('triple20_pending_sync','1');nativeSetItem('triple20_pending_keys',JSON.stringify([...this.pendingKeys]));setSyncStatus('Offline – lokale Kopie','offline')}
    }finally{finishSync();this.syncing=false}
  },
  async uploadLocalWithBackup(){if(!isAdmin())return;const summary=backupPreview();backupTriple20Data('triple20_vor_cloud_upload');if(!await appConfirm(`Lokale Triple20-Daten in die Cloud übernehmen?\n\n${summary}\n\nEin JSON-Backup wurde heruntergeladen.`))return;await this.syncAll({force:true,all:true})},
  async loadCloudConfirmed(){
    if(this.loadBusy)return;this.loadBusy=true;
    try{const rows=await this.fetchCloud();if(!rows.length)throw new Error('In der Cloud wurden keine Triple20-Daten gefunden.');if(!await appConfirm('Frische Cloud-Daten laden? Die aktuelle lokale Version wird vorher als Backup gesichert.'))return;backupTriple20Data('triple20_vor_cloud_laden');this.applyFreshCloudRows(rows,CLOUD_DATA_KEYS);setSyncStatus('Frische Online-Version geladen','online');renderCloudPanel()}
    catch(error){console.warn('Cloud-Daten konnten nicht frisch geladen werden',error);setSyncStatus('Cloud-Daten konnten nicht geladen werden','offline')}
    finally{this.loadBusy=false}
  },
  startPolling(){clearInterval(this.pollTimer);clearInterval(this.memberPollTimer);clearInterval(this.stationPollTimer);this.pollTimer=setInterval(()=>{if(document.visibilityState==='hidden'||!$('#tvSection')?.classList.contains('hidden')||!$('#statsStationSection')?.classList.contains('hidden'))return;this.loadCloud()},30000);this.memberPollTimer=setInterval(()=>{if(!this.user||document.visibilityState==='hidden'||!$('#tvSection')?.classList.contains('hidden'))return;this.loadPublicMembers().then(()=>{if(!$('#seasonSection')?.classList.contains('hidden'))renderSeasonView()}).catch(error=>console.warn('Mitgliedsnamen konnten nicht aktualisiert werden',error))},10*60*1000);this.stationPollTimer=setInterval(()=>{if(document.visibilityState==='hidden')return;if(!$('#statsStationSection')?.classList.contains('hidden'))this.loadLiveTournament();else if(state.started||Object.values(state.competitions||{}).some(item=>item?.started))this.loadStationSuggestions()},10000)}
};
function currentMemberNickname(id,fallback=''){
  const nickname=(T20Cloud.publicMembers||[]).find(member=>member.id===id)?.nickname||'';return nickname||fallback;
}
function memberAvatarUrl(id){return T20Cloud.publicMemberAvatars?.[id]||T20Cloud.adminProfileAvatars?.[id]||(T20Cloud.user?.id===id?T20Cloud.avatarSignedUrl:'')||''}
function normalizedPlayerName(name){return (name||'').trim().replace(/\s+/g,' ').toLowerCase()}
function mappedPlayerValue(map,name){return map?.[name]||Object.entries(map||{}).find(([stored])=>normalizedPlayerName(stored)===normalizedPlayerName(name))?.[1]||''}
function profilePlayerId(profileId=''){return T20DataSchema.profilePlayerId(profileId)}
function newGuestPlayerId(){return`guest:${crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}`}
function playerIdFor(container,name,explicit=''){
  if(explicit)return String(explicit);const stored=mappedPlayerValue(container?.playerIds,name);if(stored)return String(stored);const profileId=mappedPlayerValue(container?.playerProfileIds,name);return profileId?profilePlayerId(profileId):T20DataSchema.legacyPlayerId(name)
}
function assignPlayerIdentity(container,name,{profileId='',playerId='',newGuest=false}={}){
  container.playerIds=container.playerIds||{};container.playerProfileIds=container.playerProfileIds||{};
  if(profileId)container.playerProfileIds[name]=profileId;
  const id=playerId||profilePlayerId(profileId)||(newGuest?newGuestPlayerId():playerIdFor(container,name));container.playerIds[name]=id;return id
}
function attachMatchPlayerIds(match,container=state){return T20DataSchema.ensureMatchIdentities(match,container)}
function currentSeasonWinsMap(){const season=setupSeason();if(!canViewSeasonStandings(season))return{};const rows=calculateSeasonStandings(season);return Object.fromEntries(rows.map(r=>[r.name,r.wins||0]))}
function sortBySeasonWins(players){if(!isAdmin())return [...players];const wins=currentSeasonWinsMap();return [...players].sort((a,b)=>(wins[b]||0)-(wins[a]||0)||a.localeCompare(b,'de'))}

function registeredMemberProfiles(){
  return isAdmin()?(T20Cloud.adminProfiles||[]).filter(profile=>profile.nickname?.trim()):[];
}
function setupSeason(){
  const assigned=assignedSeasonForTournament(state);if(assigned)return assigned;
  const competition=normalizedCompetition(state.activeCompetition),active=(seasonStore.seasons||[]).filter(season=>!season.archived),selected=selectedSeason();
  return active.find(season=>seasonCompetition(season)===competition)||(selected&&!selected.archived&&['open',competition].includes(seasonCompetition(selected))?selected:null)||active.find(season=>seasonCompetition(season)==='open')||null;
}
function addTournamentPlayer(name,profileId='',playerId=''){
  if(!T20Cloud.user&&!state.guestLocal)replaceTournamentState({...emptyCompetition(),guestLocal:true});
  name=(name||'').trim().replace(/\s+/g,' ');
  if(!name)return false;
  const season=setupSeason(),seasonPlayerId=mappedPlayerValue(season?.memberPlayerIds,name),resolvedId=playerId||profilePlayerId(profileId)||seasonPlayerId||'';
  if(state.players.some(player=>normalizedPlayerName(player)===normalizedPlayerName(name)||(resolvedId&&playerIdFor(state,player)===resolvedId))){appAlert('Dieser Spieler ist bereits eingetragen.');return false}
  state.players.push(name);assignPlayerIdentity(state,name,{profileId,playerId:resolvedId,newGuest:!resolvedId});save();renderPlayers();return true;
}
function renderRegisteredPlayerChoices(){
  const form=$('#playerForm');if(!form)return;
  let box=$('#registeredPlayerChoices');
  if(!box){box=document.createElement('div');box.id='registeredPlayerChoices';form.insertAdjacentElement('afterend',box)}
  if(!isAdmin()){box.innerHTML='';box.classList.add('hidden');return}
  const season=setupSeason(),enteredIds=new Set(state.players.map(player=>playerIdFor(state,player))),enteredNames=new Set(state.players.map(normalizedPlayerName)),choices=new Map();
  seasonMembers(season).forEach(storedName=>{const profileId=season?.memberProfileIds?.[storedName]||'',playerId=mappedPlayerValue(season?.memberPlayerIds,storedName)||profilePlayerId(profileId),name=currentMemberNickname(profileId,storedName).trim();if(name&&competitionCompatible(playerId,state.activeCompetition))choices.set(playerId||`name:${normalizedPlayerName(name)}`,{name,profileId,playerId})});
  const members=[...choices.values()].filter(member=>!(member.playerId&&enteredIds.has(member.playerId))&&!enteredNames.has(normalizedPlayerName(member.name))).sort((a,b)=>a.name.localeCompare(b.name,'de'));
  box.className=`registered-player-choices ${members.length?'':'hidden'}`;
  box.innerHTML=members.length?`<div class="registered-player-title"><strong>Gespeicherte Mitglieder</strong><small>Zum Hinzufügen anklicken</small></div><div class="registered-player-grid">${members.map(member=>{const photo=member.profileId?T20Cloud.adminProfileAvatars?.[member.profileId]||memberAvatarUrl(member.profileId):'',avatar=photo?`<img src="${esc(photo)}" alt="">`:esc(member.name.charAt(0).toUpperCase());return `<button type="button" class="registered-player" data-add-profile="${esc(member.name)}" data-profile-id="${esc(member.profileId||'')}" data-player-id="${esc(member.playerId||'')}"><span class="profile-avatar">${avatar}</span><span>${esc(member.name)}</span><b>+</b></button>`}).join('')}</div>`:'';
}
function renderPlayers(){
  if(!T20Cloud.user&&!state.guestLocal&&(state.players?.length||state.matches?.length)){ $('#playerList').innerHTML='';$('#playerCount').textContent='0 Spieler eingetragen';$('#memberSuggestions').innerHTML='<option value="">Mitglied auswählen …</option>';$('#registeredPlayerChoices')?.classList.add('hidden');$('#startBtn').disabled=true;return }
  if(!state.started)state.players=sortBySeasonWins(state.players);
  const seeds=activeSeededPlayers();$('#playerList').innerHTML=state.players.map((p,i)=>{const seed=seeds.indexOf(p)+1;return `<div class="player"><b><span>${i+1}</span>${esc(p)}${seed?`<small class="seed-badge">gesetzt ${seed}</small>`:''}</b><button data-remove="${i}" aria-label="${esc(p)} entfernen">×</button></div>`}).join('');
  $('#playerCount').textContent=`${state.players.length} Spieler eingetragen`;
  renderMemberSuggestions();
  renderRegisteredPlayerChoices();
  renderSeedingOptions();
  $('#startBtn').disabled=state.players.length<2;
}
function renderTournamentSubnav(){const nav=$('#tournamentSubnav');if(!nav)return;nav.classList.add('hidden');nav.innerHTML=''}
function setTournamentViewMode(mode){if(!isMember()||!['local','live'].includes(mode)||T20Cloud.tournamentViewMode===mode)return;if(T20Cloud.tournamentViewMode==='local')save();T20Cloud.tournamentViewMode=mode;replaceTournamentState(mode==='live'?structuredClone(T20Cloud.liveTournamentState||{players:[],playerIds:{},playerProfileIds:{},started:false,matches:[],settings:{}}):loadMemberTournament());renderPlayers();showTournament()}
function renderCompetitionNav(){
  const nav=$('#competitionNav');if(!nav)return;
  ensureTournamentDayState();
  nav.innerHTML=['men','women'].map(key=>{const competition=key===state.activeCompetition?competitionSnapshot():state.competitions[key],prepared=competition.started||competition.players?.length,open=competition.matches?.filter(match=>match.sa===null).length||0,status=competition.started?` · ${open} offen`:prepared?' · vorbereitet':'';return `<button type="button" class="${key===state.activeCompetition?'active':''}" data-competition="${key}">${competitionLabel(key)}${status}</button>`}).join('');
}
function setActiveCompetition(key){
  if(!['men','women'].includes(key)||key===state.activeCompetition)return;
  if(!state.started&&$('#tournamentName')?.value.trim()){state.settings=state.settings||{};state.settings.eventName=baseCompetitionEventName($('#tournamentName').value.trim());state.settings.name=`${state.settings.eventName} – ${competitionLabel(state.activeCompetition)}`}
  syncActiveCompetition();state.activeCompetition=key;loadActiveCompetition();save();renderPlayers();showTournament();
}
$('#playerForm').addEventListener('submit',e=>{e.preventDefault();const input=$('#playerName'),memberSelect=$('#memberSuggestions'),option=memberSelect?.selectedOptions?.[0],name=memberSelect?.value||input.value;if(!name){appAlert('Bitte ein Mitglied auswählen oder einen Namen eingeben.');return}if(addTournamentPlayer(name,option?.dataset.profileId||'',option?.dataset.playerId||'')){input.value='';if(memberSelect)memberSelect.value='';memberSelect?.focus()}});
$('#playerList').addEventListener('click',e=>{const i=e.target.dataset.remove;if(i!==undefined){const [removed]=state.players.splice(+i,1);if(removed){delete state.playerIds?.[removed];delete state.playerProfileIds?.[removed]}save();renderPlayers()}});
$('#setupSection').addEventListener('click',e=>{const button=e.target.closest('[data-add-profile]');if(button)addTournamentPlayer(button.dataset.addProfile,button.dataset.profileId,button.dataset.playerId)});
function renderTournamentSeasonTargetOptions(){
  const select=$('#tournamentSeasonTarget');if(!select)return;
  const current=state.scheduledSeasonId||state.settings?.targetSeasonId||state.settings?.doublesLotterySeasonId||'';
  const seasons=sortedSeasons().filter(season=>!season.archived),known=seasons.some(season=>String(season.id)===String(current));
  select.innerHTML=`<option value="">Eigenständiges Turnier · ohne Wertung</option>${seasons.map(season=>`<option value="${esc(season.id)}">${esc(seasonOptionLabel(season))}</option>`).join('')}`;
  select.value=known?String(current):'';
}
function renderCricketEntryHelp(){const box=$('#cricketEntryHelp'),lottery=$('#mode')?.value==='doubleslottery',cricket=$('#startScore')?.value==='cricket';box?.classList.toggle('hidden',lottery||!cricket)}
function toggleModeOptions(){const mode=$('#mode').value,lottery=mode==='doubleslottery';$('#groupOptions').classList.toggle('hidden',mode!=='roundrobin');$('#swissOptions').classList.toggle('hidden',mode!=='swiss');$('#doublesMixOptions')?.classList.toggle('hidden',mode!=='doublesmix');$('#doublesLotteryOptions')?.classList.toggle('hidden',!lottery);$('#legsField')?.classList.remove('hidden');$('#gameVariantField')?.classList.toggle('hidden',lottery);renderCricketEntryHelp();renderTournamentSeasonTargetOptions();$('#seedingOptions')?.classList.toggle('hidden',mode!=='double');renderSeedingOptions()}
$('#mode').addEventListener('change',()=>{if($('#mode').value==='doublesmix')$('#legs').value='2';toggleModeOptions()});toggleModeOptions();
$('#startScore')?.addEventListener('change',renderCricketEntryHelp);
$('#tournamentSeasonTarget')?.addEventListener('change',event=>{state.scheduledSeasonId=event.target.value||'';state.scheduledStandalone=!state.scheduledSeasonId;state.settings=state.settings||{};state.settings.targetSeasonId=state.scheduledSeasonId;if(state.settings.mode==='doubleslottery')state.settings.doublesLotterySeasonId=state.scheduledSeasonId;save();renderPlayers()});

function seedingDraft(){state.seedingDraft=state.seedingDraft||{seededPlayers:[],drawOrder:[]};return state.seedingDraft}
function playerBySeedName(name){const normalized=normalizedPlayerName(name);return state.players.find(player=>normalizedPlayerName(player)===normalized)||''}
function playerBySeedEntry(entry){
  const name=typeof entry==='string'?entry:entry?.name||'',profileId=typeof entry==='string'?'':entry?.profileId||'',playerId=typeof entry==='string'?mappedPlayerValue(state.playerIds,name):entry?.playerId||profilePlayerId(profileId);
  if(playerId){const linked=state.players.find(player=>playerIdFor(state,player)===playerId);if(linked)return linked}
  return playerBySeedName(name);
}
function selectedSeedingCount(){const value=$('#seedingCount')?.value??state.seedingDraft?.count??0;return value==='all'?'all':Math.max(0,Math.min(32,+value||0))}
function selectedSeedingLimit(){const count=selectedSeedingCount();return count==='all'?Number.MAX_SAFE_INTEGER:count}
function activeSeededPlayers(){
  if($('#mode')?.value!=='double'&&!state.started)return[];
  const limit=selectedSeedingLimit(),seen=new Set();return (state.seedingDraft?.seededPlayers||[]).map(playerBySeedName).filter(name=>name&&!seen.has(normalizedPlayerName(name))&&seen.add(normalizedPlayerName(name))).slice(0,limit);
}
function ensureSeedingDraw(force=false){
  const draft=seedingDraft(),seeded=activeSeededPlayers(),rest=state.players.filter(player=>!seeded.includes(player));
  const valid=!force&&draft.drawOrder?.length===state.players.length&&draft.drawOrder.every(player=>state.players.includes(player))&&seeded.every((player,index)=>draft.drawOrder[index]===player);
  if(!valid)draft.drawOrder=[...seeded,...shuffle(rest)];draft.count=selectedSeedingCount();return draft.drawOrder;
}
function selectedSeedingSeason(){return seasonStore.seasons.find(season=>String(season.id)===String($('#seedingSeason')?.value||selectedSeason()?.id||''))||selectedSeason()}
function renderSeedingOptions(){
  const box=$('#seedingOptions');if(!box)return;const visible=!state.started&&$('#mode')?.value==='double';box.classList.toggle('hidden',!visible);if(!visible)return;
  const draft=seedingDraft(),seasonSelect=$('#seedingSeason'),current=seasonSelect?.value||selectedSeason()?.id||'';
  if(seasonSelect){seasonSelect.innerHTML=(seasonStore.seasons||[]).map(season=>`<option value="${esc(season.id)}" ${String(season.id)===String(current)?'selected':''}>${esc(season.name)}</option>`).join('')||'<option value="">Keine Saison vorhanden</option>'}
  const count=$('#seedingCount');if(count)count.value=draft.count==='all'?'all':String([0,4,8,16,32].includes(+draft.count)?+draft.count:8);
  const rankingMode=$('#seedingRankingMode');if(rankingMode)rankingMode.value=draft.rankingMode==='total'?'total':'clean';draft.rankingMode=rankingMode?.value||'clean';
  draft.count=selectedSeedingCount();draft.seededPlayers=(draft.seededPlayers||[]).map(playerBySeedName).filter(Boolean).slice(0,state.players.length);
  const seeds=activeSeededPlayers(),available=state.players.filter(player=>!seeds.includes(player));
  const manual=$('#manualSeedPlayer');if(manual)manual.innerHTML=available.map(player=>`<option value="${esc(player)}">${esc(player)}</option>`).join('')||'<option value="">Alle Spieler gesetzt</option>';
  $('#seededPlayerList').innerHTML=seeds.length?seeds.map((player,index)=>`<div class="seeded-player"><span>${index+1}</span><b>${esc(player)}</b><button type="button" data-seed-up="${index}" ${index===0?'disabled':''} aria-label="Nach oben">↑</button><button type="button" data-seed-down="${index}" ${index===seeds.length-1?'disabled':''} aria-label="Nach unten">↓</button><button type="button" data-seed-remove="${index}" aria-label="Setzung entfernen">×</button></div>`).join(''):'<p class="option-help">Noch keine Spieler gesetzt. Du kannst eine Saisonrangliste übernehmen oder Spieler manuell hinzufügen.</p>';
  const preview=$('#seedingPreview');if(state.players.length<2){preview.innerHTML='<p class="option-help">Mindestens zwei Spieler eintragen.</p>';return}
  const order=ensureSeedingDraw(),plan=T20DoubleKO.create(order),games=T20DoubleKO.evaluate(plan).preview.filter(match=>match.bracket==='upper'&&match.stage===1);
  preview.innerHTML=games.map(match=>`<article><span>${esc(match.a||'Freilos')}</span><b>VS</b><span>${esc(match.automatic?'Freilos':match.b||'Freilos')}</span></article>`).join('');
}
function loadSeasonSeeding(){
  const count=selectedSeedingCount(),limit=selectedSeedingLimit(),season=selectedSeedingSeason();if(count===0){appAlert('Bitte zuerst eine Anzahl gesetzter Spieler auswählen.');return}if(!canViewSeasonStandings(season)){appAlert('Der Saisonendstand ist derzeit gesperrt und nur für den Vereinsadministrator sichtbar.');return}
  const draft=seedingDraft(),rankingMode=$('#seedingRankingMode')?.value==='total'?'total':'clean',rows=visibleSeasonStandings(season,rankingMode),ranked=[...new Set(rows.map(playerBySeedEntry).filter(Boolean))];
  if(!ranked.length){appAlert('Keiner der eingetragenen Turnierteilnehmer konnte der gewählten Saisonrangliste zugeordnet werden. Bitte zuerst die Spieler zum Turnier hinzufügen und danach die Rangliste übernehmen.');return}
  draft.count=count;draft.rankingMode=rankingMode;draft.seededPlayers=ranked.slice(0,limit);ensureSeedingDraw(true);save();renderPlayers()
}
function addManualSeed(){const player=$('#manualSeedPlayer')?.value;if(!player)return;const draft=seedingDraft();if(draft.seededPlayers.length>=state.players.length)return appAlert('Alle eingetragenen Spieler sind bereits gesetzt.');draft.seededPlayers.push(player);const needed=draft.seededPlayers.length,draftCount=needed<=4?4:needed<=8?8:needed<=16?16:needed<=32?32:'all';draft.count=draftCount;$('#seedingCount').value=String(draft.count);ensureSeedingDraw(true);save();renderPlayers()}
$('#seedingOptions').addEventListener('click',event=>{
  if(event.target.id==='loadSeasonSeeds'){loadSeasonSeeding();return}if(event.target.id==='addManualSeed'){addManualSeed();return}if(event.target.id==='rerollSeeding'){ensureSeedingDraw(true);renderSeedingOptions();save();return}
  const draft=seedingDraft(),up=event.target.dataset.seedUp,down=event.target.dataset.seedDown,remove=event.target.dataset.seedRemove,index=+(up??down??remove);
  if(remove!==undefined)draft.seededPlayers.splice(index,1);else if(up!==undefined&&index>0)[draft.seededPlayers[index-1],draft.seededPlayers[index]]=[draft.seededPlayers[index],draft.seededPlayers[index-1]];else if(down!==undefined&&index<draft.seededPlayers.length-1)[draft.seededPlayers[index+1],draft.seededPlayers[index]]=[draft.seededPlayers[index],draft.seededPlayers[index+1]];else return;ensureSeedingDraw(true);save();renderPlayers()
});
$('#seedingCount').addEventListener('change',()=>{const draft=seedingDraft();draft.count=selectedSeedingCount();draft.seededPlayers=draft.seededPlayers.slice(0,selectedSeedingLimit());ensureSeedingDraw(true);save();renderPlayers()});
$('#seedingRankingMode').addEventListener('change',()=>{const draft=seedingDraft();draft.rankingMode=$('#seedingRankingMode').value==='total'?'total':'clean';save()});

// Turnierauslosung und Paarungslogik werden vor app.js durch tournament-engine.js bereitgestellt.
$('#startBtn').addEventListener('click',event=>{if($('#mode').value==='doublesmix'&&state.players.length<4){event.stopImmediatePropagation();appAlert('Für das Doppel-Mixturnier werden mindestens vier Spieler benötigt.')}},{capture:true});
$('#startBtn').addEventListener('click',event=>{if($('#mode').value!=='doubleslottery')return;const eligibility=doublesLotteryEligibility(state.players.length);if(!eligibility.valid){event.stopImmediatePropagation();appAlert(eligibility.reason)}},{capture:true});
let startSeasonMismatchConfirmed=false;
$('#startBtn').addEventListener('click',async event=>{const target=seasonStore.seasons.find(season=>String(season.id)===String($('#tournamentSeasonTarget')?.value||'')),competition=normalizedCompetition(state.activeCompetition),targetCompetition=seasonCompetition(target),mismatch=target&&targetCompetition!=='open'&&targetCompetition!==competition;if(!mismatch||startSeasonMismatchConfirmed){startSeasonMismatchConfirmed=false;return}event.preventDefault();event.stopImmediatePropagation();if(await appConfirm(`Achtung: Der Bewerb ist „${competitionLabel(competition)}“, die gewählte Wertung ist ausdrücklich „${competitionLabel(targetCompetition)}“. Trotzdem so starten?`)){startSeasonMismatchConfirmed=true;$('#startBtn').click()}},{capture:true});
function isCricketMatch(match={},settings={}){const game=String(match?.game||'').toLowerCase(),label=String(match?.gameLabel||'').toLowerCase(),settingsGame=String(settings?.game||'').toLowerCase(),start=String(settings?.start||'').toLowerCase();return game==='cricket'||label.startsWith('cricket')||(!game&&(settingsGame==='cricket'||start==='cricket'))}
function selectedTournamentGame(mode=$('#mode')?.value){if(mode==='doubleslottery')return{game:'doubles-lottery-series',start:'301 DO · 301 DI/DO · Cricket',resultEntry:'leg-wins-only',cricketScoringEngine:'external-board'};const value=$('#startScore')?.value||'501';return value==='cricket'?{game:'cricket',start:'Cricket',resultEntry:'leg-wins-only',scoringEngine:'external-board'}:{game:'x01',start:+value||501}}
function tournamentGameLabel(settings=state.settings){if(settings?.mode==='doubleslottery'||settings?.game==='doubles-lottery-series')return'301 DO · 301 DI/DO · Cricket (nur Leg-Endstand)';return settings?.game==='cricket'||String(settings?.start||'').toLowerCase()==='cricket'?'Cricket · nur Leg-Endstand':String(settings?.start||501)}
function reassignScheduledTournament(eventId,targetSeasonId){
  if(!eventId)return false;const id=String(eventId),history=loadTournamentHistory(),sources=[];
  for(const season of seasonStore.seasons||[]){const record=(season.tournaments||[]).find(item=>item.planned&&String(item.id)===id);if(record)sources.push({season,record})}
  const historyRecord=history.find(item=>item.planned&&String(item.id)===id);if(historyRecord)sources.push({season:null,record:historyRecord});
  if(!sources.length)return false;const target=seasonStore.seasons.find(season=>String(season.id)===String(targetSeasonId||''))||null,current=sources.find(source=>source.season)?.season||null;if((current?.id||'')===(target?.id||'')&&sources.length===1)return false;
  const record=structuredClone(sources[0].record);for(const season of seasonStore.seasons||[]){const before=(season.tournaments||[]).length;season.tournaments=(season.tournaments||[]).filter(item=>!(item.planned&&String(item.id)===id));if(season.tournaments.length!==before)season.updatedAt=new Date().toISOString()}
  const nextHistory=history.filter(item=>!(item.planned&&String(item.id)===id));record.seasonId=target?.id||'';record.standalone=!target;
  if(target){target.tournaments=target.tournaments||[];target.tournaments.push(record);target.tournaments.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.startTime||'').localeCompare(b.startTime||''));target.updatedAt=new Date().toISOString()}else nextHistory.push(record);
  writeLogicalData(SEASON_KEY,seasonStore,{native:true});persistTournamentHistory(nextHistory,{native:true});return true;
}
$('#startBtn').addEventListener('click',async()=>{state.eventName=$('#tournamentName').value.trim()||'Dartturnier';state.withdrawn=[];state.scoreAudit=[];state.scoreUndoStack=[];state.endedEarly=undefined;state.savedToHistory=undefined;state.seasonImportedTo=undefined;state.seasonTournamentId=undefined;state.liveSessionId=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;state.liveStartedAt=new Date().toISOString();const mode=$('#mode').value,doubleMode=mode==='double',targetSeasonId=$('#tournamentSeasonTarget')?.value||'',assignmentChanged=reassignScheduledTournament(state.scheduledEventId,targetSeasonId),draw=doubleMode?[...ensureSeedingDraw()]:[],seeds=doubleMode?[...activeSeededPlayers()]:[],seedingRankingMode=state.seedingDraft?.rankingMode==='total'?'total':'clean';state.scheduledSeasonId=targetSeasonId;state.scheduledStandalone=!targetSeasonId;state.settings={name:competitionTitle(),eventName:state.eventName,competition:state.activeCompetition,mode,legs:+$('#legs').value,...selectedTournamentGame(),groupCount:+$('#groupCount').value,qualifiers:+$('#qualifiers').value,swissRounds:+$('#swissRounds').value,doublesMixRounds:+$('#doublesMixRounds').value,targetSeasonId,doublesLotterySeasonId:mode==='doubleslottery'?targetSeasonId:'',doubleKoDrawOrder:draw,doubleKoSeededPlayers:seeds,doubleKoSeedingRankingMode:seedingRankingMode};state.matches=makeMatches();state.started=true;state.tvPausedCompetitions={...(state.tvPausedCompetitions||{}),[state.activeCompetition||'men']:false};state.seedingDraft=undefined;const other=state.competitions?.[state.activeCompetition==='men'?'women':'men'],otherHasPlayed=(other?.matches||[]).some(match=>match.b!=='Freilos'&&match.sa!==null);if(!otherHasPlayed)state.tvBoardAssignments=[];save({queueCloud:false});renderTournament();const published=await publishLiveTournament({notifyOnError:true,additionalKeys:assignmentChanged?[SEASON_KEY,TOURNAMENT_HISTORY_KEY]:[]});if(published)await PushNotifications.sendLiveTournament()});

function playerLosses(){const losses=Object.fromEntries(state.players.map(p=>[p,0]));state.matches.filter(m=>m.sa!==null&&m.b!=='Freilos').forEach(m=>{losses[m.sa>m.sb?m.b:m.a]++});return losses}
function standingsFor(players,matches=state.matches){return players.map(name=>{const played=matches.filter(m=>m.sa!==null&&m.b!=='Freilos'&&matchPlayerSide(m,name)),byes=matches.filter(m=>m.sa!==null&&m.a===name&&m.b==='Freilos').length;let w=0,lf=0,la=0;played.forEach(m=>{const side=matchPlayerSide(m,name),own=side==='a'?m.sa:m.sb,other=side==='a'?m.sb:m.sa;lf+=own;la+=other;if(own>other)w++});return{name,p:played.length,w,l:played.length-w,byes,lf,la,pts:(w+byes)*2}}).sort((a,b)=>b.pts-a.pts||b.w-a.w||(b.lf-b.la)-(a.lf-a.la)||b.lf-a.lf||a.name.localeCompare(b.name,'de'))}
function standings(){return standingsFor(state.players)}
function lotteryLeaderNames(){const rows=standings(),leader=rows[0];if(!leader)return[];return rows.filter(row=>row.pts===leader.pts&&row.w===leader.w&&row.lf-row.la===leader.lf-leader.la&&row.lf===leader.lf).map(row=>row.name)}
function modeName(){return state.settings.mode==='roundrobin'?'Jeder gegen jeden':state.settings.mode==='swiss'?'Schweizer System':state.settings.mode==='doublesmix'?'Doppel-Mix · Einzelwertung':state.settings.mode==='doubleslottery'?'Doppel-Lotterie · Einzelwertung':state.settings.mode==='double'?'Doppel-K.-o.-Turnier':'K.-o.-Turnier'}
function isEliminationTournament(source=state){const settings=source?.settings||{};return !!settings.doubleKoPlan||['knockout','double'].includes(settings.mode||source?.mode)}
function tournamentCompletionStatus(source=state){if(['completed','shortened','cancelled'].includes(source?.completionStatus))return source.completionStatus;if(source?.cancelled)return'cancelled';if(source?.endedEarly)return isEliminationTournament(source)?'cancelled':'shortened';return'completed'}
function earlyEndRoundStatus(source=state){const real=(source.matches||[]).filter(match=>match.b!=='Freilos'),played=real.filter(match=>match.sa!==null),playedRounds=[...new Set(played.map(match=>match.round||1))],incompleteRound=playedRounds.find(round=>real.some(match=>(match.round||1)===round&&match.sa===null));return{played:played.length,total:real.length,playedRounds,incompleteRound,canShorten:played.length>0&&!incompleteRound}}
function champion(){
  if(state.endedEarly)return isEliminationTournament(state)?'':standings()[0]?.name||'';
  if(state.settings.doubleKoPlan)return T20DoubleKO.evaluate(state.settings.doubleKoPlan,state.matches).champion;
  if(state.settings.mode==='roundrobin')return state.groups?.length>1?'':state.matches.every(m=>m.sa!==null)?standings()[0]?.name:'';
  if(state.settings.mode==='swiss'){const active=activeSwissPlayers();if(active.length<=1&&state.matches.every(m=>m.sa!==null))return active[0]||standings()[0]?.name||'';return state.matches.every(m=>m.sa!==null)&&Math.max(...state.matches.map(m=>m.round||1))>=(state.settings.swissRounds||4)?standings()[0]?.name:''}
  if(state.settings.mode==='doublesmix')return state.matches.length&&state.matches.every(m=>m.sa!==null)&&Math.max(...state.matches.map(m=>m.round||1))>=(state.settings.doublesMixRounds||6)?standings()[0]?.name:'';
  if(state.settings.mode==='doubleslottery')return state.matches.length&&state.matches.every(m=>m.sa!==null)?lotteryLeaderNames().join(' & '):'';
  const limit=state.settings.mode==='double'?2:1,losses=playerLosses(),active=state.players.filter(p=>losses[p]<limit);
  return active.length===1&&state.matches.every(m=>m.sa!==null)?active[0]:'';
}
function eliminationMatchType(match,index,matches=state.matches){
  if(match.bracket==='lower')return'Verliererrunde';
  if(match.bracket==='grand'){const finalNumber=matches.slice(0,index+1).filter(item=>item.bracket==='grand').length;return finalNumber>1?'Entscheidungsfinale':'Großes Finale'}
  return'Spiel';
}
function doublesMixPauseHtml(round){const pauses=state.settings.mode==='doublesmix'?(state.settings.doublesMixPauses?.[round]||[]):[];return pauses.length?`<div class="doubles-mix-pause"><b>Pause in Runde ${esc(round)}</b><span>${pauses.map(esc).join(' · ')}</span></div>`:''}
function renderTournament(){
  const route=new URLSearchParams(location.search);if(route.get('bereich')==='live')selectLiveCompetition(route.get('bewerb')||'men');
  renderTournamentSubnav();renderCompetitionNav();$('#memberLiveEmpty')?.classList.add('hidden');
  if(isMember()&&T20Cloud.tournamentViewMode==='live'&&!state.started){$('#setupSection').classList.add('hidden');$('#tournamentSection').classList.add('hidden');$('#memberLiveEmpty')?.classList.remove('hidden');renderReadonlyMode();return}
  if(!T20Cloud.user&&!state.started){$('#setupSection').classList.add('hidden');$('#tournamentSection').classList.add('hidden');$('#memberLiveEmpty')?.classList.remove('hidden');renderReadonlyMode();return}
  if(!state.started){$('#setupSection').classList.remove('hidden');$('#tournamentSection').classList.add('hidden');$('#tournamentName').value=competitionEventName()||'Freitag-Abend-Cup';renderTournamentSeasonTargetOptions();renderReadonlyMode();return}
  const noBracket=['roundrobin','swiss','doublesmix','doubleslottery'].includes(state.settings.mode);
  $('#setupSection').classList.add('hidden');$('#tournamentSection').classList.remove('hidden');$('#bracketTab').classList.toggle('hidden',noBracket);
  if(noBracket&&$('#bracketTab').classList.contains('active')){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelector('[data-tab="matches"]').classList.add('active');$('#matchesView').classList.remove('hidden');$('#bracketView').classList.add('hidden');$('#tableView').classList.add('hidden')}
  const lotterySeries=state.settings.mode==='doubleslottery'?seasonStore.seasons.find(season=>String(season.id)===String(state.settings.doublesLotterySeasonId||'')):null,repeatPairs=state.settings.doublesLotteryRepeatPairs||0,repeatHistory=state.settings.doublesLotteryRepeatHistory||0,opponentRepeats=state.settings.doublesLotteryOpponentRepeats||0,lotteryDraw=state.settings.mode==='doubleslottery'?` · ${lotterySeries?lotterySeries.name:'freie Auslosung'} · ${repeatPairs?`${repeatPairs} unvermeidbar wiederholte${repeatPairs===1?'s Doppel':' Doppel'}`:'keine Partnerwiederholung'}${repeatHistory>repeatPairs?` · ${repeatHistory} frühere gemeinsame Spieltage`:''}${opponentRepeats?` · ${opponentRepeats} Gegnerwiederholung${opponentRepeats===1?'':'en'}`:''}`:'';
  $('#liveCompetitionLabel').textContent=`${competitionLabel().toUpperCase()} · LIVE-TURNIER`;$('#liveTitle').textContent=competitionEventName()||state.settings.name;$('#liveMeta').textContent=`${state.players.length} Teilnehmende · ${modeName()} · ${tournamentGameLabel()}${lotteryDraw}`;
  const refreshed=T20Cloud.lastSyncAt?new Date(T20Cloud.lastSyncAt).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';$('#liveViewerStatus').textContent=refreshed?`Automatisch aktuell · zuletzt ${refreshed} Uhr`:'Automatische Aktualisierung alle 15 Sekunden';
  $('#openTvViewBtn')?.classList.toggle('hidden',!isAdmin());
  $('#openStatsStationBtn')?.classList.toggle('hidden',!isAdmin());
  $('#tournamentActionsMenu')?.classList.toggle('hidden',!isAdmin());
  renderTvDisplayControls();
  $('#showLiveQrBtn')?.classList.toggle('hidden',!isAdmin());
  $('#renameEventBtn')?.classList.toggle('hidden',!isAdmin());
  $('#undoLastScoreBtn')?.classList.toggle('hidden',!isAdmin()||!(state.scoreUndoStack||[]).length||!!state.seasonImportedTo);
  const endButton=$('#endTournamentBtn');endButton?.classList.toggle('hidden',!isAdmin()||!!champion());if(endButton)endButton.textContent=isEliminationTournament(state)?'Turnier abbrechen':'Turnier vorzeitig beenden';
  const done=state.matches.filter(m=>m.sa!==null).length;$('#progressText').textContent=(state.matches.length?Math.round(done/(state.settings.doubleKoPlan?2*state.players.length-2+Number(state.matches.some(m=>m.nodeId==='F2')):state.matches.length)*100):0)+'%';
  const indexedMatches=state.matches.map((match,index)=>({match,index})),viewerOrder=isAdmin()&&!state.settings.doubleKoPlan?indexedMatches:[...indexedMatches].sort((a,b)=>Number(a.match.sa!==null)-Number(b.match.sa!==null)||a.index-b.index),firstOpenIndex=viewerOrder.find(item=>item.match.sa===null&&item.match.b!=='Freilos')?.index;
  const matchCard=({match:m,index:i})=>{const current=!isAdmin()&&i===firstOpenIndex,completed=m.sa!==null,suggestion=!completed?m.suggestedScore:null,scoreA=suggestion?.a??m.sa,scoreB=suggestion?.b??m.sb,format=m.gameLabel?` · ${esc(m.gameLabel)}`:'';return `<article class="match ${completed?'done':''} ${suggestion?'has-score-suggestion':''} ${current?'current-live-match':''}">${current?'<div class="current-live-label">AKTUELL · NÄCHSTES SPIEL</div>':''}<div class="match-no">${m.group!==undefined?'Gruppe '+String.fromCharCode(65+m.group)+' · ':''}Runde ${m.round}${format} · ${eliminationMatchType(m,i)} ${String(i+1).padStart(2,'0')}${suggestion?'<span class="score-suggestion-label">Screenshot-Vorschlag · bitte bestätigen</span>':''}</div><div class="players-match"><span class="${m.sa>m.sb?'winner-player':''}">${esc(m.a)}</span><b>${completed?m.sa+' : '+m.sb:'VS'}</b><span class="${m.sb>m.sa?'winner-player':''}">${esc(m.b)}</span></div><div class="score-controls">${m.b==='Freilos'?'Weiter':`<select data-sa="${i}" aria-label="Gewonnene Legs ${esc(m.a)}">${options(scoreA)}</select><span>:</span><select data-sb="${i}" aria-label="Gewonnene Legs ${esc(m.b)}">${options(scoreB)}</select><button data-save="${i}" aria-label="${completed?'Leg-Endstand korrigieren':'Leg-Endstand speichern'}" title="${completed?'Leg-Endstand korrigieren':'Leg-Endstand speichern'}">${completed?'Ändern':'✓'}</button>`}</div></article>`};
  const roundGroups=new Map();viewerOrder.forEach(item=>{const key=String(item.match.round||1);if(!roundGroups.has(key))roundGroups.set(key,[]);roundGroups.get(key).push(item)});
  $('#matchList').innerHTML=state.settings.doubleKoPlan?viewerOrder.filter(item=>item.match.sa===null).map(matchCard).join('')+`<details class="completed-round"><summary>Gespielte Begegnungen (${viewerOrder.filter(item=>item.match.sa!==null).length})</summary>${viewerOrder.filter(item=>item.match.sa!==null).map(matchCard).join('')}</details>`:[...roundGroups.entries()].map(([round,items])=>{const complete=items.every(({match})=>match.sa!==null),pause=doublesMixPauseHtml(round);if(!complete)return pause+items.map(matchCard).join('');return `<details class="completed-round"><summary><span>Runde ${esc(round)} abgeschlossen</span><small>${items.length} Spiel${items.length===1?'':'e'} anzeigen</small></summary><div class="completed-round-matches">${pause}${items.map(matchCard).join('')}</div></details>`}).join('');
  renderScoreHistory();renderTable();renderBracket();renderQualification();renderWithdrawCard();const winner=champion();$('#winnerCard').classList.toggle('hidden',!winner);if(winner){$('#winnerName').textContent=winner;saveTournamentToHistory()}renderSeasonImport(winner);renderReadonlyMode();
}
function options(current){let s='<option value="">–</option>';for(let i=0;i<=state.settings.legs;i++)s+=`<option ${current===i?'selected':''}>${i}</option>`;return s}
function renderWithdrawCard(){
  const card=$('#withdrawCard');if(!card)return;
  const mode=state.settings.mode,changeable=['swiss','doublesmix'].includes(mode),visible=state.started&&changeable&&!champion()&&canEditCurrentTournament();
  card.classList.toggle('hidden',!visible);if(!visible)return;
  const active=activeTournamentPlayers(),withdrawn=withdrawnPlayers(),isMix=mode==='doublesmix';
  const entered=new Set(state.players.map(p=>p.toLowerCase())),suggestions=seasonMembers(setupSeason()).filter(p=>!entered.has(p.toLowerCase()));
  card.innerHTML=`<div><h3>Ein-/Ausstieg ${isMix?'im Doppel-Mix':'im Schweizer System'}</h3><p>Nach einer abgeschlossenen Runde kannst du Spieler aus dem weiteren Turnier nehmen oder neue Spieler in die nächste ungespielte Runde aufnehmen. Die Paarungen dieser Runde werden danach neu ausgelost.${isMix?' Bereits erzielte Einzelpunkte bleiben erhalten.':''}</p>${withdrawn.length?`<div class="withdrawn-list">Ausgestiegen: ${withdrawn.map(p=>`<span>${esc(p)}</span>`).join('')}</div>`:''}</div><div class="swiss-change-actions"><div class="withdraw-actions"><select id="withdrawPlayerSelect" aria-label="Spieler zum Aussteigen auswählen">${active.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select><button id="withdrawPlayerBtn" class="danger" ${active.length<(isMix?5:1)?'disabled':''}>Spieler steigt aus</button></div><div class="late-join-fields"><select id="joinMemberSelect" aria-label="Gespeichertes Mitglied hinzufügen"><option value="">Mitglied auswählen …</option>${suggestions.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select><input id="joinPlayerName" placeholder="Oder neuen Spieler eingeben" autocomplete="off"></div><button id="joinPlayerBtn" class="secondary">Spieler steigt ein</button></div>`;
}
function canRebuildCurrentRound(){
  const round=Math.max(...state.matches.map(m=>m.round||1)),current=state.matches.filter(m=>(m.round||1)===round),roundStarted=current.some(m=>m.sa!==null&&m.b!=='Freilos'),roundOpen=current.some(m=>m.sa===null);
  if(roundStarted&&roundOpen){appAlert('Bitte die aktuelle Runde erst fertig spielen. Danach kann die nächste Runde neu gepaart werden.');return null}
  return{round,current,roundStarted,roundOpen};
}
function rebuildSwissRound(round){
  state.matches=state.matches.filter(m=>(m.round||1)!==round);
  if(round<=(state.settings.swissRounds||4)&&activeSwissPlayers().length>1)state.matches.push(...swissRound(round,state.matches));
}
function rebuildDoublesMixRound(round){
  state.matches=state.matches.filter(m=>(m.round||1)!==round);if(state.settings.doublesMixPauses)delete state.settings.doublesMixPauses[round];
  if(round<=(state.settings.doublesMixRounds||6)&&activeTournamentPlayers().length>=4)state.matches.push(...doublesMixRound(round,state.matches));
}
async function withdrawRoundPlayer(name){
  const mode=state.settings.mode;if(!canEditCurrentTournament()||!state.started||!['swiss','doublesmix'].includes(mode)||!name)return;
  if(mode==='doublesmix'&&activeTournamentPlayers().length<=4){appAlert('Für eine weitere Doppelrunde müssen mindestens vier Spieler aktiv bleiben.');return}
  state.withdrawn=state.withdrawn||[];if(state.withdrawn.includes(name))return;
  const status=canRebuildCurrentRound();if(!status)return;
  const {round,roundStarted,current}=status,hasOpenMatch=current.some(m=>matchPlayerSide(m,name));
  state.withdrawn.push(name);
  if(!roundStarted||hasOpenMatch)(mode==='doublesmix'?rebuildDoublesMixRound:rebuildSwissRound)(round);
  save({queueCloud:false});renderTournament();await publishLiveTournament({notifyOnError:true});
}
async function joinRoundPlayer(name){
  name=(name||'').trim();const mode=state.settings.mode;if(!canEditCurrentTournament()||!state.started||!['swiss','doublesmix'].includes(mode)||!name)return;
  if(state.players.some(p=>p.toLowerCase()===name.toLowerCase())){appAlert('Dieser Spieler ist bereits im Turnier eingetragen.');return}
  const status=canRebuildCurrentRound();if(!status)return;
  const {round,roundStarted}=status,targetRound=roundStarted?round+1:round;
  const maxRounds=mode==='doublesmix'?(state.settings.doublesMixRounds||6):(state.settings.swissRounds||4);
  if(targetRound>maxRounds){appAlert('Es gibt keine weitere Runde mehr, in die der Spieler einsteigen kann.');return}
  const season=setupSeason(),profileId=mappedPlayerValue(season?.memberProfileIds,name),savedPlayerId=mappedPlayerValue(season?.memberPlayerIds,name);state.players.push(name);assignPlayerIdentity(state,name,{profileId,playerId:savedPlayerId,newGuest:!profileId&&!savedPlayerId});state.players=sortBySeasonWins(state.players);
  if(mode==='doublesmix'){state.settings.doublesMixJoinRounds={...(state.settings.doublesMixJoinRounds||{}),[name]:targetRound}}
  if(season&&!seasonMembers(season).some(p=>p.toLowerCase()===name.toLowerCase())){season.memberPlayerIds={...(season.memberPlayerIds||{}),[name]:playerIdFor(state,name)};saveSeasonMembers(season,[...seasonMembers(season),name])}
  (mode==='doublesmix'?rebuildDoublesMixRound:rebuildSwissRound)(targetRound);
  save({queueCloud:false});renderTournament();await publishLiveTournament({notifyOnError:true});
}
function advanceElimination(){
  if(state.settings.doubleKoPlan){state.matches=T20DoubleKO.evaluate(state.settings.doubleKoPlan,state.matches).matches.map(match=>attachMatchPlayerIds(match));return}
  if(['roundrobin','doubleslottery'].includes(state.settings.mode))return;
  if(state.settings.mode==='doublesmix'){
    const round=Math.max(...state.matches.map(m=>m.round||1)),current=state.matches.filter(m=>(m.round||1)===round),total=state.settings.doublesMixRounds||6;
    if(current.some(m=>m.sa===null)||round>=total||state.matches.some(m=>(m.round||1)===round+1))return;
    state.matches.push(...doublesMixRound(round+1,state.matches));return;
  }
  if(state.settings.mode==='swiss'){
    const round=Math.max(...state.matches.map(m=>m.round||1)),current=state.matches.filter(m=>(m.round||1)===round);
    if(current.some(m=>m.sa===null)||round>=(state.settings.swissRounds||4)||state.matches.some(m=>(m.round||1)===round+1))return;
    if(activeSwissPlayers().length<2)return;
    state.matches.push(...swissRound(round+1,state.matches));return;
  }
  while(true){
    const round=Math.max(...state.matches.map(m=>m.round||1)),current=state.matches.filter(m=>(m.round||1)===round);
    if(current.some(m=>m.sa===null))return;
    const limit=state.settings.mode==='double'?2:1,losses=playerLosses(),active=state.players.filter(p=>losses[p]<limit);
    if(active.length<=1)return;
    const next=round+1;
    const winners=matches=>matches.map(m=>m.sa>m.sb?m.a:m.b);
    if(state.settings.mode==='knockout'){addPairs(state.matches,winners(current),next,'upper');continue}
    const upperActive=state.players.filter(player=>losses[player]===0),lowerActive=state.players.filter(player=>losses[player]===1),completedGrand=state.matches.some(match=>match.bracket==='grand'&&match.sa!==null);
    if(active.length===2&&completedGrand){const previousGrand=state.matches.filter(match=>match.bracket==='grand').at(-1),ordered=previousGrand?[previousGrand.a,previousGrand.b]:active;addPairs(state.matches,ordered,next,'grand');continue}
    if(active.length===2&&upperActive.length===1&&lowerActive.length===1){addPairs(state.matches,[upperActive[0],lowerActive[0]],next,'grand');continue}
    const upperGames=current.filter(m=>m.bracket==='upper'),lowerGames=current.filter(m=>m.bracket==='lower');
    const upperWinners=winners(upperGames),lowerWinners=winners(lowerGames);
    const upperLosers=upperGames.filter(m=>m.b!=='Freilos').map(m=>m.sa>m.sb?m.b:m.a);
    const orderedPool=(activePlayers,preferred)=>[...new Set([...preferred,...activePlayers])].filter(player=>activePlayers.includes(player));
    const upperEntrants=orderedPool(upperActive,upperWinners),lowerPreferred=[];
    for(let i=0,max=Math.max(lowerWinners.length,upperLosers.length);i<max;i++){if(lowerWinners[i])lowerPreferred.push(lowerWinners[i]);if(upperLosers[i])lowerPreferred.push(upperLosers[i])}
    const lowerEntrants=orderedPool(lowerActive,lowerPreferred);
    if(upperEntrants.length>1)addPairs(state.matches,upperEntrants,next,'upper');
    if(lowerEntrants.length>1)addPairs(state.matches,lowerEntrants,next,'lower');
    if(upperEntrants.length<2&&lowerEntrants.length<2)return;
  }
}
function scoreMatchLabel(match,index){return `Runde ${match.round||1}${match.gameLabel?` · ${match.gameLabel}`:''} · ${match.a} gegen ${match.b} · Spiel ${index+1}`}
function pushScoreAudit(entry){state.scoreAudit=state.scoreAudit||[];state.scoreAudit.push({id:`score-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,at:new Date().toISOString(),actor:T20Cloud.profile?.nickname||(isFullAdmin()?'Vereinsadministrator':'Turnierleitung'),...entry});state.scoreAudit=state.scoreAudit.slice(-30)}
function renderScoreHistory(){
  const card=$('#scoreHistoryCard');if(!card)return;const entries=(state.scoreAudit||[]).slice(-8).reverse();card.classList.toggle('hidden',!isAdmin()||!entries.length);if(!isAdmin()||!entries.length){card.innerHTML='';return}
  card.innerHTML=`<details class="score-history-details"><summary><span><b>Änderungsprotokoll</b><small>${entries.length} letzte Ergebnisänderung${entries.length===1?'':'en'}</small></span></summary><div class="score-history-heading"><div><span class="eyebrow">ÄNDERUNGSPROTOKOLL</span><h3>Letzte Ergebnisänderungen</h3></div><small>Nur für die Turnierleitung sichtbar</small></div><div class="score-history-list">${entries.map(entry=>`<article><span>${entry.action==='undo'?'↶':entry.action==='correct'?'↻':'✓'}</span><div><b>${esc(entry.label||'Spiel')}</b><small>${esc(entry.actor||'Turnierleitung')} · ${entry.action==='undo'?'Rückgängig gemacht':entry.action==='correct'?`${esc(entry.before||'–')} → ${esc(entry.after||'–')}`:`Ergebnis ${esc(entry.after||'–')} gespeichert`} · ${new Date(entry.at).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})} Uhr</small></div></article>`).join('')}</div></details>`;
}
function detachCompletedScoreRecord(){
  if(state.seasonImportedTo){appAlert('Dieses Turnier wurde bereits in die Saisonwertung übernommen. Ergebnisse können danach nicht mehr verändert werden.');return false}
  if(state.savedToHistory){persistTournamentHistory(loadTournamentHistory().filter(item=>item.id!==state.savedToHistory));state.savedToHistory=undefined}
  state.endedEarly=undefined;return true
}
async function saveMatchScore(index,sa,sb){
  if(state.settings.doubleKoPlan){
    const match=state.matches[index];if(!match)return;
    const before=match.sa===null?null:`${match.sa}:${match.sb}`,after=`${sa}:${sb}`;if(before===after)return;
    let next;try{next=T20DoubleKO.correct(state.settings.doubleKoPlan,state.matches,match.nodeId,sa,sb)}catch(error){appAlert(error.message);return}
    if(!detachCompletedScoreRecord())return;
    const matchesBefore=structuredClone(state.matches),label=scoreMatchLabel(match,index);state.matches=next;const confirmed=state.matches.find(item=>item.nodeId===match.nodeId);if(confirmed)delete confirmed.suggestedScore;
    state.scoreUndoStack=[...(state.scoreUndoStack||[]),{at:new Date().toISOString(),label,matchesBefore}].slice(-20);
    pushScoreAudit({action:before===null?'save':'correct',label,before,after});save({queueCloud:false});renderTournament();await publishLiveTournament();return;
  }
  const match=state.matches[index];if(!match)return;const oldScore=match.sa===null?null:`${match.sa}:${match.sb}`,newScore=`${sa}:${sb}`;if(oldScore===newScore){appAlert('Dieses Ergebnis ist bereits gespeichert.');return}if(!detachCompletedScoreRecord())return;
  const laterMatches=['roundrobin','doubleslottery'].includes(state.settings.mode)?[]:state.matches.filter(item=>(item.round||1)>(match.round||1));if(laterMatches.some(item=>item.sa!==null&&item.b!=='Freilos')){appAlert('In einer späteren Runde wurden bereits Ergebnisse gespeichert. Bitte mache zuerst die jeweils letzten Ergebnisse rückgängig.');return}
  const matchesBefore=structuredClone(state.matches),label=scoreMatchLabel(match,index);if(laterMatches.length)state.matches=state.matches.filter(item=>(item.round||1)<=(match.round||1));const target=state.matches[index];if(!target)return;target.sa=sa;target.sb=sb;delete target.suggestedScore;advanceElimination();state.scoreUndoStack=state.scoreUndoStack||[];state.scoreUndoStack.push({at:new Date().toISOString(),label,matchesBefore});state.scoreUndoStack=state.scoreUndoStack.slice(-20);pushScoreAudit({action:oldScore===null?'save':'correct',label,before:oldScore,after:newScore});save({queueCloud:false});renderTournament();await publishLiveTournament()
}
async function undoLastScore(){
  if(!isAdmin()||!state.started)return;const stack=state.scoreUndoStack||[],last=stack.at(-1);if(!last)return;if(!await appConfirm(`Letzte Ergebnisänderung rückgängig machen?\n\n${last.label}`))return;if(!detachCompletedScoreRecord())return;state.matches=structuredClone(last.matchesBefore||[]);stack.pop();pushScoreAudit({action:'undo',label:last.label});save({queueCloud:false});renderTournament();await publishLiveTournament({notifyOnError:true})
}
$('#matchList').addEventListener('click',async e=>{const i=e.target.dataset.save;if(i===undefined)return;if(!assertTournamentAction())return;const match=state.matches[+i],cricket=isCricketMatch(match,state.settings),a=$(`[data-sa="${i}"]`).value,b=$(`[data-sb="${i}"]`).value;if(a===''||b===''||a===b){appAlert(cricket?'Bitte nur den eindeutigen Leg-Endstand des beendeten Cricket-Spiels eintragen.':'Bitte ein eindeutiges Ergebnis eintragen.');return}if(Math.max(+a,+b)!==state.settings.legs){appAlert(`${cricket?'Beim Cricket wird hier nur der Leg-Endstand gespeichert. Der Sieger':'Der Sieger'} benötigt ${state.settings.legs} Legs.`);return}await saveMatchScore(+i,+a,+b)});
$('#withdrawCard').addEventListener('click',async e=>{
  if((e.target.id==='withdrawPlayerBtn'||e.target.id==='joinPlayerBtn')&&!assertTournamentAction())return;
  if(e.target.id==='withdrawPlayerBtn'){const name=$('#withdrawPlayerSelect')?.value;if(!name)return;if(!await appConfirm(`${name} aus dem weiteren Turnier nehmen?`))return;await withdrawRoundPlayer(name)}
  if(e.target.id==='joinPlayerBtn'){const name=$('#joinMemberSelect')?.value||$('#joinPlayerName')?.value;if(!name){appAlert('Bitte ein Mitglied auswählen oder einen Namen eingeben.');return}if(!await appConfirm(`${name} ab der nächsten Runde ins Turnier aufnehmen?`))return;await joinRoundPlayer(name)}
});

function tableHtml(rows,title=''){return `<div class="group-table">${title?`<h3>${title}</h3>`:''}<div class="table-wrap"><table><thead><tr><th>#</th><th>Spieler</th><th>Sp.</th><th>S</th><th>N</th><th>Legs</th><th>Pkt.</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.name)}</b></td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.lf}:${r.la}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></div></div>`}
function renderTable(){if(state.settings.mode==='roundrobin'&&state.groups?.length>1)$('#tableView').innerHTML=state.groups.map((players,i)=>tableHtml(standingsFor(players,state.matches.filter(m=>m.group===i)),`Gruppe ${String.fromCharCode(65+i)}`)).join('');else $('#tableView').innerHTML=tableHtml(standings())}
function qualifiedPlayers(){if(!state.groups?.length)return[];return state.groups.flatMap((players,i)=>standingsFor(players,state.matches.filter(m=>m.group===i)).slice(0,Math.min(state.settings.qualifiers||1,players.length)).map(r=>r.name))}
function renderQualification(){const visible=state.settings.mode==='roundrobin'&&state.groups?.length>1&&state.matches.every(m=>m.sa!==null),card=$('#qualificationCard');card.classList.toggle('hidden',!visible);if(visible)$('#qualifiedPlayers').innerHTML=qualifiedPlayers().map(p=>`<span>${esc(p)}</span>`).join('')}
$('#qualificationCard').addEventListener('click',e=>{const mode=e.target.dataset.finals;if(!mode)return;const qualified=qualifiedPlayers();if(qualified.length<2){appAlert('Für eine Finalrunde müssen mindestens zwei Spieler weiterkommen.');return}state.groupStage={players:[...state.players],groups:state.groups,matches:state.matches};state.players=qualified;state.groups=[];state.settings.mode=mode;state.settings.name+=' – Finalrunde';state.matches=makeMatches();save();renderTournament()});

function defaultPointSystem(){return appSettings.club?.pointSystem||{5:25,4:20,3:15,2:10,1:7,0:5}}
function loadSeasons(){try{const data=storedDataValue(SEASON_KEY,T20DataSchema.toLogical(SEASON_KEY,{seasons:[]}));return Array.isArray(data.seasons)?data:T20DataSchema.toLogical(SEASON_KEY,{seasons:[]})}catch(error){rememberDataSchemaError(error);return T20DataSchema.toLogical(SEASON_KEY,{seasons:[]})}}
function persistSelectedSeason(){if(selectedSeasonId)nativeSetItem('tripleTwentySelectedSeason',selectedSeasonId);else nativeRemoveItem('tripleTwentySelectedSeason')}
function persistSeasons(){writeLogicalData(SEASON_KEY,seasonStore);persistSelectedSeason()}
function seasonItemTime(item={},fallback=0){const value=Date.parse(item.updatedAt||item.deletedAt||item.completedAt||item.createdAt||'');return Number.isFinite(value)?value:fallback}
function mergePlayerCompetitions(localStore={},remoteStore={}){
  const local=localStore.playerCompetitions||{},remote=remoteStore.playerCompetitions||{},localTimes=localStore.playerCompetitionUpdatedAt||{},remoteTimes=remoteStore.playerCompetitionUpdatedAt||{},playerCompetitions={},playerCompetitionUpdatedAt={};
  for(const id of new Set([...Object.keys(local),...Object.keys(remote)])){const localTime=Date.parse(localTimes[id]||'')||0,remoteTime=Date.parse(remoteTimes[id]||'')||0,useLocal=local[id]!==undefined&&(remote[id]===undefined||localTime>=remoteTime);playerCompetitions[id]=normalizedCompetition(useLocal?local[id]:remote[id]);const updatedAt=useLocal?localTimes[id]:remoteTimes[id];if(updatedAt)playerCompetitionUpdatedAt[id]=updatedAt}
  return{playerCompetitions,playerCompetitionUpdatedAt};
}
function mergeSeasonStores(localStore,remoteStore){
  const local=localStore&&Array.isArray(localStore.seasons)?localStore:{seasons:[]},remote=remoteStore&&Array.isArray(remoteStore.seasons)?remoteStore:{seasons:[]};
  const deletedSeasonIds={...(remote.deletedSeasonIds||{}),...(local.deletedSeasonIds||{})};
  for(const [id,at] of Object.entries(remote.deletedSeasonIds||{})){if(Date.parse(at)>Date.parse(deletedSeasonIds[id]||''))deletedSeasonIds[id]=at}
  const deletedTournamentIds={...(remote.deletedTournamentIds||{}),...(local.deletedTournamentIds||{})};
  for(const [id,at] of Object.entries(remote.deletedTournamentIds||{})){if(Date.parse(at)>Date.parse(deletedTournamentIds[id]||''))deletedTournamentIds[id]=at}
  const seasonIds=new Set([...local.seasons,...remote.seasons].map(season=>season?.id).filter(Boolean)),seasons=[];
  for(const id of seasonIds){
    if(deletedSeasonIds[id])continue;
    const left=local.seasons.find(season=>season.id===id),right=remote.seasons.find(season=>season.id===id);
    if(!left||!right){const only=structuredClone(left||right);only.tournaments=(only.tournaments||[]).filter(tournament=>!deletedTournamentIds[tournament.id]);seasons.push(only);continue}
    const leftTime=seasonItemTime(left),rightTime=seasonItemTime(right),newer=leftTime>=rightTime?left:right,older=newer===left?right:left;
    const tournamentIds=new Set([...(left.tournaments||[]),...(right.tournaments||[])].map(tournament=>tournament?.id).filter(Boolean)),tournaments=[];
    for(const tournamentId of tournamentIds){
      const deletedAt=Date.parse(deletedTournamentIds[tournamentId]||''),a=(left.tournaments||[]).find(tournament=>tournament.id===tournamentId),b=(right.tournaments||[]).find(tournament=>tournament.id===tournamentId),aTime=seasonItemTime(a,leftTime),bTime=seasonItemTime(b,rightTime);
      if(Number.isFinite(deletedAt)&&deletedAt>=Math.max(aTime,bTime))continue;
      tournaments.push(structuredClone(!a||!b?a||b:aTime>=bTime?a:b));
    }
    const completedScheduleIds=new Set(tournaments.filter(item=>!item.planned).map(item=>String(item.scheduledEventId||'')).filter(Boolean));
    seasons.push({...structuredClone(older),...structuredClone(newer),tournaments:tournaments.filter(item=>!item.planned||!completedScheduleIds.has(String(item.id))).sort((a,b)=>(a.date||'').localeCompare(b.date||''))});
  }
  return{...structuredClone(remote),...structuredClone(local),...mergePlayerCompetitions(local,remote),seasons,deletedSeasonIds,deletedTournamentIds};
}
function createSeason(data={}){
  if(!isClubMode())return null;
  const half=currentHalfYear(),season={id:data.id||`season-${Date.now()}`,name:data.name||half.name,competition:normalizedCompetition(data.competition),startDate:data.startDate||half.start,endDate:data.endDate||half.end,tournaments:data.tournaments||[],players:data.players||[],members:data.members||data.players||[],pointSystem:data.pointSystem||defaultPointSystem(),dropCount:+(data.dropCount??appSettings.club.dropResults??0),stats:data.stats||{},archived:!!data.archived,createdAt:data.createdAt||new Date().toISOString()};
  saveSeason(season);return season;
}
function saveSeason(season){if(!isClubMode()||!season)return season;season.updatedAt=new Date().toISOString();const i=seasonStore.seasons.findIndex(s=>s.id===season.id);if(i>=0)seasonStore.seasons[i]=season;else seasonStore.seasons.push(season);selectedSeasonId=season.id;persistSeasons();renderSeasonView();return season}
function sortedSeasons(){return [...(seasonStore.seasons||[])].sort((a,b)=>Number(!!a.archived)-Number(!!b.archived)||(b.startDate||'').localeCompare(a.startDate||'')||(b.createdAt||'').localeCompare(a.createdAt||''))}
function selectedSeason(){const seasons=sortedSeasons(),today=todayIso();return seasons.find(s=>s.id===selectedSeasonId)||seasons.find(s=>!s.archived&&(!s.startDate||s.startDate<=today)&&(!s.endDate||s.endDate>=today))||seasons.find(s=>!s.archived)||seasons[0]}
function seasonStandingsLocked(season=selectedSeason()){return !!season?.standingsLocked}
function canViewSeasonStandings(season=selectedSeason()){return !seasonStandingsLocked(season)||isFullAdmin()}
function seasonLockNoticeHtml(admin=false){return `<section class="season-standings-lock ${admin?'is-admin':''}"><span aria-hidden="true">${admin?'🔒':'🏆'}</span><div><b>${admin?'Endstand öffentlich gesperrt':'Endstand noch nicht veröffentlicht'}</b><p>${admin?'Die vollständige Rangliste ist derzeit ausschließlich für den Vereinsadministrator sichtbar.':SEASON_STANDINGS_LOCK_MESSAGE}</p></div></section>`}
async function setSeasonStandingsLocked(locked){
  if(!isFullAdmin())return;const season=selectedSeason();if(!season||seasonStandingsLocked(season)===!!locked)return;
  const question=locked?`Endstand von „${season.name}“ jetzt öffentlich sperren?\n\nMitglieder und Turnierleitungen sehen bis zur Veröffentlichung keine Rangliste, Saisonstatistik oder Spieltagsergebnisse.`:`Endstand von „${season.name}“ jetzt veröffentlichen?\n\nDie Rangliste und die Ergebnisse sind danach wieder für alle sichtbar.`;
  if(!await appConfirm(question))return;season.standingsLocked=!!locked;season.standingsLockedAt=locked?new Date().toISOString():null;saveSeason(season);renderPublicHome({refreshRegistrations:false});await T20Cloud.syncAll({keys:[SEASON_KEY]});if(T20Cloud.pendingKeys.has(SEASON_KEY))appAlert('Die Sperre wurde auf diesem Gerät gespeichert, aber noch nicht online bestätigt. Bitte die App geöffnet lassen und die Internetverbindung prüfen.');
}
function seasonForDate(date=todayIso(),competition='open'){if(!isClubMode())return null;const target=normalizedCompetition(competition),active=seasonStore.seasons.filter(season=>!season.archived&&season.startDate<=date&&season.endDate>=date);return target==='open'?active[0]||null:active.find(season=>seasonCompetition(season)===target)||active.find(season=>seasonCompetition(season)==='open')||null}
function seasonForScheduledEvent(eventId=''){return eventId?seasonStore.seasons.find(season=>(season.tournaments||[]).some(tournament=>tournament.planned&&String(tournament.id)===String(eventId))):null}
function assignedSeasonForTournament(tournament=state){return seasonStore.seasons.find(season=>String(season.id)===String(tournament.scheduledSeasonId||''))||seasonForScheduledEvent(tournament.scheduledEventId)}
async function deleteSeason(seasonId){
  if(!isClubMode()||!canManageClubData())return null;
  const i=seasonStore.seasons.findIndex(s=>s.id===seasonId);if(i<0)return null;
  const deleted=seasonStore.seasons.splice(i,1)[0];seasonStore.deletedSeasonIds=seasonStore.deletedSeasonIds||{};seasonStore.deletedSeasonIds[seasonId]=new Date().toISOString();const next=seasonStore.seasons.find(s=>!s.archived)||seasonStore.seasons[0];
  selectedSeasonId=next?.id||'';if(selectedSeasonId)window.T20BrowserStorage.setItem('tripleTwentySelectedSeason',selectedSeasonId);else window.T20BrowserStorage.removeItem('tripleTwentySelectedSeason');
  persistSeasons();renderSeasonView();renderPublicHome({refreshRegistrations:false});await T20Cloud.syncAll({keys:[SEASON_KEY]});if(T20Cloud.pendingKeys?.has(SEASON_KEY))appAlert(`„${deleted.name||'Die Wertung'}“ wurde auf diesem Gerät gelöscht, aber die Online-Löschung ist noch nicht bestätigt. Bitte die App geöffnet lassen und nicht abmelden.`);return deleted;
}
function updateSeasonFromForm(){
  if(!canManageClubData())return null;
  const season=seasonFormCreating?null:selectedSeason(),data={name:$('#seasonName').value.trim()||currentLeaguePeriod().name,competition:normalizedCompetition($('#seasonCompetition').value),startDate:$('#seasonStart').value,endDate:$('#seasonEnd').value,dropCount:+$('#seasonDrops').value};
  seasonFormOpen=false;seasonFormCreating=false;
  if(!season)return createSeason(data);
  season.name=data.name;season.competition=data.competition;season.startDate=data.startDate;season.endDate=data.endDate;season.dropCount=data.dropCount;season.stats=calculateSeasonStatisticsSummary(season);saveSeason(season);return season;
}
function tournamentWins(name,matches){return matches.filter(m=>{const side=matchPlayerSide(m,name);return m.sa!==null&&m.b!=='Freilos'&&side&&((side==='a'&&m.sa>m.sb)||(side==='b'&&m.sb>m.sa))}).length}
function tournamentLosses(name,matches){return matches.filter(m=>{const side=matchPlayerSide(m,name);return m.sa!==null&&m.b!=='Freilos'&&side&&((side==='a'&&m.sa<m.sb)||(side==='b'&&m.sb<m.sa))}).length}
function tournamentByeMatches(matches=[],plan=null){const stored=(matches||[]).filter(match=>match.sa!==null&&match.a&&match.a!=='Freilos'&&match.b==='Freilos'),automatic=plan&&globalThis.T20DoubleKO?T20DoubleKO.evaluate(plan,matches||[]).preview.filter(match=>match.automatic&&match.a&&match.a!=='Freilos'&&match.b==='Freilos'):[],unique=new Map();for(const match of [...stored,...automatic])unique.set(match.nodeId||`${match.round||1}:${match.a}`,match);return[...unique.values()]}
function tournamentByes(name,matches,plan=null){return tournamentByeMatches(matches,plan).filter(match=>match.a===name).length}
function pointsForWins(wins,pointSystem=defaultPointSystem()){return pointSystem[Math.min(5,wins)]??0}
function scoringWins(wins=0,byes=0){return Math.max(0,+wins||0)+Math.max(0,+byes||0)}
function pointsForTournamentResult(wins=0,byes=0,pointSystem=defaultPointSystem()){return pointsForWins(scoringWins(wins,byes),pointSystem)}
function storedResultByes(result={},tournament={}){return result.byes??tournamentByes(result.name,tournament.matches||[],tournament.settings?.doubleKoPlan||tournament.doubleKoPlan)}
function pointsForStoredTournamentResult(result={},tournament={},pointSystem=defaultPointSystem()){return pointsForTournamentResult(result.wins||0,storedResultByes(result,tournament),pointSystem)}
function doubleKoPlacementNames(plan,matches=[]){
  if(!plan||!globalThis.T20DoubleKO)return[];
  const evaluated=T20DoubleKO.evaluate(plan,matches),champion=evaluated.champion;if(!champion)return[];
  const completed=(matches||[]).filter(match=>match.sa!==null&&match.sb!==null),final=completed.filter(match=>match.bracket==='grand').sort((a,b)=>(a.stage||a.round||0)-(b.stage||b.round||0)).at(-1),runnerUp=final?(final.sa>final.sb?final.b:final.a):'',lowerFinal=completed.filter(match=>match.bracket==='lower').sort((a,b)=>(a.stage||a.round||0)-(b.stage||b.round||0)).at(-1),third=lowerFinal?(lowerFinal.sa>lowerFinal.sb?lowerFinal.b:lowerFinal.a):'';
  return[champion,runnerUp,third].filter((name,index,list)=>name&&list.indexOf(name)===index);
}
function tournamentRecordPlacements(record={}){
  const plan=record.settings?.doubleKoPlan||record.doubleKoPlan;if(!plan)return[];
  return doubleKoPlacementNames(plan,record.matches||[]);
}
function tournamentRecordChampion(record={}){if(tournamentCompletionStatus(record)==='cancelled')return'';return tournamentRecordPlacements(record)[0]||tournamentPlayerName(record,record.winner||[...(record.results||[])].sort((a,b)=>(a.rank||999)-(b.rank||999))[0]?.name||'')}
function aggregateAutodartsStats(name,matches=state.matches){
  const rows=[];for(const match of matches||[]){const side=match.a===name?'a':match.b===name?'b':'';if(side&&match.autodartsStats?.[side])rows.push(match.autodartsStats[side])}
  const valid=key=>rows.filter(row=>Number.isFinite(Number(row[key]))),mean=key=>{const values=valid(key);return values.length?Number((values.reduce((sum,row)=>sum+Number(row[key]),0)/values.length).toFixed(1)):null},averageRows=valid('average'),weightedDarts=averageRows.reduce((sum,row)=>sum+(Number(row.darts)||0),0),average=averageRows.length?(weightedDarts?averageRows.reduce((sum,row)=>sum+Number(row.average)*(Number(row.darts)||0),0)/weightedDarts:mean('average')):null;
  return{average:average===null?null:Number(average.toFixed(1)),first9:mean('first9'),checkoutRate:mean('checkoutRate'),until170:mean('until170'),highestFinish:Math.max(0,...valid('highestFinish').map(row=>Number(row.highestFinish))),darts:valid('darts').reduce((sum,row)=>sum+Number(row.darts),0),max180:valid('max180').reduce((sum,row)=>sum+Number(row.max180),0),matches:rows.length};
}
function tournamentRecordDate(source=state){
  const scheduledId=source?.scheduledEventId||'',scheduled=(seasonStore.seasons||[]).flatMap(season=>season.tournaments||[]).find(tournament=>String(tournament.id)===String(scheduledId))||loadTournamentHistory().find(tournament=>tournament.planned&&String(tournament.id)===String(scheduledId));
  if(scheduled?.date)return scheduled.date;
  const entered=$('#seasonTournamentDate')?.value;if(entered)return entered;
  if(source?.liveStartedAt){const started=new Date(source.liveStartedAt);if(!Number.isNaN(started.getTime()))return localDateKey(started)}
  return todayIso();
}
function orderedTournamentResults(players,matches,pointSystem=defaultPointSystem(),doubleKoPlan=null){
  const rows=standingsFor(players,matches),rowMap=new Map(rows.map(row=>[row.name,row]));
  return players.map(name=>{const wins=tournamentWins(name,matches),losses=tournamentLosses(name,matches),byes=tournamentByes(name,matches,doubleKoPlan),row=rowMap.get(name)||{};return{name,wins,losses,byes,scoringWins:scoringWins(wins,byes),points:pointsForTournamentResult(wins,byes,pointSystem),row}}).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.losses-b.losses||((b.row.lf||0)-(b.row.la||0))-((a.row.lf||0)-(a.row.la||0))||(b.row.lf||0)-(a.row.lf||0)||a.name.localeCompare(b.name,'de'));
}
function buildCurrentTournamentRecord(){
  const rows=standings(),pointSystem=assignedSeasonForTournament(state)?.pointSystem||defaultPointSystem(),date=tournamentRecordDate(state),stats={},completionStatus=tournamentCompletionStatus(state),cancelled=completionStatus==='cancelled',performanceOrder=orderedTournamentResults(state.players,state.matches,pointSystem,state.settings.doubleKoPlan),placements=!cancelled&&state.settings.doubleKoPlan?doubleKoPlacementNames(state.settings.doubleKoPlan,state.matches):[],orderedNames=cancelled?[]:[...placements,...performanceOrder.map(result=>result.name)].filter((name,index,list)=>list.indexOf(name)===index),ordered=orderedNames.map(name=>performanceOrder.find(result=>result.name===name)).filter(Boolean),rankByName=new Map(ordered.map((result,index)=>[result.name,index+1]));
  document.querySelectorAll('[data-stat-player]').forEach(row=>{const p=row.dataset.statPlayer;stats[p]={max180:+(row.querySelector('[data-stat-180]')?.value||0),checkout:+(row.querySelector('[data-stat-checkout]')?.value||0)}});
  const playerIds=Object.fromEntries(state.players.map(name=>[name,playerIdFor(state,name)])),playerProfileIds=Object.fromEntries(state.players.map(name=>[name,mappedPlayerValue(state.playerProfileIds,name)]).filter(([,id])=>id));
  const results=state.players.map(name=>{const wins=tournamentWins(name,state.matches),losses=tournamentLosses(name,state.matches),byes=tournamentByes(name,state.matches,state.settings.doubleKoPlan),row=rows.find(r=>r.name===name)||{},playerId=playerIds[name],profileId=playerProfileIds[name]||'',auto=aggregateAutodartsStats(name);return{name,playerId,profileId,wins,losses,byes,scoringWins:scoringWins(wins,byes),rank:cancelled?0:rankByName.get(name)||0,legsFor:row.lf||0,legsAgainst:row.la||0,points:cancelled?0:pointsForTournamentResult(wins,byes,pointSystem),max180:stats[name]?.max180??auto.max180,checkout:stats[name]?.checkout??auto.highestFinish,average:auto.average,first9:auto.first9,checkoutRate:auto.checkoutRate,until170:auto.until170,darts:auto.darts,statMatches:auto.matches}});
  const eventName=competitionEventName(),storedCompetition=state.scheduledCompetition||state.activeCompetition,storedLabel=storedCompetition==='women'?'Damen':storedCompetition==='open'?'Offen':'Herren',recordName=state.scheduledStandalone?eventName:competitionTitle(),winner=state.settings.mode==='doubleslottery'?lotteryLeaderNames().join(' & '):placements[0]||ordered[0]?.name||'';
  const finalWinner=cancelled?'':winner,top3=cancelled?[]:ordered.slice(0,3).map(r=>r.name),winnerId=playerIds[finalWinner]||'',top3Ids=top3.map(name=>playerIds[name]);
  return{id:`tournament-${Date.now()}`,scheduledEventId:state.scheduledEventId||'',scheduledSeasonId:state.scheduledSeasonId||assignedSeasonForTournament(state)?.id||'',standalone:cancelled||!!state.scheduledStandalone,name:recordName,eventName,competition:storedCompetition,competitionLabel:storedLabel,date,mode:state.settings.mode,completionStatus,endedEarly:!!state.endedEarly,cancelled,players:[...state.players],participantCount:state.players.length,winner:finalWinner,winnerId,top3,top3Ids,playerIds,playerProfileIds,settings:{...state.settings,name:recordName,eventName,competition:storedCompetition},matches:state.matches.map(m=>({...m})),results,createdAt:new Date().toISOString()};
}
function loadTournamentHistory(){try{const data=storedDataValue(TOURNAMENT_HISTORY_KEY,[]),deleted=seasonStore?.deletedTournamentIds||{};return Array.isArray(data)?data.filter(item=>!deleted[item?.id]):[]}catch(error){rememberDataSchemaError(error);return[]}}
function persistTournamentHistory(history,{native=false}={}){return writeLogicalData(TOURNAMENT_HISTORY_KEY,history,{native})}
function saveTournamentToHistory(){
  const completedReal=(state.matches||[]).filter(match=>match.sa!==null&&match.b!=='Freilos').length;
  if(!T20Cloud.user||state.savedToHistory||!state.matches?.length||(!state.endedEarly&&!state.matches.every(m=>m.sa!==null))||(state.endedEarly&&completedReal<1)||tournamentCompletionStatus(state)==='cancelled')return;
  const history=loadTournamentHistory(),record=buildCurrentTournamentRecord(),plannedIndex=record.scheduledEventId?history.findIndex(item=>item.planned&&String(item.id)===String(record.scheduledEventId)):-1;if(plannedIndex>=0)history.splice(plannedIndex,1,record);else history.push(record);persistTournamentHistory(history);state.savedToHistory=record.id;save();
}
function archiveCancelledEliminationTournament(){
  const record=buildCurrentTournamentRecord(),scheduledId=record.scheduledEventId||'',cancelledSeasonId=record.scheduledSeasonId||state.scheduledSeasonId||'';record.standalone=true;record.cancelledSeasonId=cancelledSeasonId;record.scheduledSeasonId='';record.seasonId='';
  const history=loadTournamentHistory(),plannedIndex=scheduledId?history.findIndex(item=>item.planned&&String(item.id)===String(scheduledId)):-1;if(plannedIndex>=0)history.splice(plannedIndex,1,record);else history.push(record);persistTournamentHistory(history);
  let seasonChanged=false;for(const season of seasonStore.seasons||[]){const before=(season.tournaments||[]).length;season.tournaments=(season.tournaments||[]).filter(item=>!(item.planned&&scheduledId&&String(item.id)===String(scheduledId)));if(season.tournaments.length!==before){season.updatedAt=new Date().toISOString();seasonChanged=true}}
  if(seasonChanged)persistSeasons();return record;
}
function markCurrentTournamentStandalone(){
  state.scheduledStandalone=true;state.scheduledSeasonId='';const history=loadTournamentHistory(),record=history.find(item=>String(item.id)===String(state.savedToHistory||''));if(record){record.standalone=true;record.scheduledSeasonId='';record.seasonId='';persistTournamentHistory(history)}save();
}
function exportCurrentTournamentJson(){const record=state.savedToHistory?loadTournamentHistory().find(t=>t.id===state.savedToHistory)||buildCurrentTournamentRecord():buildCurrentTournamentRecord();downloadFile(`${(record.name||'Turnier').replaceAll(' ','_')}.json`,'application/json',JSON.stringify(record,null,2))}
function currentTournamentRecordForImport(){const archived=state.savedToHistory?loadTournamentHistory().find(tournament=>String(tournament.id)===String(state.savedToHistory)):null;return archived?structuredClone(archived):buildCurrentTournamentRecord()}
function updateTournamentHistoryRecord(record){const history=loadTournamentHistory(),index=history.findIndex(item=>String(item.id)===String(record.id));if(index>=0)history[index]=structuredClone(record);else history.push(structuredClone(record));persistTournamentHistory(history)}
function seasonMembers(season=selectedSeason()){return [...new Set((season?.members!==undefined?season.members:season?.players)||[])].sort((a,b)=>a.localeCompare(b,'de'))}
function saveSeasonMembers(season,names){
  season.members=[...new Set(names.map(n=>n.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));season.memberProfileIds=season.memberProfileIds||{};season.memberPlayerIds=season.memberPlayerIds||{};
  season.members.forEach(name=>{const profileId=mappedPlayerValue(season.memberProfileIds,name),existing=mappedPlayerValue(season.memberPlayerIds,name);season.memberPlayerIds[name]=existing||profilePlayerId(profileId)||newGuestPlayerId()});
  season.players=[...new Set([...(season.tournaments||[]).flatMap(t=>t.players||[]),...season.members])].sort((a,b)=>a.localeCompare(b,'de'));saveSeason(season)
}
function renderMemberSuggestions(){
  const list=$('#memberSuggestions'),season=setupSeason();if(!list)return;const empty='<option value="">Mitglied auswählen …</option>';if(!T20Cloud.user){list.innerHTML=empty;return}
  const enteredIds=new Set(state.players.map(name=>playerIdFor(state,name))),enteredNames=new Set(state.players.map(normalizedPlayerName)),unique=new Map();
  for(const storedName of seasonMembers(season)){const profileId=season?.memberProfileIds?.[storedName]||'',playerId=mappedPlayerValue(season?.memberPlayerIds,storedName)||profilePlayerId(profileId),name=currentMemberNickname(profileId,storedName);if(name&&competitionCompatible(playerId,state.activeCompetition))unique.set(playerId||`name:${normalizedPlayerName(name)}`,{name,profileId,playerId})}
  const choices=[...unique.values()].filter(item=>!(item.playerId&&enteredIds.has(item.playerId))&&!enteredNames.has(normalizedPlayerName(item.name))).sort((a,b)=>a.name.localeCompare(b.name,'de'));
  list.innerHTML=empty+choices.map(item=>`<option value="${esc(item.name)}" data-profile-id="${esc(item.profileId)}" data-player-id="${esc(item.playerId)}">${esc(item.name)}</option>`).join('')
}
function addSeasonMember(name,season=selectedSeason()){if(!canManageClubData()||!season||!name.trim())return;const members=seasonMembers(season);if(members.some(p=>p.toLowerCase()===name.trim().toLowerCase())){appAlert('Dieses Mitglied ist bereits eingetragen.');return}saveSeasonMembers(season,[...members,name.trim()]);renderMemberSuggestions()}
async function removeSeasonMember(name,season=selectedSeason()){if(!canManageClubData()||!season)return;if(!await appConfirm(`${name} aus der Mitgliederliste entfernen? Bereits gespeicherte Spieltage bleiben erhalten.`))return;saveSeasonMembers(season,seasonMembers(season).filter(p=>p!==name));renderMemberSuggestions()}
function remapTournamentPlayerIdentity(tournament,storedName,playerId,profileId=''){
  if(!tournament)return;const sameName=name=>normalizedPlayerName(name)===normalizedPlayerName(storedName),oldIds=new Set(Object.entries(tournament.playerIds||{}).filter(([name])=>sameName(name)).map(([,id])=>id));tournament.playerIds=tournament.playerIds||{};tournament.playerProfileIds=tournament.playerProfileIds||{};
  for(const name of tournament.players||[])if(sameName(name)){tournament.playerIds[name]=playerId;if(profileId)tournament.playerProfileIds[name]=profileId}
  for(const result of tournament.results||[])if(sameName(result.name)||oldIds.has(result.playerId)){result.playerId=playerId;if(profileId)result.profileId=profileId}
  for(const match of tournament.matches||[]){if(oldIds.has(match.aId)||sameName(match.a))match.aId=playerId;if(oldIds.has(match.bId)||sameName(match.b))match.bId=playerId;for(const key of ['teamAIds','teamBIds'])if(Array.isArray(match[key]))match[key]=match[key].map(id=>oldIds.has(id)?playerId:id)}
  if(oldIds.has(tournament.winnerId)||sameName(tournament.winner))tournament.winnerId=playerId;if(Array.isArray(tournament.top3Ids))tournament.top3Ids=tournament.top3Ids.map((id,index)=>oldIds.has(id)||sameName(tournament.top3?.[index])?playerId:id)
}
async function linkSeasonMemberProfile(storedName,profileId,season=selectedSeason()){
  if(!canManageClubData())return;const profile=(T20Cloud.adminProfiles||[]).find(item=>item.id===profileId);if(!season||!profile)return;
  const nickname=profile.nickname?.trim()||profile.display_name?.trim()||'diesem Benutzer';
  if(!await appConfirm(`„${storedName}“ mit dem Benutzer „${nickname}“ verknüpfen? Die bisherigen Saisonergebnisse bleiben erhalten.`))return;
  const playerId=profilePlayerId(profileId);season.memberProfileIds=season.memberProfileIds||{};season.memberPlayerIds=season.memberPlayerIds||{};season.memberProfileIds[storedName]=profileId;season.memberPlayerIds[storedName]=playerId;
  for(const tournament of season.tournaments||[])remapTournamentPlayerIdentity(tournament,storedName,playerId,profileId);remapTournamentPlayerIdentity(state,storedName,playerId,profileId);save();saveSeason(season);appAlert(`„${storedName}“ ist jetzt mit „${nickname}“ verknüpft.`)
}
function addTournamentToSeason(seasonId,tournament){
  if(!isClubMode())return null;
  if(tournamentCompletionStatus(tournament)==='cancelled'){appAlert('Ein abgebrochenes K.-o.-Turnier hat keinen Sieger und darf keine Saisonpunkte erhalten.');return null}
  const assigned=assignedSeasonForTournament(tournament),season=assigned||seasonStore.seasons.find(s=>s.id===seasonId);if(!season)return null;
  const tournamentCompetition=normalizedCompetition(tournament.competition||tournament.settings?.competition),targetCompetition=seasonCompetition(season);
  if(tournamentCompetition!=='open'&&targetCompetition!=='open'&&tournamentCompetition!==targetCompetition){appAlert(`Dieses ${competitionLabel(tournamentCompetition)}-Turnier kann nicht in die ${competitionLabel(targetCompetition)}-Wertung „${season.name}“ übernommen werden.`);return null}
  tournament.scheduledSeasonId=season.id;tournament.competition=tournamentCompetition;tournament.competitionLabel=competitionLabel(tournamentCompetition);
  season.memberProfileIds={...(season.memberProfileIds||{}),...(tournament.playerProfileIds||{})};season.memberPlayerIds={...(season.memberPlayerIds||{}),...(tournament.playerIds||{})};
  season.tournaments=season.tournaments||[];season.members=[...new Set([...(season.members||season.players||[]),...(tournament.players||[])])].sort((a,b)=>a.localeCompare(b,'de'));season.players=[...new Set([...(season.players||[]),...(season.members||[]),...(tournament.players||[])])].sort((a,b)=>a.localeCompare(b,'de'));
  const plannedIndex=tournament.scheduledEventId?season.tournaments.findIndex(item=>item.planned&&item.id===tournament.scheduledEventId):-1;if(plannedIndex>=0){const planned=season.tournaments[plannedIndex];tournament.date=tournament.date||planned.date;tournament.startTime=tournament.startTime||planned.startTime;season.tournaments.splice(plannedIndex,1,tournament)}else season.tournaments.push(tournament);season.tournaments.sort((a,b)=>a.date.localeCompare(b.date));season.stats=calculateSeasonStatisticsSummary(season);saveSeason(season);return season;
}
function deleteTournamentFromSeason(seasonId,tournamentId){
  if(!isClubMode()||!canManageClubData())return null;
  const season=seasonStore.seasons.find(s=>s.id===seasonId);if(!season)return null;
  season.tournaments=(season.tournaments||[]).filter(t=>t.id!==tournamentId);
  season.players=[...new Set([...(season.members||[]),...(season.tournaments||[]).flatMap(t=>t.players||[])])].sort((a,b)=>a.localeCompare(b,'de'));
  season.stats=calculateSeasonStatisticsSummary(season);saveSeason(season);return season;
}
function manualTournamentPlayers(season=selectedSeason()){
  const rows=calculateSeasonStandings(season),wins=Object.fromEntries(rows.map(r=>[r.name,r.wins||0]));
  return seasonMembers(season).sort((a,b)=>(wins[b]||0)-(wins[a]||0)||a.localeCompare(b,'de'));
}
function manualMatchRow(players,round=1){
  const options=players.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
  return `<div class="manual-match-row" data-manual-match><label>Runde<input type="number" min="1" max="30" value="${round}" data-manual-round></label><label>Spieler 1<select data-manual-a><option value="">Auswählen …</option>${options}</select></label><label>Ergebnis<input type="number" min="0" max="30" data-manual-sa placeholder="0"></label><span class="manual-match-separator">:</span><label>Ergebnis<input type="number" min="0" max="30" data-manual-sb placeholder="0"></label><label>Spieler 2<select data-manual-b><option value="">Auswählen …</option>${options}</select></label><button class="danger manual-match-remove" type="button" data-remove-manual-match aria-label="Paarung entfernen">×</button></div>`;
}
function renderManualTournamentForm(season=selectedSeason()){
  const button=`<div class="manual-toggle-row"><button type="button" class="secondary" id="toggleManualTournament">${manualTournamentOpen?'Nachtrag ausblenden':'+ Spieltag manuell nachtragen'}</button></div>`;
  if(!manualTournamentOpen)return button;
  const players=manualTournamentPlayers(season);
  if(!players.length)return button+`<div class="card slim-card manual-tournament-card"><h3>Spieltag manuell nachtragen</h3><p class="empty-line">Lege zuerst unter „Mitglieder“ die Spieler an. Danach kannst du hier den gespielten Schweizer Spieltag eintragen.</p></div>`;
  return button+`<form id="manualTournamentForm" class="card slim-card manual-tournament-card"><h3>Spieltag manuell nachtragen</h3><p>Teilnehmer markieren und Siege sowie Niederlagen eintragen. Darunter können die einzelnen Paarungen und Ergebnisse erfasst werden.</p><div class="grid"><label>Datum<input id="manualTournamentDate" type="date" value="${todayIso()}" required></label><label>Turniername<input id="manualTournamentName" value="Dienstagsturnier" maxlength="50"></label></div><div class="table-wrap manual-entry-table"><table><thead><tr><th>Dabei</th><th>Spieler</th><th>Siege</th><th>Niederlagen</th></tr></thead><tbody>${players.map(p=>`<tr data-manual-player="${esc(p)}"><td><input type="checkbox" data-manual-present checked></td><td><b>${esc(p)}</b></td><td><input type="number" min="0" max="20" value="0" data-manual-wins></td><td><input type="number" min="0" max="20" value="0" data-manual-losses></td></tr>`).join('')}</tbody></table></div><section class="manual-matches"><div class="manual-matches-head"><div><h4>Paarungen</h4><p>Runde, Spieler und Ergebnis jeder Begegnung eintragen.</p></div><button class="secondary" type="button" id="addManualMatch">+ Paarung</button></div><div id="manualMatchRows">${manualMatchRow(players)}</div></section><button class="primary" type="submit">SPIELTAG IN SAISON SPEICHERN <span>→</span></button></form>`;
}
function buildManualTournamentRecord(){
  const season=selectedSeason(),pointSystem=season?.pointSystem||defaultPointSystem(),date=$('#manualTournamentDate')?.value||todayIso(),name=$('#manualTournamentName')?.value.trim()||'Dienstagsturnier';
  const results=[...document.querySelectorAll('[data-manual-player]')].filter(row=>row.querySelector('[data-manual-present]')?.checked).map(row=>{
    const player=row.dataset.manualPlayer,wins=+(row.querySelector('[data-manual-wins]')?.value||0),losses=+(row.querySelector('[data-manual-losses]')?.value||0),max180=+(row.querySelector('[data-manual-180]')?.value||0),checkout=+(row.querySelector('[data-manual-checkout]')?.value||0);
    const profileId=mappedPlayerValue(season?.memberProfileIds,player),playerId=mappedPlayerValue(season?.memberPlayerIds,player)||profilePlayerId(profileId)||newGuestPlayerId();return{name:player,playerId,profileId,wins,losses,byes:0,scoringWins:wins,max180,checkout,points:pointsForTournamentResult(wins,0,pointSystem),rank:0,legsFor:0,legsAgainst:0};
  }).sort((a,b)=>b.wins-a.wins||a.losses-b.losses||b.max180-a.max180||b.checkout-a.checkout||a.name.localeCompare(b.name,'de'));
  results.forEach((r,i)=>r.rank=i+1);
  const playerIds=Object.fromEntries(results.map(r=>[r.name,r.playerId])),playerProfileIds=Object.fromEntries(results.filter(r=>r.profileId).map(r=>[r.name,r.profileId]));
  const matches=[...document.querySelectorAll('[data-manual-match]')].map(row=>({round:+(row.querySelector('[data-manual-round]')?.value||1),a:row.querySelector('[data-manual-a]')?.value||'',b:row.querySelector('[data-manual-b]')?.value||'',sa:row.querySelector('[data-manual-sa]')?.value,sb:row.querySelector('[data-manual-sb]')?.value})).filter(m=>m.a||m.b||m.sa!==''||m.sb!=='').map(m=>({...m,sa:m.sa===''?null:+m.sa,sb:m.sb===''?null:+m.sb}));
  const record={id:`manual-tournament-${Date.now()}`,name,date,mode:'swiss',manual:true,players:results.map(r=>r.name),playerIds,playerProfileIds,participantCount:results.length,winner:results[0]?.name||'',winnerId:results[0]?.playerId||'',top3:results.slice(0,3).map(r=>r.name),top3Ids:results.slice(0,3).map(r=>r.playerId),settings:{mode:'swiss',name,manual:true},matches,results,createdAt:new Date().toISOString()};return T20DataSchema.ensureTournamentIdentities(record,season?.memberPlayerIds||{});
}
function addManualTournamentFromForm(){
  if(!canManageClubData())return;
  const season=selectedSeason();if(!season)return;
  const tournament=buildManualTournamentRecord();
  if(tournament.participantCount<2){appAlert('Bitte mindestens zwei Teilnehmer markieren.');return}
  const participants=new Set(tournament.players),invalid=tournament.matches.find(m=>!m.a||!m.b||m.sa===null||m.sb===null||m.a===m.b||!participants.has(m.a)||!participants.has(m.b)||m.sa===m.sb);
  if(invalid){appAlert('Bitte alle begonnenen Paarungen vollständig ausfüllen. Die Spieler müssen verschieden und als Teilnehmer markiert sein; ein Ergebnis darf nicht unentschieden sein.');return}
  addTournamentToSeason(season.id,tournament);manualTournamentOpen=false;
  appAlert('Spieltag wurde manuell in die Saisonwertung übernommen.');
}
function calculateDropResults(entries,dropCount=0){
  const marked=entries.map((e,i)=>({...e,index:i,dropped:false}));
  [...marked].sort((a,b)=>a.points-b.points||Number(a.present)-Number(b.present)||a.date.localeCompare(b.date)).slice(0,Math.min(dropCount,marked.length)).forEach(e=>{marked[e.index].dropped=true});
  return marked;
}
function calculateSeasonStandings(season=selectedSeason(),rankingMode='clean'){
  if(!isClubMode()||!season)return[];
  const tournaments=(season.tournaments||[]).filter(tournament=>!tournament.planned&&(!tournament.date||tournament.date<=todayIso())),players=new Map();
  const resolveProfileId=(container,name,explicit='')=>explicit||mappedPlayerValue(container?.playerProfileIds,name)||mappedPlayerValue(season.memberProfileIds,name),resolvePlayerId=(container,name,explicit='',profileId='')=>explicit||mappedPlayerValue(container?.playerIds,name)||mappedPlayerValue(season.memberPlayerIds,name)||profilePlayerId(profileId)||T20DataSchema.legacyPlayerId(name);
  const addPlayer=(name,playerId='',profileId='')=>{profileId=resolveProfileId(null,name,profileId);playerId=resolvePlayerId(null,name,playerId,profileId);if(!playerId)return;const display=profileId?currentMemberNickname(profileId,name):name,existing=players.get(playerId);if(existing){if(profileId&&!existing.profileId)existing.profileId=profileId;if(profileId)existing.name=display;return}players.set(playerId,{playerId,name:display,profileId})};
  for(const name of season.members||[])addPlayer(name,mappedPlayerValue(season.memberPlayerIds,name),mappedPlayerValue(season.memberProfileIds,name));
  for(const name of season.players||[])addPlayer(name,mappedPlayerValue(season.memberPlayerIds,name),mappedPlayerValue(season.memberProfileIds,name));
  for(const tournament of tournaments){
    for(const name of tournament.players||[]){const profileId=resolveProfileId(tournament,name);addPlayer(name,resolvePlayerId(tournament,name,'',profileId),profileId)}
    for(const result of tournament.results||[]){const profileId=resolveProfileId(tournament,result.name,result.profileId);addPlayer(result.name,resolvePlayerId(tournament,result.name,result.playerId,profileId),profileId)}
  }
  const rows=[...players.values()].map(player=>{
    const entries=tournaments.map(t=>{const r=(t.results||[]).find(x=>{const profileId=resolveProfileId(t,x.name,x.profileId),id=resolvePlayerId(t,x.name,x.playerId,profileId);return id===player.playerId}),byes=r?storedResultByes(r,t):0,points=r?pointsForStoredTournamentResult(r,t,season.pointSystem||defaultPointSystem()):0;return r?{tournamentId:t.id,date:t.date,name:t.name,present:true,points,wins:r.wins||0,losses:r.losses||0,byes,scoringWins:scoringWins(r.wins||0,byes),max180:r.max180||0,checkout:r.checkout||0,average:r.average??null,first9:r.first9??null,checkoutRate:r.checkoutRate??null,darts:r.darts||0,statMatches:r.statMatches||0,rank:r.rank||0}:{tournamentId:t.id,date:t.date,name:t.name,present:false,points:0,wins:0,losses:0,byes:0,scoringWins:0,max180:0,checkout:0,average:null,first9:null,checkoutRate:null,darts:0,statMatches:0,rank:0}});
    const configuredDrops=season.dropCount||0,effectiveDrops=tournaments.length>configuredDrops?configuredDrops:0,dropped=calculateDropResults(entries,effectiveDrops),used=dropped.filter(e=>!e.dropped),played=entries.filter(e=>e.present),cleanPlayed=used.filter(e=>e.present).length,cleanWins=used.reduce((sum,e)=>sum+e.wins,0),cleanLosses=used.reduce((sum,e)=>sum+e.losses,0),wins=entries.reduce((sum,e)=>sum+e.wins,0),losses=entries.reduce((sum,e)=>sum+e.losses,0),byes=entries.reduce((sum,e)=>sum+(e.byes||0),0),max180=entries.reduce((sum,e)=>sum+e.max180,0),checkout=Math.max(0,...entries.map(e=>e.checkout||0)),statEntries=entries.filter(e=>e.average!==null),statDarts=statEntries.reduce((sum,e)=>sum+(e.darts||0),0),average=statEntries.length?Number((statDarts?statEntries.reduce((sum,e)=>sum+e.average*(e.darts||0),0)/statDarts:statEntries.reduce((sum,e)=>sum+e.average,0)/statEntries.length).toFixed(1)):null,first9Entries=entries.filter(e=>e.first9!==null),first9=first9Entries.length?Number((first9Entries.reduce((sum,e)=>sum+e.first9,0)/first9Entries.length).toFixed(1)):null;
    return{name:player.name,playerId:player.playerId,profileId:player.profileId,totalPoints:entries.reduce((sum,e)=>sum+e.points,0),cleanPoints:used.reduce((sum,e)=>sum+e.points,0),cleanWins,cleanLosses,cleanPlayed,played:played.length,wins,losses,byes,max180,checkout,average,first9,darts:statDarts,statMatches:entries.reduce((sum,e)=>sum+(e.statMatches||0),0),dropResults:dropped.filter(e=>e.dropped),entries:dropped,participation:tournaments.length?played.length/tournaments.length:0,winRate:wins+losses?wins/(wins+losses):0};
  });
  return rows.sort((a,b)=>rankingMode==='total'
    ?b.totalPoints-a.totalPoints||b.wins-a.wins||a.losses-b.losses||b.played-a.played||a.name.localeCompare(b.name,'de')
    :b.cleanPoints-a.cleanPoints||b.cleanWins-a.cleanWins||a.cleanLosses-b.cleanLosses||b.cleanPlayed-a.cleanPlayed||a.name.localeCompare(b.name,'de'));
}
function visibleSeasonStandings(season=selectedSeason(),rankingMode='clean'){
  const rows=calculateSeasonStandings(season,rankingMode).filter(row=>row.played>0);
  if(!season)return rows;
  const competition=seasonCompetition(season);if(competition==='open')return rows;
  return rows.filter(row=>competitionCompatible(row.playerId,competition));
}
function seasonStats(season=selectedSeason()){const rows=visibleSeasonStandings(season);return{max180:[...rows].sort((a,b)=>b.max180-a.max180)[0],checkout:[...rows].sort((a,b)=>b.checkout-a.checkout)[0],played:[...rows].sort((a,b)=>b.played-a.played)[0],participation:[...rows].sort((a,b)=>b.participation-a.participation||b.played-a.played)[0],wins:[...rows].sort((a,b)=>b.wins-a.wins)[0],winRate:[...rows].filter(r=>r.wins+r.losses>0).sort((a,b)=>b.winRate-a.winRate||b.wins-a.wins)[0]}}
function calculateSeasonStatisticsSummary(season=selectedSeason()){const s=seasonStats(season),pick=(row,key)=>row?{player:row.name,value:row[key]||0}:null;return{updatedAt:new Date().toISOString(),max180:pick(s.max180,'max180'),checkout:pick(s.checkout,'checkout'),played:pick(s.played,'played'),participation:s.participation?{player:s.participation.name,value:s.participation.participation}:null,wins:pick(s.wins,'wins'),winRate:s.winRate?{player:s.winRate.name,value:s.winRate.winRate}:null}}
function renderSeasonImport(winner){
  const card=$('#seasonImportCard');if(!card)return;const complete=!!winner&&state.matches.length&&(state.endedEarly||state.matches.every(m=>m.sa!==null));
  card.classList.toggle('hidden',!complete);if(!complete)return;
  if(!T20Cloud.user){card.innerHTML='<h3>Turnier abgeschlossen</h3><p>Das Ergebnis wird ohne Anmeldung nicht gespeichert.</p>';return}
  if(!isAdmin()){card.innerHTML='<h3>Turnier abgeschlossen</h3><p>Dieses Turnier wurde lokal/offline gespielt und nicht in eine Saison übernommen.</p><button id="exportCurrentTournamentBtn" class="primary">TURNIER EXPORTIEREN <span>→</span></button>';return}
  if(!isClubMode()){card.innerHTML='<h3>Turnier abgeschlossen</h3><p>Dieses Turnier wurde lokal gespeichert. Du kannst es als JSON exportieren.</p><button id="exportCurrentTournamentBtn" class="primary">TURNIER EXPORTIEREN <span>→</span></button>';return}
  const seasons=seasonStore.seasons.filter(s=>!s.archived);
  if(state.seasonImportedTo){const s=seasonStore.seasons.find(x=>x.id===state.seasonImportedTo);card.innerHTML=`<h3>Saisonwertung</h3><p>Dieses Turnier wurde bereits in ${esc(s?.name||'eine Saison')} übernommen.</p>`;return}
  if(!state.started){card.innerHTML='<h3>Turnier abgeschlossen</h3><p>Das Ergebnis ist unter „Ergebnisse → Einzelturniere“ gespeichert.</p>';return}
  const recordDate=tournamentRecordDate(state),assigned=assignedSeasonForTournament(state),competition=normalizedCompetition(state.scheduledCompetition||state.settings?.competition||state.activeCompetition),current=assigned||seasonForDate(recordDate,competition)||seasons[0];
  if(state.scheduledStandalone||!assigned){card.innerHTML=`<h3>Turnier speichern</h3><p>Dieses Turnier kann ohne Saisonpunkte im Ergebnisarchiv gespeichert werden.</p><button id="finishStandaloneTournamentBtn" class="primary">OHNE WERTUNG SPEICHERN &amp; ABSCHLIESSEN <span>→</span></button>${seasons.length?`<details class="optional-season-import"><summary>Optional einer Saisonwertung zuordnen</summary><div class="grid"><label>Wertung<select id="seasonImportSelect">${seasons.map(s=>`<option value="${esc(s.id)}" ${s.id===current?.id?'selected':''}>${esc(seasonOptionLabel(s))}</option>`).join('')}</select></label><label>Turnierdatum<input id="seasonTournamentDate" type="date" value="${recordDate}"></label></div><button id="addToSeasonBtn" class="secondary">ZUSÄTZLICH IN WERTUNG ÜBERNEHMEN</button></details>`:''}`;return}
  card.innerHTML=`<h3>Turnier abschließen</h3><div class="grid"><label>Wertung (vor dem Start festgelegt)<select id="seasonImportSelect" disabled>${seasons.map(s=>`<option value="${esc(s.id)}" ${s.id===current.id?'selected':''}>${esc(seasonOptionLabel(s))}</option>`).join('')}</select><small>Die Zuordnung kann nach dem Turnierstart nicht mehr geändert werden.</small></label><label>Turnierdatum<input id="seasonTournamentDate" type="date" value="${recordDate}"></label></div><button id="addToSeasonBtn" class="primary">ABSCHLIESSEN &amp; IN „${esc(current.name)}“ SPEICHERN <span>→</span></button>`;
}
function renderResultsViewMode(){
  document.querySelectorAll('[data-results-view]').forEach(button=>button.classList.toggle('active',button.dataset.resultsView===resultsViewMode));$('#seasonLeagueResults')?.classList.toggle('hidden',resultsViewMode!=='leagues');$('#seasonStandaloneResults')?.classList.toggle('hidden',resultsViewMode!=='standalone');
}
function renderSeasonView(){
  if(!isClubMode()){$('#seasonSection')?.classList.add('hidden');return}
  const season=selectedSeason(),seasons=sortedSeasons();$('#seasonSelect').innerHTML=seasons.length?seasons.map(s=>`<option value="${esc(s.id)}" ${s.id===season?.id?'selected':''}>${esc(seasonOptionLabel(s))}</option>`).join(''):'<option value="">Keine Wertung vorhanden</option>';
  if($('#seasonActionSelect'))$('#seasonActionSelect').value='';
  renderSeasonHeader(season);
  renderSeasonForm(season);
  renderStandaloneTournaments();
  renderResultsViewMode();
  if(!season){$('#seasonOverview').innerHTML='<div class="empty-card">Noch keine Liga-Wertung vorhanden. Eigenständige Turniere findest du oben unter „Einzelturniere“.</div>';document.querySelector('.export-actions')?.classList.add('hidden');['seasonStandings','seasonTournaments','seasonStats','seasonHonors','seasonPlayerDetail'].forEach(id=>$('#'+id).innerHTML='');renderMemberSuggestions();return}
  const rows=visibleSeasonStandings(season),current=seasonForDate(todayIso());
  const lockControl=isFullAdmin()?`<section class="season-lock-control ${seasonStandingsLocked(season)?'is-locked':'is-open'}"><div><span class="eyebrow">VERÖFFENTLICHUNG</span><b>${seasonStandingsLocked(season)?'Endstand öffentlich gesperrt':'Endstand öffentlich sichtbar'}</b><small>${seasonStandingsLocked(season)?'Nur der Vereinsadministrator sieht derzeit die vollständige Auswertung.':'Mitglieder und Turnierleitungen können die Rangliste sehen.'}</small></div><button class="${seasonStandingsLocked(season)?'primary':'danger'}" type="button" data-season-standings-lock="${seasonStandingsLocked(season)?'0':'1'}">${seasonStandingsLocked(season)?'ENDSTAND VERÖFFENTLICHEN':'ENDSTAND SPERREN'}</button></section>`:'';
  $('#seasonOverview').innerHTML=`<div class="season-cards"><article><span>Aktive Liga-Wertung</span><b>${esc(current?.name||'Keine aktive Wertung')}</b></article><article><span>Ausgewählte Wertung</span><b>${esc(season.name)}${season.archived?' · Archiv':''}</b><small>${competitionLabel(seasonCompetition(season))} · ${season.startDate} bis ${season.endDate}</small></article><article><span>Spieltage</span><b>${season.tournaments?.length||0}</b></article><article><span>Streicher</span><b>${season.dropCount||0}</b></article></div>${lockControl}`;
  document.querySelector('.export-actions')?.classList.toggle('hidden',seasonStandingsLocked(season)&&!isFullAdmin());
  renderSeasonStandings(season,rows);renderSeasonTournaments(season);renderSeasonStats(season,rows);renderSeasonHonors(season,rows);renderMemberSuggestions();
}
function renderSeasonHeader(season=selectedSeason()){
  const summary=$('#seasonCurrentSummary'),toggle=$('#toggleSeasonFormBtn');if(!summary)return;
  if(!season){summary.innerHTML='<span>Saisonwertungen</span><b>Noch keine Wertung</b><small>Eigenständige Turniere können trotzdem gespeichert werden.</small>';if(toggle)toggle.textContent=seasonFormOpen?'Formular ausblenden':'Neue Wertung';return}
  summary.innerHTML=`<span>Geladene Wertung</span><b>${esc(season.name)}${season.archived?' · Archiv':''}</b><small>${competitionLabel(seasonCompetition(season))} · ${esc(season.startDate)} bis ${esc(season.endDate)} · ${season.tournaments?.length||0} Spieltage · ${season.dropCount||0} Streicher</small>`;
  if(toggle)toggle.textContent=seasonFormOpen?'Bearbeitung ausblenden':'Wertung bearbeiten';
}
function renderSeasonForm(season=selectedSeason()){
  const h=currentLeaguePeriod(),editing=season&&!seasonFormCreating,s=editing?season:{name:h.name,competition:'men',startDate:h.start,endDate:h.end,dropCount:0};
  $('#seasonForm').classList.toggle('hidden',!seasonFormOpen);
  $('#seasonFormTitle').textContent=editing?'Geladene Wertung bearbeiten':'Neue Wertung erstellen';
  $('#seasonFormSubmit').innerHTML=editing?'WERTUNGSÄNDERUNGEN SPEICHERN <span>→</span>':'WERTUNG SPEICHERN <span>→</span>';
  $('#seasonName').value=s.name||h.name;$('#seasonCompetition').value=seasonCompetition(s);$('#seasonStart').value=s.startDate||h.start;$('#seasonEnd').value=s.endDate||h.end;$('#seasonDrops').value=String(s.dropCount??0);
}
function renderSeasonStandings(season=selectedSeason(),rows=visibleSeasonStandings(season)){
  if(!canViewSeasonStandings(season)){$('#seasonStandings').innerHTML=seasonLockNoticeHtml(false);$('#seasonPlayerDetail').innerHTML='';return}
  rows=visibleSeasonStandings(season,seasonRankingMode);
  const ownId=T20Cloud.user?.id||'',ownNickname=T20Cloud.profile?.nickname||'';
  const modeSwitch=`<div class="season-ranking-switch" role="group" aria-label="Ansicht der Saisonrangliste"><button type="button" data-season-ranking-mode="clean" class="${seasonRankingMode==='clean'?'active':''}">Wertung nach Streicher</button><button type="button" data-season-ranking-mode="total" class="${seasonRankingMode==='total'?'active':''}">Alle Ergebnisse</button></div><p class="season-ranking-note">${seasonRankingMode==='clean'?`Offizielle Wertung: ${season.dropCount||0} Streicher werden berücksichtigt.`:'Vergleichsansicht: alle Ergebnisse werden gezählt, ohne Streicher.'}</p>`;
  const mobile=`<div class="season-mobile-ranking">${rows.map((r,i)=>{const reference=playerProfileReference(r),own=!!(ownId&&r.profileId===ownId)||(!isAdmin()&&ownNickname&&normalizedPlayerName(r.name)===normalizedPlayerName(ownNickname)),podium=i<3?` podium-${i+1}`:'';return `<article class="season-mobile-player${podium}${own?' is-own-player':''}"><button class="season-mobile-summary" type="button" data-season-mobile-toggle="${esc(reference)}" aria-expanded="false"><span class="season-mobile-rank">${i+1}</span><span class="season-mobile-name"><b>${esc(r.name)}</b>${own?'<small>Dein Profil</small>':''}</span><span class="season-mobile-points"><b>${seasonRankingMode==='clean'?r.cleanPoints:r.totalPoints}</b><small>Punkte</small></span><span class="season-mobile-chevron">⌄</span></button><div class="season-mobile-details hidden" data-season-mobile-details="${esc(reference)}"><div><span>Gesamtpunkte</span><b>${r.totalPoints}</b></div><div><span>Nach Streicher</span><b>${r.cleanPoints}</b></div><div><span>Turniere</span><b>${r.played}</b></div><div><span>Siege</span><b>${r.wins}</b></div><div><span>Niederlagen</span><b>${r.losses}</b></div><div><span>Freilose</span><b>${r.byes||0}</b></div><div class="season-mobile-drops"><span>Streicher</span><b>${r.dropResults.map(entry=>`<i>${entry.present?entry.points:0}</i>`).join('')||'–'}</b></div><button class="link-btn season-mobile-profile" type="button" data-season-player="${esc(reference)}">Spielerdetails öffnen</button></div></article>`}).join('')||'<div class="empty-card">Noch keine Rangliste vorhanden.</div>'}</div>`;
  const desktop=`<div class="table-wrap season-desktop-ranking"><table><thead><tr><th>#</th><th>Spieler</th><th>Gesamt</th><th>Nach Streicher</th><th>Turniere</th><th>Siege</th><th>Freilose</th><th>Niederl.</th><th>Streicher</th></tr></thead><tbody>${rows.map((r,i)=>{const reference=playerProfileReference(r);return`<tr data-season-player="${esc(reference)}"><td>${i+1}</td><td><button class="link-btn" data-season-player="${esc(reference)}">${esc(r.name)}</button></td><td>${seasonRankingMode==='total'?`<b>${r.totalPoints}</b>`:r.totalPoints}</td><td>${seasonRankingMode==='clean'?`<b>${r.cleanPoints}</b>`:r.cleanPoints}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.byes||0}</td><td>${r.losses}</td><td>${r.dropResults.map(e=>`<span class="drop-pill">${e.present?e.points:0}</span>`).join(' ')||'–'}</td></tr>`}).join('')}</tbody></table></div>`;
  $('#seasonStandings').innerHTML=(seasonStandingsLocked(season)?seasonLockNoticeHtml(true):'')+modeSwitch+mobile+desktop;
}
function renderSeasonMembers(season=selectedSeason(),rows=calculateSeasonStandings(season),targetSelector='#seasonMembers'){
  const revealResults=canViewSeasonStandings(season),wins=Object.fromEntries(rows.map(r=>[r.playerId,r.wins||0])),memberMap=new Map();seasonMembers(season).forEach(storedName=>{const profileId=mappedPlayerValue(season.memberProfileIds,storedName),playerId=mappedPlayerValue(season.memberPlayerIds,storedName)||profilePlayerId(profileId)||T20DataSchema.legacyPlayerId(storedName),name=currentMemberNickname(profileId,storedName),existing=memberMap.get(playerId);if(!existing||normalizedPlayerName(storedName)===normalizedPlayerName(name))memberMap.set(playerId,{storedName,name,profileId,playerId})});const members=[...memberMap.values()].sort((a,b)=>revealResults?(wins[b.playerId]||0)-(wins[a.playerId]||0)||a.name.localeCompare(b.name,'de'):a.name.localeCompare(b.name,'de'));
  const editable=canManageClubData(),profiles=editable?(T20Cloud.adminProfiles||[]).filter(profile=>profile.nickname?.trim()):[];
  const form=editable?`<form id="memberForm" class="player-form"><input id="memberName" placeholder="Mitgliedsname" maxlength="30" autocomplete="off"><button type="submit">+ Mitglied</button></form>`:'';
  const target=$(targetSelector);if(!target)return;target.innerHTML=`<div class="card slim-card"><h3>Mitglieder-Zuordnung</h3><p>Diese Liste bestimmt, welche gespeicherten Mitglieder bei einem Turnier dieser Wertung angeboten und welchem Benutzerkonto sie zugeordnet werden.</p>${form}<div class="member-list">${members.map((p,i)=>{const linkedId=mappedPlayerValue(season?.memberProfileIds,p.storedName),linked=profiles.find(profile=>profile.id===linkedId),mapping=editable?(linked?`<small class="member-linked">✓ Verknüpft mit ${esc(linked.nickname)}</small>`:profiles.length?`<div class="member-link-control"><select aria-label="Benutzer für ${esc(p.storedName)} auswählen"><option value="">Benutzer zuordnen …</option>${profiles.map(profile=>`<option value="${esc(profile.id)}">${esc(profile.nickname)}${profile.display_name?` · ${esc(profile.display_name)}`:''}</option>`).join('')}</select><button class="secondary" type="button" data-link-member="${esc(p.storedName)}">Zuordnen</button></div>`:'<small>Registrierte Benutzer im Konto aktualisieren</small>'):'',competition=playerCompetition(p.playerId),competitionControl=editable?`<label class="member-role-control">Bewerbszuordnung<select data-member-competition="${esc(p.playerId)}"><option value="open" ${competition==='open'?'selected':''}>Offen / noch nicht festgelegt</option><option value="men" ${competition==='men'?'selected':''}>Herren</option><option value="women" ${competition==='women'?'selected':''}>Damen</option></select></label>`:'';return `<div class="member-row"><b><span>${i+1}</span>${esc(p.name)}</b><small>${wins[p.playerId]||0} Saison-Siege</small>${mapping}${competitionControl}${editable?`<button class="danger" data-remove-member="${esc(p.storedName)}">Entfernen</button>`:''}</div>`}).join('')||'<p class="empty-line">Noch keine Mitglieder eingetragen.</p>'}</div></div>`;
  if(!revealResults)target.querySelectorAll('.member-row>b+small').forEach(label=>{label.textContent='Saisonmitglied'});
}
function tournamentPlayerName(tournament,name){
  const id=mappedPlayerValue(tournament.playerProfileIds,name)||(tournament.results||[]).find(result=>normalizedPlayerName(result.name)===normalizedPlayerName(name))?.profileId||'';
  return currentMemberNickname(id,name);
}
function tournamentMatchesHtml(tournament){
  const matches=(tournament.matches||[]).filter(m=>m.a&&m.b).sort((a,b)=>(a.round||1)-(b.round||1));
  if(!matches.length)return '<p class="empty-line">Für diesen Spieltag wurden keine einzelnen Paarungen gespeichert.</p>';
  return `<div class="season-pairings">${matches.map(m=>`<div class="season-pairing"><small>Runde ${m.round||1}${m.gameLabel?` · ${esc(m.gameLabel)}`:''}</small><b>${esc(tournamentPlayerName(tournament,m.a))}</b><strong>${m.sa??'–'} : ${m.sb??'–'}</strong><b>${esc(tournamentPlayerName(tournament,m.b))}</b></div>`).join('')}</div>`;
}
function tournamentCorrectionForm(tournament){
  const matches=(tournament.matches||[]).map((match,index)=>({...match,index})).filter(match=>match.a&&match.b&&match.b!=='Freilos'&&match.sa!==null&&match.sb!==null).sort((a,b)=>(a.round||1)-(b.round||1));
  if(!matches.length)return '<p class="empty-line">Für diesen Spieltag sind keine korrigierbaren Paarungen gespeichert.</p>';
  return `<form class="season-correction-form" data-correction-form="${esc(tournament.id)}"><div class="season-correction-note"><b>Ergebnisse nachträglich korrigieren</b><p>Nur die Spielstände werden geändert. Paarungen und nachfolgende Runden bleiben unverändert; Platzierung und Saisonwertung werden neu berechnet.</p></div><div class="season-correction-matches">${matches.map(match=>`<div class="season-correction-row" data-correction-match="${match.index}"><small>Runde ${match.round||1}${match.gameLabel?` · ${esc(match.gameLabel)}`:''}</small><b>${esc(tournamentPlayerName(tournament,match.a))}</b><input type="number" min="0" max="30" value="${match.sa}" aria-label="Legs ${esc(tournamentPlayerName(tournament,match.a))}" required><span>:</span><input type="number" min="0" max="30" value="${match.sb}" aria-label="Legs ${esc(tournamentPlayerName(tournament,match.b))}" required><b>${esc(tournamentPlayerName(tournament,match.b))}</b></div>`).join('')}</div><div class="season-correction-actions"><button class="primary" type="submit">KORREKTUR SPEICHERN</button><button class="secondary" type="button" data-cancel-correction="${esc(tournament.id)}">Abbrechen</button></div></form>`;
}
function recalculateTournamentRecord(tournament,season){
  const players=tournament.players||[],matches=tournament.matches||[],rows=standingsFor(players,matches),pointSystem=season?.pointSystem||defaultPointSystem(),doubleKoPlan=tournament.settings?.doubleKoPlan||tournament.doubleKoPlan,ordered=orderedTournamentResults(players,matches,pointSystem,doubleKoPlan),rankByName=new Map(ordered.map((result,index)=>[result.name,index+1])),previous=new Map((tournament.results||[]).map(result=>[result.playerId||T20DataSchema.legacyPlayerId(result.name),result]));
  tournament.results=players.map(name=>{const playerId=playerIdFor(tournament,name),old=previous.get(playerId)||{},wins=tournamentWins(name,matches),losses=tournamentLosses(name,matches),byes=tournamentByes(name,matches,doubleKoPlan),row=rows.find(item=>item.name===name)||{};return{...old,name,playerId,profileId:old.profileId||mappedPlayerValue(tournament.playerProfileIds,name),wins,losses,byes,scoringWins:scoringWins(wins,byes),rank:rankByName.get(name)||0,legsFor:row.lf||0,legsAgainst:row.la||0,points:pointsForTournamentResult(wins,byes,pointSystem)}});
  tournament.winner=ordered[0]?.name||'';tournament.winnerId=playerIdFor(tournament,tournament.winner);tournament.top3=ordered.slice(0,3).map(row=>row.name);tournament.top3Ids=tournament.top3.map(name=>playerIdFor(tournament,name));tournament.correctedAt=new Date().toISOString();return tournament;
}
async function correctSeasonTournamentFromForm(form){
  if(!canManageClubData())return;const season=selectedSeason(),tournamentId=form.dataset.correctionForm,tournament=season?.tournaments?.find(item=>String(item.id)===String(tournamentId));if(!season||!tournament)return;
  const changes=[...form.querySelectorAll('[data-correction-match]')].map(row=>{const inputs=row.querySelectorAll('input'),index=+row.dataset.correctionMatch,sa=+inputs[0].value,sb=+inputs[1].value;return{index,sa,sb}});
  if(changes.some(change=>!Number.isInteger(change.sa)||!Number.isInteger(change.sb)||change.sa<0||change.sb<0||change.sa>30||change.sb>30||change.sa===change.sb)){appAlert('Bitte gültige Spielstände zwischen 0 und 30 eingeben. Ein Spiel darf nicht unentschieden enden.');return}
  const changed=changes.filter(change=>tournament.matches[change.index]?.sa!==change.sa||tournament.matches[change.index]?.sb!==change.sb);if(!changed.length){editingSeasonTournamentId='';renderSeasonTournaments();return}
  if(!await appConfirm(`${changed.length===1?'Diesen Spielstand':'Diese Spielstände'} korrigieren und die Saisonwertung neu berechnen? Die folgenden Paarungen bleiben unverändert.`))return;
  changed.forEach(change=>{tournament.matches[change.index].sa=change.sa;tournament.matches[change.index].sb=change.sb});recalculateTournamentRecord(tournament,season);season.stats=calculateSeasonStatisticsSummary(season);
  const history=loadTournamentHistory(),historyRecord=history.find(item=>String(item.id)===String(tournament.id));if(historyRecord){historyRecord.matches=(tournament.matches||[]).map(match=>({...match}));recalculateTournamentRecord(historyRecord,season);persistTournamentHistory(history)}
  if(String(state.seasonTournamentId||state.savedToHistory)===String(tournament.id)){state.matches=(tournament.matches||[]).map(match=>({...match}));save()}
  editingSeasonTournamentId='';expandedSeasonTournamentIds.add(String(tournament.id));saveSeason(season);renderPublicHome();appAlert('Der Spielstand wurde korrigiert. Platzierung und Saisonwertung wurden neu berechnet; die Paarungen bleiben unverändert.');
}
function renderSeasonTournaments(season=selectedSeason()){
  if(!canViewSeasonStandings(season)){$('#seasonTournaments').innerHTML=seasonLockNoticeHtml(false);return}
  const pointSystem=season?.pointSystem||defaultPointSystem(),tournaments=[...(season?.tournaments||[])].sort((a,b)=>{const aPlanned=!!a.planned,bPlanned=!!b.planned;if(aPlanned!==bPlanned)return aPlanned?-1:1;return aPlanned?String(a.date||'').localeCompare(String(b.date||'')):String(b.date||'').localeCompare(String(a.date||''))}),list=tournaments.length?`<div class="match-list">${tournaments.map(t=>{const planned=!!t.planned,expanded=expandedSeasonTournamentIds.has(String(t.id)),editing=editingSeasonTournamentId===String(t.id),shortened=tournamentCompletionStatus(t)==='shortened',summary=planned?`Geplanter Termin · ${esc(t.competitionLabel||'Offen')}`:`${shortened?'Vorzeitig beendet · ':''}Sieger: ${esc(tournamentPlayerName(t,t.winner)||'–')} · Top 3: ${(t.top3||[]).map(name=>esc(tournamentPlayerName(t,name))).join(', ')||'–'}`;return `<article class="match season-match"><div class="match-no">${esc(t.date)}${planned?' · Geplant':` · ${t.participantCount||0} Teilnehmer${t.manual?' · Manuell':''}`}</div><div><b>${esc(t.name)}</b><p>${summary}</p>${planned?'':`<div class="season-detail ${expanded||editing?'':'hidden'}" id="details-${esc(t.id)}"><h4>Platzierungen</h4><div class="season-results">${(t.results||[]).sort((a,b)=>a.rank-b.rank).map(r=>{const byes=storedResultByes(r,t);return`<span>${r.rank}. ${esc(tournamentPlayerName(t,r.name))} · ${r.wins}S/${r.losses}N${byes?` · ${byes} Freilos`:''} · ${pointsForStoredTournamentResult(r,t,pointSystem)} Pkt.</span>`}).join('')}</div><h4>Paarungen</h4>${editing?tournamentCorrectionForm(t):tournamentMatchesHtml(t)}</div>`}</div><div class="season-match-actions">${planned?'':`<button class="secondary" data-tournament-detail="${esc(t.id)}">${expanded||editing?'Details ausblenden':'Details anzeigen'}</button>`}${canManageClubData()&&!planned?`<button class="secondary" data-edit-tournament="${esc(t.id)}">${editing?'Korrektur geöffnet':'Ergebnisse korrigieren'}</button>`:''}${canManageClubData()?`<button class="secondary" data-rename-tournament="${esc(t.id)}">Spieltag umbenennen</button><button class="danger" data-delete-tournament="${esc(t.id)}">Löschen</button>`:''}</div></article>`}).join('')}</div>`:'<div class="empty-card">Noch keine Turniere in dieser Saison.</div>';
  $('#seasonTournaments').innerHTML=(canManageClubData()?renderManualTournamentForm(season):'')+list;
}
function standaloneTournamentHistory(){
  const linkedIds=new Set((seasonStore.seasons||[]).flatMap(season=>(season.tournaments||[]).filter(tournament=>!tournament.planned).map(tournament=>String(tournament.id))));
  return loadTournamentHistory().filter(tournament=>!tournament.planned&&(tournament.standalone||(!linkedIds.has(String(tournament.id))&&!tournament.scheduledSeasonId))).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(b.createdAt||'').localeCompare(a.createdAt||''));
}
function renderStandaloneTournaments(){
  const box=$('#seasonStandalone');if(!box)return;const tournaments=standaloneTournamentHistory();
  box.innerHTML=`<section class="standalone-results-head"><div><span class="eyebrow">EINZELTURNIERE</span><h3>Turniere ohne Saisonwertung</h3><p>Vereinsmeisterschaften und andere eigenständige Turniere bleiben dauerhaft gespeichert, beeinflussen aber keine Liga-Rangliste.</p></div><b>${tournaments.length}</b></section>`+(tournaments.length?`<div class="match-list standalone-result-list">${tournaments.map(tournament=>{const id=String(tournament.id),expanded=expandedStandaloneTournamentIds.has(id),top=(tournament.top3||[]).filter(Boolean),cancelled=tournamentCompletionStatus(tournament)==='cancelled',shortened=tournamentCompletionStatus(tournament)==='shortened',summary=cancelled?'Abgebrochen · keine Wertung':`${shortened?'Vorzeitig beendet · ':''}Sieger: ${esc(tournamentPlayerName(tournament,tournament.winner)||'–')}${top.length?` · Top 3: ${top.map(name=>esc(tournamentPlayerName(tournament,name))).join(', ')}`:''}`;return `<article class="match season-match standalone-result" id="standalone-result-${esc(id)}"><div class="match-no">${esc(tournament.date||'')}${tournament.competitionLabel?` · ${esc(tournament.competitionLabel)}`:''} · ${tournament.participantCount||tournament.players?.length||0} Teilnehmende</div><div><b>${esc(tournament.eventName||tournament.name||'Turnier')}</b><p>${summary}</p><div class="season-detail ${expanded?'':'hidden'}" id="standalone-details-${esc(id)}">${cancelled?'<h4>Keine Platzierung oder Saisonpunkte</h4><p class="empty-line">Die gespielten Paarungen bleiben nur als Nachweis erhalten.</p>':`<h4>Platzierungen</h4><div class="season-results">${(tournament.results||[]).sort((a,b)=>(a.rank||999)-(b.rank||999)).map(result=>`<span>${result.rank||'–'}. ${esc(tournamentPlayerName(tournament,result.name))} · ${result.wins||0}S/${result.losses||0}N</span>`).join('')||'<span>Keine Platzierung gespeichert.</span>'}</div>`}<h4>Paarungen</h4>${tournamentMatchesHtml(tournament)}</div></div><div class="season-match-actions"><button class="secondary" type="button" data-standalone-detail="${esc(id)}">${expanded?'Details ausblenden':'Details anzeigen'}</button>${canManageClubData()&&expanded?`<button class="danger" type="button" data-delete-standalone="${esc(id)}">Turnier löschen</button>`:''}</div></article>`}).join('')}</div>`:'<div class="empty-card">Noch keine eigenständigen Turniere gespeichert.</div>');
}
async function deleteStandaloneTournament(id){
  if(!canManageClubData()||!id)return;const tournament=standaloneTournamentHistory().find(item=>String(item.id)===String(id));if(!tournament)return;
  const name=tournament.eventName||tournament.name||'Turnier';if(!await appConfirm(`Eigenständiges Turnier „${name}“ vom ${publicDate(tournament.date)} endgültig löschen?\n\nErgebnisse, Paarungen und Platzierungen werden aus dem Archiv entfernt.`))return;
  seasonStore.deletedTournamentIds=seasonStore.deletedTournamentIds||{};seasonStore.deletedTournamentIds[id]=new Date().toISOString();persistSeasons();
  persistTournamentHistory(loadTournamentHistory().filter(item=>String(item.id)!==String(id)));
  if(String(state.savedToHistory||'')===String(id)){state.savedToHistory=undefined;save()}expandedStandaloneTournamentIds.delete(String(id));renderStandaloneTournaments();renderPublicHome({refreshRegistrations:false});
  await T20Cloud.syncAll({keys:[TOURNAMENT_HISTORY_KEY,SEASON_KEY]});if(T20Cloud.pendingKeys?.has(TOURNAMENT_HISTORY_KEY)||T20Cloud.pendingKeys?.has(SEASON_KEY))appAlert('Das Turnier wurde auf diesem Gerät gelöscht, aber die Online-Speicherung ist noch nicht bestätigt. Bitte die App geöffnet lassen und nicht abmelden.');
}
async function renameSeasonTournament(tournamentId){
  if(!canManageClubData())return;
  const selected=selectedSeason(),target=selected?.tournaments?.find(tournament=>tournament.id===tournamentId);if(!target)return;
  const sharedEventName=target.eventName||'',oldEventName=sharedEventName||target.name||'Spieltag',next=await appPrompt('Neuer Name des Spieltags:',oldEventName);if(next===null)return;
  const eventName=next.trim();if(!eventName){appAlert('Bitte einen Namen für den Spieltag eingeben.');return}
  const updateRecord=record=>{record.eventName=eventName;record.name=record.competition?`${eventName} – ${record.competitionLabel||competitionLabel(record.competition)}`:eventName;record.settings={...(record.settings||{}),eventName,name:record.name}};
  for(const season of seasonStore.seasons||[])for(const record of season.tournaments||[])if(record.id===target.id||(sharedEventName&&record.eventName===sharedEventName&&record.date===target.date))updateRecord(record);
  const history=loadTournamentHistory();let historyChanged=false;for(const record of history)if(record.id===target.id||(sharedEventName&&record.eventName===sharedEventName&&record.date===target.date)){updateRecord(record);historyChanged=true}if(historyChanged)persistTournamentHistory(history);
  if(state.seasonTournamentId===target.id||state.savedToHistory===target.id){state.eventName=eventName;for(const [key,competition] of Object.entries(state.competitions||{})){competition.settings=competition.settings||{};competition.settings.eventName=eventName;competition.settings.name=`${eventName} – ${competitionLabel(key)}`}state.settings={...(state.settings||{}),eventName,name:competitionTitle()};save()}
  persistSeasons();renderSeasonView();renderNavigation();
}
function renderSeasonStats(season=selectedSeason(),rows=calculateSeasonStandings(season)){
  if(!canViewSeasonStandings(season)){$('#seasonStats').innerHTML=seasonLockNoticeHtml(false);return}
  const s=seasonStats(season),card=(title,row,value)=>`<article><span>${title}</span><b>${row?esc(row.name):'–'}</b><small>${value}</small></article>`;
  $('#seasonStats').innerHTML=`<div class="season-cards stats-cards">${card('Meiste Teilnahmen',s.played,s.played?.played||0)}${card('Beste Teilnahmequote',s.participation,`${Math.round((s.participation?.participation||0)*100)}%`)}${card('Meiste Siege',s.wins,s.wins?.wins||0)}${card('Beste Siegquote',s.winRate,`${Math.round((s.winRate?.winRate||0)*100)}%`)}</div>`;
}
function renderSeasonHonors(season=selectedSeason(),rows=calculateSeasonStandings(season)){
  if(!canViewSeasonStandings(season)){$('#seasonHonors').innerHTML=seasonLockNoticeHtml(false);return}
  const s=seasonStats(season),isLeague=/liga/i.test(season?.name||''),championLabel=isLeague?'Liga-Champion':/vereinsmeister/i.test(season?.name||'')?'Vereinsmeister':'Gesamtsieger',runnerUpLabel=isLeague?'Liga-Vizemeister':'Vizemeister';$('#seasonHonors').innerHTML=`<div class="honors"><article><span>🥇</span><b>${championLabel}</b><p>${esc(rows[0]?.name||'–')}</p></article><article><span>🥈</span><b>${runnerUpLabel}</b><p>${esc(rows[1]?.name||'–')}</p></article><article><span>🥉</span><b>Platz 3</b><p>${esc(rows[2]?.name||'–')}</p></article><article><span>📅</span><b>Beste Teilnahmequote</b><p>${esc(s.participation?.name||'–')} · ${Math.round((s.participation?.participation||0)*100)}%</p></article></div>`;
}
function renderPlayerSeasonDetail(reference){
  const season=selectedSeason();if(!canViewSeasonStandings(season)){$('#seasonPlayerDetail').innerHTML=seasonLockNoticeHtml(false);return}const normalized=normalizedPlayerName(reference),row=calculateSeasonStandings(season).find(result=>result.profileId===reference||result.playerId===reference||normalizedPlayerName(result.name)===normalized);if(!row)return;
  const privateProfile=isAdmin()?(T20Cloud.adminProfiles||[]).find(profile=>profile.id===row.profileId):(T20Cloud.user?.id===row.profileId?T20Cloud.profile:null),photo=memberAvatarUrl(row.profileId),initial=esc((row.name||'?').charAt(0).toUpperCase()),avatar=photo?`<img src="${esc(photo)}" alt="Profilfoto von ${esc(row.name)}">`:initial;
  const fullName=privateProfile?.display_name?`<p class="player-profile-realname">${esc(privateProfile.display_name)}</p>`:'';
  $('#seasonPlayerDetail').innerHTML=`<div class="card player-detail"><button class="secondary close-detail">Schließen</button><div class="player-profile-head"><span class="profile-avatar player-profile-avatar">${avatar}</span><div><span class="eyebrow">SPIELERPROFIL</span><h3>${esc(row.name)}</h3>${fullName}</div></div><div class="season-cards player-profile-stats"><article><span>Turniere</span><b>${row.played}</b></article><article><span>Siege</span><b>${row.wins}</b></article><article><span>Niederlagen</span><b>${row.losses}</b></article><article><span>Gesamtpunkte</span><b>${row.totalPoints}</b></article><article><span>Nach Streicher</span><b>${row.cleanPoints}</b></article><article><span>Teilnahme</span><b>${Math.round(row.participation*100)}%</b></article></div><div class="table-wrap"><table><thead><tr><th>Datum</th><th>Turnier</th><th>Status</th><th>S/N</th><th>Punkte</th></tr></thead><tbody>${row.entries.map(entry=>`<tr class="${entry.dropped?'dropped-row':''}"><td>${entry.date}</td><td>${esc(entry.name)}</td><td>${entry.present?'Gespielt':'Fehltermin'}${entry.dropped?' · gestrichen':''}</td><td>${entry.wins}/${entry.losses}</td><td>${entry.points}</td></tr>`).join('')}</tbody></table></div></div>`;$('#seasonPlayerDetail').scrollIntoView({behavior:'smooth',block:'start'});
}

function playerProfileReference(row={}){return row.profileId||row.playerId||row.name||''}
function findPublicPlayer(reference=''){
  const decoded=decodeURIComponent(reference||''),normalized=normalizedPlayerName(decoded),matches=[];
  for(const season of seasonStore.seasons||[]){
    const rows=calculateSeasonStandings(season),row=rows.find(item=>(decoded&&(item.profileId===decoded||item.playerId===decoded))||normalizedPlayerName(item.name)===normalized);
    if(row)matches.push({season,row,rank:rows.indexOf(row)+1});
  }
  if(!matches.length)return null;
  const preferred=matches.find(item=>!item.season.archived&&(!item.season.startDate||item.season.startDate<=todayIso())&&(!item.season.endDate||item.season.endDate>=todayIso()))||matches.find(item=>!item.season.archived)||matches[0];
  return{reference:playerProfileReference(preferred.row),name:preferred.row.name,playerId:preferred.row.playerId||'',profileId:preferred.row.profileId||'',matches,preferred};
}
function publicPlayerUrl(reference){const url=new URL(TRIPLE20_PUBLIC_URL);url.searchParams.set('bereich','spieler');url.searchParams.set('spieler',reference);return url.href}
function directPlayerComparison(player){
  const ownId=T20Cloud.user?.id||'',ownName=T20Cloud.profile?.nickname||T20Cloud.profile?.display_name||'';
  if(!ownId&&!ownName)return null;
  const target={playerId:player?.playerId||'',profileId:player?.profileId||'',name:player?.name||''},own={playerId:profilePlayerId(ownId),profileId:ownId,name:ownName};
  const samePerson=(name,playerId,profileId,person)=>person.playerId&&playerId?String(person.playerId)===String(playerId):person.profileId&&profileId?String(person.profileId)===String(profileId):normalizedPlayerName(name)===normalizedPlayerName(person.name);
  if((own.playerId&&target.playerId&&own.playerId===target.playerId)||(own.profileId&&target.profileId&&own.profileId===target.profileId)||normalizedPlayerName(own.name)===normalizedPlayerName(target.name))return null;
  const seen=new Set();let wins=0,losses=0,legsFor=0,legsAgainst=0;
  for(const season of seasonStore.seasons||[]){if(!canViewSeasonStandings(season))continue;for(const tournament of season.tournaments||[]){
    if(tournament.planned)continue;
    const participantIdentity=name=>{const result=(tournament.results||[]).find(row=>normalizedPlayerName(row.name)===normalizedPlayerName(name));return{playerId:result?.playerId||mappedPlayerValue(tournament.playerIds,name),profileId:result?.profileId||mappedPlayerValue(tournament.playerProfileIds,name)}};
    (tournament.matches||[]).forEach((match,index)=>{
      if(!match.a||!match.b||match.b==='Freilos'||match.sa===null||match.sb===null||match.sa===undefined||match.sb===undefined)return;
      const sideA=matchSidePlayers(match,'a'),sideB=matchSidePlayers(match,'b'),identity=(side,index)=>{const name=(side==='a'?sideA:sideB)[index],ids=side==='a'?match.teamAIds:match.teamBIds,directId=Array.isArray(ids)?ids[index]:match[`${side}Id`],fallback=participantIdentity(name);return{name,playerId:directId||fallback.playerId,profileId:fallback.profileId}},ownSide=sideA.some((_,index)=>{const item=identity('a',index);return samePerson(item.name,item.playerId,item.profileId,own)})?'a':sideB.some((_,index)=>{const item=identity('b',index);return samePerson(item.name,item.playerId,item.profileId,own)})?'b':'',targetSide=sideA.some((_,index)=>{const item=identity('a',index);return samePerson(item.name,item.playerId,item.profileId,target)})?'a':sideB.some((_,index)=>{const item=identity('b',index);return samePerson(item.name,item.playerId,item.profileId,target)})?'b':'';
      if(!ownSide||!targetSide||ownSide===targetSide)return;
      const eventKey=tournament.scheduledEventId||`${tournament.date||''}|${tournament.eventName||tournament.name||''}|${tournament.competition||tournament.settings?.competition||''}`,matchKey=match.nodeId||`${match.round||1}|${index}`;
      const key=`${eventKey}|${matchKey}|${normalizedPlayerName(match.a)}|${normalizedPlayerName(match.b)}`;if(seen.has(key))return;seen.add(key);
      const ownScore=Number(ownSide==='a'?match.sa:match.sb),targetScore=Number(targetSide==='a'?match.sa:match.sb);legsFor+=ownScore;legsAgainst+=targetScore;if(ownScore>targetScore)wins++;else if(ownScore<targetScore)losses++;
    });
  }}
  return{ownName:own.name||'Du',targetName:target.name,matches:wins+losses,wins,losses,legsFor,legsAgainst};
}
function publicPlayerProfileHtml(player){
  if(!player)return `<div class="public-player-empty card"><span>🎯</span><h1 id="playerProfileTitle">Spielerprofil nicht gefunden</h1><p>Das Profil ist möglicherweise noch nicht mit einer Saisonwertung verknüpft.</p><button class="secondary" type="button" data-profile-back>Zur Startseite</button></div>`;
  const visibleMatches=player.matches.filter(({season})=>canViewSeasonStandings(season)),allEntries=visibleMatches.flatMap(({season,row})=>row.entries.filter(entry=>entry.present).map(entry=>({...entry,seasonName:season.name}))),recent=[...allEntries].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6),played=allEntries.length,wins=allEntries.reduce((sum,item)=>sum+(item.wins||0),0),losses=allEntries.reduce((sum,item)=>sum+(item.losses||0),0),points=allEntries.reduce((sum,item)=>sum+(item.points||0),0),podiums=allEntries.filter(item=>item.rank&&item.rank<=3).length,winRate=wins+losses?Math.round(wins/(wins+losses)*100):0,comparison=directPlayerComparison(player);
  const photo=memberAvatarUrl(player.profileId),initial=esc((player.name||'?').charAt(0).toUpperCase()),avatar=photo?`<img src="${esc(photo)}" alt="Profilfoto von ${esc(player.name)}">`:initial;
  const seasons=player.matches.map(({season,row,rank})=>canViewSeasonStandings(season)?`<article><span>${season.archived?'ARCHIV':'SAISON'}</span><h3>${esc(season.name)}</h3><div><b>Rang ${rank}</b><strong>${row.cleanPoints} Punkte</strong></div><small>${row.played} Turniere · ${row.wins} Siege · ${row.losses} Niederlagen</small><button class="link-btn" type="button" data-profile-season="${esc(season.id)}">Rangliste öffnen</button></article>`:`<article class="is-locked"><span>ENDSTAND GESPERRT</span><h3>${esc(season.name)}</h3><p>${esc(SEASON_STANDINGS_LOCK_MESSAGE)}</p></article>`).join('');
  const comparisonHtml=comparison?`<section class="player-comparison"><div><span class="eyebrow">DIREKTER VERGLEICH</span><h2>${esc(comparison.ownName)} gegen ${esc(comparison.targetName)}</h2><p>${comparison.matches?`${comparison.matches} direkte Begegnung${comparison.matches===1?'':'en'} · Legs ${comparison.legsFor}:${comparison.legsAgainst}`:'Noch keine direkte Begegnung gespeichert.'}</p></div><div class="player-comparison-score"><article><small>Deine Siege</small><b>${comparison.wins}</b></article><strong>:</strong><article><small>Deine Niederlagen</small><b>${comparison.losses}</b></article></div></section>`:'';
  return `<div class="public-player-back"><button class="secondary" type="button" data-profile-back>← Zurück</button></div><header class="public-player-hero"><span class="profile-avatar public-player-avatar">${avatar}</span><div><span class="eyebrow">TRIPLE20 · SPIELERPROFIL</span><h1 id="playerProfileTitle">${esc(player.name)}</h1><p>${esc(appSettings.club.name||'Dartclub Achensee')} · Persönliche Turnierbilanz</p></div><button class="primary public-player-share" type="button" data-profile-share="${esc(player.reference)}">PROFIL TEILEN <span>↗</span></button></header><div class="public-player-stats"><article><small>Turniere</small><b>${played}</b></article><article><small>Siege</small><b>${wins}</b></article><article><small>Niederlagen</small><b>${losses}</b></article><article><small>Siegquote</small><b>${winRate}%</b></article><article><small>Podestplätze</small><b>${podiums}</b></article><article><small>Punkte</small><b>${points}</b></article></div>${comparisonHtml}<div class="public-player-layout"><section><div class="public-player-heading"><span>FORM</span><h2>Letzte Ergebnisse</h2></div>${recent.length?`<div class="public-player-results">${recent.map(item=>`<article><time>${publicDate(item.date)}</time><div><b>${esc(item.name||'Spieltag')}</b><small>${esc(item.seasonName)}</small></div><strong>${item.rank?`${item.rank}. Platz`:''}${item.rank&&item.points?' · ':''}${item.points?`${item.points} Pkt.`:''}</strong></article>`).join('')}</div>`:'<p class="public-empty">Noch keine Ergebnisse vorhanden.</p>'}</section><section><div class="public-player-heading"><span>SAISONEN</span><h2>Ranglisten</h2></div><div class="public-player-seasons">${seasons}</div></section></div>`;
}
function showPlayerProfile(reference='',updateUrl=true){
  hideMainSections();$('#playerProfileSection')?.classList.remove('hidden');const player=findPublicPlayer(reference);$('#playerProfileContent').innerHTML=publicPlayerProfileHtml(player);renderNavigation();if(updateUrl)updateAppUrl('spieler',{spieler:player?.reference||reference});
}
async function sharePlayerProfile(reference){
  const player=findPublicPlayer(reference);if(!player)return;const url=publicPlayerUrl(player.reference),data={title:`${player.name} · Triple20`,text:`Spielerprofil von ${player.name} auf Triple20`,url};
  try{if(navigator.share){await navigator.share(data);return}await navigator.clipboard.writeText(url);appAlert('Profil-Link wurde kopiert.')}catch(error){if(error?.name!=='AbortError')await appPrompt('Profil-Link kopieren:',url)}
}
function exportSeasonJson(){const season=selectedSeason();if(!season)return;downloadFile(`${season.name.replaceAll(' ','_')}.json`,'application/json',JSON.stringify(season,null,2))}
function exportStandingsCsv(){const season=selectedSeason();if(!season)return;const rows=visibleSeasonStandings(season),head=['Platz','Spieler','Gesamtpunkte','Bereinigte Punkte','Turniere','Siege','Niederlagen'];const csv=[head.join(';'),...rows.map((r,i)=>[i+1,r.name,r.totalPoints,r.cleanPoints,r.played,r.wins,r.losses].map(v=>`"${String(v).replaceAll('"','""')}"`).join(';'))].join('\n');downloadFile(`${season.name.replaceAll(' ','_')}_rangliste.csv`,'text/csv;charset=utf-8',csv)}

function publicDate(value){if(!value)return'Datum offen';const date=new Date(`${value}T12:00:00`);return Number.isNaN(date.getTime())?esc(value):date.toLocaleDateString('de-AT',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})}
function publicStartTime(record={}){const value=record.startTime||record.settings?.startTime||record.settings?.start||'';return /^\d{2}:\d{2}$/.test(value)?`${value} Uhr`:''}
function publicTournamentKey(record={}){
  const id=String(record.id||'').trim();
  if(id)return `${record.planned?'planned':'completed'}|${id}`;
  const baseName=(record.eventName||record.name||'').trim().replace(/\s+[–-]\s+(Herren|Damen)$/i,'').replace(/\s+/g,' ').toLowerCase();
  const competition=normalizedCompetition(record.competition||record.settings?.competition);
  return `${record.date||''}|${baseName}|${competition}`;
}
function publicTournamentRecords(){
  // Eine abgeschlossene Turnierfassung hat Vorrang vor dem ursprünglich
  // geplanten Termin. Abgeschlossene Saisonfassungen bleiben weiterhin die
  // offizielle Quelle gegenüber einer älteren lokalen Historie.
  const history=loadTournamentHistory(),completedScheduleIds=new Set(history.map(record=>record.scheduledEventId).filter(Boolean)),activeScheduleIds=new Set([state.scheduledEventId,...Object.values(state.competitions||{}).map(competition=>competition?.scheduledEventId)].filter(Boolean));
  const seasonRecords=(seasonStore.seasons||[]).flatMap(season=>(season.tournaments||[]).filter(tournament=>!tournament.planned||(!completedScheduleIds.has(tournament.id)&&!activeScheduleIds.has(tournament.id))).map(tournament=>({...tournament,seasonName:season.name,seasonId:season.id})));
  const records=[...history,...seasonRecords];
  const unique=new Map();
  records.forEach(record=>{const key=publicTournamentKey(record),old=unique.get(key),completedBeatsPlanned=old&&!old.planned&&record.planned,next=completedBeatsPlanned?{...record,...old}:{...(old||{}),...record};unique.set(key,{...next,seasonName:record.seasonName||old?.seasonName||''})});
  return [...unique.entries()].map(([key,value])=>({...value,_publicKey:key})).filter(record=>tournamentCompletionStatus(record)!=='cancelled').sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.name||'').localeCompare(b.name||'','de'));
}
function seasonForPublicTournament(tournament={}){return (seasonStore.seasons||[]).find(season=>String(season.id)===String(tournament.seasonId||'')||(season.tournaments||[]).some(item=>String(item.id)===String(tournament.id||'')))||null}
function publicEventShareUrl(){return TRIPLE20_PUBLIC_URL}
function publicEventCalendarText(tournament={}){
  const date=(tournament.date||'').replaceAll('-',''),time=(tournament.startTime||tournament.settings?.startTime||'19:00').replace(':','');
  if(!/^\d{8}$/.test(date)||!/^\d{4}$/.test(time))return'';
  const localStart=new Date(`${tournament.date}T${time.slice(0,2)}:${time.slice(2)}:00`),localEnd=new Date(localStart.getTime()+4*60*60*1000),localStamp=value=>`${value.getFullYear()}${String(value.getMonth()+1).padStart(2,'0')}${String(value.getDate()).padStart(2,'0')}T${String(value.getHours()).padStart(2,'0')}${String(value.getMinutes()).padStart(2,'0')}00`,utcStamp=value=>value.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),ics=value=>String(value||'').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');
  const title=tournament.name||tournament.eventName||'Triple20 Spieltag',details=[tournament.competitionLabel,tournament.seasonName].filter(Boolean).join(' · '),uid=`${tournament.id||`${date}-${time}`}@triple20`;
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Triple20//Spieltermine//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${ics(uid)}`,`DTSTAMP:${utcStamp(new Date())}`,`DTSTART;TZID=Europe/Vienna:${localStamp(localStart)}`,`DTEND;TZID=Europe/Vienna:${localStamp(localEnd)}`,`SUMMARY:${ics(title)}`,`DESCRIPTION:${ics(`${details}${details?'\n':''}Aktuelle Informationen in der Triple20-App.`)}`,`URL:${publicEventShareUrl()}`,'BEGIN:VALARM','TRIGGER:-PT2H','ACTION:DISPLAY',`DESCRIPTION:${ics(title)} beginnt in 2 Stunden`,'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
}
function addPublicEventToCalendar(key){
  const tournament=publicTournamentRecords().find(item=>item._publicKey===key),content=tournament&&publicEventCalendarText(tournament);if(!content){appAlert('Für diesen Termin fehlen Datum oder Startzeit.');return}
  const filename=`Triple20_${(tournament.name||'Spieltag').replace(/[^a-z0-9äöüß]+/gi,'_').replace(/^_|_$/g,'')}_${tournament.date}.ics`;downloadFile(filename,'text/calendar;charset=utf-8',content);
}
async function scheduledTournamentExistsOnline(id){
  if(!id||!T20Cloud.client)return false;const rows=await withTimeout(T20Cloud.fetchCloud(),12000,'Die Online-Kontrolle hat zu lange gedauert.'),cloud=cloudDataFromRows(rows),seasons=logicalDataValue(SEASON_KEY,cloud[SEASON_KEY]),history=logicalDataValue(TOURNAMENT_HISTORY_KEY,cloud[TOURNAMENT_HISTORY_KEY])||[];T20Cloud.rememberCloudRows(rows);return !!(seasons?.seasons||[]).some(item=>(item.tournaments||[]).some(tournament=>String(tournament.id)===String(id)))||history.some(tournament=>String(tournament.id)===String(id));
}
async function sharePublicEventOnWhatsApp(key){
  const tournament=publicTournamentRecords().find(item=>item._publicKey===key);if(!tournament)return;
  if(tournament.planned){try{if(!await scheduledTournamentExistsOnline(tournament.id)){appAlert('Dieser Termin ist noch nicht sicher online gespeichert und kann deshalb noch nicht geteilt werden. Bitte die Internetverbindung prüfen und den Termin erneut veröffentlichen.');return}}catch(error){appAlert(`Der Termin konnte vor dem Teilen nicht online bestätigt werden: ${error?.message||'Bitte später erneut versuchen.'}`);return}}
  const title=tournament.name||tournament.eventName||'Triple20 Spieltag',date=publicDate(tournament.date),time=publicStartTime(tournament),details=[tournament.competitionLabel,tournament.seasonName].filter(Boolean).join(' · '),message=[`🎯 ${title}`,`📅 ${date}${time?` um ${time.replace(' Uhr','')}`:''}`,details?`🏆 ${details}`:'','',`Alle Informationen findest du in der Triple20-App:`,publicEventShareUrl()].filter(line=>line!==null&&line!==undefined).join('\n');
  if(navigator.share){try{await navigator.share({title,text:message});return}catch(error){if(error?.name==='AbortError')return}}
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
}
function resultGraphicPlayers(tournament={}){
  const ranked=[...(tournament.results||[])].filter(item=>item?.name).sort((a,b)=>(b.points||0)-(a.points||0)||(b.wins||0)-(a.wins||0)||(a.losses||0)-(b.losses||0)||((b.legsFor||0)-(b.legsAgainst||0))-((a.legsFor||0)-(a.legsAgainst||0))||(a.rank||999)-(b.rank||999)||String(a.name).localeCompare(String(b.name),'de'));if(ranked.length)return ranked.slice(0,3);
  const names=[tournament.winner,...(tournament.top3||[])].filter(Boolean);return [...new Set(names)].slice(0,3).map((name,index)=>({name,rank:index+1}));
}
function drawResultGraphic(tournament={}){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),width=1080,height=1350;canvas.width=width;canvas.height=height;
  const blue='#0e6bff',navy='#06101d',muted='#a9bad0',white='#ffffff',roundRect=(x,y,w,h,r,fill,stroke='')=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}},fitText=(text,maxWidth,startSize,minSize=34)=>{let size=startSize;do{ctx.font=`900 ${size}px Helvetica Neue,Arial,sans-serif`;if(ctx.measureText(text).width<=maxWidth)return size;size-=2}while(size>minSize);return minSize};
  const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#02060c');gradient.addColorStop(.58,navy);gradient.addColorStop(1,'#0a2246');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);const glow=ctx.createRadialGradient(870,180,10,870,180,520);glow.addColorStop(0,'rgba(14,107,255,.42)');glow.addColorStop(1,'rgba(14,107,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  ctx.fillStyle=blue;ctx.font='900 29px Helvetica Neue,Arial,sans-serif';ctx.fillText('TRIPLE20 · ERGEBNIS',76,95);const title=(tournament.name||tournament.eventName||'Dartturnier').toUpperCase(),titleSize=fitText(title,928,76,44);ctx.fillStyle=white;ctx.font=`900 ${titleSize}px Helvetica Neue,Arial,sans-serif`;ctx.fillText(title,76,190,928);ctx.fillStyle=muted;ctx.font='700 30px Helvetica Neue,Arial,sans-serif';ctx.fillText(`${publicDate(tournament.date)}${tournament.competitionLabel?` · ${tournament.competitionLabel}`:''}${tournament.seasonName?` · ${tournament.seasonName}`:''}`,76,245,928);
  const players=resultGraphicPlayers(tournament),labels=['SIEGER','2. PLATZ','3. PLATZ'],cardY=[330,565,775],cardH=[195,175,175];players.forEach((player,index)=>{const y=cardY[index],h=cardH[index],circle=index===0?112:92;roundRect(76,y,928,h,28,index===0?'rgba(14,107,255,.2)':'rgba(255,255,255,.055)',index===0?blue:'rgba(169,186,208,.3)');roundRect(106,y+42,circle,circle,999,index===0?blue:'rgba(255,255,255,.12)');ctx.fillStyle=white;ctx.textAlign='center';ctx.font=`900 ${index===0?58:46}px Helvetica Neue,Arial,sans-serif`;ctx.fillText(String(index+1),106+circle/2,y+42+circle*.68);ctx.textAlign='left';ctx.fillStyle=index===0?'#77b2ff':muted;ctx.font='900 23px Helvetica Neue,Arial,sans-serif';ctx.fillText(labels[index],250,y+66);const name=String(player.name||'–'),nameSize=fitText(name,700,index===0?56:48,32);ctx.fillStyle=white;ctx.font=`900 ${nameSize}px Helvetica Neue,Arial,sans-serif`;ctx.fillText(name,250,y+125,700);const detail=[player.points!==undefined?`${player.points} Punkte`:'',player.wins!==undefined?`${player.wins} Siege`:''].filter(Boolean).join(' · ');if(detail){ctx.fillStyle=muted;ctx.font='700 24px Helvetica Neue,Arial,sans-serif';ctx.fillText(detail,250,y+162,700)}});
  const statsY=players.length>=3?1010:players.length===2?810:600,participants=tournament.participantCount||tournament.players?.length||0,matches=tournament.matches?.length||0;roundRect(76,statsY,928,120,24,'rgba(255,255,255,.06)','rgba(169,186,208,.22)');ctx.fillStyle=muted;ctx.font='800 24px Helvetica Neue,Arial,sans-serif';ctx.fillText('TEILNEHMENDE',110,statsY+45);ctx.fillText('SPIELE',550,statsY+45);ctx.fillStyle=white;ctx.font='900 42px Helvetica Neue,Arial,sans-serif';ctx.fillText(String(participants||'–'),110,statsY+92);ctx.fillText(String(matches||'–'),550,statsY+92);ctx.fillStyle=white;ctx.font='900 42px Helvetica Neue,Arial,sans-serif';ctx.fillText('TRIPLE',76,1260);ctx.fillStyle=blue;ctx.fillText('20',222,1260);ctx.fillStyle=muted;ctx.font='700 22px Helvetica Neue,Arial,sans-serif';ctx.textAlign='right';ctx.fillText('triple20.at',1004,1258);ctx.textAlign='left';return canvas;
}
async function openResultGraphic(key){
  const tournament=publicTournamentRecords().find(item=>item._publicKey===key);if(!tournament)return;if(!canViewSeasonStandings(seasonForPublicTournament(tournament))){appAlert(SEASON_STANDINGS_LOCK_MESSAGE);return}if(!resultGraphicPlayers(tournament).length){appAlert('Für diesen Spieltag ist noch kein Ergebnis gespeichert.');return}
  const canvas=drawResultGraphic(tournament),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',.95));if(!blob){appAlert('Die Ergebnisgrafik konnte nicht erstellt werden.');return}resultGraphicBlob=blob;resultGraphicFilename=`Triple20_${(tournament.name||'Ergebnis').replace(/[^a-z0-9äöüß]+/gi,'_').replace(/^_|_$/g,'')}_${tournament.date||todayIso()}.png`;const src=URL.createObjectURL(blob);$('#resultGraphicOverlay')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="resultGraphicOverlay" class="result-graphic-overlay" role="dialog" aria-modal="true" aria-labelledby="resultGraphicTitle"><section class="result-graphic-dialog"><button id="closeResultGraphicBtn" class="live-qr-close" type="button" aria-label="Ergebnisgrafik schließen">×</button><span class="eyebrow">ERGEBNIS TEILEN</span><h2 id="resultGraphicTitle">Grafik ist bereit</h2><p>Für WhatsApp, Instagram und andere soziale Netzwerke.</p><img src="${src}" alt="Ergebnisgrafik für ${esc(tournament.name||'den Spieltag')}"><div><button id="shareResultGraphicBtn" class="primary" type="button">GRAFIK TEILEN <span>↗</span></button><button id="downloadResultGraphicBtn" class="secondary" type="button">PNG SPEICHERN</button></div></section></div>`);
}
function closeResultGraphic(){const image=$('#resultGraphicOverlay img');if(image?.src?.startsWith('blob:'))URL.revokeObjectURL(image.src);$('#resultGraphicOverlay')?.remove()}
function downloadResultGraphic(){if(resultGraphicBlob)downloadFile(resultGraphicFilename,'image/png',resultGraphicBlob)}
async function shareResultGraphic(){const file=resultGraphicBlob&&new File([resultGraphicBlob],resultGraphicFilename,{type:'image/png'});if(!file)return;if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:'Triple20 Ergebnis',text:'Aktuelles Ergebnis aus der Triple20-App',files:[file]});return}catch(error){if(error?.name==='AbortError')return}}downloadResultGraphic();appAlert('Die direkte Teilen-Funktion ist in diesem Browser nicht verfügbar. Die Grafik wurde deshalb als PNG gespeichert.')}
function registrationEventKey(tournament={}){return String(tournament.id||tournament._publicKey||'').slice(0,160)}
function registrationHtml(tournament={}){
  const eventKey=registrationEventKey(tournament),count=tournamentRegistrationCounts[eventKey]||0,own=tournamentRegistrations.find(item=>item.event_key===eventKey&&item.user_id===T20Cloud.user?.id),visibleRows=T20Cloud.user?tournamentRegistrations.filter(item=>item.event_key===eventKey).sort((a,b)=>(a.nickname||'').localeCompare(b.nickname||'','de')):[];
  const names=visibleRows.length?`<details class="registration-names"><summary>${count} Anmeldung${count===1?'':'en'} anzeigen</summary><span>${visibleRows.map(item=>esc(item.nickname||'Mitglied')).join(', ')}</span></details>`:`<small>${count} angemeldet</small>`;
  if(!T20Cloud.user)return `<div class="event-registration"><small>${count} angemeldet</small><button class="secondary" type="button" data-event-login>Zur Teilnahme anmelden</button></div>`;
  return `<div class="event-registration member-registration ${isAdmin()?'admin-registration':''}"><div>${names}${own?'<small>Du bist angemeldet.</small>':''}</div><button class="${own?'danger':'primary'}" type="button" data-event-registration="${esc(eventKey)}" data-registration-action="${own?'cancel':'join'}">${own?'Teilnahme absagen':'Ich bin dabei'}</button></div>`;
}
async function loadTournamentRegistrations({force=false}={}){
  if(registrationsLoading||!T20Cloud.client||(!force&&Date.now()-registrationsLoadedAt<60000))return;registrationsLoading=true;
  try{
    const [{data:counts,error:countError},{data:rows,error:rowError}]=await Promise.all([T20Cloud.client.rpc('triple20_registration_counts'),T20Cloud.user?T20Cloud.client.from('triple20_tournament_registrations').select('event_key,user_id,nickname,updated_at'):Promise.resolve({data:[]})]);
    if(countError)throw countError;if(rowError)throw rowError;tournamentRegistrationCounts=Object.fromEntries((counts||[]).map(item=>[item.event_key,+item.registration_count||0]));tournamentRegistrations=rows||[];registrationsLoadedAt=Date.now();
    if(!$('#publicHomeSection')?.classList.contains('hidden'))renderPublicHome({refreshRegistrations:false});
    if(isAdmin()&&!$('#authSection')?.classList.contains('hidden'))renderCloudPanel();
    if(isAdmin()&&!$('#tournamentManagementPanel')?.classList.contains('hidden'))renderTournamentManagement();
  }catch(error){console.warn('Teilnahmeanmeldungen konnten nicht geladen werden:',error)}finally{registrationsLoading=false}
}
async function changeTournamentRegistration(eventKey,action){
  if(!T20Cloud.user){showLogin();return}if(!T20Cloud.client){appAlert('Die Anmeldung benötigt momentan eine Internetverbindung.');return}
  const button=document.querySelector(`[data-event-registration="${CSS.escape(eventKey)}"]`);if(button)button.disabled=true;
  try{
    if(action==='cancel'){const {error}=await T20Cloud.client.from('triple20_tournament_registrations').delete().eq('event_key',eventKey).eq('user_id',T20Cloud.user.id);if(error)throw error}
    else{const nickname=T20Cloud.profile?.nickname?.trim()||'Mitglied',{error}=await T20Cloud.client.from('triple20_tournament_registrations').upsert({event_key:eventKey,user_id:T20Cloud.user.id,nickname,updated_at:new Date().toISOString()},{onConflict:'event_key,user_id'});if(error)throw error}
    while(registrationsLoading)await new Promise(resolve=>setTimeout(resolve,80));await loadTournamentRegistrations({force:true});
  }catch(error){console.error('Teilnahmeanmeldung fehlgeschlagen:',error);appAlert('Die Teilnahme konnte nicht gespeichert werden. Bitte prüfe die Internetverbindung oder die Supabase-Einrichtung.')}finally{if(button)button.disabled=false}
}
async function transferAdminCheckInToTournament(){
  if(!isAdmin())return;const event=upcomingAdminEvents().find(item=>registrationEventKey(item)===adminCheckInEventKey);if(!event)return;
  const data=checkInData(event),profiles=new Map((T20Cloud.adminProfiles||[]).map(profile=>[profile.id,profile])),members=data.ids.map(id=>profiles.get(id)).filter(Boolean).map(profile=>({id:profile.id,name:(profile.nickname||profile.display_name||'').trim()})).filter(item=>item.name),unique=new Map(members.map(item=>[item.name.toLowerCase(),item])),players=[...unique.values()];
  const targetCompetition=['men','women'].includes(event.competition)?event.competition:(state.activeCompetition||'men');ensureTournamentDayState();const targetState=targetCompetition===state.activeCompetition?competitionSnapshot(state):competitionSnapshot(state.competitions?.[targetCompetition]||emptyCompetition());
  if((targetState.started||targetState.players?.length||targetState.matches?.length)&&!await appConfirm(`Der vorbereitete Bewerb „${competitionLabel(targetCompetition)}“ wird durch den Check-in ersetzt. Fortfahren?`))return;
  state.activeCompetition=targetCompetition;loadActiveCompetition();
  const scheduledSeason=seasonStore.seasons.find(season=>String(season.id)===String(event.seasonId||''))||seasonForScheduledEvent(event.id),eventName=event.eventName||event.name||'Dartturnier';
  replaceActiveCompetition({...emptyCompetition(),players:players.map(item=>item.name),playerIds:Object.fromEntries(players.filter(item=>item.id).map(item=>[item.name,profilePlayerId(item.id)])),playerProfileIds:Object.fromEntries(players.filter(item=>item.id).map(item=>[item.name,item.id])),scheduledEventId:event.id||'',scheduledSeasonId:scheduledSeason?.id||'',scheduledStandalone:!!event.standalone||!event.seasonId,scheduledCompetition:event.competition||targetCompetition,scheduledViaTournamentManagement:true,settings:{eventName,competition:targetCompetition}});state.eventName=eventName;save();
  $('#tournamentName').value=state.eventName;applyTournamentDefaults();renderPlayers();adminCheckInEventKey='';showTournament();document.querySelector('#setupSection')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function publicEventRow(tournament,status){
  const results=tournament.results||[],matches=tournament.matches||[],winner=tournament.winner||[...results].sort((a,b)=>(a.rank||999)-(b.rank||999))[0]?.name||'';
  const participantText=(tournament.participantCount||tournament.players?.length)?`${tournament.participantCount||tournament.players.length} Teilnehmende`:'';
  const meta=[tournament.seasonName,tournament.competitionLabel,participantText,matches.length?`${matches.length} Spiele`:''].filter(Boolean).join(' · ');
  const locked=status!=='future'&&!canViewSeasonStandings(seasonForPublicTournament(tournament)),key=esc(tournament._publicKey||tournament.id||''),share=status==='future'?`<div class="public-event-share"><button class="secondary" type="button" data-public-calendar="${key}" aria-label="${esc(tournament.name||'Termin')} zum Kalender hinzufügen">Kalender</button><button class="secondary whatsapp-share" type="button" data-public-whatsapp="${key}" aria-label="${esc(tournament.name||'Termin')} über WhatsApp teilen">WhatsApp</button></div>`:locked?'':`<button class="secondary result-graphic-button" type="button" data-result-graphic="${key}">Ergebnisgrafik</button>`,remove=isAdmin()?`<button class="danger public-delete-event" type="button" data-public-delete="${key}">Löschen</button>`:'';
  const startTime=publicStartTime(tournament),rawTime=tournament.startTime||tournament.settings?.startTime||tournament.settings?.start||'',dateTime=[tournament.date,rawTime].filter(Boolean).join('T');
  return `<article class="public-event-row${locked?' is-result-locked':''}"><time datetime="${esc(dateTime)}"><span>${publicDate(tournament.date)}</span>${startTime?`<b>${esc(startTime)}</b>`:''}</time><div><h3>${esc(tournament.name||tournament.eventName||'Spieltag')}</h3><p>${esc(meta||'Weitere Angaben folgen')}</p>${status==='future'?registrationHtml(tournament):locked?`<small class="public-result-lock-note">${esc(SEASON_STANDINGS_LOCK_MESSAGE)}</small>`:''}</div><div class="public-event-result"><strong>${status==='future'?'Geplant':locked?'Endstand gesperrt':winner?`Sieger: ${esc(winner)}`:'Beendet'}</strong>${share}${remove}</div></article>`;
}
async function createPublicSchedule(){
  if(!isAdmin())return;
  const form=$('#publicScheduleForm'),submit=form?.querySelector('button[type="submit"]'),status=$('#publicScheduleStatus'),setStatus=(message,type='')=>{if(!status)return;status.textContent=message;status.className=`public-schedule-status ${type?`is-${type}`:''}`},season=seasonStore.seasons.find(item=>item.id===$('#publicScheduleSeason')?.value),date=$('#publicScheduleDate')?.value,startTime=$('#publicScheduleTime')?.value,name=$('#publicScheduleName')?.value.trim(),competition=$('#publicScheduleCompetition')?.value||'open';
  if(!date||!startTime||!name){appAlert('Bitte Datum, Startzeit und Bezeichnung vollständig eintragen.');return}
  if(season&&seasonCompetition(season)!=='open'&&seasonCompetition(season)!==normalizedCompetition(competition)&&!await appConfirm(`Der angekündigte Bewerb ist „${competitionLabel(competition)}“, die gewählte Wertung aber ausdrücklich „${competitionLabel(seasonCompetition(season))}“. Trotzdem so speichern?`))return;
  if(date<todayIso()&&!await appConfirm('Das gewählte Datum liegt in der Vergangenheit. Termin trotzdem eintragen?'))return;
  const label=competition==='women'?'Damen':competition==='men'?'Herren':'Offen',standalone=!season,record={id:`scheduled-${Date.now()}`,seasonId:season?.id||'',standalone,name,date,startTime,competition,competitionLabel:label,planned:true,players:[],participantCount:0,matches:[],results:[],createdAt:new Date().toISOString()},syncKey=season?SEASON_KEY:TOURNAMENT_HISTORY_KEY;
  if(season){season.tournaments=season.tournaments||[];season.tournaments.push(record);season.tournaments.sort((a,b)=>(a.date||'').localeCompare(b.date||''));saveSeason(season)}else{const history=loadTournamentHistory();history.push(record);persistTournamentHistory(history)}renderPublicHome();if(submit)submit.disabled=true;setStatus('Termin wird online gespeichert und anschließend kontrolliert …','saving');
  try{
    await T20Cloud.syncAll({keys:[syncKey]});
    const online=await scheduledTournamentExistsOnline(record.id);
    if(!online)throw new Error('Der Termin wurde von Supabase nicht bestätigt.');
    setStatus(`✓ Online bestätigt: ${name} am ${publicDate(date)}${standalone?' · ohne Saisonwertung':''}.`,'success');$('#publicScheduleName').value='';appAlert(standalone?'Der Termin wurde als eigenständiges Turnier gespeichert. Er erscheint öffentlich, kann Anmeldungen annehmen und wird später nicht in eine Saisonwertung übernommen.':'Der zukünftige Spieltermin wurde online gespeichert und nochmals erfolgreich aus Supabase gelesen.');renderTournamentManagement();
  }catch(error){
    T20Cloud.pendingKeys.add(syncKey);T20Cloud.pendingSync=true;nativeSetItem('triple20_pending_sync','1');nativeSetItem('triple20_pending_keys',JSON.stringify([...T20Cloud.pendingKeys]));setSyncStatus('Termin nur lokal – Online-Speicherung fehlt','conflict');setStatus(`NICHT ONLINE GESPEICHERT: ${error?.message||'Supabase hat den Termin nicht bestätigt.'} Diese Seite geöffnet lassen und nicht abmelden.`,'error');appAlert('ACHTUNG: Der Termin ist nur auf diesem Gerät gespeichert und noch nicht online veröffentlicht. Bitte die Seite geöffnet lassen, Internetverbindung prüfen und nicht abmelden.');
  }finally{if(submit)submit.disabled=false}
}
async function deletePublicTournament(key){
  if(!isAdmin()||!key)return;
  const record=publicTournamentRecords().find(item=>item._publicKey===key);if(!record)return;
  if(!await appConfirm(`„${record.name||record.eventName||'Spieltag'}“ vom ${publicDate(record.date)} wirklich löschen? Der Eintrag wird auch aus Saison und Turnierhistorie entfernt.`))return;
  const registrationKey=registrationEventKey(record);if(T20Cloud.client&&registrationKey)try{const {error}=await T20Cloud.client.from('triple20_tournament_registrations').delete().eq('event_key',registrationKey);if(error)throw error}catch(error){console.warn('Teilnahmeanmeldungen konnten beim Löschen des Termins nicht entfernt werden:',error)}
  const same=item=>publicTournamentKey(item)===key;
  seasonStore.deletedTournamentIds=seasonStore.deletedTournamentIds||{};
  for(const season of seasonStore.seasons||[]){const removed=(season.tournaments||[]).filter(same);for(const item of removed)if(item.id)seasonStore.deletedTournamentIds[item.id]=new Date().toISOString();season.tournaments=(season.tournaments||[]).filter(item=>!same(item));if(removed.length)season.updatedAt=new Date().toISOString()}
  persistSeasons();persistTournamentHistory(loadTournamentHistory().filter(item=>!same(item)));renderSeasonView();renderPublicHome();await T20Cloud.syncAll();if(T20Cloud.pendingSync)appAlert('Der Eintrag wurde lokal gelöscht, konnte aber noch nicht mit der Cloud synchronisiert werden. Bitte noch nicht abmelden.');
}
function liveCompetitionCards(){
  ensureTournamentDayState();
  return ['men','women'].map(key=>({key,label:competitionLabel(key),data:key===state.activeCompetition?competitionSnapshot(state):competitionSnapshot(state.competitions?.[key]||emptyCompetition())})).filter(item=>competitionIsLive(item.data)).map(item=>{
    const tournament=item.data,done=(tournament.matches||[]).filter(match=>match.sa!==null).length,total=(tournament.matches||[]).length,next=(tournament.matches||[]).filter(match=>match.sa===null&&match.b!=='Freilos').slice(0,3);
    return `<article class="public-live-card"><div><span class="live-dot">LIVE</span><small>${esc(item.label)}</small></div><h3>${esc(competitionEventName(tournament)||tournament.settings?.name||'Vereinsturnier')}</h3><p>${done} von ${total} Spielen beendet · ${tournament.players?.length||0} Teilnehmende</p><div class="public-live-matches">${next.map(match=>`<div><span>${esc(match.a)}</span><b>vs.</b><span>${esc(match.b)}</span></div>`).join('')||'<p>Alle Spiele dieses Bewerbs sind beendet.</p>'}</div><button class="secondary public-live-open" type="button" data-open-live="${item.key}">Vollständigen Spielplan öffnen</button></article>`;
  });
}
function publicHomeWinner(record={}){
  const winner=tournamentRecordChampion(record);
  if(!winner)return null;
  const result=(record.results||[]).find(row=>row.playerId===record.winnerId||normalizedPlayerName(row.name)===normalizedPlayerName(record.winner||winner)),playerId=record.winnerId||result?.playerId||mappedPlayerValue(record.playerIds,winner),profileId=mappedPlayerValue(record.playerProfileIds,record.winner)||mappedPlayerValue(record.playerProfileIds,winner)||result?.profileId||'',reference=profileId||playerId||winner,profile=findPublicPlayer(reference),photo=profileId?memberAvatarUrl(profileId):'';
  return{name:winner,playerId,profileId,reference:profile?.reference||'',photo,label:record.competitionLabel||(/^women$/.test(record.competition)?'Damen':/^men$/.test(record.competition)?'Herren':'Vereinsmeisterschaft')};
}
function homeNewsItems(){
  const news=appSettings.home?.news||defaultSettings.home.news,extras=Array.isArray(news.items)?news.items.filter(item=>item&&item.id):[];
  return[{id:'main',eyebrow:news.eyebrow||'DCA NEWS',title:news.title||'',text:news.text||'',imagePath:news.imagePath||'',imagePosition:news.imagePosition||'center',imageLayout:news.imageLayout||'right',profileIds:[]},...extras.map(item=>({id:String(item.id),eyebrow:item.eyebrow||'DCA NEWS',title:item.title||'',text:item.text||'',imagePath:item.imagePath||'',imagePosition:item.imagePosition||'center',imageLayout:item.imageLayout||'right',profileIds:Array.isArray(item.profileIds)?[...new Set(item.profileIds.filter(Boolean).map(String))].slice(0,2):[]}))]
}
function homeNewsItem(id=editingHomeNewsId){return homeNewsItems().find(item=>item.id===id)||homeNewsItems()[0]}
function updateHomeNewsItem(id,patch={},persist=false){
  const news=appSettings.home?.news||defaultSettings.home.news;
  if(id==='main')appSettings=mergeSettings(appSettings,{home:{news:{...news,...patch,items:Array.isArray(news.items)?news.items:[]}}});
  else appSettings=mergeSettings(appSettings,{home:{news:{...news,items:(Array.isArray(news.items)?news.items:[]).map(item=>String(item.id)===String(id)?{...item,...patch}:item)}}});
  if(persist)saveSettings();return homeNewsItem(id)
}
function homeNewsImageUrl(id='main'){return T20Cloud.homeNewsImageSignedUrls?.[id]||(id==='main'?T20Cloud.homeNewsImageSignedUrl:'')||''}
function homeNewsSelectedProfiles(news={}){return(news.profileIds||[]).map(id=>{const member=(T20Cloud.publicMembers||[]).find(item=>String(item.id)===String(id))||(T20Cloud.adminProfiles||[]).find(item=>String(item.id)===String(id));if(!member)return null;return{id:String(member.id),name:member.nickname||member.display_name||'Mitglied',photo:memberAvatarUrl(member.id)}}).filter(Boolean).slice(0,2)}
function publicHomeFeatureHtml(past=[],news=homeNewsItems()[0],slideCount=1){
  const custom=news.id!=='main',edit=isFullAdmin()?`<button class="secondary public-home-edit public-news-edit" type="button" data-home-editor="news" data-home-news-id="${esc(news.id)}">Bearbeiten</button>`:'',championships=past.filter(record=>/vereinsmeister/i.test(`${record.name||''} ${record.eventName||''}`)),source=championships[0]||past[0],controls=slideCount>1?`<div class="public-news-slider-controls" aria-label="DCA News wechseln"><button type="button" data-news-slide="prev" aria-label="Vorherige News">‹</button><div>${homeNewsItems().map((item,index)=>`<button type="button" data-news-slide="${index}" class="${index===publicHomeNewsIndex?'active':''}" aria-label="News ${index+1} anzeigen"></button>`).join('')}</div><button type="button" data-news-slide="next" aria-label="Nächste News">›</button></div>`:'';
  if(custom){const title=news.title||'Aktuelles aus dem DCA',summary=news.text||'Neuigkeiten aus unserem Vereinsleben.',profiles=homeNewsSelectedProfiles(news),visual=profiles.length?`<div class="public-feature-winners custom-news-profiles">${profiles.map(profile=>{const avatar=profile.photo?`<img src="${esc(profile.photo)}" alt="Profilfoto von ${esc(profile.name)}">`:`<span>${esc(profile.name.charAt(0).toUpperCase())}</span>`;return`<button type="button" data-public-player="${esc(profile.id)}" aria-label="Profil von ${esc(profile.name)} öffnen">${avatar}<small>PROFIL</small><b>${esc(profile.name)}</b></button>`}).join('')}</div>`:`<div class="public-feature-mark" aria-hidden="true"><i></i><strong>DCA</strong><small>ACHENSEE</small></div>`;return `${edit}<div class="public-feature-copy"><span>${esc(news.eyebrow||'DCA NEWS')}</span><h1 id="publicHomeTitle">${esc(title)}</h1><p>${esc(summary)}</p></div>${visual}<button class="primary public-feature-action" type="button" data-public-nav="ergebnisse">ERGEBNISSE ENTDECKEN <b>→</b></button>${controls}`}
  if(!source){const title=news.title||'Willkommen beim Dartclub Achensee',summary=news.text||'Turniere, Ergebnisse und Vereinsleben an einem Ort.';return `${edit}<div class="public-feature-copy"><span>${esc(news.eyebrow||'DCA NEWS')}</span><h1 id="publicHomeTitle">${esc(title)}</h1><p>${esc(summary)}</p></div><div class="public-feature-mark" aria-hidden="true"><i></i><strong>DCA</strong><small>ACHENSEE</small></div><button class="primary public-feature-action" type="button" data-public-nav="ergebnisse">ERGEBNISSE ENTDECKEN <b>→</b></button>${controls}`}
  const sameEvent=championships.filter(record=>record.date===source.date).slice(0,2),featureRecords=sameEvent.length?sameEvent:[source],winners=featureRecords.map(publicHomeWinner).filter(Boolean),year=(source.date||'').slice(0,4)||new Date().getFullYear(),isChampionship=championships.includes(source),title=news.title||(isChampionship?`Unsere Vereinsmeister ${year}`:(source.name||source.eventName||'Aktuelles aus dem DCA')),summary=news.text||(isChampionship?'Die Titel sind entschieden.':`${publicDate(source.date)}${source.winner?` · Sieger: ${tournamentPlayerName(source,source.winner)}`:''}`);
  const winnerHtml=winners.length?`<div class="public-feature-winners">${winners.map(winner=>{const avatar=winner.photo?`<img src="${esc(winner.photo)}" alt="Profilfoto von ${esc(winner.name)}">`:`<span>${esc(winner.name.charAt(0).toUpperCase())}</span>`,content=`${avatar}<small>${esc(winner.label)}</small><b>${esc(winner.name)}</b>`;return winner.reference?`<button type="button" data-public-player="${esc(winner.reference)}" aria-label="Profil von ${esc(winner.name)} öffnen">${content}</button>`:`<div>${content}</div>`}).join('')}</div>`:`<div class="public-feature-mark" aria-hidden="true"><i></i><strong>DCA</strong><small>ACHENSEE</small></div>`;
  return `${edit}<div class="public-feature-copy"><span>${esc(news.eyebrow||(isChampionship?'DCA NEWS':'AKTUELL'))}</span><h1 id="publicHomeTitle">${esc(title)}</h1><p>${esc(summary)}</p></div>${winnerHtml}<button class="primary public-feature-action" type="button" data-public-results="${isChampionship?'standalone':'leagues'}"${isChampionship&&source.id?` data-results-tournament="${esc(source.id)}"`:''}>ERGEBNISSE ANSEHEN <b>→</b></button>${controls}`;
}
function publicHomeNextEventsHtml(upcoming=[]){
  const info=appSettings.home?.info||defaultSettings.home.info;if(info.mode==='custom'){const items=Array.isArray(info.items)?info.items.filter(item=>item?.title).slice(0,4):[];return items.length?items.map((item,index)=>`<article class="public-info-item"><span class="public-info-marker">${String(index+1).padStart(2,'0')}</span><div><strong>${esc(item.title)}</strong>${item.detail?`<span>${esc(item.detail)}</span>`:''}</div></article>`).join(''):'<p class="public-next-empty">Noch kein Hinweis eingetragen.</p>'}
  if(!upcoming.length)return '<p class="public-next-empty">Derzeit ist kein weiterer Vereinstermin eingetragen.</p>';
  return upcoming.slice(0,2).map(item=>`<article><time datetime="${esc(item.date||'')}"><b>${publicDate(item.date)}</b>${publicStartTime(item)?`<small>${esc(publicStartTime(item))}</small>`:''}</time><div><strong>${esc(item.name||item.eventName||'Spieltag')}</strong><span>${esc([item.competitionLabel,item.seasonName].filter(Boolean).join(' · ')||'DCA Termin')}</span></div><i aria-hidden="true">→</i></article>`).join('');
}
function renderHomeNewsImage(news=homeNewsItem(homeNewsItems()[publicHomeNewsIndex]?.id)){const feature=$('#publicFeatureStory');if(!feature)return;const image=homeNewsImageUrl(news.id),position=['top','bottom'].includes(news.imagePosition)?news.imagePosition:'center',layout=news.imageLayout==='full'?'full':'right';feature.classList.toggle('has-background-image',!!image);feature.classList.toggle('image-layout-right',!!image&&layout==='right');feature.classList.toggle('custom-news-image',news.id!=='main');feature.style.backgroundPosition=`center ${position}`;feature.style.setProperty('--home-news-position',position);feature.style.setProperty('--home-news-image',image?`url(${JSON.stringify(image)})`:'none')}
function stopHomeNewsSlider(){if(publicHomeNewsTimer){clearInterval(publicHomeNewsTimer);publicHomeNewsTimer=null}}
function renderHomeNewsSlide(){const feature=$('#publicFeatureStory');if(!feature)return;const items=homeNewsItems();publicHomeNewsIndex=Math.max(0,Math.min(items.length-1,publicHomeNewsIndex));const news=items[publicHomeNewsIndex];feature.innerHTML=publicHomeFeatureHtml(publicHomeNewsPast,news,items.length);renderHomeNewsImage(news)}
function startHomeNewsSlider(){stopHomeNewsSlider();const items=homeNewsItems();if(items.length<2||$('#publicHomeSection')?.classList.contains('hidden'))return;publicHomeNewsTimer=setInterval(()=>{publicHomeNewsIndex=(publicHomeNewsIndex+1)%homeNewsItems().length;renderHomeNewsSlide()},9000)}
function changeHomeNewsSlide(direction){const count=homeNewsItems().length;if(count<2)return;const index=Number(direction);publicHomeNewsIndex=Number.isFinite(index)?Math.max(0,Math.min(count-1,index)):direction==='prev'?(publicHomeNewsIndex-1+count)%count:(publicHomeNewsIndex+1)%count;renderHomeNewsSlide();startHomeNewsSlider()}
function renderPublicHome({refreshRegistrations=true}={}){
  const status=$('#publicHomeStatus');if(!status)return;
  const records=publicTournamentRecords(),today=todayIso(),upcoming=records.filter(item=>item.planned&&item.date>=today),past=records.filter(item=>!item.planned).sort((a,b)=>(b.date||'').localeCompare(a.date||'')),live=liveCompetitionCards();
  status.innerHTML=T20Cloud.authResolved?'':'<span class="public-loading">Aktuelle Vereinsdaten werden geladen …</span>';
  publicHomeNewsPast=past;publicHomeNewsIndex=Math.min(publicHomeNewsIndex,homeNewsItems().length-1);renderHomeNewsSlide();startHomeNewsSlider();
  const info=appSettings.home?.info||defaultSettings.home.info;$('#publicInfoEyebrow').textContent=info.eyebrow||'TERMINE';$('#publicNextTitle').textContent=info.title||'Als Nächstes';document.querySelector('.public-next-panel [data-home-editor]')?.classList.toggle('hidden',!isFullAdmin());
  $('#publicNextEvents').innerHTML=publicHomeNextEventsHtml(upcoming);
  const liveGames=$('#publicLiveGames'),liveDetails=$('#publicLiveDetails'),liveTournamentData=liveTvCompetitions();liveDetails?.classList.toggle('is-empty-live',!live.length);liveDetails?.classList.toggle('hidden',!live.length);liveGames.innerHTML=live.join('');
  $('#publicLivePulse')?.classList.toggle('is-live',!!live.length);$('#publicLiveTitle').textContent=live.length?`${live.length===1?'Ein Turnier':'Zwei Turniere'} läuft live`:'Heute kein Turnier';
  const openMatches=liveTournamentData.reduce((sum,item)=>sum+(item.tournament.matches||[]).filter(match=>match.sa===null&&match.b!=='Freilos').length,0),next=upcoming[0];$('#publicLiveSummary').textContent=live.length?`${openMatches} offene ${openMatches===1?'Paarung':'Paarungen'} · aktuelle Spielstände werden automatisch angezeigt`:next?`Nächster Termin: ${next.name||next.eventName||'Spieltag'} · ${publicDate(next.date)}${publicStartTime(next)?` · ${publicStartTime(next)}`:''}`:'Sobald ein Turnier startet, erscheint es hier automatisch.';
  const visibleUpcoming=upcoming.slice(0,3),upcomingMore=upcoming.length>3?`<p class="public-list-more">+ ${upcoming.length-3} weitere ${upcoming.length-3===1?'Termin':'Termine'} in der Turnierleitung</p>`:'';$('#publicUpcomingGames').innerHTML=visibleUpcoming.map(item=>publicEventRow(item,'future')).join('')+upcomingMore||'<div class="public-empty"><p>Derzeit sind keine zukünftigen Spieltage eingetragen.</p></div>';
  $('#tyrolDartsAd')?.classList.toggle('hidden',appSettings.tyrolDartsAdEnabled===false);
  const visiblePast=past.slice(0,2);
  $('#publicPastGames').innerHTML=visiblePast.map(item=>publicEventRow(item,'past')).join('')||'<div class="public-empty"><p>Noch keine vergangenen Spiele vorhanden.</p></div>';
  const homeSeasons=[...(seasonStore.seasons||[])].sort((a,b)=>Number(!!a.archived)-Number(!!b.archived)||String(b.endDate||'').localeCompare(String(a.endDate||''))).slice(0,2);$('#publicSeasonRankings').innerHTML=homeSeasons.map(season=>{const rows=visibleSeasonStandings(season),locked=!canViewSeasonStandings(season);return `<article class="public-ranking-card${locked?' is-locked':''}"><div><span>${locked?'ENDSTAND GESPERRT':season.archived?'ARCHIV':'SAISON'}</span><h3>${esc(season.name)}</h3><small>${publicDate(season.startDate)} – ${publicDate(season.endDate)}</small></div>${locked?`<p>${esc(SEASON_STANDINGS_LOCK_MESSAGE)}</p>`:rows.length?`<ol>${rows.slice(0,3).map(row=>`<li><button class="public-player-link" type="button" data-public-player="${esc(playerProfileReference(row))}">${esc(row.name)}</button><b>${row.cleanPoints} Pkt.</b></li>`).join('')}</ol>`:'<p>Noch keine Wertung vorhanden.</p>'}<button class="link-btn" type="button" data-season-open="${esc(season.id)}">${locked?'Hinweis öffnen':'Rangliste öffnen'}</button></article>`}).join('')||'<div class="public-empty"><p>Noch keine Saisonranglisten vorhanden.</p></div>';
  if(refreshRegistrations)loadTournamentRegistrations();
}

const TV_AUTO_MATCHES_DURATION=30000,TV_AUTO_STANDARD_DURATION=20000;
let tvRefreshTimer=null,tvWakeLock=null,tvDisplayReturnTimer=null;
function tvPublicUrl(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('bereich','tv');return url.href}
function tvCompetitionData(key){ensureTournamentDayState();return key===state.activeCompetition?competitionSnapshot(state):competitionSnapshot(state.competitions?.[key]||emptyCompetition())}
function tvModeLabel(settings={}){return settings.mode==='swiss'?'Schweizer System':settings.mode==='roundrobin'?'Jeder gegen jeden':settings.mode==='doublesmix'?'Doppel-Mix · Einzelwertung':settings.mode==='doubleslottery'?'Doppel-Lotterie · Einzelwertung':settings.mode==='double'?'Doppel-K.-o.':settings.mode==='knockout'?'K.-o.':'Turnier'}
function normalizedTvDisplayMode(mode=state.tvDisplayMode){if(['finals','winners','losers'].includes(mode))return'bracket';return['matches','standings','bracket','auto'].includes(mode)?mode:'matches'}
function tvCompetitionPaused(key){return !!state.tvPausedCompetitions?.[key]}
function liveTvCompetitions(){return['men','women'].map(key=>({key,tournament:tvCompetitionData(key)})).filter(item=>competitionIsLive(item.tournament))}
function tvHasElimination(live=liveTvCompetitions()){return live.some(({tournament})=>['knockout','double'].includes(tournament.settings?.mode))}
function tvHasDoubleElimination(live=liveTvCompetitions()){return live.some(({tournament})=>tournament.settings?.mode==='double')}
function tvTournamentHasElimination(tournament){return['knockout','double'].includes(tournament?.settings?.mode)}
function tvTournamentHasDoubleElimination(tournament){return tournament?.settings?.mode==='double'}
function tvDisplayCompetitionKey(live=liveTvCompetitions()){
  const stored=state.tvDisplayCompetition;if(live.some(item=>item.key===stored))return stored;
  const active=state.activeCompetition||'men';return live.some(item=>item.key===active)?active:(live[0]?.key||active);
}
function tvDisplayCompetition(live=liveTvCompetitions()){const key=tvDisplayCompetitionKey(live);return live.find(item=>item.key===key)||null}
function tvAlternateMode(tournament){return tvTournamentHasElimination(tournament)?'bracket':'standings'}
function tvAutoState(now=Date.now()){
  const live=liveTvCompetitions(),target=tvDisplayCompetition(live)?.tournament,elapsed=Math.max(0,now-Number(state.tvDisplayChangedAt||now));
  if(tvTournamentHasDoubleElimination(target)){
    const cycle=TV_AUTO_MATCHES_DURATION+TV_AUTO_MATCHES_DURATION,position=elapsed%cycle;
    return position<TV_AUTO_MATCHES_DURATION?{mode:'matches',page:0,nextIn:TV_AUTO_MATCHES_DURATION-position}:{mode:'bracket',page:0,nextIn:cycle-position};
  }
  const cycle=TV_AUTO_MATCHES_DURATION+TV_AUTO_STANDARD_DURATION,position=elapsed%cycle;return position<TV_AUTO_MATCHES_DURATION?{mode:'matches',page:0,nextIn:TV_AUTO_MATCHES_DURATION-position}:{mode:tvAlternateMode(target),page:0,nextIn:cycle-position};
}
function effectiveTvDisplayMode(now=Date.now()){
  const mode=normalizedTvDisplayMode(),target=tvDisplayCompetition()?.tournament;
  if(mode==='bracket'&&!tvTournamentHasElimination(target))return'matches';
  if(mode==='standings'&&tvTournamentHasElimination(target))return'matches';
  if(['matches','standings','bracket','finals','winners','losers'].includes(mode))return mode;
  if(mode==='auto')return tvAutoState(now).mode;
  return'matches';
}
function tvDoubleSidePageCount(tournament,kind){const plan=tournament?.settings?.doubleKoPlan;if(!plan)return 1;const stages=new Set(plan.nodes.filter(node=>node.bracket===kind).map(node=>node.stage));return Math.max(1,Math.ceil(stages.size/(kind==='upper'?6:5)))}
function tvBracketPageInfo(mode=effectiveTvDisplayMode()){
  const kind=mode==='winners'?'upper':mode==='losers'?'lower':'';if(!kind)return{kind:'',page:0,pages:1};
  const target=tvDisplayCompetition(),doubles=target?.tournament.settings?.mode==='double'?[target]:[],pages=Math.max(1,...doubles.map(({tournament})=>tvDoubleSidePageCount(tournament,kind))),stored=normalizedTvDisplayMode()==='auto'&&tvAutoState().mode===mode?tvAutoState().page:Number(state.tvBracketPages?.[kind]||0),page=Math.max(0,Math.min(pages-1,stored));
  return{kind,page,pages};
}
function renderTvDisplayControls(){
  const controls=$('#tvDisplayControls');if(!controls)return;
  const live=liveTvCompetitions(),activeTournament=state.started?{key:state.activeCompetition||'men',tournament:competitionSnapshot(state)}:null,controlCompetitions=live.length?live:(activeTournament?[activeTournament]:[]),controlTarget=controlCompetitions.find(item=>item.key===(state.activeCompetition||'men'))||controlCompetitions[0],hasLive=controlCompetitions.length>0,hasElimination=tvTournamentHasElimination(controlTarget?.tournament),hasDouble=tvTournamentHasDoubleElimination(controlTarget?.tournament);controls.classList.toggle('hidden',!isAdmin()||!hasLive);if(!isAdmin()||!hasLive)return;
  const standingsButton=controls.querySelector('[data-tv-display="standings"]'),bracketButton=controls.querySelector('[data-tv-display="bracket"]'),targetLabel=competitionLabel(controlTarget?.key);
  standingsButton?.classList.toggle('hidden',hasElimination);if(standingsButton)standingsButton.textContent=`Top 10 ${targetLabel}`;
  bracketButton?.classList.toggle('hidden',!hasElimination);if(bracketButton)bracketButton.textContent=`Turnierbaum ${targetLabel}`;
  controls.querySelector('[data-tv-display="winners"]')?.classList.add('hidden');
  controls.querySelector('[data-tv-display="losers"]')?.classList.add('hidden');
  const stored=normalizedTvDisplayMode(),active=stored==='auto'?'auto':effectiveTvDisplayMode(),sameTarget=tvDisplayCompetitionKey(live)===controlTarget?.key;controls.querySelectorAll('[data-tv-display]').forEach(button=>button.classList.toggle('active',button.dataset.tvDisplay===active&&(!['standings','bracket'].includes(active)||sameTarget)));
  const pauseControls=$('#tvCompetitionPauseControls'),pauseKeys=live.length===2?live.map(item=>item.key):live.filter(item=>tvCompetitionPaused(item.key)).map(item=>item.key),showPause=pauseKeys.length>0;pauseControls?.classList.toggle('hidden',!showPause);pauseControls?.querySelectorAll('[data-tv-pause]').forEach(button=>{const key=button.dataset.tvPause,paused=tvCompetitionPaused(key);button.classList.toggle('hidden',!pauseKeys.includes(key));button.classList.toggle('is-paused',paused);button.textContent=`${competitionLabel(key)} ${paused?'fortsetzen':'pausieren'}`});
  const info=tvBracketPageInfo(active),pageControls=$('#tvBracketPageControls'),pageLabel=$('#tvBracketPageLabel');pageControls?.classList.toggle('hidden',!info.kind||info.pages<=1);if(pageLabel)pageLabel.textContent=`Seite ${info.page+1}/${info.pages}`;
  const help=$('#tvDisplayHelp');if(help){const viewHelp=hasDouble?'Automatisch wechselt zwischen vier aktuellen Spielen und dem vollständigen Turnierbaum.':hasElimination?'Die Rasteransicht bleibt bis zum manuellen Umschalten sichtbar.':'Top 10 bleibt bis zum manuellen Umschalten sichtbar.',boardHelp=showPause?' Freie Boards werden automatisch belegt; das kleinere Turnier wird bevorzugt. Laufende Spiele bleiben auch bei einer Pause sichtbar.':'';help.textContent=viewHelp+boardHelp}
}
function scheduleTvDisplayReturn(){
  clearTimeout(tvDisplayReturnTimer);tvDisplayReturnTimer=null;
  if(normalizedTvDisplayMode()!=='auto')return;
  const remaining=Math.max(50,tvAutoState().nextIn);
  tvDisplayReturnTimer=setTimeout(()=>{renderTvDisplayControls();renderTvView();scheduleTvDisplayReturn()},remaining+50);
}
async function setTvDisplayMode(mode){
  if(!isAdmin())return;const live=liveTvCompetitions(),active=state.activeCompetition||'men';state.tvDisplayMode=normalizedTvDisplayMode(mode);state.tvDisplayCompetition=live.some(item=>item.key===active)?active:(live[0]?.key||active);state.tvDisplayChangedAt=Date.now();delete state.tvDisplayUntil;persistTvSettings({queueCloud:false});renderTvDisplayControls();renderTvView();scheduleTvDisplayReturn();await T20Cloud.syncAll({force:true,keys:[TV_SETTINGS_KEY]});
}
async function setTvCompetitionPaused(key){
  if(!isAdmin()||!['men','women'].includes(key))return;state.tvPausedCompetitions={...(state.tvPausedCompetitions||{}),[key]:!tvCompetitionPaused(key)};tvBoardAssignments(liveTvCompetitions());persistTvSettings({queueCloud:false});renderTvDisplayControls();renderTvView();await T20Cloud.syncAll({force:true,keys:[TV_SETTINGS_KEY]});
}
async function changeTvBracketPage(direction){
  if(!isAdmin())return;const mode=effectiveTvDisplayMode(),info=tvBracketPageInfo(mode);if(!info.kind||info.pages<=1)return;state.tvBracketPages={...(state.tvBracketPages||{}),[info.kind]:(info.page+Number(direction)+info.pages)%info.pages};persistTvSettings({queueCloud:false});renderTvDisplayControls();renderTvView();await T20Cloud.syncAll({force:true,keys:[TV_SETTINGS_KEY]});
}
function tvStandingsHtml(tournament){
  const rows=standingsFor(tournament.players||[],tournament.matches||[]).slice(0,10);if(!rows.length)return'<div class="tv-empty"><div><b>Noch keine Tabelle</b><span>Sobald Spieler eingetragen sind, erscheint hier die Rangliste.</span></div></div>';
  return `<div class="tv-table-wrap"><table class="tv-standings"><thead><tr><th>#</th><th>Spieler</th><th>Sp.</th><th>S</th><th>N</th><th>Legs</th><th>Pkt.</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td class="tv-rank">${index+1}</td><td>${esc(row.name)}</td><td>${row.p}</td><td>${row.w}</td><td>${row.l}</td><td>${row.lf}:${row.la}</td><td><b>${row.pts}</b></td></tr>`).join('')}</tbody></table></div>`;
}
function tvBracketGame(match,label='Noch offen'){
  if(!match)return`<div class="tv-bracket-game placeholder"><span>${esc(label)}</span><b>–</b><span>${esc(label)}</span><b>–</b></div>`;
  if(match.automatic)return `<div class="tv-bracket-game automatic"><span>${esc(match.a)}</span><b>→</b><span>Freilos</span><b>–</b></div>`;
  const done=match.sa!==null,winner=done?(match.sa>match.sb?'a':'b'):'';
  return `<div class="tv-bracket-game ${done?'done':'open'}"><span class="${winner==='a'?'is-winner':''}">${esc(match.a||label)}</span><b>${done?match.sa:'–'}</b><span class="${winner==='b'?'is-winner':''}">${esc(match.b||label)}</span><b>${done?match.sb:'–'}</b></div>`;
}
function tvBracketRounds(matches=[],kind='upper',stageCount=0,playerCount=0){
  const filtered=matches.filter(match=>match.bracket===kind),roundNumbers=filtered.some(match=>match.nodeId)?Array.from({length:stageCount},(_,i)=>i+1):[...new Set(filtered.map(match=>+match.round||1))].sort((a,b)=>a-b),count=Math.max(stageCount,roundNumbers.length);
  return Array.from({length:count},(_,index)=>{const round=roundNumbers[index],planned=kind==='lower'?Math.max(1,2**(Math.max(1,Math.ceil(Math.log2(playerCount)))-1-Math.ceil((index+1)/2))):Math.max(1,Math.ceil(playerCount/2**(index+1)));return{round,label:kind==='lower'?`Verliererrunde ${index+1}`:index===count-1?'Finale':`Runde ${index+1}`,matches:round===undefined?[]:filtered.filter(match=>(+match.round||1)===round),planned}});
}
function tvBracketColumns(rounds,{finals=false,limit=5}={}){
  // Future placeholders and automatic byes are not tournament progress.
  // Keep the earliest unfinished stage visible even when another branch is ahead.
  const firstPending=rounds.findIndex(stage=>stage.matches.some(match=>match.sa===null&&!match.automatic));
  const lastActual=rounds.reduce((last,stage,index)=>stage.matches.some(match=>!match.preview&&!match.automatic)?index:last,-1);
  const focus=firstPending>=0?firstPending:lastActual,start=focus<0?0:Math.max(0,Math.min(Math.max(0,rounds.length-limit),focus-1)),visible=finals?rounds.slice(-2):rounds.slice(start,start+limit);
  return visible.map(stage=>{
    const placeholder=stage.label==='Finale'?'Finalist':stage.label.startsWith('Verliererrunde')?'Teilnehmer aus Vorrunde':'Sieger aus Vorrunde';
    const games=stage.matches.length?stage.matches.filter(match=>!(match.automatic&&match.a==='Freilos'&&match.b==='Freilos')):Array.from({length:stage.planned||1},()=>null);
    const pageSize=typeof window!=='undefined'&&window.innerHeight<900?4:6,pages=Math.max(1,Math.ceil(games.length/pageSize)),page=Math.floor(Date.now()/15000)%pages,shown=games.slice(page*pageSize,(page+1)*pageSize);
    return `<section class="tv-bracket-round ${games.length>2?'dense':''}"><h3>${esc(stage.label)}${pages>1?` <small>· ${page+1}/${pages}</small>`:''}</h3><div>${shown.length?shown.map(match=>tvBracketGame(match,placeholder)).join(''):'<p class="tv-bracket-empty">Keine Begegnung</p>'}</div>${pages>1?'<small class="tv-bracket-page-note">Weitere Felder alle 15 Sek.</small>':''}</section>`;
  }).join('');
}
function tvKnockoutBracketHtml(tournament,{finals=false}={}){
  const playerCount=tournament.players?.length||0,total=Math.max(1,Math.ceil(Math.log2(Math.max(2,playerCount)))),rounds=tvBracketRounds(tournament.matches||[],'upper',total,playerCount);
  if(!rounds.length)return'<div class="tv-empty"><div><b>Noch kein Raster</b><span>Der Turnierbaum erscheint nach der Auslosung.</span></div></div>';
  return `<div class="tv-ko-bracket ${finals?'finals':''}">${tvBracketColumns(rounds,{finals,limit:5})}</div>`;
}
function tvDoubleBracketHtml(tournament,{finals=false}={}){
  const actual=tournament.matches||[],plan=tournament.settings?.doubleKoPlan;
  const real=actual.filter(match=>!match.automatic&&match.a&&match.b&&match.a!=='Freilos'&&match.b!=='Freilos'&&!match.preview);
  const losses=new Map((tournament.players||[]).map(name=>[name,0]));
  real.filter(match=>match.sa!==null).forEach(match=>{const loser=match.sa>match.sb?match.b:match.a;losses.set(loser,(losses.get(loser)||0)+1)});
  const remaining=[...losses.values()].filter(count=>count<2).length;
  const ready=real.filter(match=>match.sa===null);
  const closing=finals||(plan&&remaining<=4)||ready.some(match=>match.bracket==='grand');
  const label=match=>match.bracket==='grand'?(match.nodeId==='F2'||actual.filter(m=>m.bracket==='grand').indexOf(match)>0?'Entscheidungsfinale':'Großes Finale'):`${match.bracket==='lower'?'Verliererrunde':'Runde'} ${match.stage||match.round||1}`;
  if(closing){
    const preview=plan?T20DoubleKO.evaluate(plan,actual).preview:real,k=plan?Math.log2(plan.size):0;
    const sections=[['upper','Gewinnerseite'],['lower','Verliererseite'],['grand','Finale']].map(([kind,title])=>{
      const candidates=preview.filter(match=>match.bracket===kind&&!match.automatic);
      const threshold=kind==='upper'?k-1:2*k-3;
      const games=plan?candidates.filter(match=>kind==='grand'||match.stage>=threshold||match.sa===null&&!match.preview):candidates.slice(-2);
      return `<section class="tv-closing-lane"><h3>${title}</h3>${games.map(match=>`<article><small>${esc(label(match))}</small>${tvBracketGame(match,'Finalist')}</article>`).join('')||'<p>Keine Begegnung</p>'}</section>`;
    }).join('');
    return `<div class="tv-closing-bracket">${sections}</div>`;
  }
  const lane=(kind,title,empty)=>{
    const games=ready.filter(match=>match.bracket===kind),columns=Math.min(4,Math.max(1,Math.ceil(games.length/3)));
    return `<section class="tv-ready-lane ${kind}" style="--ready-columns:${columns};--ready-weight:${Math.max(1,Math.ceil(games.length/columns))}"><h3>${title}<small>${games.length} spielbereit</small></h3><div class="tv-ready-games">${games.map(match=>`<article class="tv-ready-game"><small>${esc(label(match))} · Spiel ${actual.indexOf(match)+1}</small><strong title="${esc(match.a)}">${esc(match.a)}</strong><b>VS</b><strong title="${esc(match.b)}">${esc(match.b)}</strong></article>`).join('')||`<p>${empty}</p>`}</div></section>`;
  };
  return `<div class="tv-ready-bracket">${lane('upper','Gewinnerseite','Derzeit kein Spiel bereit.')}${lane('lower','Verliererseite','Wartet auf Ergebnisse der vorherigen Spiele.')}</div>`;
}
function tvDoubleSideHtml(tournament,kind){
  const plan=tournament.settings?.doubleKoPlan;if(!plan)return tvDoubleBracketHtml(tournament);
  const preview=T20DoubleKO.evaluate(plan,tournament.matches||[]).preview.filter(match=>match.bracket===kind),roundsPerPage=kind==='upper'?6:5,stages=[...new Set(plan.nodes.filter(node=>node.bracket===kind).map(node=>node.stage))].sort((a,b)=>a-b),pages=Math.max(1,Math.ceil(stages.length/roundsPerPage)),mode=kind==='upper'?'winners':'losers',stored=normalizedTvDisplayMode()==='auto'&&tvAutoState().mode===mode?tvAutoState().page:Number(state.tvBracketPages?.[kind]||0),page=Math.max(0,Math.min(pages-1,stored)),visibleStages=stages.slice(page*roundsPerPage,(page+1)*roundsPerPage);
  const stageHtml=stage=>{
    const games=preview.filter(match=>match.stage===stage&&!match.automatic),placeholder=kind==='upper'?'Sieger aus Vorrunde':'Teilnehmer aus Vorrunde';
    return `<section class="tv-bracket-round ${games.length>4?'dense':''}"><h3>${kind==='upper'&&stage===stages.at(-1)?'Finale Gewinnerrunde':`${kind==='upper'?'Runde':'Verliererrunde'} ${stage}`}</h3><div>${games.length?games.map(match=>tvBracketGame(match,placeholder)).join(''):'<p class="tv-bracket-empty">Noch keine Begegnung</p>'}</div></section>`;
  };
  return `<div class="tv-side-bracket ${kind}">${visibleStages.map(stageHtml).join('')}</div><div class="tv-side-page-status"><span>${kind==='upper'?'Gewinnerrunde':'Verliererrunde'}</span><strong>Seite ${page+1}/${pages}</strong>${pages>1?'<small>Seitenwechsel über die Turniersteuerung</small>':''}</div>`;
}
function tvFullDoubleTreeHtml(tournament){
  const plan=tournament.settings?.doubleKoPlan;if(!plan)return tvDoubleBracketHtml(tournament);
  if(plan.size>32)return tvDoubleBracketHtml(tournament);
  const preview=T20DoubleKO.evaluate(plan,tournament.matches||[]).preview,stages=kind=>[...new Set(plan.nodes.filter(node=>node.bracket===kind).map(node=>node.stage))].sort((a,b)=>a-b);
  const upperStages=stages('upper'),lowerStages=stages('lower');
  // Automatic bye nodes are real positions in the 32-slot tree. Keeping them
  // visible prevents a 28-player event from collapsing from 16 to 12 rows.
  const column=(kind,stage,label,extra='')=>{const games=preview.filter(match=>match.bracket===kind&&match.stage===stage),placeholder=kind==='upper'?'Sieger':'Teilnehmer';return `<section class="tv-tree-column ${kind} ${extra}"><h3>${esc(label)}</h3><div>${games.map(match=>tvBracketGame(match,placeholder)).join('')||'<p class="tv-bracket-empty">Noch offen</p>'}</div></section>`};
  const lower=[...lowerStages].reverse().map(stage=>column('lower',stage,`Verlierer RND ${stage}`)).join('');
  const base=column('upper',upperStages[0],'Startrunde','base');
  const upper=upperStages.slice(1).map((stage,index)=>column('upper',stage,index===upperStages.length-2?'Finale GR':`Gewinner RND ${index+1}`)).join('');
  const finals=preview.filter(match=>match.bracket==='grand'&&!match.automatic),finalColumn=`<section class="tv-tree-column grand"><h3>Finale</h3><div>${finals.map(match=>tvBracketGame(match,'Finalist')).join('')||'<p class="tv-bracket-empty">Noch offen</p>'}</div></section>`;
  return `<div class="tv-full-tree" style="--tree-columns:${lowerStages.length+upperStages.length+1}">${lower}${base}${upper}${finalColumn}</div>`;
}
function tvBracketHtml(tournament,displayMode){
  const mode=tournament.settings?.mode;if(mode==='double')return tvFullDoubleTreeHtml(tournament);if(mode==='knockout')return tvKnockoutBracketHtml(tournament);return tvStandingsHtml(tournament);
}
function tvPlayableMatches(tournament){const matches=(tournament.matches||[]).filter(match=>match.b!=='Freilos'&&match.sa===null),rounds=matches.map(match=>+match.round||1),currentRound=rounds.length?Math.min(...rounds):1;if(tournament.settings?.doubleKoPlan||tournament.settings?.mode==='doubleslottery')return matches;return matches.filter(match=>(+match.round||1)===currentRound)}
function tvRealPlayer(name){return !!name&&!['freilos','noch offen','sieger aus vorrunde','teilnehmer aus vorrunde'].includes(String(name).trim().toLowerCase())}
function tvMatchIdentity(tournament,match){return match?.nodeId?`node:${match.nodeId}`:`match:${(tournament.matches||[]).indexOf(match)}`}
function tvBoardAssignments(live){
  const byKey=Object.fromEntries(live.map(item=>[item.key,item])),stored=Array.isArray(state.tvBoardAssignments)?state.tvBoardAssignments:[],assigned=[],usedMatches=new Set(),busyPlayers=new Set();
  const add=(board,key,match)=>{const id=tvMatchIdentity(byKey[key].tournament,match),players=[...matchSidePlayers(match,'a'),...matchSidePlayers(match,'b')].map(name=>String(name||'').trim().toLowerCase());if(usedMatches.has(`${key}:${id}`)||players.some(player=>busyPlayers.has(player)))return false;assigned.push({board,key,match,matchId:id});usedMatches.add(`${key}:${id}`);players.forEach(player=>busyPlayers.add(player));return true};
  for(const saved of [...stored].sort((a,b)=>a.board-b.board)){
    const item=byKey[saved.key],board=Number(saved.board);if(!item||board<1||board>4||assigned.some(entry=>entry.board===board))continue;
    const match=(item.tournament.matches||[]).find(entry=>tvMatchIdentity(item.tournament,entry)===saved.matchId);if(!match||match.sa!==null||match.b==='Freilos'||!tvRealPlayer(match.a)||!tvRealPlayer(match.b))continue;add(board,saved.key,match);
  }
  const priority=[...live].sort((a,b)=>(a.tournament.players?.length||0)-(b.tournament.players?.length||0)||a.key.localeCompare(b.key));
  for(let board=1;board<=4;board++){
    if(assigned.some(entry=>entry.board===board))continue;
    for(const item of priority){
      if(tvCompetitionPaused(item.key))continue;
      const match=tvPlayableMatches(item.tournament).find(entry=>tvRealPlayer(entry.a)&&tvRealPlayer(entry.b)&&!usedMatches.has(`${item.key}:${tvMatchIdentity(item.tournament,entry)}`)&&![...matchSidePlayers(entry,'a'),...matchSidePlayers(entry,'b')].map(name=>String(name).trim().toLowerCase()).some(player=>busyPlayers.has(player)));
      if(match&&add(board,item.key,match))break;
    }
  }
  assigned.sort((a,b)=>a.board-b.board);state.tvBoardAssignments=assigned.map(({board,key,matchId})=>({board,key,matchId}));return assigned;
}
function tvCompetitionHtml(key,tournament,displayMode,boardAssignments=[],liveCount=1){
  const allMatches=tournament.matches||[],matches=allMatches.filter(match=>match.b!=='Freilos'),open=matches.filter(match=>match.sa===null),rounds=open.map(match=>+match.round||1),currentRound=rounds.length?Math.min(...rounds):Math.max(1,...matches.map(match=>+match.round||1)),current=tournament.settings?.doubleKoPlan?open:open.filter(match=>(+match.round||1)===currentRound),done=matches.filter(match=>match.sa!==null).length,total=tournament.settings?.doubleKoPlan?2*tournament.players.length-2+Number(matches.some(m=>m.nodeId==='F2')):matches.length,progress=total?Math.round(done/total*100):0,title=competitionEventName(tournament),mode=tvModeLabel(tournament.settings);
  const visible=boardAssignments.filter(item=>item.key===key),paused=displayMode==='matches'&&tvCompetitionPaused(key),bracketDisplay=displayMode==='bracket'&&['knockout','double'].includes(tournament.settings?.mode),content=bracketDisplay?tvBracketHtml(tournament,displayMode):displayMode==='standings'?tvStandingsHtml(tournament):visible.length?`<div class="tv-match-grid">${visible.map(item=>{const match=item.match,index=allMatches.indexOf(match),type=eliminationMatchType(match,index,allMatches),description=match.gameLabel|| (type==='Spiel'?`Runde ${match.round||1}`:type);return `<article class="tv-match"><small class="tv-match-label">BOARD ${item.board||boardAssignments.indexOf(item)+1} · ${esc(description)} · Spiel ${index+1}</small><span class="tv-match-player-a">${esc(match.a)}</span><b>VS</b><span class="tv-match-player-b">${esc(match.b)}</span></article>`}).join('')}</div>`:`<div class="tv-empty"><div><b>${paused?'Pause':current.length?'Wartet auf freies Board':matches.length?'Bewerb abgeschlossen':'Noch keine Paarungen'}</b><span>${paused?'Laufende Spiele werden beendet; neue Paarungen warten bis zur Fortsetzung.':current.length?'Die nächste spielbereite Begegnung erhält automatisch ein freies Board.':matches.length?'Alle Ergebnisse dieser Konkurrenz sind eingetragen.':'Die Turnierleitung bereitet den Bewerb vor.'}</span></div></div>`;
  const viewName=displayMode==='standings'?'TOP 10':displayMode==='bracket'?'TURNIERBAUM':'',badge=viewName?`<div class="tv-round tv-view-badge"><span>ANZEIGE</span><b>${viewName}</b></div>`:`<div class="tv-round"><span>${open.length?(tournament.settings?.doubleKoPlan?'BEREIT':'RUNDE'):'STATUS'}</span><b>${open.length?(tournament.settings?.doubleKoPlan?Math.min(4,open.length):currentRound):'✓'}</b></div>`;
  return `<article class="tv-competition${displayMode==='standings'?' tv-standings-view':''}${bracketDisplay?' tv-bracket-view':''}"><div class="tv-competition-head"><div><span class="tv-competition-label">${esc(competitionLabel(key).toUpperCase())}</span><h2>${esc(title)}</h2></div>${badge}</div><div class="tv-progress"><i style="width:${progress}%"></i></div><div class="tv-meta"><span>${esc(mode)} · ${esc(tournamentGameLabel(tournament.settings))} · ${tournament.players?.length||0} Teilnehmende</span><span>${done}/${total} Spiele</span></div>${content}</article>`;
}
function renderTvView(){
  const container=$('#tvCompetitions');if(!container)return;
  const live=liveTvCompetitions(),displayMode=effectiveTvDisplayMode(),specialTarget=['standings','bracket'].includes(displayMode)?tvDisplayCompetition(live):null,treeMode=displayMode==='bracket'&&tvTournamentHasDoubleElimination(specialTarget?.tournament),visibleLive=specialTarget?[specialTarget]:live,boardAssignments=displayMode==='matches'?tvBoardAssignments(live):[];document.body.classList.toggle('tv-tree-mode',treeMode);container.classList.toggle('single',visibleLive.length===1);container.innerHTML=visibleLive.length?visibleLive.map(item=>tvCompetitionHtml(item.key,item.tournament,displayMode,boardAssignments,live.length)).join(''):'<div class="tv-no-live"><div><b>Derzeit läuft kein Turnier</b><p>Die Anzeige aktualisiert sich automatisch, sobald ein Bewerb gestartet wird.</p></div></div>';
  const footerMessage=$('#tvFooterMessage');if(footerMessage){const paused=live.filter(item=>tvCompetitionPaused(item.key)).map(item=>competitionLabel(item.key)),matchesMessage=paused.length?`${paused.join(' und ')} pausiert`:'Offene Paarungen der aktuellen Runde',targetName=competitionLabel(specialTarget?.key);footerMessage.textContent=displayMode==='standings'?`Aktuelle Top 10 · ${targetName}`:displayMode==='bracket'?`Turnierbaum · ${targetName}`:matchesMessage}
  const updated=$('#tvUpdatedAt'),stamp=T20Cloud.lastSyncAt?new Date(T20Cloud.lastSyncAt):new Date();if(updated)updated.textContent=`Automatisch aktuell · ${stamp.toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} Uhr`;
}
function stopTvRefresh(){if(tvRefreshTimer){clearInterval(tvRefreshTimer);tvRefreshTimer=null}}
function startTvRefresh(){stopTvRefresh();tvRefreshTimer=setInterval(()=>{if($('#tvSection')?.classList.contains('hidden')||document.visibilityState==='hidden')return;renderTvView();T20Cloud.loadLiveTournament().catch(error=>console.warn('TV-Daten konnten nicht aktualisiert werden:',error))},12000)}
async function toggleTvFullscreen(){
  try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch(error){console.warn('Vollbild konnte nicht aktiviert werden:',error)}
  if('wakeLock'in navigator&&!tvWakeLock)try{tvWakeLock=await navigator.wakeLock.request('screen');tvWakeLock.addEventListener('release',()=>{tvWakeLock=null})}catch(error){console.warn('Bildschirm-Wachhaltefunktion ist nicht verfügbar:',error)}
}
function showTv(updateUrl=true){hideMainSections();document.body.classList.add('tv-mode');$('#tvSection')?.classList.remove('hidden');renderTvView();startTvRefresh();scheduleTvDisplayReturn();T20Cloud.loadLiveTournament().catch(error=>console.warn('TV-Startdaten konnten nicht aktualisiert werden:',error));if(updateUrl)updateAppUrl('tv')}
function refreshVisibleTv(){document.body.classList.add('tv-mode');$('#tvSection')?.classList.remove('hidden');renderTvView();if(!tvRefreshTimer)startTvRefresh()}

// Statistikstation und Screenshot-Auswertung werden vor app.js durch stats-station.js bereitgestellt.

function loadClubDuels(){
  try{const data=storedDataValue(CLUB_DUELS_KEY,T20DataSchema.toLogical(CLUB_DUELS_KEY,{version:1,duels:[]}));return data&&Array.isArray(data.duels)?data:T20DataSchema.toLogical(CLUB_DUELS_KEY,{version:1,duels:[]})}catch(error){rememberDataSchemaError(error);return T20DataSchema.toLogical(CLUB_DUELS_KEY,{version:1,duels:[]})}
}
function saveClubDuels(store){writeLogicalData(CLUB_DUELS_KEY,{version:1,duels:store.duels||[]})}
function clubDuelTime(item){const value=Date.parse(item?.updatedAt||item?.deletedAt||item?.completedAt||item?.createdAt||'');return Number.isFinite(value)?value:0}
function mergeClubDuelStores(localStore,remoteStore){
  const local=localStore&&Array.isArray(localStore.duels)?localStore:{version:1,duels:[]},remote=remoteStore&&Array.isArray(remoteStore.duels)?remoteStore:{version:1,duels:[]},ids=new Set([...local.duels,...remote.duels].map(item=>item?.id).filter(Boolean)),duels=[];
  for(const id of ids){
    const left=local.duels.find(item=>item.id===id),right=remote.duels.find(item=>item.id===id);
    if(!left||!right){duels.push(structuredClone(left||right));continue}
    const newer=clubDuelTime(left)>=clubDuelTime(right)?left:right,older=newer===left?right:left;
    if(newer.deletedAt){duels.push(structuredClone(newer));continue}
    const matchIds=new Set([...(left.matches||[]),...(right.matches||[])].map(match=>match?.id).filter(Boolean)),matches=[];
    for(const matchId of matchIds){const a=(left.matches||[]).find(match=>match.id===matchId),b=(right.matches||[]).find(match=>match.id===matchId);matches.push(structuredClone(!a||!b?a||b:clubDuelTime(a)>=clubDuelTime(b)?a:b))}
    duels.push({...structuredClone(older),...structuredClone(newer),matches});
  }
  return{version:1,duels};
}
function clubDuelId(){return crypto.randomUUID?.()||`duel-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function clubDuelModeLabel(mode){return mode==='tdsv'?'TDSV-Steeldart':'Freundschaftsspiel'}
function parseClubRoster(value){return [...new Set(String(value||'').split(/[\n,;]+/).map(name=>name.trim().replace(/\s+/g,' ')).filter(Boolean))]}
function clubDuelDate(value){if(!value)return'–';const date=new Date(`${value}T12:00:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('de-AT',{dateStyle:'medium'}).format(date)}
function clubDuelScore(duel){
  return (duel.matches||[]).reduce((score,match)=>{if(match.homeLegs===null||match.guestLegs===null)return score;score.homeLegs+=match.homeLegs;score.guestLegs+=match.guestLegs;if(match.homeLegs>match.guestLegs)score.home++;else score.guest++;score.played++;return score},{home:0,guest:0,homeLegs:0,guestLegs:0,played:0});
}
function clubDuelMatches(settings){
  let number=0,singleNumber=0,doubleNumber=0;const matches=[];
  const add=(section,type,count)=>{for(let i=1;i<=count;i++){const label=type==='double'?`Offenes Doppel ${++doubleNumber}`:`Offenes Einzel ${++singleNumber}`;matches.push({id:clubDuelId(),number:++number,section,type,label,homePlayers:[],guestPlayers:[],homeLegs:null,guestLegs:null})}};
  add(1,'single',settings.firstSingles);add(2,'double',settings.doubles);add(3,'single',settings.lastSingles);return matches;
}
function clubDuelPlayerOptions(players,selected=''){return `<option value="">Spieler wählen …</option>${players.map(name=>`<option value="${esc(name)}" ${name===selected?'selected':''}>${esc(name)}</option>`).join('')}`}
function clubDuelPlayerSelectors(duel,match,side){
  const players=side==='home'?duel.homePlayers:duel.guestPlayers,chosen=side==='home'?match.homePlayers:match.guestPlayers,slots=match.type==='double'?2:1;
  return `<div class="club-duel-player-selects">${Array.from({length:slots},(_,index)=>`<select data-duel-player="${side}" data-slot="${index}" aria-label="${side==='home'?'Heim':'Gast'} Spieler ${index+1}" ${isAdmin()?'':'disabled'}>${clubDuelPlayerOptions(players,chosen?.[index]||'')}</select>`).join('')}</div>`;
}
function clubDuelScoreOptions(legs,value){return `<option value="">–</option>${Array.from({length:legs+1},(_,i)=>`<option value="${i}" ${value===i?'selected':''}>${i}</option>`).join('')}`}
function clubDuelLegsToWin(duel,match){return match?.type==='double'?(+duel.doubleLegsToWin||+duel.legsToWin||3):(+duel.singleLegsToWin||+duel.legsToWin||3)}
function clubDuelMatchCard(duel,match,index){
  const done=match.homeLegs!==null&&match.guestLegs!==null,canEdit=isAdmin()&&duel.status!=='completed',legsToWin=clubDuelLegsToWin(duel,match);
  return `<article class="club-duel-match ${done?'is-done':''}" data-duel-match="${index}"><header><span>${esc(match.label)}</span><small>Abschnitt ${match.section} · ${duel.startScore} ${duel.outMode==='double'?'Double Out':'Single Out'} · Best of ${legsToWin*2-1}</small></header><div class="club-duel-match-teams"><section><b>${esc(duel.homeClub)}</b>${clubDuelPlayerSelectors(duel,match,'home')}</section><strong>VS</strong><section><b>${esc(duel.guestClub)}</b>${clubDuelPlayerSelectors(duel,match,'guest')}</section></div><div class="club-duel-score-controls"><select data-duel-score="home" ${canEdit?'':'disabled'}>${clubDuelScoreOptions(legsToWin,match.homeLegs)}</select><b>:</b><select data-duel-score="guest" ${canEdit?'':'disabled'}>${clubDuelScoreOptions(legsToWin,match.guestLegs)}</select>${canEdit?`<button class="primary" type="button" data-duel-save-score="${index}">${done?'ÄNDERN':'SPEICHERN'}</button>`:''}</div></article>`;
}
function renderClubDuelSetup(){
  const box=$('#clubDuelSetup');if(!box)return;box.classList.toggle('hidden',!clubDuelSetupOpen||!isAdmin());if(!clubDuelSetupOpen||!isAdmin()){box.innerHTML='';return}
  const members=(T20Cloud.publicMembers||[]).map(item=>item.nickname).filter(Boolean).sort((a,b)=>a.localeCompare(b,'de'));
  box.innerHTML=`<form id="clubDuelSetupForm"><div class="club-duel-form-head"><div><span class="eyebrow">NEUES VEREINSDUELL</span><h2>Begegnung einrichten</h2><p>Die TDSV-Vorlage ist fix. Beim Freundschaftsspiel kannst du das Format anpassen.</p></div><button class="secondary" type="button" data-duel-cancel>Abbrechen</button></div><div class="grid club-duel-main-fields"><label>Regelvorlage<select id="clubDuelMode"><option value="tdsv">TDSV-Steeldart</option><option value="friendly">Freundschaftsspiel</option></select></label><label>Datum<input id="clubDuelDate" type="date" value="${todayIso()}" required></label><label>Heimverein<input id="clubDuelHomeClub" value="${esc(appSettings.club.name||'Dartclub Achensee')}" maxlength="60" required></label><label>Gastverein<input id="clubDuelGuestClub" maxlength="60" placeholder="Name des Gastvereins" required></label><label>Spielort<input id="clubDuelVenue" maxlength="80" placeholder="z. B. Dartlokal Buchau"></label><label>Bezeichnung<input id="clubDuelName" maxlength="80" placeholder="optional"></label></div><div id="clubDuelFormatFields" class="club-duel-format-fields"><label>Start<select id="clubDuelStartScore"><option value="501">501</option><option value="301">301</option></select></label><label>Finish<select id="clubDuelOutMode"><option value="double">Double Out</option><option value="single">Single Out</option></select></label><label>Einzel<select id="clubDuelSingleLegs"><option value="2">Best of 3</option><option value="3" selected>Best of 5</option><option value="4">Best of 7</option><option value="5">Best of 9</option></select></label><label>Doppel<select id="clubDuelDoubleLegs"><option value="2" selected>Best of 3</option><option value="3">Best of 5</option><option value="4">Best of 7</option><option value="5">Best of 9</option></select></label><label>Einzel Abschnitt 1<input id="clubDuelFirstSingles" type="number" min="0" max="20" value="4"></label><label>Doppel<input id="clubDuelDoubles" type="number" min="0" max="20" value="2"></label><label>Einzel Abschnitt 3<input id="clubDuelLastSingles" type="number" min="0" max="20" value="4"></label></div><div class="club-duel-rosters"><label><span>Spieler ${esc(appSettings.club.name||'Heimverein')}</span><textarea id="clubDuelHomePlayers" rows="7" placeholder="Ein Name pro Zeile" required></textarea><small>Gespeicherte Mitglieder können übernommen oder Namen frei eingetragen werden.</small><div class="club-duel-member-chips">${members.map(name=>`<button type="button" data-duel-member="${esc(name)}">+ ${esc(name)}</button>`).join('')}</div></label><label><span>Spieler Gastverein</span><textarea id="clubDuelGuestPlayers" rows="7" placeholder="Ein Name pro Zeile" required></textarea><small>Mindestens 4, höchstens 6 Spieler bei TDSV.</small></label></div><div id="clubDuelSetupHint" class="club-duel-rule-hint"></div><button class="primary" type="submit">VEREINSDUELL ANLEGEN <span>→</span></button></form>`;
  updateClubDuelModeFields();
}
function updateClubDuelModeFields(){
  const tdsv=$('#clubDuelMode')?.value!=='friendly',format=$('#clubDuelFormatFields');if(!format)return;
  const values={clubDuelStartScore:'501',clubDuelOutMode:'double',clubDuelSingleLegs:'3',clubDuelDoubleLegs:'3',clubDuelFirstSingles:'4',clubDuelDoubles:'2',clubDuelLastSingles:'4'};
  for(const [id,value] of Object.entries(values)){const field=$('#'+id);if(tdsv)field.value=value;field.disabled=tdsv}
  $('#clubDuelSetupHint').innerHTML=tdsv?'<b>TDSV-Vorlage:</b> 4 offene Einzel, 2 offene Doppel und 4 offene Einzel · alle Best of 5 · 501 Double Out · 4 bis 6 Spieler je Mannschaft. Das offizielle TDSV-Protokoll bleibt für Ligaspiele verbindlich.':'<b>Freundschaftsspiel:</b> Spielzahl sowie Legmodus für Einzel und Doppel können getrennt vereinbart werden.';
}
function createClubDuel(form){
  if(!isAdmin())return;const mode=$('#clubDuelMode').value,homePlayers=parseClubRoster($('#clubDuelHomePlayers').value),guestPlayers=parseClubRoster($('#clubDuelGuestPlayers').value);
  if(mode==='tdsv'&&(homePlayers.length<4||homePlayers.length>6||guestPlayers.length<4||guestPlayers.length>6)){appAlert('Für die TDSV-Vorlage benötigt jede Mannschaft mindestens 4 und höchstens 6 Spieler.');return}
  if(!homePlayers.length||!guestPlayers.length){appAlert('Bitte für beide Vereine Spieler eintragen.');return}
  const settings=mode==='tdsv'?{startScore:501,outMode:'double',singleLegsToWin:3,doubleLegsToWin:3,firstSingles:4,doubles:2,lastSingles:4}:{startScore:+$('#clubDuelStartScore').value,outMode:$('#clubDuelOutMode').value,singleLegsToWin:+$('#clubDuelSingleLegs').value,doubleLegsToWin:+$('#clubDuelDoubleLegs').value,firstSingles:+$('#clubDuelFirstSingles').value,doubles:+$('#clubDuelDoubles').value,lastSingles:+$('#clubDuelLastSingles').value};
  if(settings.firstSingles+settings.doubles+settings.lastSingles<1){appAlert('Das Vereinsduell benötigt mindestens eine Begegnung.');return}
  const duel={id:clubDuelId(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'live',mode,date:$('#clubDuelDate').value,venue:$('#clubDuelVenue').value.trim(),name:$('#clubDuelName').value.trim(),homeClub:$('#clubDuelHomeClub').value.trim(),guestClub:$('#clubDuelGuestClub').value.trim(),homePlayers,guestPlayers,...settings};duel.matches=clubDuelMatches(settings);
  const store=loadClubDuels();store.duels.push(duel);saveClubDuels(store);selectedClubDuelId=duel.id;clubDuelSetupOpen=false;renderClubDuels();
}
function saveClubDuelLineup(index,card){
  if(!isAdmin())return;const store=loadClubDuels(),duel=store.duels.find(item=>item.id===selectedClubDuelId&&!item.deletedAt),match=duel?.matches?.[index];if(!duel||!match||duel.status==='completed'||!card)return;
  const readPlayers=side=>[...card.querySelectorAll(`[data-duel-player="${side}"]`)].map(select=>select.value).filter(Boolean),updatedAt=new Date().toISOString();
  match.homePlayers=readPlayers('home');match.guestPlayers=readPlayers('guest');match.updatedAt=updatedAt;duel.updatedAt=updatedAt;saveClubDuels(store);
}
function saveClubDuelMatch(index){
  if(!isAdmin())return;const store=loadClubDuels(),duel=store.duels.find(item=>item.id===selectedClubDuelId),card=$(`[data-duel-match="${index}"]`),match=duel?.matches?.[index];if(!duel||!match||!card)return;
  const readPlayers=side=>[...card.querySelectorAll(`[data-duel-player="${side}"]`)].map(select=>select.value).filter(Boolean),homePlayers=readPlayers('home'),guestPlayers=readPlayers('guest'),required=match.type==='double'?2:1;
  if(homePlayers.length!==required||guestPlayers.length!==required||new Set(homePlayers).size!==required||new Set(guestPlayers).size!==required){appAlert(`Bitte für beide Vereine ${required===2?'zwei unterschiedliche Spieler':'einen Spieler'} auswählen.`);return}
  const home=card.querySelector('[data-duel-score="home"]').value,guest=card.querySelector('[data-duel-score="guest"]').value;
  const legsToWin=clubDuelLegsToWin(duel,match);if(home===''||guest===''||home===guest||Math.max(+home,+guest)!==legsToWin){appAlert(`Bitte ein eindeutiges Ergebnis eintragen. Der Sieger benötigt ${legsToWin} Legs.`);return}
  match.homePlayers=homePlayers;match.guestPlayers=guestPlayers;match.homeLegs=+home;match.guestLegs=+guest;match.updatedAt=new Date().toISOString();duel.updatedAt=match.updatedAt;saveClubDuels(store);renderClubDuels();
}
async function finishClubDuel(){
  if(!isAdmin())return;const store=loadClubDuels(),duel=store.duels.find(item=>item.id===selectedClubDuelId);if(!duel)return;const open=duel.matches.filter(match=>match.homeLegs===null||match.guestLegs===null).length;if(open){appAlert(`Noch ${open} Begegnung${open===1?' ist':'en sind'} offen.`);return}const score=clubDuelScore(duel);if(!await appConfirm(`Vereinsduell mit ${score.home}:${score.guest} abschließen und speichern?`))return;duel.status='completed';duel.completedAt=new Date().toISOString();duel.updatedAt=duel.completedAt;saveClubDuels(store);selectedClubDuelId='';renderClubDuels();
}
function reopenClubDuel(id){if(!isAdmin())return;const store=loadClubDuels(),duel=store.duels.find(item=>item.id===id&&!item.deletedAt);if(!duel)return;duel.status='live';delete duel.completedAt;duel.updatedAt=new Date().toISOString();saveClubDuels(store);selectedClubDuelId=id;renderClubDuels()}
async function deleteClubDuel(id){if(!isAdmin())return;const store=loadClubDuels(),duel=store.duels.find(item=>item.id===id&&!item.deletedAt);if(!duel||!await appConfirm(`Vereinsduell „${duel.homeClub} gegen ${duel.guestClub}“ wirklich löschen?`))return;duel.deletedAt=new Date().toISOString();duel.updatedAt=duel.deletedAt;duel.status='deleted';if(selectedClubDuelId===id)selectedClubDuelId='';saveClubDuels(store);renderClubDuels()}
function renderClubDuelLive(duel){
  const box=$('#clubDuelLive');if(!box)return;box.classList.toggle('hidden',!duel);if(!duel){box.innerHTML='';return}const score=clubDuelScore(duel),open=duel.matches.length-score.played;
  box.innerHTML=`<section class="club-duel-live-head"><div><span class="eyebrow">${esc(clubDuelModeLabel(duel.mode))}</span><h1>${esc(duel.homeClub)} <small>gegen</small> ${esc(duel.guestClub)}</h1><p>${clubDuelDate(duel.date)}${duel.venue?` · ${esc(duel.venue)}`:''} · ${score.played}/${duel.matches.length} Begegnungen</p></div><div class="club-duel-total"><span><small>${esc(duel.homeClub)}</small><b>${score.home}</b></span><i>:</i><span><small>${esc(duel.guestClub)}</small><b>${score.guest}</b></span><em>Legs ${score.homeLegs}:${score.guestLegs}</em></div></section>${duel.mode==='tdsv'?'<p class="club-duel-official-note">TDSV-Vorlage zur Durchführung und Speicherung. Bei offiziellen Ligaspielen bleibt das TDSV-Spielprotokoll maßgeblich.</p>':''}<div class="club-duel-match-list">${[1,2,3].map(section=>{const matches=duel.matches.map((match,index)=>({match,index})).filter(item=>item.match.section===section);if(!matches.length)return'';return `<section class="club-duel-section"><h2>Abschnitt ${section}<small>${section===2?'Doppel':'Einzel'}</small></h2>${matches.map(item=>clubDuelMatchCard(duel,item.match,item.index)).join('')}</section>`}).join('')}</div><div class="club-duel-live-actions"><button class="secondary" type="button" data-duel-back>Zur Übersicht</button><button class="secondary" type="button" data-duel-tv="${esc(duel.id)}">TV-Ansicht öffnen</button>${isAdmin()?`<button class="primary" type="button" data-duel-finish ${open?'disabled':''}>DUELL ABSCHLIESSEN <span>✓</span></button>`:''}</div>`;
}
function clubDuelHistoryCard(duel){const score=clubDuelScore(duel),winner=score.home===score.guest?'Unentschieden':score.home>score.guest?duel.homeClub:duel.guestClub;return `<details class="club-duel-history-card"><summary><time>${clubDuelDate(duel.date)}</time><span><b>${esc(duel.homeClub)} <i>${score.home}:${score.guest}</i> ${esc(duel.guestClub)}</b><small>${esc(clubDuelModeLabel(duel.mode))}${duel.venue?` · ${esc(duel.venue)}`:''}</small></span><strong>${esc(winner)}</strong></summary><div class="club-duel-history-detail"><p>Legs gesamt: <b>${score.homeLegs}:${score.guestLegs}</b></p>${duel.matches.map(match=>`<div><small>${esc(match.label)}</small><span>${esc(match.homePlayers.join(' / '))}</span><b>${match.homeLegs}:${match.guestLegs}</b><span>${esc(match.guestPlayers.join(' / '))}</span></div>`).join('')}${isAdmin()?`<footer><button class="secondary" type="button" data-duel-reopen="${esc(duel.id)}">Ergebnisse bearbeiten</button><button class="danger" type="button" data-duel-delete="${esc(duel.id)}">Löschen</button></footer>`:''}</div></details>`}
function renderClubDuels(){
  const store=loadClubDuels(),visible=store.duels.filter(item=>!item.deletedAt),live=visible.filter(item=>item.status!=='completed').sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')),history=visible.filter(item=>item.status==='completed').sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(selectedClubDuelId&&!visible.some(item=>item.id===selectedClubDuelId))selectedClubDuelId='';const selected=visible.find(item=>item.id===selectedClubDuelId)||null;
  $('#newClubDuelBtn')?.classList.toggle('hidden',!isAdmin()||clubDuelSetupOpen);
  const status=$('#clubDuelStatus');if(status)status.innerHTML=selected?'':live.length?`<div class="club-duel-live-list"><div><span class="eyebrow">LAUFEND</span><h2>${live.length===1?'Ein Vereinsduell ist':'Mehrere Vereinsduelle sind'} noch offen</h2></div>${live.map(duel=>{const score=clubDuelScore(duel);return `<button type="button" data-duel-open="${esc(duel.id)}"><span>${esc(duel.homeClub)} <b>${score.home}:${score.guest}</b> ${esc(duel.guestClub)}</span><small>${score.played}/${duel.matches.length} Begegnungen · öffnen →</small></button>`}).join('')}</div>`:'<div class="club-duel-empty"><span>🤝</span><div><h2>Noch kein laufendes Vereinsduell</h2><p>Neue Begegnungen werden unabhängig von Saison und Vereinsturnieren gespeichert.</p></div></div>';
  renderClubDuelSetup();renderClubDuelLive(selected);const archive=$('#clubDuelHistory');if(archive)archive.innerHTML=history.length?history.map(clubDuelHistoryCard).join(''):'<p class="view-note">Noch keine abgeschlossenen Vereinsduelle gespeichert.</p>';
}
function showClubDuels(updateUrl=true,shell=isAdmin()?'internal':'public'){setShellMode(shell);hideMainSections();$('#clubDuelsSection')?.classList.remove('hidden');renderClubDuels();renderNavigation();if(updateUrl)updateAppUrl('vereinsduelle')}
function clubDuelTvUrl(id){const url=new URL(TRIPLE20_PUBLIC_URL);url.searchParams.set('bereich','vereinsduell-tv');url.searchParams.set('duell',id);return url.href}
function showClubDuelTv(id='',updateUrl=true){selectedClubDuelId=id||selectedClubDuelId;hideMainSections();document.body.classList.add('club-duel-tv-mode');$('#clubDuelTvSection')?.classList.remove('hidden');renderClubDuelTv();if(updateUrl)updateAppUrl('vereinsduell-tv',{duell:selectedClubDuelId})}
function renderClubDuelTv(){
  const duel=loadClubDuels().duels.find(item=>item.id===selectedClubDuelId&&!item.deletedAt),content=$('#clubDuelTvContent');if(!content)return;if(!duel){$('#clubDuelTvTitle').textContent='Vereinsduell nicht gefunden';$('#clubDuelTvMeta').textContent='Bitte den Link in Triple20 erneut öffnen.';content.innerHTML='';return}
  const score=clubDuelScore(duel),open=(duel.matches||[]).filter(match=>match.homeLegs===null||match.guestLegs===null).slice(0,6),last=[...(duel.matches||[])].filter(match=>match.homeLegs!==null&&match.guestLegs!==null).slice(-3).reverse();$('#clubDuelTvTitle').textContent=`${duel.homeClub} gegen ${duel.guestClub}`;$('#clubDuelTvMeta').textContent=`${clubDuelModeLabel(duel.mode)} · ${score.played}/${duel.matches.length} Begegnungen · ${new Date().toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})} Uhr`;
  const pairing=match=>`<article><small>${esc(match.label)}</small><div><b>${esc(match.homePlayers?.join(' / ')||'Noch aufstellen')}</b><strong>${match.homeLegs===null?'–':match.homeLegs}:${match.guestLegs===null?'–':match.guestLegs}</strong><b>${esc(match.guestPlayers?.join(' / ')||'Noch aufstellen')}</b></div></article>`;
  content.innerHTML=`<section class="club-duel-tv-score"><div><small>${esc(duel.homeClub)}</small><b>${score.home}</b></div><i>:</i><div><small>${esc(duel.guestClub)}</small><b>${score.guest}</b></div><span>Legs ${score.homeLegs}:${score.guestLegs}</span></section><div class="club-duel-tv-columns"><section><h2>Nächste Begegnungen</h2>${open.length?open.map(pairing).join(''):'<p>Alle Begegnungen gespielt.</p>'}</section><section><h2>Letzte Ergebnisse</h2>${last.length?last.map(pairing).join(''):'<p>Noch kein Ergebnis eingetragen.</p>'}</section></div>`;
}

function updateAppUrl(area,extras={},replace=false){
  if(applyingRoute)return;
  const url=new URL(location.href);url.searchParams.set('bereich',area);
  ['produkt','kategorie','bewerb','spieler','duell'].forEach(key=>{const value=extras[key];if(value)url.searchParams.set(key,value);else url.searchParams.delete(key)});
  const next=url.pathname+(url.searchParams.size?`?${url.searchParams}`:'')+url.hash;
  history[replace?'replaceState':'pushState']({},document.title,next);
  updatePageMetadata(area);
}
function updatePageMetadata(area='start'){
  const pages={
    start:['Dartclub Achensee – News, Turniere und Live-Ergebnisse','Die offizielle Vereinsseite des Dartclub Achensee mit News, Terminen, Live-Spielen, Ergebnissen und Ranglisten.'],
    verein:['Dartclub Achensee – Verein, Kontakt und Mitgliedschaft','Informationen zum Dartclub Achensee, Vereinslokal, Spielzeiten, Kontakt und Mitgliedschaft.'],
    ergebnisse:['Dartclub Achensee – Ergebnisse und Ranglisten','Ergebnisse, Saisonwertungen und Ranglisten des Dartclub Achensee.'],
    saison:['Dartclub Achensee – Ergebnisse und Ranglisten','Ergebnisse, Saisonwertungen und Ranglisten des Dartclub Achensee.'],
    live:['Dartclub Achensee – Live-Spielplan','Laufende Spiele und aktuelle Ergebnisse des Dartclub Achensee live verfolgen.'],
    vereinsduelle:['Dartclub Achensee – Vereinsduelle','Laufende und abgeschlossene Vereinsduelle des Dartclub Achensee.'],
    konto:['Triple20 – Konto','Anmeldung und persönliches Konto für Triple20.'],
    verwaltung:['Triple20 – Vereinsverwaltung','Interner Verwaltungsbereich des Dartclub Achensee.'],
    turnier:['Triple20 – Turnierleitung','Interne Turnierleitung des Dartclub Achensee.'],
    einstellungen:['Triple20 – Einstellungen','Interne Einstellungen für Triple20.']
  },[title,description]=pages[area]||pages.start,canonical=new URL(location.href);
  canonical.hash='';if(area==='start')canonical.search='';
  document.title=title;
  document.querySelector('meta[name="description"]')?.setAttribute('content',description);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content',title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content',description);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content',canonical.href);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href',canonical.href);
}
function setShellMode(mode='public'){
  currentShellMode=mode==='internal'&&isAdmin()?'internal':'public';
  document.body.classList.toggle('internal-shell',currentShellMode==='internal');
  document.body.classList.toggle('public-shell',currentShellMode==='public');
}
function scrollPublicSection(selector){showHome();requestAnimationFrame(()=>document.querySelector(selector)?.scrollIntoView({behavior:'smooth',block:'start'}))}
async function applyAppRoute(){
  const params=new URLSearchParams(location.search),area=params.get('bereich')||'start',competition=params.get('bewerb')||'men',player=params.get('spieler')||'',duel=params.get('duell')||'';
  applyingRoute=true;
  try{
    if(area==='tv'){showTv(false);return}
    if(area==='vereinsduell-tv'){showClubDuelTv(duel,false);return}
    if(area==='statistikstation'){showStatsStation(false);return}
    if(area==='verwaltung'){isAdmin()?showDashboard(false):showLogin(false);return}
    if(area==='mitgliedervorschau'){isAdmin()?showMemberPreview(false):showLogin(false);return}
    if(area==='empfehlungen'){showHome(false);return}
    if(area==='spieler'&&player){showPlayerProfile(player,false);return}
    if(area==='verein'){showClubInfo(false);return}
    if(area==='vereinsduelle'){showClubDuels(false);return}
  if(area==='saison'||area==='ergebnisse'){showSeason(false);return}
    if(area==='konto'){showLogin(false);return}
    if(area==='dartvision-lab'){showDartVisionLab(false);return}
    if(area==='einstellungen'){showSettings(false);return}
    if(area==='live'){showLive(competition,false);return}
    if(area==='turnier'){canManageTournament()?showTournament(false):showHome(false);return}
    showHome(false);
  }finally{applyingRoute=false;updatePageMetadata(area)}
}
function hideMainSections(){stopTvRefresh();stopHomeNewsSlider();document.body.classList.remove('tv-mode','tv-tree-mode','club-duel-tv-mode');['tvSection','clubDuelTvSection','publicHomeSection','clubInfoSection','playerProfileSection','dashboardSection','memberPreviewSection','authSection','settingsSection','seasonSection','clubDuelsSection','statsStationSection','dartVisionLabSection','tournamentManagementPanel','tournamentSubnav','competitionNav','memberLiveEmpty','setupSection','tournamentSection'].forEach(id=>$('#'+id)?.classList.add('hidden'))}
function renderNavigation(){
  const admin=isAdmin(),internal=currentShellMode==='internal'&&admin;
  $('.club-settings-block')?.classList.remove('hidden');
  $('#showDashboardBtn')?.classList.toggle('hidden',!internal);
  $('#showSettingsBtn')?.classList.toggle('hidden',!internal||!isFullAdmin());
  $('#showTournamentBtn')?.classList.toggle('hidden',!internal||!canManageTournament());
  $('#showClubDuelsBtn')?.classList.toggle('hidden',!internal);
  $('#showInternalSeasonBtn')?.classList.toggle('hidden',!internal);
  $('#showSeasonBtn')?.classList.remove('hidden');
  const loginBtn=$('#showLoginBtn');if(loginBtn)loginBtn.textContent=internal?'Konto':admin?'Verwaltung':accountMenuLabel();
}
function renderDashboard(){
  if(!$('#dashboardCards')||!$('#dashboardPanel'))return;
  const season=selectedSeason(),upcoming=upcomingAdminEvents(),next=upcoming[0],profiles=T20Cloud.adminProfiles||[],openRequests=(T20Cloud.membershipApplications||[]).filter(item=>item.status==='new').length,history=loadTournamentHistory().filter(item=>!item.planned&&tournamentCompletionStatus(item)!=='cancelled').slice(-4).reverse();
  const cards=[
    ['📅','Nächstes Turnier',next?`${next.name||next.eventName||'Spieltag'} · ${publicDate(next.date)}`:'Noch kein Termin'],
    ['📊','Aktive Saison',season?.name||'Keine Saison ausgewählt'],
    ['👥','Mitglieder',`${profiles.length||seasonMembers(season).length||0}`],
    ['☑','Offene Aufgaben',`${openRequests+upcoming.length}`]
  ];
  $('#dashboardCards').innerHTML=cards.map(c=>`<article><span>${c[0]}</span><div><small>${esc(c[1])}</small><b>${esc(c[2])}</b></div></article>`).join('');
  $('#dashboardPanel').innerHTML=`<section><div><span>AKTUELLE AKTIVITÄTEN</span><h2>Zuletzt im Verein</h2></div>${history.length?`<div class="internal-activity-list">${history.map(item=>`<article><span>🏆</span><div><b>${esc(item.name||item.eventName||'Turnier')} abgeschlossen</b><small>${esc(publicDate(item.date))}${item.winner?` · Sieger: ${esc(tournamentPlayerName(item,item.winner))}`:''}</small></div></article>`).join('')}</div>`:'<p class="view-note">Noch keine abgeschlossenen Turniere vorhanden.</p>'}</section>`;
}
function showHome(updateUrl=true){setShellMode('public');hideMainSections();$('#publicHomeSection')?.classList.remove('hidden');renderPublicHome();renderNavigation();if(updateUrl)updateAppUrl('start')}
function showDashboard(updateUrl=true){if(!isAdmin()){showLogin(updateUrl);return}setShellMode('internal');hideMainSections();$('#dashboardSection')?.classList.remove('hidden');renderDashboard();renderNavigation();if(updateUrl)updateAppUrl('verwaltung')}
function memberPreviewModel(){
  const profile=T20Cloud.profile||{},nickname=(profile.nickname||'').trim(),userId=T20Cloud.user?.id||'',seasons=[...(seasonStore.seasons||[])].sort((a,b)=>Number(!!a.archived)-Number(!!b.archived)||(b.startDate||'').localeCompare(a.startDate||''));
  let selected=null;
  for(const season of seasons){const rows=calculateSeasonStandings(season),row=rows.find(item=>(userId&&item.profileId===userId)||(nickname&&normalizedPlayerName(item.name)===normalizedPlayerName(nickname)));if(row){selected={season,row,rank:rows.indexOf(row)+1,sample:false};break}}
  if(!selected)for(const season of seasons){const rows=calculateSeasonStandings(season);if(rows.length){selected={season,row:rows[0],rank:1,sample:true};break}}
  const shownName=selected?.row?.name||nickname||'Beispielmitglied',displayName=selected?.sample?'Beispielansicht mit öffentlichen Ranglistendaten':(profile.display_name||'Persönliches Mitgliedskonto');
  return{...selected,shownName,displayName};
}
function renderMemberPreview(){
  const panel=$('#memberPreviewPanel');if(!panel)return;const model=memberPreviewModel(),next=publicTournamentRecords().filter(item=>item.planned&&item.date>=todayIso()).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.startTime||'').localeCompare(b.startTime||''))[0],initial=esc(model.shownName.charAt(0).toUpperCase()||'M');
  let overview='';
  if(model.row&&model.season){const recent=model.row.entries.filter(entry=>entry.present).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,3),balance=model.row.wins+model.row.losses?`${model.row.wins} : ${model.row.losses}`:'0 : 0';overview=`<section class="personal-overview"><div class="personal-overview-head"><div><span class="eyebrow">MEINE ÜBERSICHT</span><h3>${esc(model.season.name)}</h3><p>${esc(model.shownName)} · Persönliche Saisonwerte${model.sample?' · Beispieldaten':''}</p></div><div class="personal-overview-actions"><button class="secondary" type="button" disabled>Mein öffentliches Profil</button><button class="secondary" type="button" disabled>Rangliste öffnen</button></div></div><div class="personal-stat-grid"><article><small>Rang</small><b>${model.rank}</b></article><article><small>Punkte</small><b>${model.row.cleanPoints}</b></article><article><small>Turniere</small><b>${model.row.played}</b></article><article><small>Siege : Niederlagen</small><b>${balance}</b></article></div><div class="personal-overview-detail"><section><h4>Letzte Ergebnisse</h4>${recent.length?`<div class="personal-results">${recent.map(entry=>`<div><span><b>${publicDate(entry.date)}</b>${esc(entry.name||'Spieltag')}</span><strong>${entry.rank?`${entry.rank}. Platz · `:''}${entry.points} Pkt.</strong></div>`).join('')}</div>`:'<p class="view-note">Noch kein gespielter Termin vorhanden.</p>'}</section><section class="personal-next-event"><h4>Nächster Spieltag</h4>${next?`<b>${esc(next.name||next.eventName||'Spieltag')}</b><p>${publicDate(next.date)}${publicStartTime(next)?` · ${esc(publicStartTime(next))}`:''}</p><small>${esc([next.competitionLabel,next.seasonName].filter(Boolean).join(' · ')||'Weitere Informationen folgen')}</small>`:'<p class="view-note">Derzeit ist kein zukünftiger Spieltag eingetragen.</p>'}</section></div></section>`}else overview=`<section class="personal-overview personal-overview-empty"><div><span class="eyebrow">MEINE ÜBERSICHT</span><h3>Noch keine Saisonzuordnung</h3><p>So erscheint das Konto, bevor ein Mitgliederprofil einer Saison zugeordnet wurde.</p></div></section>`;
  panel.innerHTML=`<section class="member-profile member-view-preview"><div class="member-preview-note"><b>Nur Vorschau</b><span>Es wird kein Mitgliedskonto geöffnet oder verändert.</span></div><div class="profile-heading"><div><span class="profile-avatar">${initial}</span><div><h3>${esc(model.shownName)}</h3><p class="view-note">${esc(model.displayName)}</p></div></div></div>${overview}<details class="member-account-settings" open><summary><span><b>Profil &amp; Benachrichtigungen</b><small>Push, Profilfoto und persönliche Daten verwalten</small></span><i>⌄</i></summary><div class="member-account-settings-body"><section class="push-card"><div><span class="eyebrow">BENACHRICHTIGUNGEN</span><h3>Nichts mehr verpassen</h3><p>Mitglieder können Hinweise zu Spieltagen und Vereinsmeldungen aktivieren.</p></div><button class="primary" type="button" disabled>PUSH AKTIVIEREN</button></section><section class="member-profile-settings"><div class="member-settings-heading"><span class="eyebrow">PROFIL</span><h3>Persönliche Angaben</h3></div><div class="profile-form"><label>Spitzname<input value="${esc(model.shownName)}" disabled></label><label>Vor- und Zuname<input value="${esc(model.displayName)}" disabled></label><button class="primary" type="button" disabled>PROFIL SPEICHERN</button></div><p class="view-note">In der echten Mitgliederansicht kann ausschließlich das angemeldete Mitglied seine eigenen Daten bearbeiten.</p></section></div></details></section>`;
}
function showMemberPreview(updateUrl=true){if(!isAdmin()){showLogin(updateUrl);return}setShellMode('internal');hideMainSections();$('#memberPreviewSection')?.classList.remove('hidden');renderMemberPreview();renderNavigation();if(updateUrl)updateAppUrl('mitgliedervorschau')}
function safeClubLink(value=''){try{const url=new URL(value);return url.protocol==='https:'?url.href:''}catch{return''}}
function clubInfoLines(value=''){return String(value).split('\n').map(line=>line.trim()).filter(Boolean)}
function membershipStatusLabel(status='new'){return({new:'Neu',contacted:'Kontaktiert',completed:'Aufgenommen',rejected:'Abgelehnt'})[status]||'Neu'}
function membershipApplicationsHtml(){
  if(!isFullAdmin())return'';const rows=T20Cloud.membershipApplications||[],open=rows.filter(item=>item.status==='new').length;
  return `<details class="membership-admin"><summary><span><b>Mitgliedsanfragen</b><small>${T20Cloud.membershipApplicationsBusy?'Werden geladen …':`${open} neu · ${rows.length} gesamt`}</small></span><i aria-hidden="true">⌄</i></summary><div class="membership-admin-body">${T20Cloud.membershipApplicationsBusy?'<div class="empty-card">Mitgliedsanfragen werden geladen …</div>':rows.length?rows.map(item=>{const email=String(item.email||''),phone=String(item.phone||''),phoneHref=phone.replace(/[^+\d]/g,''),date=item.submitted_at?new Date(item.submitted_at).toLocaleString('de-AT',{dateStyle:'medium',timeStyle:'short'}):'–';return `<article class="membership-request ${item.status==='new'?'is-new':''}"><div class="membership-request-head"><div><span>${esc(membershipStatusLabel(item.status))}</span><h3>${esc(item.full_name||'Ohne Namen')}</h3><small>Eingegangen am ${esc(date)}</small></div><div class="membership-request-links">${email?`<a href="mailto:${esc(email)}">E-Mail</a>`:''}${phone&&phoneHref?`<a href="tel:${esc(phoneHref)}">Anrufen</a>`:''}</div></div><dl><div><dt>Geburtsdatum</dt><dd>${esc(item.birth_date?new Date(`${item.birth_date}T12:00:00`).toLocaleDateString('de-AT'):'–')}</dd></div><div><dt>E-Mail</dt><dd>${esc(email||'–')}</dd></div><div><dt>Telefon</dt><dd>${esc(phone||'–')}</dd></div><div class="wide"><dt>Adresse</dt><dd>${esc(item.address||'–')}</dd></div></dl><div class="membership-request-actions"><button type="button" data-membership-status="contacted" data-membership-id="${esc(item.id)}">Kontaktiert</button><button type="button" data-membership-status="completed" data-membership-id="${esc(item.id)}">Aufgenommen</button><button type="button" data-membership-status="rejected" data-membership-id="${esc(item.id)}">Ablehnen</button><button class="danger" type="button" data-membership-delete="${esc(item.id)}">Löschen</button></div></article>`}).join(''):'<div class="empty-card">Noch keine Mitgliedsanfragen vorhanden.</div>'}</div></details>`
}
function membershipSectionHtml(){return `<section class="club-membership"><div class="club-membership-intro"><div><span class="eyebrow">MITGLIEDSCHAFT</span><h2>Mitglied werden</h2><p>Du möchtest beim Dartclub Achensee dabei sein? Sende uns hier deine Mitgliedsanfrage. Wir melden uns anschließend persönlich bei dir.</p><small>Das Online-Formular ersetzt keine Unterschrift. Die Aufnahme wird abschließend persönlich mit dem Verein bestätigt.</small></div><button class="primary" type="button" data-membership-open>Anfrage starten</button></div><form id="membershipApplicationForm" class="membership-form hidden"><div class="membership-form-grid"><label>Vor- und Nachname<input id="membershipName" name="name" autocomplete="name" maxlength="120" required></label><label>Geburtsdatum<input id="membershipBirthDate" name="birthDate" type="date" min="1900-01-01" max="${localDateKey()}" required></label><label class="wide">Adresse<textarea id="membershipAddress" name="address" autocomplete="street-address" rows="3" maxlength="300" required></textarea></label><label>Telefon<input id="membershipPhone" name="phone" type="tel" autocomplete="tel" maxlength="50" required></label><label>E-Mail<input id="membershipEmail" name="email" type="email" autocomplete="email" maxlength="160" required></label><label class="membership-honeypot" aria-hidden="true">Website<input id="membershipWebsite" name="website" tabindex="-1" autocomplete="off"></label></div><label class="membership-consent"><input id="membershipAccepted" name="accepted" type="checkbox" required><span>Ich melde mich hiermit als Mitglied beim Dartclub Achensee an und stimme zu, dass meine Angaben ausschließlich zur Bearbeitung dieser Anfrage verwendet werden.</span></label><div class="membership-form-footer"><p id="membershipFormStatus" role="status"></p><div><button class="secondary" type="button" data-membership-cancel>Abbrechen</button><button class="primary" type="submit">${T20Cloud.membershipApplicationSubmitting?'Wird gesendet …':'Anfrage senden'}</button></div></div></form></section>`}
function renderClubInfo(){
  const box=$('#clubInfoContent');if(!box)return;const info=appSettings.clubInfo||defaultSettings.clubInfo,name=appSettings.club.name||'Dartclub Achensee',tagline=info.tagline||'Sport. Gemeinschaft. Good Darts.',address=clubInfoLines(info.address),hours=clubInfoLines(info.hours),email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email||'')?info.email:'',phone=String(info.phone||'').trim(),phoneHref=phone.replace(/[^+\d]/g,''),mapsUrl=safeClubLink(info.mapsUrl),cards=[];
  if(info.venue||address.length)cards.push(`<article class="club-info-card"><span>ORT</span><h2>${esc(info.venue||'Vereinslokal')}</h2>${address.length?`<address>${address.map(line=>`<i>${esc(line)}</i>`).join('')}</address>`:''}${mapsUrl?`<a href="${esc(mapsUrl)}" target="_blank" rel="noopener">In Karte öffnen →</a>`:''}</article>`);
  if(hours.length)cards.push(`<article class="club-info-card"><span>ÖFFNUNGSZEITEN</span><h2>Wann wir spielen</h2><div class="club-info-hours">${hours.map(line=>{const [day,...detail]=line.split('|');return `<div><b>${esc(day.trim())}</b><small>${esc(detail.join('|').trim())}</small></div>`}).join('')}</div></article>`);
  if(info.contactName||email||phone)cards.push(`<article class="club-info-card"><span>KONTAKT</span><h2>${esc(info.contactName||'Dartclub Achensee')}</h2><div class="club-info-contact">${email?`<a href="mailto:${esc(email)}">${esc(email)}</a>`:''}${phone&&phoneHref?`<a href="tel:${esc(phoneHref)}">${esc(phone)}</a>`:''}</div></article>`);
  box.innerHTML=`<div class="public-player-back"><button class="secondary" type="button" data-club-info-back>← Zur Startseite</button>${isFullAdmin()?'<button class="secondary" type="button" data-club-info-edit>Vereinsseite bearbeiten</button>':''}</div><header id="clubInfoHero" class="club-info-hero"><span class="eyebrow">ÜBER DEN VEREIN</span><h1 id="clubInfoTitle">${esc(name)}</h1><h2>${esc(tagline)}</h2>${info.description?`<p>${esc(info.description)}</p>`:'<p>Die wichtigsten Informationen über unseren Verein, das Dartlokal und die Möglichkeiten, mit uns in Kontakt zu treten.</p>'}</header>${cards.length?`<div class="club-info-grid">${cards.join('')}</div>`:'<div class="club-info-empty"><h2>Vereinsdaten folgen</h2><p>Adresse, Öffnungszeiten und Kontakt werden derzeit ergänzt.</p></div>'}${membershipSectionHtml()}${membershipApplicationsHtml()}`;renderClubInfoImage();
}
function renderClubInfoImage(){const hero=$('#clubInfoHero');if(!hero)return;const image=T20Cloud.clubInfoImageSignedUrl||'',info=appSettings.clubInfo||defaultSettings.clubInfo,position=['top','bottom'].includes(info.imagePosition)?info.imagePosition:'center',layout=info.imageLayout==='full'?'full':'right';hero.classList.toggle('has-background-image',!!image);hero.classList.toggle('image-layout-right',!!image&&layout==='right');hero.style.backgroundPosition=`center ${position}`;hero.style.setProperty('--club-info-image-position',position);hero.style.setProperty('--club-info-image',image?`url(${JSON.stringify(image)})`:'none')}
function showClubInfo(updateUrl=true){setShellMode('public');hideMainSections();$('#clubInfoSection')?.classList.remove('hidden');renderClubInfo();renderNavigation();if(updateUrl)updateAppUrl('verein');if(isFullAdmin()&&!T20Cloud.membershipApplicationsBusy)T20Cloud.loadMembershipApplications().catch(error=>console.warn('Mitgliedsanfragen konnten nicht geladen werden:',error))}
function selectLiveCompetition(key){
  if(!['men','women'].includes(key)||key===state.activeCompetition)return;
  syncActiveCompetition();state.activeCompetition=key;loadActiveCompetition();
}
function showLive(key='men',updateUrl=true){setShellMode('public');const competition=['men','women'].includes(key)?key:'men';if(updateUrl)updateAppUrl('live',{bewerb:competition});selectLiveCompetition(competition);clearImportedCompetitionForNewSetup();hideMainSections();$('#competitionNav')?.classList.remove('hidden');renderTournament();renderNavigation()}
function livePublicUrl(key=state.activeCompetition){const url=new URL(TRIPLE20_PUBLIC_URL);url.searchParams.set('bereich','live');url.searchParams.set('bewerb',['men','women'].includes(key)?key:'men');return url.href}
function renderLiveQrCode(key=state.activeCompetition){
  const box=$('#liveQrCode'),link=$('#liveQrLink'),url=livePublicUrl(key);if(link){link.href=url;link.textContent=url}if(!box)return;box.innerHTML='';
  if(typeof QRCode==='function')new QRCode(box,{text:url,width:260,height:260,colorDark:'#07111f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});else box.innerHTML='<p>Der QR-Code konnte nicht geladen werden. Bitte verwende den angezeigten Link.</p>';
  document.querySelectorAll('[data-live-qr-competition]').forEach(button=>button.classList.toggle('active',button.dataset.liveQrCompetition===key));
}
function openLiveQr(){
  if(!isAdmin())return;$('#liveQrOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="liveQrOverlay" class="live-qr-overlay" role="dialog" aria-modal="true" aria-labelledby="liveQrTitle"><section class="live-qr-dialog"><button id="closeLiveQrBtn" class="live-qr-close" type="button" aria-label="QR-Code schließen">×</button><span class="eyebrow">ZUSCHAUER-LINK</span><h2 id="liveQrTitle">Live-Spielplan öffnen</h2><p>QR-Code scannen und den Spielplan ohne Anmeldung ansehen.</p><div class="live-qr-switch"><button class="secondary" type="button" data-live-qr-competition="men">Herren</button><button class="secondary" type="button" data-live-qr-competition="women">Damen</button></div><div id="liveQrCode" class="live-qr-code"></div><a id="liveQrLink" class="live-qr-link" href="#" target="_blank" rel="noopener"></a><button id="copyLiveQrLinkBtn" class="primary" type="button">LINK KOPIEREN <span>⧉</span></button></section></div>`);renderLiveQrCode(state.activeCompetition||'men');
}
function showLogin(updateUrl=true){setShellMode(isAdmin()?'internal':'public');hideMainSections();$('#authSection')?.classList.remove('hidden');renderCloudPanel();renderNavigation();if(updateUrl)updateAppUrl('konto')}
function showSettings(updateUrl=true){if(!isFullAdmin()){showLogin(updateUrl);return}setShellMode('internal');hideMainSections();$('#settingsSection').classList.remove('hidden');renderSettingsForm();renderNavigation();if(updateUrl)updateAppUrl('einstellungen')}
// Die DartVision-Testlogik liegt in dartvision-lab.js; der lokale Zustand bleibt im App-Kern.
let dartVisionLab=loadDartVisionLab();
async function prepareHomeNewsImage(file){
  if(!file||(!file.type.startsWith('image/')&&!/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name||'')))throw new Error('Bitte eine Bilddatei auswählen.');if(file.size>50*1024*1024)throw new Error('Das Ausgangsbild ist größer als 50 MB.');
  const bitmap=await decodeAvatarImage(file),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));let blob=await encode(.84);if(blob?.size>900*1024)blob=await encode(.7);if(!blob||blob.size>1024*1024)throw new Error('Das Bild konnte nicht auf unter 1 MB verkleinert werden.');return blob
}
function homeInfoItemsFromText(value=''){return String(value).split('\n').map(line=>line.trim()).filter(Boolean).slice(0,4).map(line=>{const [title,...detail]=line.split('|');return{title:title.trim().slice(0,80),detail:detail.join('|').trim().slice(0,120)}}).filter(item=>item.title)}
function homeInfoItemsText(items=[]){return (Array.isArray(items)?items:[]).map(item=>[item.title,item.detail].filter(Boolean).join(' | ')).join('\n')}
function homeNewsProfileMembers(){const map=new Map();for(const member of[...(T20Cloud.publicMembers||[]),...(T20Cloud.adminProfiles||[])])if(member?.id&&(member.nickname||member.display_name))map.set(String(member.id),{id:String(member.id),name:(member.nickname||member.display_name).trim()});return[...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'))}
function homeNewsProfileOptions(selected=''){return`<option value="">Kein Profil</option>${homeNewsProfileMembers().map(member=>`<option value="${esc(member.id)}" ${member.id===String(selected||'')?'selected':''}>${esc(member.name)}</option>`).join('')}`}
function homeNewsEditorPatch(){const profileIds=editingHomeNewsId==='main'?[]:[...new Set([$('#homeNewsProfile1')?.value,$('#homeNewsProfile2')?.value].filter(Boolean))].slice(0,2);return{eyebrow:$('#homeNewsEyebrow').value.trim()||'DCA NEWS',title:$('#homeNewsTitle').value.trim(),text:$('#homeNewsText').value.trim(),imagePosition:$('#homeNewsImagePosition').value,imageLayout:$('#homeNewsImageLayout').value,profileIds}}
function syncHomeNewsEditorFields(){return updateHomeNewsItem(editingHomeNewsId,homeNewsEditorPatch())}
function addHomeNewsItem(){
  if(!isFullAdmin())return;syncHomeNewsEditorFields();const news=appSettings.home?.news||defaultSettings.home.news,items=Array.isArray(news.items)?news.items:[];if(items.length>=5){appAlert('Es können maximal sechs DCA-News gleichzeitig im Slider stehen.');return}const id=crypto.randomUUID?.()||`news-${Date.now()}`;appSettings=mergeSettings(appSettings,{home:{news:{...news,items:[...items,{id,eyebrow:'DCA NEWS',title:'Neue Neuigkeit',text:'',imagePath:'',imagePosition:'center',imageLayout:'right',profileIds:[]}]}}});saveSettings();editingHomeNewsId=id;renderHomeEditor();$('#homeNewsTitle')?.select()
}
function renderHomeEditor(){
  const section=$('#homePageSettings');if(!section)return;const items=homeNewsItems();if(!items.some(item=>item.id===editingHomeNewsId))editingHomeNewsId='main';const news=homeNewsItem(editingHomeNewsId),info=appSettings.home?.info||defaultSettings.home.info,clubInfo=appSettings.clubInfo||defaultSettings.clubInfo,image=homeNewsImageUrl(news.id),clubImage=T20Cloud.clubInfoImageSignedUrl||'';
  $('#homeNewsItemTabs').innerHTML=items.map((item,index)=>`<button class="${item.id===editingHomeNewsId?'active':''}" type="button" data-home-news-edit="${esc(item.id)}"><b>${index+1}</b><span>${esc(item.title||`${item.id==='main'?'Automatische':'Neue'} News`)}</span></button>`).join('');$('#homeNewsEyebrow').value=news.eyebrow||'DCA NEWS';$('#homeNewsTitle').value=news.title||'';$('#homeNewsText').value=news.text||'';$('#homeNewsImagePosition').value=['top','bottom'].includes(news.imagePosition)?news.imagePosition:'center';$('#homeNewsImageLayout').value=news.imageLayout==='full'?'full':'right';const profileBox=$('#homeNewsProfiles');profileBox.classList.toggle('hidden',news.id==='main');$('#homeNewsProfile1').innerHTML=homeNewsProfileOptions(news.profileIds?.[0]);$('#homeNewsProfile2').innerHTML=homeNewsProfileOptions(news.profileIds?.[1]);$('#homeInfoEyebrow').value=info.eyebrow||'TERMINE';$('#homeInfoTitle').value=info.title||'Als Nächstes';$('#homeInfoMode').value=info.mode==='custom'?'custom':'auto';$('#homeInfoItems').value=homeInfoItemsText(info.items);
  const preview=$('#homeNewsImagePreview');preview.innerHTML=image?`<img src="${esc(image)}" alt="Vorschau des DCA-News-Hintergrundbildes">`:'<span>Noch kein Hintergrundbild</span>';$('#removeHomeNewsImageBtn').classList.toggle('hidden',!news.imagePath);$('#deleteHomeNewsItemBtn').classList.toggle('hidden',news.id==='main');$('#homeNewsImageInput').disabled=!!T20Cloud.homeImageBusy;$('#removeHomeNewsImageBtn').disabled=!!T20Cloud.homeImageBusy;$('#deleteHomeNewsItemBtn').disabled=!!T20Cloud.homeImageBusy;section.classList.toggle('is-busy',!!T20Cloud.homeImageBusy)
  $('#clubInfoTagline').value=clubInfo.tagline||'';$('#clubInfoDescription').value=clubInfo.description||'';$('#clubInfoVenue').value=clubInfo.venue||'';$('#clubInfoAddress').value=clubInfo.address||'';$('#clubInfoHours').value=clubInfo.hours||'';$('#clubInfoContactName').value=clubInfo.contactName||'';$('#clubInfoEmail').value=clubInfo.email||'';$('#clubInfoPhone').value=clubInfo.phone||'';$('#clubInfoMapsUrl').value=clubInfo.mapsUrl||'';$('#clubInfoImagePosition').value=['top','bottom'].includes(clubInfo.imagePosition)?clubInfo.imagePosition:'center';$('#clubInfoImageLayout').value=clubInfo.imageLayout==='full'?'full':'right';
  const clubPreview=$('#clubInfoImagePreview');clubPreview.innerHTML=clubImage?`<img src="${esc(clubImage)}" alt="Vorschau des Vereinsseiten-Hintergrundbildes">`:'<span>Noch kein Hintergrundbild</span>';$('#removeClubInfoImageBtn').classList.toggle('hidden',!clubInfo.imagePath);$('#clubInfoImageInput').disabled=!!T20Cloud.clubInfoImageBusy;$('#removeClubInfoImageBtn').disabled=!!T20Cloud.clubInfoImageBusy;section.classList.toggle('is-busy',!!T20Cloud.homeImageBusy||!!T20Cloud.clubInfoImageBusy)
}
function renderSettingsForm(){
  $('#settingsMode').value='club';$('#settingsDefaultMode').value=appSettings.tournament.defaultMode||'swiss';$('#settingsDefaultFormat').value=appSettings.tournament.defaultFormat||'single';$('#settingsDefaultLegs').value=String(appSettings.tournament.defaultLegs||2);
  $('#settingsClubName').value=appSettings.club.name||'';$('#settingsClubLogo').value=appSettings.club.logo||'';$('#settingsClubColor').value=appSettings.club.color||appSettings.theme.primary;$('#settingsSeasonMode').value=appSettings.club.seasonMode||'halfyear';
  [5,4,3,2,1,0].forEach(n=>{$(`#points${n}`).value=appSettings.club.pointSystem[n]});
  const mode=themeModeForTheme();$('#themeMode').value=mode;renderThemePreview(mode);renderHomeEditor();renderNavigation();renderReadonlyMode();
}
function renderThemePreview(mode=$('#themeMode')?.value||themeModeForTheme()){
  const box=$('#themePreview'),preset=themeModes[mode]||themeModes.light;if(!box)return;
  box.innerHTML=Object.entries(preset.theme).map(([key,value])=>`<span title="${esc(key)}" style="background:${esc(value)}"></span>`).join('')+`<small>${esc(preset.label)}</small>`;
}
function applyTournamentDefaults(){if($('#mode'))$('#mode').value=appSettings.tournament.defaultMode||'swiss';if($('#legs'))$('#legs').value=String(appSettings.tournament.defaultLegs||2);toggleModeOptions()}
function renderModeGate(){}

function bracketCard(m,label='Sieger der Vorrunde'){
  if(!m)return `<div class="bracket-game placeholder"><div class="bracket-player"><span>${label}</span><small>–</small></div><div class="bracket-player"><span>${label}</span><small>–</small></div></div>`;
  return `<div class="bracket-game ${m.preview?'preview':''}"><div class="bracket-player ${m.sa!==null&&m.sa>m.sb?'won':''}"><span>${esc(m.a)}</span><small>${m.sa===null?'–':m.sa}</small></div><div class="bracket-player ${m.sb!==null&&m.sb>m.sa?'won':''}"><span>${esc(m.b)}</span><small>${m.sb===null?'–':m.sb}</small></div></div>`;
}
function singleBracket(){
  const total=Math.max(1,Math.ceil(Math.log2(state.players.length))),columns=[];
  for(let round=1;round<=total;round++){const games=state.matches.filter(m=>(m.round||1)===round),count=Math.max(1,Math.ceil(state.players.length/2**round));const cards=Array.from({length:count},(_,i)=>bracketCard(games[i],round===total?'Finalist':'Sieger der Vorrunde')).join('');columns.push(`<section class="bracket-round"><h3>${round===total?'Finale':'Runde '+round}</h3><div class="bracket-games">${cards}</div></section>`)}
  return `<div class="bracket-grid">${columns.join('')}</div>`;
}
function groupedMatches(kind){const all=state.matches.filter(m=>m.bracket===kind),rounds=[...new Set(all.map(m=>m.round))].sort((a,b)=>a-b);return rounds.map(r=>all.filter(m=>m.round===r))}
function knownWinner(m){return m&&m.sa!==null?(m.sa>m.sb?m.a:m.b):''}
function knownLoser(m){return m&&m.sa!==null&&m.b!=='Freilos'?(m.sa>m.sb?m.b:m.a):''}
function previewPairs(inputs,count,fallback){const games=[];for(let i=0;i<count;i++)games.push({a:inputs[i*2]||fallback,b:inputs[i*2+1]||fallback,sa:null,sb:null,preview:true});return games}
function projectedUpper(roundCount){
  const actual=groupedMatches('upper'),stages=[];
  for(let stage=0;stage<roundCount;stage++){const count=Math.max(1,2**(roundCount-stage-1));if(actual[stage]?.length)stages.push(actual[stage]);else{const previous=stages[stage-1]||[],inputs=[];for(let i=0;i<count*2;i++)inputs.push(knownWinner(previous[i])||`Sieger aus Gewinner-Spiel ${stage}`);stages.push(previewPairs(inputs,count,'Sieger aus offenem Spiel'))}}
  return stages;
}
function projectedLower(roundCount,upperStages,upperRounds){
  const actual=groupedMatches('lower'),stages=[];
  for(let stage=0;stage<roundCount;stage++){
    const count=Math.max(1,2**(upperRounds-1-Math.ceil((stage+1)/2)));
    if(actual[stage]?.length){stages.push(actual[stage]);continue}
    const inputs=[];
    if(stage===0){for(const [i,game] of (upperStages[0]||[]).entries())inputs.push(knownLoser(game)||`Verlierer aus Gewinner-Spiel ${i+1}`)}
    else{const lowerWinners=(stages[stage-1]||[]).map(m=>knownWinner(m)||`Sieger aus Verliererspiel ${stage}`),upperLosers=(upperStages[stage]||[]).map(m=>knownLoser(m)||`Verlierer aus Gewinner-Spiel ${stage+1}`),max=Math.max(lowerWinners.length,upperLosers.length);for(let i=0;i<max;i++){if(lowerWinners[i])inputs.push(lowerWinners[i]);if(upperLosers[i])inputs.push(upperLosers[i])}}
    stages.push(previewPairs(inputs,count,'Noch offen'));
  }
  return stages;
}
function doubleLane(kind,title,stages,roundCount,upperRounds){
  const columns=[];
  for(let stage=1;stage<=roundCount;stage++){
    const games=stages[stage-1]||[];
    const planned=kind==='upper'?Math.max(1,2**(upperRounds-stage)):Math.max(1,2**(upperRounds-1-Math.ceil(stage/2)));
    const count=Math.max(planned,games.length);
    const label=kind==='lower'?'Verlierer aus dem Gewinnerbaum':'Sieger der Vorrunde';
    columns.push(`<section class="bracket-round"><h3>${title} ${stage}</h3><div class="bracket-games">${Array.from({length:count},(_,i)=>bracketCard(games[i],label)).join('')}</div></section>`);
  }
  return `<section class="bracket-side ${kind==='lower'?'loser-side':'winner-side'}"><h2>${title}n</h2><div class="bracket-grid">${columns.join('')}</div></section>`;
}
function renderBracket(){
  if(state.settings.doubleKoPlan){
    const plan=state.settings.doubleKoPlan,preview=T20DoubleKO.evaluate(plan,state.matches).preview,k=Math.log2(plan.size);
    const stages=(kind,count)=>Array.from({length:count},(_,i)=>preview.filter(match=>match.bracket===kind&&match.stage===i+1));
    const finals=preview.filter(match=>match.bracket==='grand').map(match=>`<section class="grand-final"><h3>${match.nodeId==='F2'?'Entscheidungsfinale':'Großes Finale'}</h3>${bracketCard(match)}</section>`).join('');
    $('#bracketGrid').innerHTML=`<div class="double-bracket-layout">${doubleLane('lower','Verliererrunde',stages('lower',2*k-2),2*k-2,k)}${finals}${doubleLane('upper','Gewinnerrunde',stages('upper',k),k,k)}</div>`;return;
  }
  if(['roundrobin','swiss','doublesmix','doubleslottery'].includes(state.settings.mode)){$('#bracketGrid').innerHTML='';return}
  if(state.settings.mode==='knockout'){$('#bracketGrid').innerHTML=singleBracket();return}
  const upperRounds=Math.max(1,Math.ceil(Math.log2(state.players.length))),lowerRounds=Math.max(1,upperRounds*2-2);
  const upperStages=projectedUpper(upperRounds),lowerStages=projectedLower(lowerRounds,upperStages,upperRounds),realFinal=state.matches.find(m=>m.bracket==='grand');
  const projectedFinal={a:knownWinner(upperStages.at(-1)?.[0])||'Sieger Gewinnerbaum',b:knownWinner(lowerStages.at(-1)?.[0])||'Sieger Verliererbaum',sa:null,sb:null,preview:true};
  const final=`<section class="grand-final"><span>🏆</span><h3>Großes Finale</h3>${bracketCard(realFinal||projectedFinal,'Finalist')}</section>`;
  $('#bracketGrid').innerHTML=`<div class="double-bracket-layout">${doubleLane('lower','Verliererrunde',lowerStages,lowerRounds,upperRounds)}${final}${doubleLane('upper','Gewinnerrunde',upperStages,upperRounds,upperRounds)}</div>`;
}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#matchesView').classList.toggle('hidden',b.dataset.tab!=='matches');$('#bracketView').classList.toggle('hidden',b.dataset.tab!=='bracket');$('#tableView').classList.toggle('hidden',b.dataset.tab!=='table')}));
function clearImportedCompetitionForNewSetup(){if(state.started||!state.seasonImportedTo)return false;replaceActiveCompetition();save();return true}
function showTournament(updateUrl=true){if(!canManageTournament()){showHome(updateUrl);return}setShellMode('internal');clearImportedCompetitionForNewSetup();hideMainSections();$('#tournamentManagementPanel')?.classList.remove('hidden');$('#competitionNav')?.classList.remove('hidden');renderTournamentManagement();renderTournament();renderNavigation();T20Cloud.loadStationSuggestions().catch(error=>console.warn('Ergebnisvorschläge konnten nicht geladen werden:',error));if(updateUrl)updateAppUrl('turnier')}
function showSeason(updateUrl=true,shell='public'){if(!isClubMode()){showHome(updateUrl);return}setShellMode(shell);hideMainSections();$('#seasonSection').classList.remove('hidden');renderSeasonView();renderNavigation();if(updateUrl)updateAppUrl('ergebnisse')}
function showInternalSeason(){showSeason(true,'internal')}
function fillSeasonForm(){const h=currentHalfYear();$('#seasonName').value=h.name;$('#seasonCompetition').value='men';$('#seasonStart').value=h.start;$('#seasonEnd').value=h.end;$('#seasonDrops').value='0'}
function closeMenu(){const hero=$('.hero'),btn=$('#menuToggle');hero?.classList.remove('nav-open');if(btn)btn.setAttribute('aria-expanded','false')}
document.addEventListener('submit',e=>{if(!canManageClubData()&&e.target.closest('#settingsForm,#seasonForm,#memberForm,#manualTournamentForm,[data-correction-form]')){e.preventDefault();appAlert('Diese Vereinsverwaltung ist nur für den Vereinsadministrator verfügbar.')}},true);
document.addEventListener('click',e=>{
  const clubOnly=e.target.closest('#seasonActionSelect,[data-remove-member],[data-link-member],[data-delete-tournament],[data-edit-tournament],[data-rename-tournament],#toggleManualTournament');
  if(clubOnly&&!canManageClubData()){e.preventDefault();e.stopPropagation();appAlert('Diese Vereinsverwaltung ist nur für den Vereinsadministrator verfügbar.');return}
  if(!isAdmin()&&e.target.closest('#addToSeasonBtn')){e.preventDefault();e.stopPropagation();assertAdminAction()}
},true);
$('#menuToggle')?.addEventListener('click',e=>{e.stopPropagation();const hero=$('.hero'),open=!hero.classList.contains('nav-open');hero.classList.toggle('nav-open',open);e.currentTarget.setAttribute('aria-expanded',String(open))});
document.addEventListener('click',e=>{if(!e.target.closest('.hero'))closeMenu()});
$('.main-actions')?.addEventListener('click',e=>{if(e.target.closest('button'))closeMenu()});
$('#cloudAdminPanel').addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='testPasswordLoginForm')T20Cloud.signIn($('#testLoginEmail').value.trim(),$('#testLoginPassword').value);
  if(e.target.id==='memberLoginForm')T20Cloud.sendLoginCode($('#memberEmail').value.trim());
  if(e.target.id==='memberCodeForm')T20Cloud.verifyLoginCode($('#memberOtpCode').value);
  if(e.target.id==='memberProfileForm')T20Cloud.saveProfile($('#profileDisplayName').value,$('#profileNickname').value);
  if(e.target.id==='adminPushForm')PushNotifications.send($('#pushTitle').value,$('#pushBody').value,$('#pushUrl').value);
});
$('#cloudAdminPanel').addEventListener('click',async e=>{
  if(e.target.id==='enterLocalAdminPreviewBtn'){T20Cloud.startLocalAdminPreview();return}
  const memberProfile=e.target.closest('[data-member-profile]');if(memberProfile){showPlayerProfile(memberProfile.dataset.memberProfile);return}
  const memberSeason=e.target.closest('[data-member-season]');if(memberSeason){selectedSeasonId=memberSeason.dataset.memberSeason;persistSelectedSeason();showSeason();return}
  if(e.target.closest('[data-member-home]')){showHome();return}
  if(e.target.id==='adminLogoutBtn'||e.target.id==='memberLogoutBtn')T20Cloud.signOut();
  if(e.target.id==='removeAvatarBtn')T20Cloud.removeAvatar();
  if(e.target.id==='refreshMembersBtn')T20Cloud.refreshAdminProfiles();
  if(e.target.id==='changeMemberEmailBtn'){T20Cloud.otpEmail='';T20Cloud.authMessage='';T20Cloud.authError='';renderCloudPanel();return}
  if(e.target.id==='resendMemberCodeBtn'){T20Cloud.sendLoginCode();return}
  if(e.target.id==='enablePushBtn')PushNotifications.enable();
  if(e.target.id==='disablePushBtn')PushNotifications.disable();
  const checkIn=e.target.closest('[data-admin-checkin]');if(checkIn){adminCheckInEventKey=checkIn.dataset.adminCheckin;renderCloudPanel();return}
  if(e.target.closest('[data-checkin-close]')){adminCheckInEventKey='';renderCloudPanel();return}
  if(e.target.closest('[data-checkin-transfer]')){await transferAdminCheckInToTournament();return}
  if(e.target.closest('[data-admin-home]')){showHome();return}
  if(e.target.closest('[data-admin-tournament]')){showTournament();return}
  if(e.target.id==='openDartVisionLabBtn'){showDartVisionLab();return}
  if(e.target.id==='closeAuthTabBtn'){try{window.close()}catch{}}
  if(e.target.id==='continueAuthTabBtn'){clearTimeout(T20Cloud.authHandoffCloseTimer);T20Cloud.authHandoffActive=false;showLogin()}
  if(e.target.id==='backupDownloadBtn')backupTriple20Data();
  if(e.target.id==='uploadLocalBtn')T20Cloud.uploadLocalWithBackup();
  if(e.target.id==='loadCloudBtn')T20Cloud.loadCloudConfirmed();
  if(e.target.id==='forceCloudBtn'){if(await appConfirm('Lokale Daten wirklich in der Cloud überschreiben?'))T20Cloud.syncAll({force:true,all:true})}
});
$('#tournamentManagementPanel')?.addEventListener('click',async event=>{
  const checkIn=event.target.closest('[data-admin-checkin]');if(checkIn){adminCheckInEventKey=checkIn.dataset.adminCheckin;renderTournamentManagement();return}
  if(event.target.closest('[data-checkin-close]')){adminCheckInEventKey='';renderTournamentManagement();return}
  if(event.target.closest('[data-checkin-transfer]')){await transferAdminCheckInToTournament();return}
  const remove=event.target.closest('[data-remove-member]');if(remove){await removeSeasonMember(remove.dataset.removeMember);renderAdminMemberAssignment();return}
  const link=event.target.closest('[data-link-member]');if(link){const profileId=link.closest('.member-link-control')?.querySelector('select')?.value;if(!profileId){appAlert('Bitte zuerst einen registrierten Benutzer auswählen.');return}await linkSeasonMemberProfile(link.dataset.linkMember,profileId);renderAdminMemberAssignment();return}
});
$('#tournamentManagementPanel')?.addEventListener('submit',event=>{event.preventDefault();if(event.target.id==='publicScheduleForm'){createPublicSchedule();return}if(event.target.id==='memberForm'){addSeasonMember(event.target.querySelector('#memberName')?.value||'');renderAdminMemberAssignment()}});
$('#tournamentManagementPanel')?.addEventListener('change',event=>{const competitionSelect=event.target.closest('[data-member-competition]');if(competitionSelect){setPlayerCompetition(competitionSelect.dataset.memberCompetition,competitionSelect.value);renderAdminMemberAssignment();return}if(event.target.id!=='adminMemberSeasonSelect')return;selectedSeasonId=event.target.value;persistSelectedSeason();renderAdminMemberAssignment()});
$('#cloudAdminPanel').addEventListener('change',event=>{
  if(event.target.id==='globalPushToggle'){setGlobalPushEnabled(event.target.checked);return}
  if(event.target.id==='tyrolDartsAdToggle'){setTyrolDartsAdEnabled(event.target.checked);return}
  const competitionSelect=event.target.closest('[data-member-competition]');if(competitionSelect){setPlayerCompetition(competitionSelect.dataset.memberCompetition,competitionSelect.value);return}
  const roleSelect=event.target.closest('[data-member-role]');
  if(roleSelect)T20Cloud.setMemberRole(roleSelect.dataset.memberRole,roleSelect.value);
});
$('#cloudAdminPanel').addEventListener('change',e=>{if(e.target.id==='backupImportInput')handleBackupImport(e.target.files?.[0]);if(e.target.id==='profileAvatarInput'&&e.target.files?.[0])openAvatarCrop(e.target.files[0]).catch(error=>{T20Cloud.authError=`Bild konnte nicht geöffnet werden: ${error?.message||'Unbekannter Fehler'}`;renderCloudPanel()})});
document.addEventListener('click',e=>{if(e.target.id==='cancelAvatarCropBtn'||e.target.id==='avatarCropOverlay')closeAvatarCrop();if(e.target.id==='saveAvatarCropBtn')saveAvatarCrop()});
$('#brandHomeBtn')?.addEventListener('click',()=>showHome());
$('#showNewsBtn')?.addEventListener('click',()=>scrollPublicSection('#publicFeatureStory'));
$('#showEventsBtn')?.addEventListener('click',()=>scrollPublicSection('.public-next-panel'));
$('#showPublicLiveBtn')?.addEventListener('click',()=>scrollPublicSection('.public-live-band'));
$('#showRankingsBtn')?.addEventListener('click',()=>scrollPublicSection('.public-home-rankings'));
$('#showClubInfoBtn')?.addEventListener('click',()=>showClubInfo());
$('#showDashboardBtn')?.addEventListener('click',()=>showDashboard());
$('#showInternalSeasonBtn')?.addEventListener('click',showInternalSeason);
$('#dashboardPublicHomeBtn')?.addEventListener('click',()=>showHome());
$('#dashboardPreviewBtn')?.addEventListener('click',()=>showHome());
$('#dashboardMemberViewBtn')?.addEventListener('click',()=>showMemberPreview());
$('#memberPreviewBackBtn')?.addEventListener('click',()=>showDashboard());
$('#dashboardSection')?.addEventListener('click',event=>{const start=event.target.closest('[data-dashboard-tournament]');if(start){setActiveCompetition(start.dataset.dashboardTournament);showTournament()}});
$('#showTournamentBtn').addEventListener('click',()=>{if(canManageTournament())showTournament()});
$('#showClubDuelsBtn')?.addEventListener('click',()=>showClubDuels());
$('#newClubDuelBtn')?.addEventListener('click',()=>{if(!assertAdminAction())return;selectedClubDuelId='';clubDuelSetupOpen=true;renderClubDuels()});
$('#clubDuelsSection')?.addEventListener('change',event=>{if(event.target.id==='clubDuelMode'){updateClubDuelModeFields();return}const player=event.target.closest('[data-duel-player]'),card=player?.closest('[data-duel-match]');if(card)saveClubDuelLineup(+card.dataset.duelMatch,card)});
$('#clubDuelsSection')?.addEventListener('submit',event=>{if(event.target.id!=='clubDuelSetupForm')return;event.preventDefault();createClubDuel(event.target)});
$('#clubDuelsSection')?.addEventListener('click',async event=>{
  if(event.target.closest('[data-duel-cancel]')){clubDuelSetupOpen=false;renderClubDuels();return}
  const member=event.target.closest('[data-duel-member]');if(member){const field=$('#clubDuelHomePlayers'),players=parseClubRoster(field?.value);if(!players.some(name=>name.toLowerCase()===member.dataset.duelMember.toLowerCase()))players.push(member.dataset.duelMember);if(field)field.value=players.join('\n');return}
  const open=event.target.closest('[data-duel-open]');if(open){selectedClubDuelId=open.dataset.duelOpen;clubDuelSetupOpen=false;renderClubDuels();return}
  const saveScore=event.target.closest('[data-duel-save-score]');if(saveScore){saveClubDuelMatch(+saveScore.dataset.duelSaveScore);return}
  const tv=event.target.closest('[data-duel-tv]');if(tv){window.open(clubDuelTvUrl(tv.dataset.duelTv),'_blank','noopener');return}
  if(event.target.closest('[data-duel-finish]')){await finishClubDuel();return}
  if(event.target.closest('[data-duel-back]')){selectedClubDuelId='';renderClubDuels();return}
  const reopen=event.target.closest('[data-duel-reopen]');if(reopen){reopenClubDuel(reopen.dataset.duelReopen);return}
  const remove=event.target.closest('[data-duel-delete]');if(remove)await deleteClubDuel(remove.dataset.duelDelete);
});
$('#clubDuelTvFullscreenBtn')?.addEventListener('click',toggleTvFullscreen);
$('#showHomeBtn')?.addEventListener('click',()=>showHome());
$('#publicHomeSection')?.addEventListener('click',event=>{const slide=event.target.closest('[data-news-slide]');if(slide){changeHomeNewsSlide(slide.dataset.newsSlide);return}const editor=event.target.closest('[data-home-editor]');if(editor&&isFullAdmin()){if(editor.dataset.homeEditor==='news')editingHomeNewsId=editor.dataset.homeNewsId||homeNewsItems()[publicHomeNewsIndex]?.id||'main';showSettings();requestAnimationFrame(()=>{document.getElementById('homePageSettings')?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById(editor.dataset.homeEditor==='info'?'homeInfoTitle':'homeNewsTitle')?.focus()});return}const player=event.target.closest('[data-public-player]');if(player){showPlayerProfile(player.dataset.publicPlayer);return}const live=event.target.closest('[data-open-live]');if(live){showLive(live.dataset.openLive);return}if(event.target.closest('[data-event-login]')){showLogin();return}const registration=event.target.closest('[data-event-registration]');if(registration){changeTournamentRegistration(registration.dataset.eventRegistration,registration.dataset.registrationAction);return}const calendar=event.target.closest('[data-public-calendar]');if(calendar){addPublicEventToCalendar(calendar.dataset.publicCalendar);return}const whatsapp=event.target.closest('[data-public-whatsapp]');if(whatsapp){sharePublicEventOnWhatsApp(whatsapp.dataset.publicWhatsapp);return}const graphic=event.target.closest('[data-result-graphic]');if(graphic){openResultGraphic(graphic.dataset.resultGraphic);return}const remove=event.target.closest('[data-public-delete]');if(remove){deletePublicTournament(remove.dataset.publicDelete);return}const results=event.target.closest('[data-public-results]');if(results){resultsViewMode=results.dataset.publicResults==='standalone'?'standalone':'leagues';const tournamentId=results.dataset.resultsTournament;if(tournamentId)expandedStandaloneTournamentIds.add(String(tournamentId));showSeason();if(tournamentId)requestAnimationFrame(()=>document.getElementById(`standalone-result-${tournamentId}`)?.scrollIntoView({block:'start'}));return}const nav=event.target.closest('[data-public-nav]');if(nav?.dataset.publicNav==='turnier'){const liveKey=liveTvCompetitions()[0]?.key||state.activeCompetition||'men';isAdmin()?showTournament():showLive(liveKey);return}if(nav?.dataset.publicNav==='verein'){showClubInfo();return}if(nav&&['saison','ergebnisse'].includes(nav.dataset.publicNav)){showSeason();return}const seasonButton=event.target.closest('[data-season-open]');if(seasonButton){selectedSeasonId=seasonButton.dataset.seasonOpen;persistSelectedSeason();showSeason()}});
$('#publicFeatureStory')?.addEventListener('mouseenter',stopHomeNewsSlider);
$('#publicFeatureStory')?.addEventListener('mouseleave',startHomeNewsSlider);
$('#publicFeatureStory')?.addEventListener('focusin',stopHomeNewsSlider);
$('#publicFeatureStory')?.addEventListener('focusout',()=>setTimeout(startHomeNewsSlider,0));
$('#clubInfoSection')?.addEventListener('click',event=>{if(event.target.closest('[data-club-info-back]')){showHome();return}if(event.target.closest('[data-club-info-edit]')&&isFullAdmin()){showSettings();requestAnimationFrame(()=>{document.getElementById('clubInfoEditor')?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('clubInfoTagline')?.focus()});return}if(event.target.closest('[data-membership-open]')){event.target.closest('[data-membership-open]').classList.add('hidden');$('#membershipApplicationForm')?.classList.remove('hidden');requestAnimationFrame(()=>$('#membershipName')?.focus());return}if(event.target.closest('[data-membership-cancel]')){renderClubInfo();return}const status=event.target.closest('[data-membership-status]');if(status){T20Cloud.setMembershipApplicationStatus(status.dataset.membershipId,status.dataset.membershipStatus);return}const remove=event.target.closest('[data-membership-delete]');if(remove)T20Cloud.deleteMembershipApplication(remove.dataset.membershipDelete)});
$('#clubInfoSection')?.addEventListener('submit',async event=>{if(event.target.id!=='membershipApplicationForm')return;event.preventDefault();const form=event.target,status=$('#membershipFormStatus'),submit=form.querySelector('[type="submit"]'),payload={name:$('#membershipName').value.trim(),birthDate:$('#membershipBirthDate').value,address:$('#membershipAddress').value.trim(),phone:$('#membershipPhone').value.trim(),email:$('#membershipEmail').value.trim().toLowerCase(),accepted:$('#membershipAccepted').checked,website:$('#membershipWebsite').value.trim()};status.textContent='Anfrage wird sicher übermittelt …';status.className='';submit.disabled=true;try{const saved=await T20Cloud.submitMembershipApplication(payload);if(!saved)return;form.reset();form.querySelectorAll('input,textarea,button').forEach(control=>control.disabled=true);status.textContent='Danke! Deine Mitgliedsanfrage wurde übermittelt. Der Dartclub Achensee meldet sich persönlich bei dir.';status.className='success'}catch(error){console.error('Mitgliedsanfrage fehlgeschlagen:',error);status.textContent=/triple20_submit_membership_application|Could not find the function/i.test(error?.message||'')?'Die Online-Anmeldung ist noch nicht eingerichtet. Bitte den Vereinsadministrator informieren.':`Die Anfrage konnte nicht gesendet werden: ${error?.message||'Bitte später erneut versuchen.'}`;status.className='error';submit.disabled=false}});
document.addEventListener('click',event=>{if(event.target.id==='closeResultGraphicBtn'||event.target.id==='resultGraphicOverlay'){closeResultGraphic();return}if(event.target.id==='downloadResultGraphicBtn'){downloadResultGraphic();return}if(event.target.closest('#shareResultGraphicBtn'))shareResultGraphic()});
document.addEventListener('click',e=>{const modeButton=e.target.closest('[data-tournament-mode]');if(modeButton){setTournamentViewMode(modeButton.dataset.tournamentMode);return}const competitionButton=e.target.closest('[data-competition]');if(competitionButton){const liveRoute=new URLSearchParams(location.search).get('bereich')==='live';if(liveRoute||!isAdmin())showLive(competitionButton.dataset.competition);else setActiveCompetition(competitionButton.dataset.competition)}});
$('#showLiveQrBtn')?.addEventListener('click',openLiveQr);
$('#openTvViewBtn')?.addEventListener('click',()=>window.open(tvPublicUrl(),'_blank','noopener'));
$('#tvDisplayControls')?.addEventListener('click',event=>{const displayButton=event.target.closest('[data-tv-display]');if(displayButton){setTvDisplayMode(displayButton.dataset.tvDisplay);return}const pauseButton=event.target.closest('[data-tv-pause]');if(pauseButton)setTvCompetitionPaused(pauseButton.dataset.tvPause)});
$('#tvBracketPageControls')?.addEventListener('click',event=>{const button=event.target.closest('[data-tv-page]');if(button)changeTvBracketPage(button.dataset.tvPage)});
$('#tvFullscreenBtn')?.addEventListener('click',toggleTvFullscreen);
$('#tvRefreshBtn')?.addEventListener('click',()=>T20Cloud.loadLiveTournament().then(renderTvView).catch(error=>console.warn('TV-Aktualisierung fehlgeschlagen:',error)));
window.addEventListener('storage',event=>{if(event.key!=='dartTournament'||$('#tvSection')?.classList.contains('hidden')||!event.newValue)return;const next=safeJsonParse(event.newValue);if(!next)return;replaceTournamentState(next);renderTvView()});
document.addEventListener('click',async event=>{if(event.target.id==='closeLiveQrBtn'||event.target.id==='liveQrOverlay'){$('#liveQrOverlay')?.remove();return}const switchButton=event.target.closest('[data-live-qr-competition]');if(switchButton){renderLiveQrCode(switchButton.dataset.liveQrCompetition);return}const copyButton=event.target.closest('#copyLiveQrLinkBtn');if(copyButton){const value=$('#liveQrLink')?.href||'';try{await navigator.clipboard.writeText(value);copyButton.firstChild.textContent='LINK KOPIERT '}catch{await appPrompt('Live-Link kopieren:',value)}}});
$('#showSeasonBtn').addEventListener('click',()=>showSeason(true,'public'));
$('#showSettingsBtn').addEventListener('click',()=>showSettings());
$('#showLoginBtn').addEventListener('click',()=>{if(isAdmin()&&currentShellMode==='public')showDashboard();else showLogin()});
$('#closeDartVisionLabBtn')?.addEventListener('click',()=>showLogin());
$('#dartVisionLabSection')?.addEventListener('submit',event=>{event.preventDefault();if(event.target.id==='dartVisionSetupForm'){startDartVisionTest();return}if(event.target.id==='dartVisionThrowForm'){const input=$('#dartVisionThrowScore'),score=Number(input?.value);if(!enterDartVisionThrow(score))appAlert('Bitte eine ganze Zahl zwischen 0 und 180 eingeben.')}});
$('#dartVisionLabSection')?.addEventListener('click',event=>{const board=event.target.closest('[data-dartvision-board]');if(board){dartVisionLab.activeBoard=+board.dataset.dartvisionBoard;saveDartVisionLab();renderDartVisionLab();return}if(event.target.closest('[data-dartvision-undo]')){undoDartVisionThrow();return}if(event.target.closest('[data-dartvision-reset]')){resetDartVisionBoard();return}if(event.target.closest('[data-dartvision-new]'))resetDartVisionBoard()});
window.addEventListener('popstate',applyAppRoute);
$('#themeMode').addEventListener('change',e=>renderThemePreview(e.target.value));
$('#settingsForm').addEventListener('submit',e=>{e.preventDefault();const themeMode=$('#themeMode').value,preset=themeModes[themeMode]||themeModes.light;updateSettings({appName:'Triple20',mode:$('#settingsMode').value,themeMode,home:{news:{...appSettings.home.news,eyebrow:$('#homeNewsEyebrow').value.trim()||'DCA NEWS',title:$('#homeNewsTitle').value.trim(),text:$('#homeNewsText').value.trim(),imagePosition:$('#homeNewsImagePosition').value,imageLayout:$('#homeNewsImageLayout').value},info:{eyebrow:$('#homeInfoEyebrow').value.trim()||'TERMINE',title:$('#homeInfoTitle').value.trim()||'Als Nächstes',mode:$('#homeInfoMode').value==='custom'?'custom':'auto',items:homeInfoItemsFromText($('#homeInfoItems').value)}},clubInfo:{tagline:$('#clubInfoTagline').value.trim(),description:$('#clubInfoDescription').value.trim(),venue:$('#clubInfoVenue').value.trim(),address:$('#clubInfoAddress').value.trim(),hours:$('#clubInfoHours').value.trim(),contactName:$('#clubInfoContactName').value.trim(),email:$('#clubInfoEmail').value.trim(),phone:$('#clubInfoPhone').value.trim(),mapsUrl:$('#clubInfoMapsUrl').value.trim()},club:{enabled:$('#settingsMode').value==='club',name:$('#settingsClubName').value.trim(),logo:$('#settingsClubLogo').value.trim(),color:$('#settingsClubColor').value,seasonMode:$('#settingsSeasonMode').value,dropResults:appSettings.club.dropResults,pointSystem:{5:+$('#points5').value,4:+$('#points4').value,3:+$('#points3').value,2:+$('#points2').value,1:+$('#points1').value,0:+$('#points0').value}},tournament:{defaultMode:$('#settingsDefaultMode').value,defaultFormat:$('#settingsDefaultFormat').value,defaultLegs:+$('#settingsDefaultLegs').value},theme:{...preset.theme}});applyTournamentDefaults();showDashboard()});
$('#settingsForm').addEventListener('submit',()=>{syncHomeNewsEditorFields();if(editingHomeNewsId!=='main'){const main=homeNewsItem('main');$('#homeNewsEyebrow').value=main.eyebrow||'DCA NEWS';$('#homeNewsTitle').value=main.title||'';$('#homeNewsText').value=main.text||'';$('#homeNewsImagePosition').value=main.imagePosition||'center';$('#homeNewsImageLayout').value=main.imageLayout||'right'}appSettings=mergeSettings(appSettings,{clubInfo:{...appSettings.clubInfo,imagePosition:$('#clubInfoImagePosition').value,imageLayout:$('#clubInfoImageLayout').value}})},true);
$('#homeNewsImageInput')?.addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)T20Cloud.uploadHomeNewsImage(file)});
$('#removeHomeNewsImageBtn')?.addEventListener('click',()=>T20Cloud.removeHomeNewsImage());
$('#addHomeNewsItemBtn')?.addEventListener('click',addHomeNewsItem);
$('#deleteHomeNewsItemBtn')?.addEventListener('click',()=>T20Cloud.deleteHomeNewsItem());
$('#homeNewsItemTabs')?.addEventListener('click',event=>{const button=event.target.closest('[data-home-news-edit]');if(!button||button.dataset.homeNewsEdit===editingHomeNewsId)return;syncHomeNewsEditorFields();editingHomeNewsId=button.dataset.homeNewsEdit;renderHomeEditor()});
$('#clubInfoImageInput')?.addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)T20Cloud.uploadClubInfoImage(file)});
$('#removeClubInfoImageBtn')?.addEventListener('click',()=>T20Cloud.removeClubInfoImage());
$('#seasonActionSelect').addEventListener('change',async e=>{const action=e.target.value;e.target.value='';if(!canManageClubData()||!action)return;if(action==='new'){seasonFormCreating=true;seasonFormOpen=true;renderSeasonView();return}if(action==='edit'){seasonFormCreating=false;seasonFormOpen=!seasonFormOpen;renderSeasonView();return}const season=selectedSeason();if(!season)return;if(action==='archive'){if(!await appConfirm(`Wertung „${season.name}“ archivieren? Ergebnisse und Rangliste bleiben erhalten.`))return;season.archived=true;saveSeason(season);return}if(action==='delete'){if(!await appConfirm(`Wertung „${season.name}“ wirklich endgültig löschen? Alle zugeordneten Spieltage und Punkte dieser Wertung werden entfernt.`))return;deleteSeason(season.id)}});
$('#seasonForm').addEventListener('submit',e=>{e.preventDefault();updateSeasonFromForm()});
$('#seasonSelect').addEventListener('change',e=>{selectedSeasonId=e.target.value;seasonFormOpen=false;seasonFormCreating=false;manualTournamentOpen=false;expandedSeasonTournamentIds.clear();persistSelectedSeason();renderSeasonView()});
$('#seasonOverview').addEventListener('click',event=>{const button=event.target.closest('[data-season-standings-lock]');if(button)setSeasonStandingsLocked(button.dataset.seasonStandingsLock==='1')});
document.querySelectorAll('[data-results-view]').forEach(button=>button.addEventListener('click',()=>{resultsViewMode=button.dataset.resultsView==='standalone'?'standalone':'leagues';renderResultsViewMode()}));
document.querySelectorAll('.season-tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.season-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');['standings','tournaments','stats','honors'].forEach(tab=>$('#season'+tab[0].toUpperCase()+tab.slice(1))?.classList.toggle('hidden',b.dataset.seasonTab!==tab))}));
$('#seasonStandalone')?.addEventListener('click',event=>{const remove=event.target.closest('[data-delete-standalone]');if(remove){deleteStandaloneTournament(remove.dataset.deleteStandalone);return}const button=event.target.closest('[data-standalone-detail]');if(!button)return;const id=String(button.dataset.standaloneDetail),box=document.getElementById(`standalone-details-${id}`),open=box?.classList.contains('hidden');if(open)expandedStandaloneTournamentIds.add(id);else expandedStandaloneTournamentIds.delete(id);renderStandaloneTournaments()});
$('#seasonStandings').addEventListener('click',e=>{const mode=e.target.closest('[data-season-ranking-mode]');if(mode){seasonRankingMode=mode.dataset.seasonRankingMode==='total'?'total':'clean';window.T20BrowserStorage.setItem('triple20_season_ranking_mode',seasonRankingMode);renderSeasonStandings();return}const toggle=e.target.closest('[data-season-mobile-toggle]');if(toggle){const reference=toggle.dataset.seasonMobileToggle,details=[...document.querySelectorAll('[data-season-mobile-details]')].find(item=>item.dataset.seasonMobileDetails===reference),open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));toggle.closest('.season-mobile-player')?.classList.toggle('is-open',!open);details?.classList.toggle('hidden',open);return}const el=e.target.closest('[data-season-player]');if(el)showPlayerProfile(el.dataset.seasonPlayer)});
$('#playerProfileSection')?.addEventListener('click',event=>{if(event.target.closest('[data-profile-back]')){history.length>1?history.back():showHome();return}const share=event.target.closest('[data-profile-share]');if(share){sharePlayerProfile(share.dataset.profileShare);return}const season=event.target.closest('[data-profile-season]');if(season){selectedSeasonId=season.dataset.profileSeason;persistSelectedSeason();showSeason()}});
$('#seasonTournaments').addEventListener('submit',async e=>{if(e.target.matches?.('[data-correction-form]')){e.preventDefault();await correctSeasonTournamentFromForm(e.target);return}if(e.target.id!=='manualTournamentForm')return;e.preventDefault();addManualTournamentFromForm()});
$('#seasonTournaments').addEventListener('click',async e=>{
  const detailId=e.target.dataset.tournamentDetail,editId=e.target.dataset.editTournament,renameId=e.target.dataset.renameTournament,deleteId=e.target.dataset.deleteTournament,cancelId=e.target.dataset.cancelCorrection;
  if(e.target.id==='toggleManualTournament'){manualTournamentOpen=!manualTournamentOpen;renderSeasonTournaments();return}
  if(e.target.id==='addManualMatch'){const rows=$('#manualMatchRows'),players=manualTournamentPlayers();if(rows)rows.insertAdjacentHTML('beforeend',manualMatchRow(players,Math.max(1,...[...rows.querySelectorAll('[data-manual-round]')].map(input=>+input.value||1))));return}
  if(e.target.dataset.removeManualMatch!==undefined){e.target.closest('[data-manual-match]')?.remove();return}
  if(detailId){const box=document.getElementById(`details-${detailId}`);if(box){const willOpen=box.classList.contains('hidden');box.classList.toggle('hidden',!willOpen);if(willOpen)expandedSeasonTournamentIds.add(String(detailId));else expandedSeasonTournamentIds.delete(String(detailId));e.target.textContent=willOpen?'Details ausblenden':'Details anzeigen'}return}
  if(editId){editingSeasonTournamentId=String(editId);expandedSeasonTournamentIds.add(String(editId));renderSeasonTournaments();return}
  if(cancelId){editingSeasonTournamentId='';renderSeasonTournaments();return}
  if(renameId){await renameSeasonTournament(renameId);return}
  if(deleteId){const season=selectedSeason(),tournament=season?.tournaments?.find(t=>t.id===deleteId);if(!season||!tournament)return;if(!await appConfirm(`Spieltag „${tournament.name}“ vom ${tournament.date} wirklich aus der Saison löschen?`))return;deleteTournamentFromSeason(season.id,deleteId)}
});
$('#seasonPlayerDetail').addEventListener('click',e=>{if(e.target.classList.contains('close-detail'))$('#seasonPlayerDetail').innerHTML=''});
$('#winnerCard').addEventListener('click',async e=>{if(e.target.id==='exportCurrentTournamentBtn'){exportCurrentTournamentJson();return}if(e.target.id==='seasonFromWinnerBtn'){showSeason();return}if(e.target.id==='finishStandaloneTournamentBtn'){saveTournamentToHistory();const savedId=state.savedToHistory,savedRecord=loadTournamentHistory().find(item=>String(item.id)===String(savedId||''));if(!savedId||!savedRecord){appAlert('Das Turnier konnte nicht in das Ergebnisarchiv übernommen werden. Es bleibt geöffnet; bitte nichts zurücksetzen.');return}markCurrentTournamentStandalone();state.started=false;save({queueCloud:false});renderSeasonImport(champion());const finalKeys=['dartTournament',TOURNAMENT_HISTORY_KEY];await T20Cloud.syncAll({keys:finalKeys});renderPublicHome({refreshRegistrations:false});if(finalKeys.some(key=>T20Cloud.pendingKeys.has(key))){appAlert('Das eigenständige Turnier ist auf diesem Gerät gespeichert, aber noch nicht vollständig online. Bitte die App geöffnet lassen und die Internetverbindung prüfen.');return}const confirmedOnline=await scheduledTournamentExistsOnline(savedId).catch(()=>false);if(!confirmedOnline){T20Cloud.pendingKeys.add(TOURNAMENT_HISTORY_KEY);T20Cloud.persistPendingKeys();appAlert('Das Turnier ist auf diesem Gerät gespeichert, aber der Eintrag im Online-Archiv konnte nicht bestätigt werden. Bitte die App geöffnet lassen und nichts zurücksetzen.');return}appAlert('Das Turnier wurde unter „Ergebnisse → Einzelturniere“ gespeichert, online kontrolliert und aus der Live-Ansicht entfernt. Die Saisonwertungen bleiben unverändert.');return}if(e.target.id!=='addToSeasonBtn')return;const id=$('#seasonImportSelect')?.value;if(!id)return;const tournament=currentTournamentRecordForImport(),importedSeason=addTournamentToSeason(id,tournament);if(!importedSeason)return;updateTournamentHistoryRecord(tournament);state.seasonImportedTo=importedSeason.id;state.seasonTournamentId=tournament.id;state.started=false;save({queueCloud:false});renderSeasonImport(champion());const finalKeys=['dartTournament','tripleTwentySeasons','triple20_tournaments'];await T20Cloud.syncAll({keys:finalKeys});renderPublicHome({refreshRegistrations:false});if(finalKeys.some(key=>T20Cloud.pendingKeys.has(key))){appAlert(`Das Turnier ist auf diesem Gerät sicher gespeichert, konnte aber noch nicht vollständig online in „${importedSeason.name}“ übernommen werden. Bitte die App geöffnet lassen und die Internetverbindung prüfen.`);return}appAlert(`Turnier wurde in „${importedSeason.name}“ übernommen, online gespeichert und aus der Live-Ansicht entfernt.`)});
$('#exportSeasonJsonBtn').addEventListener('click',exportSeasonJson);
$('#exportStandingsCsvBtn').addEventListener('click',exportStandingsCsv);
async function renameEvent(){
  if(!isAdmin())return;
  const next=await appPrompt('Neuer Name des Spieltags:',state.eventName||'');
  if(next===null)return;
  const name=next.trim();if(!name){appAlert('Bitte einen Namen für den Spieltag eingeben.');return}
  state.eventName=name;
  for(const [key,competition] of Object.entries(state.competitions||{})){competition.settings=competition.settings||{};competition.settings.eventName=name;competition.settings.name=`${name} – ${competitionLabel(key)}`}
  state.settings={...(state.settings||{}),eventName:name,name:competitionTitle()};
  if(state.savedToHistory){const history=loadTournamentHistory(),record=history.find(item=>item.id===state.savedToHistory);if(record){record.eventName=name;record.name=competitionTitle();record.settings={...(record.settings||{}),eventName:name,name:competitionTitle()};persistTournamentHistory(history)}}
  if(state.seasonImportedTo&&state.seasonTournamentId){const season=seasonStore.seasons.find(item=>item.id===state.seasonImportedTo),record=season?.tournaments?.find(item=>item.id===state.seasonTournamentId);if(record){record.eventName=name;record.name=competitionTitle();record.settings={...(record.settings||{}),eventName:name,name:competitionTitle()};persistSeasons()}}
  save();renderTournament();renderNavigation();
}
async function endTournamentEarly(){
  if(!isAdmin()||!state.started||state.endedEarly)return;
  const status=earlyEndRoundStatus();if(!status.played){appAlert('Das Turnier kann erst beendet werden, wenn mindestens ein reguläres Spiel abgeschlossen ist.');return}
  if(isEliminationTournament(state)){
    if(!await appConfirm(`K.-o.-Turnier wirklich abbrechen?\n\nGespielte Partien: ${status.played} von ${status.total}\n\nEs wird ausdrücklich kein Sieger und keine Platzierung vergeben. Das Turnier erhält keine Saisonpunkte; die gespielten Paarungen bleiben nur als Nachweis gespeichert.`))return;
    state.endedEarly=true;save({queueCloud:false});archiveCancelledEliminationTournament();const additionalKeys=[TOURNAMENT_HISTORY_KEY,SEASON_KEY];replaceActiveCompetition();save({queueCloud:false});renderPlayers();renderTournament();showTournament();const published=await publishLiveTournament({additionalKeys});renderPublicHome({refreshRegistrations:false});appAlert(published?'Das K.-o.-Turnier wurde ohne Sieger, Platzierung und Saisonpunkte als abgebrochen gespeichert.':'Der Abbruch ist auf diesem Gerät gespeichert, aber noch nicht vollständig online. Bitte die App geöffnet lassen und die Verbindung prüfen.');return
  }
  if(!status.canShorten){appAlert(`Runde ${status.incompleteRound} ist bereits begonnen, aber noch nicht vollständig. Bitte diese Runde fertig spielen oder einzelne falsche Ergebnisse korrigieren, bevor der Zwischenstand gewertet wird.`);return}
  const leader=standings()[0]?.name||'der aktuelle Tabellenführer';
  if(!await appConfirm(`Turnier vorzeitig beenden und den Zwischenstand werten?\n\nAktueller Tabellenführer: ${leader}\nVollständig gespielte Runden: ${status.playedRounds.join(', ')}\nGespielte Partien: ${status.played} von ${status.total}\n\nDer Datensatz wird sichtbar als „vorzeitig beendet“ gekennzeichnet und kann danach in die Saisonwertung übernommen werden.`))return;
  state.endedEarly=true;save({queueCloud:false});renderTournament();await publishLiveTournament({notifyOnError:true});
}
async function reset(){if(state.started&&!await appConfirm(`Den Bewerb „${competitionLabel()}“ wirklich löschen? Der andere Bewerb bleibt erhalten.`))return;const hadPublishedTournament=Object.values(state.competitions||{}).some(competition=>competition?.started);replaceActiveCompetition();save({queueCloud:false});renderPlayers();renderTournament();showTournament();if(hadPublishedTournament)await publishLiveTournament({notifyOnError:true})}
$('#resetBtn').onclick=reset;$('#undoLastScoreBtn').onclick=undoLastScore;$('#endTournamentBtn').onclick=endTournamentEarly;$('#finishReset').onclick=reset;$('#renameEventBtn').onclick=renameEvent;
$('#openStatsStationBtn').onclick=()=>showStatsStation();
$('#closeStatsStationBtn').onclick=showHome;
$('#statsStationFile').addEventListener('change',event=>analyzeStatsStationImage(event.target.files?.[0]));
$('#statsStationMatch').addEventListener('change',()=>{$('#statsStationPreview').classList.add('hidden');$('#statsStationStatus').textContent='Jetzt den Autodarts-Screenshot dieses Spiels auswählen.';renderStatsStationStored()});
$('#statsStationPreview').addEventListener('submit',event=>{if(event.target.id!=='statsStationConfirmForm')return;event.preventDefault();saveStatsStationResult(event.target)});
$('#statsStationAuthorization').addEventListener('submit',event=>{if(event.target.id!=='statsStationAuthorizationForm')return;event.preventDefault();authorizeStatsStation(event.target)});
$('#statsStationAuthorization').addEventListener('click',event=>{const button=event.target.closest('[data-revoke-stats-station]');if(button)revokeStatsStation(button.dataset.revokeStatsStation)});
$('#statsStationStored').addEventListener('click',event=>{if(event.target.id==='deleteStatsStationBtn')deleteStatsStationResult()});
registerAccess();applyTheme();applyTournamentDefaults();fillSeasonForm();renderPlayers();renderSettingsForm();renderNavigation();renderSeasonView();applyAppRoute();T20Cloud.init().finally(applyAppRoute);
