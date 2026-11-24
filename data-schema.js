(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.T20DataSchema=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CURRENT_VERSION=3;
  const KEYS={
    tournament:'dartTournament',
    seasons:'tripleTwentySeasons',
    settings:'triple20_settings',
    tournaments:'triple20_tournaments',
    clubDuels:'triple20_club_duels',
    tvSettings:'triple20_tv_settings'
  };
  const COMPETITION_KEYS=['players','playerIds','playerProfileIds','started','liveSessionId','liveStartedAt','matches','settings','groups','withdrawn','endedEarly','savedToHistory','seasonImportedTo','seasonTournamentId','scheduledEventId','scheduledSeasonId','scheduledStandalone','scheduledCompetition','scheduledViaTournamentManagement','groupStage','scoreAudit','scoreUndoStack','seedingDraft'];
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const normalizeName=name=>String(name||'').trim().replace(/\s+/g,' ').toLowerCase();
  const normalizeCompetition=value=>['men','women','open'].includes(value)?value:'open';
  const profilePlayerId=profileId=>profileId?`profile:${String(profileId).replace(/^profile:/,'')}`:'';
  function legacyHash(value){let hash=2166136261;for(const character of normalizeName(value)){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(16).padStart(8,'0')}
  const legacyPlayerId=name=>normalizeName(name)?`legacy:${legacyHash(name)}`:'';
  const realPlayerName=name=>{const value=String(name||'').trim();return value&&!['Freilos','Pause','Noch offen'].includes(value)?value:''};
  const mappedValue=(map,name)=>map?.[name]||Object.entries(map||{}).find(([stored])=>normalizeName(stored)===normalizeName(name))?.[1]||'';
  const emptyCompetition=()=>({players:[],playerIds:{},playerProfileIds:{},started:false,matches:[],settings:{}});
  function versionOf(value){return Array.isArray(value)?0:Number.isInteger(value?.schemaVersion)?value.schemaVersion:0}
  function unsupported(key,version){const error=new Error(`Der Datenbereich „${key}“ verwendet Schema-Version ${version}. Diese App unterstützt höchstens Version ${CURRENT_VERSION}.`);error.code='UNSUPPORTED_SCHEMA_VERSION';error.dataKey=key;error.schemaVersion=version;throw error}
  function competitionSnapshot(source={}){const out={};for(const key of COMPETITION_KEYS)if(source[key]!==undefined)out[key]=clone(source[key]);return{...emptyCompetition(),...out}}
  function legacyTournament(value={}){
    const source=clone(value&&typeof value==='object'&&!Array.isArray(value)?value:{}),declared=['men','women'].includes(source.settings?.competition)?source.settings.competition:null,active=['men','women'].includes(source.activeCompetition)?source.activeCompetition:(declared||'men'),hasRoot=COMPETITION_KEYS.some(key=>Object.prototype.hasOwnProperty.call(source,key));
    if(!source.competitions){source.competitions={men:emptyCompetition(),women:emptyCompetition()};source.competitions[declared||active]=competitionSnapshot(source)}
    else if(hasRoot)source.competitions[declared||active]=competitionSnapshot(source);
    source.competitions.men={...emptyCompetition(),...(source.competitions.men||{})};source.competitions.women={...emptyCompetition(),...(source.competitions.women||{})};
    for(const key of COMPETITION_KEYS)delete source[key];
    source.activeCompetition=active;source.eventName=source.eventName||source.competitions[active]?.settings?.eventName||source.competitions[active]?.settings?.name||'Freitag-Abend-Cup';source.schemaVersion=1;return source;
  }
  function migrateLegacy(key,value){
    if(key===KEYS.tournament)return legacyTournament(value);
    if(key===KEYS.seasons){const source=value&&typeof value==='object'&&!Array.isArray(value)?clone(value):{};return{...source,schemaVersion:1,seasons:Array.isArray(source.seasons)?source.seasons:[],deletedSeasonIds:source.deletedSeasonIds||{},deletedTournamentIds:source.deletedTournamentIds||{}}}
    if(key===KEYS.tournaments){const tournaments=Array.isArray(value)?clone(value):Array.isArray(value?.tournaments)?clone(value.tournaments):[];return{schemaVersion:1,tournaments}}
    if(key===KEYS.clubDuels){const source=value&&typeof value==='object'&&!Array.isArray(value)?clone(value):{};return{...source,schemaVersion:1,version:source.version||1,duels:Array.isArray(source.duels)?source.duels:[]}}
    if([KEYS.settings,KEYS.tvSettings].includes(key)){const source=value&&typeof value==='object'&&!Array.isArray(value)?clone(value):{};return{...source,schemaVersion:1}}
    return clone(value);
  }
  function identityFor(container,name,inherited={}){
    if(!realPlayerName(name))return'';
    const current=mappedValue(container?.playerIds,name);if(current)return String(current);
    const inheritedId=mappedValue(inherited,name);if(inheritedId)return String(inheritedId);
    const profileId=mappedValue(container?.playerProfileIds,name);return profileId?profilePlayerId(profileId):legacyPlayerId(name);
  }
  function ensureMatchIdentities(match,container,inherited={}){
    if(!match||typeof match!=='object')return match;
    for(const side of ['a','b']){
      const teamKey=side==='a'?'teamA':'teamB',idsKey=`${teamKey}Ids`,team=Array.isArray(match[teamKey])?match[teamKey].filter(realPlayerName):[];
      if(team.length)match[idsKey]=team.map((name,index)=>match[idsKey]?.[index]||identityFor(container,name,inherited));
      else{const name=realPlayerName(match[side]);if(name)match[`${side}Id`]=match[`${side}Id`]||identityFor(container,name,inherited)}
    }
    return match;
  }
  function ensureTournamentIdentities(value,inherited={}){
    const tournament=value&&typeof value==='object'?value:{};tournament.players=Array.isArray(tournament.players)?tournament.players:[];tournament.playerIds={...(tournament.playerIds||{})};tournament.playerProfileIds={...(tournament.playerProfileIds||{})};
    tournament.competition=normalizeCompetition(tournament.competition||tournament.settings?.competition);tournament.competitionLabel=tournament.competitionLabel||(tournament.competition==='women'?'Damen':tournament.competition==='men'?'Herren':'Offen');if(tournament.settings)tournament.settings.competition=tournament.competition;
    const names=new Set(tournament.players.filter(realPlayerName));for(const result of tournament.results||[])if(realPlayerName(result?.name))names.add(result.name);for(const match of tournament.matches||[]){for(const side of ['a','b']){const team=side==='a'?match?.teamA:match?.teamB;if(Array.isArray(team))team.filter(realPlayerName).forEach(name=>names.add(name));else if(realPlayerName(match?.[side]))names.add(match[side])}}if(realPlayerName(tournament.winner))names.add(tournament.winner);for(const name of tournament.top3||[])if(realPlayerName(name))names.add(name);
    for(const name of names)tournament.playerIds[name]=identityFor(tournament,name,inherited);
    for(const result of tournament.results||[])if(realPlayerName(result?.name)){result.playerId=result.playerId||identityFor(tournament,result.name,inherited);result.profileId=result.profileId||mappedValue(tournament.playerProfileIds,result.name)}
    for(const match of tournament.matches||[])ensureMatchIdentities(match,tournament,inherited);
    if(realPlayerName(tournament.winner))tournament.winnerId=tournament.winnerId||identityFor(tournament,tournament.winner,inherited);
    if(Array.isArray(tournament.top3))tournament.top3Ids=tournament.top3.map((name,index)=>tournament.top3Ids?.[index]||identityFor(tournament,name,inherited));
    return tournament;
  }
  function ensureSeasonIdentities(season){
    if(!season||typeof season!=='object')return season;season.memberPlayerIds={...(season.memberPlayerIds||{})};const memberNames=new Set([...(season.members||[]),...(season.players||[])].filter(realPlayerName));
    for(const name of memberNames){const profileId=mappedValue(season.memberProfileIds,name);season.memberPlayerIds[name]=mappedValue(season.memberPlayerIds,name)||(profileId?profilePlayerId(profileId):legacyPlayerId(name))}
    season.tournaments=Array.isArray(season.tournaments)?season.tournaments:[];season.tournaments.forEach(tournament=>ensureTournamentIdentities(tournament,season.memberPlayerIds));return season;
  }
  function ensureClubDuelIdentities(duel){
    if(!duel||typeof duel!=='object')return duel;for(const side of ['home','guest']){const playersKey=`${side}Players`,idsKey=`${side}PlayerIds`,players=Array.isArray(duel[playersKey])?duel[playersKey]:[],map={...(duel[idsKey]||{})};players.filter(realPlayerName).forEach(name=>{map[name]=mappedValue(map,name)||legacyPlayerId(name)});duel[idsKey]=map}
    for(const match of duel.matches||[])for(const side of ['home','guest']){const players=match?.[`${side}Players`]||[],map=duel[`${side}PlayerIds`]||{};match[`${side}PlayerEntityIds`]=players.map((name,index)=>match[`${side}PlayerEntityIds`]?.[index]||mappedValue(map,name)||legacyPlayerId(name))}return duel;
  }
  function migrateV1(key,value){
    const source=clone(value);
    if(key===KEYS.tournament){source.competitions=source.competitions||{men:emptyCompetition(),women:emptyCompetition()};for(const competition of Object.values(source.competitions))ensureTournamentIdentities(competition);source.schemaVersion=2;return source}
    if(key===KEYS.seasons){for(const season of source.seasons||[])ensureSeasonIdentities(season);source.schemaVersion=2;return source}
    if(key===KEYS.tournaments){for(const tournament of source.tournaments||[])ensureTournamentIdentities(tournament);source.schemaVersion=2;return source}
    if(key===KEYS.clubDuels){for(const duel of source.duels||[])ensureClubDuelIdentities(duel);source.schemaVersion=2;return source}
    source.schemaVersion=2;return source;
  }
  function seasonCompetitionFromFacts(season){
    const facts=new Set((season?.tournaments||[]).map(tournament=>normalizeCompetition(tournament?.competition||tournament?.settings?.competition)).filter(value=>value!=='open'));return facts.size===1?[...facts][0]:'open';
  }
  function migrateV2(key,value){
    const source=clone(value);
    if(key===KEYS.tournament){for(const [competitionKey,competition] of Object.entries(source.competitions||{})){competition.settings={...(competition.settings||{}),competition:normalizeCompetition(competitionKey)};competition.competition=normalizeCompetition(competitionKey);ensureTournamentIdentities(competition)}source.schemaVersion=3;return source}
    if(key===KEYS.seasons){
      source.playerCompetitions={...(source.playerCompetitions||{})};source.playerCompetitionUpdatedAt={...(source.playerCompetitionUpdatedAt||{})};const facts=new Map();
      for(const season of source.seasons||[]){ensureSeasonIdentities(season);season.competition=normalizeCompetition(season.competition||seasonCompetitionFromFacts(season));for(const name of season.members||season.players||[]){const id=mappedValue(season.memberPlayerIds,name);if(!id)continue;if(!facts.has(id))facts.set(id,new Set());facts.get(id).add(season.competition)}}
      for(const [id,competitions] of facts)if(!source.playerCompetitions[id])source.playerCompetitions[id]=competitions.has('women')?'women':competitions.has('men')?'men':'open';
      source.schemaVersion=3;return source;
    }
    if(key===KEYS.tournaments){for(const tournament of source.tournaments||[])ensureTournamentIdentities(tournament);source.schemaVersion=3;return source}
    source.schemaVersion=3;return source;
  }
  function validateCurrent(key,value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`Der Datenbereich „${key}“ ist kein gültiges Schema-${CURRENT_VERSION}-Dokument.`);
    if(key===KEYS.tournament&&(!value.competitions||!value.competitions.men||!value.competitions.women))throw new TypeError('Das Turnier-Dokument enthält keine getrennten Herren- und Damendaten.');
    if(key===KEYS.seasons&&!Array.isArray(value.seasons))throw new TypeError('Das Saison-Dokument enthält keine Saisonliste.');
    if(key===KEYS.tournaments&&!Array.isArray(value.tournaments))throw new TypeError('Das Turnierarchiv enthält keine Turnierliste.');
    if(key===KEYS.clubDuels&&!Array.isArray(value.duels))throw new TypeError('Das Vereinsduell-Dokument enthält keine Duellliste.');
    const current=clone(value);if(key===KEYS.tournament)Object.entries(current.competitions).forEach(([competitionKey,competition])=>{competition.settings={...(competition.settings||{}),competition:normalizeCompetition(competitionKey)};competition.competition=normalizeCompetition(competitionKey);ensureTournamentIdentities(competition)});else if(key===KEYS.seasons){current.playerCompetitions={...(current.playerCompetitions||{})};current.playerCompetitionUpdatedAt={...(current.playerCompetitionUpdatedAt||{})};for(const id of Object.keys(current.playerCompetitions))current.playerCompetitions[id]=normalizeCompetition(current.playerCompetitions[id]);current.seasons.forEach(season=>{ensureSeasonIdentities(season);season.competition=normalizeCompetition(season.competition)})}else if(key===KEYS.tournaments)current.tournaments.forEach(tournament=>ensureTournamentIdentities(tournament));else if(key===KEYS.clubDuels)current.duels.forEach(ensureClubDuelIdentities);return current;
  }
  function toCurrent(key,value){
    if(value===null||value===undefined)return value;let version=versionOf(value),current=clone(value);if(version>CURRENT_VERSION)unsupported(key,version);if(version===0){current=migrateLegacy(key,current);version=1}if(version===1){current=migrateV1(key,current);version=2}if(version===2){current=migrateV2(key,current);version=3}return validateCurrent(key,current);
  }
  function toLogical(key,value){const current=toCurrent(key,value);if(current===null||current===undefined)return current;return key===KEYS.tournaments?clone(current.tournaments):current}
  function fromLogical(key,value){if(key===KEYS.tournaments)return toCurrent(key,{schemaVersion:CURRENT_VERSION,tournaments:Array.isArray(value)?value:[]});return toCurrent(key,{...(value||{}),schemaVersion:CURRENT_VERSION})}
  return{CURRENT_VERSION,KEYS,COMPETITION_KEYS,versionOf,normalizeName,normalizeCompetition,profilePlayerId,legacyPlayerId,identityFor,ensureMatchIdentities,ensureTournamentIdentities,ensureSeasonIdentities,toCurrent,toLogical,fromLogical};
});
