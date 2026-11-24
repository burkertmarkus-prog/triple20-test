(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.T20CloudPartitions=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SEASONS_KEY='tripleTwentySeasons',TOURNAMENTS_KEY='triple20_tournaments';
  const MANIFEST_KEYS={
    [SEASONS_KEY]:'triple20_seasons_manifest_v1',
    [TOURNAMENTS_KEY]:'triple20_tournaments_manifest_v1'
  };
  const PREFIXES={
    season:'triple20_season_v1:',
    seasonTournament:'triple20_season_tournament_v1:',
    tournament:'triple20_tournament_v1:'
  };
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value}
  function stable(value){return JSON.stringify(canonical(value))}
  function hash(value){const text=stable(value);let current=0xcbf29ce484222325n;for(let index=0;index<text.length;index++){current^=BigInt(text.charCodeAt(index));current=BigInt.asUintN(64,current*0x100000001b3n)}return`${current.toString(36)}-${text.length.toString(36)}`}
  function safeId(value,fallback){const text=String(value||fallback);return encodeURIComponent(text).replaceAll('%','_')}
  function contentKey(prefix,id,value){return`${prefix}${safeId(id,'unknown')}:${hash(value)}`}
  function partitionSeasons(value={}){
    const seasons=Array.isArray(value?.seasons)?value.seasons:[],rows=[],manifest={schemaVersion:1,dataSchemaVersion:Number.isInteger(value?.schemaVersion)?value.schemaVersion:0,kind:'seasons',seasons:[],deletedSeasonIds:clone(value?.deletedSeasonIds||{}),deletedTournamentIds:clone(value?.deletedTournamentIds||{})};
    if(Object.hasOwn(value,'playerCompetitions'))manifest.playerCompetitions=clone(value.playerCompetitions||{});
    if(Object.hasOwn(value,'playerCompetitionUpdatedAt'))manifest.playerCompetitionUpdatedAt=clone(value.playerCompetitionUpdatedAt||{});
    seasons.forEach((season,index)=>{const {tournaments,...meta}=clone(season||{}),id=String(season?.id||`legacy-season-${index}`),metaKey=contentKey(PREFIXES.season,id,meta),tournamentRefs=[];rows.push({data_key:metaKey,data:meta});(Array.isArray(tournaments)?tournaments:[]).forEach((tournament,tournamentIndex)=>{const tournamentId=String(tournament?.id||`legacy-tournament-${tournamentIndex}-${hash(tournament)}`),key=contentKey(PREFIXES.seasonTournament,`${id}:${tournamentId}`,tournament);rows.push({data_key:key,data:clone(tournament)});tournamentRefs.push({id:tournamentId,key})});manifest.seasons.push({id,metaKey,tournaments:tournamentRefs})});
    return{logicalKey:SEASONS_KEY,manifestKey:MANIFEST_KEYS[SEASONS_KEY],manifest,rows};
  }
  function partitionTournaments(value=[]){
    const tournaments=Array.isArray(value)?value:(Array.isArray(value?.tournaments)?value.tournaments:[]),dataSchemaVersion=Array.isArray(value)?0:(Number.isInteger(value?.schemaVersion)?value.schemaVersion:0),rows=[],manifest={schemaVersion:1,dataSchemaVersion,kind:'tournaments',tournaments:[]};tournaments.forEach((tournament,index)=>{const id=String(tournament?.id||`legacy-tournament-${index}-${hash(tournament)}`),key=contentKey(PREFIXES.tournament,id,tournament);rows.push({data_key:key,data:clone(tournament)});manifest.tournaments.push({id,key})});return{logicalKey:TOURNAMENTS_KEY,manifestKey:MANIFEST_KEYS[TOURNAMENTS_KEY],manifest,rows};
  }
  function partitionDocument(logicalKey,value){if(logicalKey===SEASONS_KEY)return partitionSeasons(value);if(logicalKey===TOURNAMENTS_KEY)return partitionTournaments(value);return null}
  function rowMap(rows=[]){return new Map(rows.map(row=>[row.data_key,row]))}
  function reconstructSeasons(manifest,rows){const map=rowMap(rows),seasons=[],missing=[];for(const ref of manifest?.seasons||[]){const meta=map.get(ref.metaKey);if(!meta){missing.push(ref.metaKey);continue}const season=clone(meta.data||{}),tournaments=[];for(const tournamentRef of ref.tournaments||[]){const row=map.get(tournamentRef.key);if(!row)missing.push(tournamentRef.key);else tournaments.push(clone(row.data))}seasons.push({...season,id:season.id||ref.id,tournaments})}const value={seasons,deletedSeasonIds:clone(manifest?.deletedSeasonIds||{}),deletedTournamentIds:clone(manifest?.deletedTournamentIds||{})};if(Object.hasOwn(manifest||{},'playerCompetitions'))value.playerCompetitions=clone(manifest.playerCompetitions||{});if(Object.hasOwn(manifest||{},'playerCompetitionUpdatedAt'))value.playerCompetitionUpdatedAt=clone(manifest.playerCompetitionUpdatedAt||{});if(Number(manifest?.dataSchemaVersion)>0)value.schemaVersion=Number(manifest.dataSchemaVersion);return{complete:missing.length===0,missing,value}}
  function reconstructTournaments(manifest,rows){const map=rowMap(rows),tournaments=[],missing=[];for(const ref of manifest?.tournaments||[]){const row=map.get(ref.key);if(!row)missing.push(ref.key);else tournaments.push(clone(row.data))}const value=Number(manifest?.dataSchemaVersion)>0?{schemaVersion:Number(manifest.dataSchemaVersion),tournaments}:tournaments;return{complete:missing.length===0,missing,value}}
  function reconstructDocument(logicalKey,rows=[]){const manifestKey=MANIFEST_KEYS[logicalKey];if(!manifestKey)return{found:false,complete:false,missing:[],value:null};const manifestRow=rows.find(row=>row.data_key===manifestKey);if(!manifestRow)return{found:false,complete:false,missing:[],value:null};const result=logicalKey===SEASONS_KEY?reconstructSeasons(manifestRow.data,rows):reconstructTournaments(manifestRow.data,rows);return{found:true,manifestRow,...result}}
  function referencedKeys(rows=[]){const keys=[];for(const logicalKey of [SEASONS_KEY,TOURNAMENTS_KEY]){const manifest=rows.find(row=>row.data_key===MANIFEST_KEYS[logicalKey])?.data;if(logicalKey===SEASONS_KEY)for(const season of manifest?.seasons||[]){if(season.metaKey)keys.push(season.metaKey);for(const tournament of season.tournaments||[])if(tournament.key)keys.push(tournament.key)}else for(const tournament of manifest?.tournaments||[])if(tournament.key)keys.push(tournament.key)}return[...new Set(keys)]}
  function logicalKeyForPhysical(dataKey=''){if(dataKey===MANIFEST_KEYS[SEASONS_KEY]||dataKey.startsWith(PREFIXES.season)||dataKey.startsWith(PREFIXES.seasonTournament))return SEASONS_KEY;if(dataKey===MANIFEST_KEYS[TOURNAMENTS_KEY]||dataKey.startsWith(PREFIXES.tournament))return TOURNAMENTS_KEY;return dataKey}
  function physicalRowsFor(logicalKey,rows=[]){return rows.filter(row=>logicalKeyForPhysical(row.data_key)===logicalKey)}
  function sameData(left,right){return stable(left)===stable(right)}
  return{SEASONS_KEY,TOURNAMENTS_KEY,MANIFEST_KEYS,PREFIXES,stable,hash,partitionDocument,reconstructDocument,referencedKeys,logicalKeyForPhysical,physicalRowsFor,sameData};
});
