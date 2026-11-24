(function(global){
'use strict';

function addPairs(target,players,round,bracket='upper'){
  for(let i=0;i<players.length-1;i+=2)target.push(attachMatchPlayerIds({a:players[i],b:players[i+1],sa:null,sb:null,round,bracket}));
  if(players.length%2)target.push(attachMatchPlayerIds({a:players.at(-1),b:'Freilos',sa:1,sb:0,round,bracket}));
}
function matchSidePlayers(match,side){
  const stored=side==='a'?match?.teamA:match?.teamB;if(Array.isArray(stored))return stored.filter(Boolean);
  const name=match?.[side];return name&&!['Freilos','Pause'].includes(name)?[name]:[]
}
function matchPlayerSide(match,name){if(matchSidePlayers(match,'a').includes(name))return'a';if(matchSidePlayers(match,'b').includes(name))return'b';return''}
function doublesMixPairKey(a,b){return[a,b].sort((x,y)=>x.localeCompare(y,'de')).join('\u0000')}
function doublesMixHistory(matches=[]){
  const partners=new Map(),opponents=new Map();
  for(const match of matches){if(match.bracket!=='doublesmix')continue;const teamA=matchSidePlayers(match,'a'),teamB=matchSidePlayers(match,'b');for(const team of [teamA,teamB])if(team.length===2){const key=doublesMixPairKey(...team);partners.set(key,(partners.get(key)||0)+1)}for(const a of teamA)for(const b of teamB){const key=doublesMixPairKey(a,b);opponents.set(key,(opponents.get(key)||0)+1)}}
  return{partners,opponents}
}
function doublesMixRound(round,history=[]){
  const players=activeTournamentPlayers(),pauseCount=players.length%4,pauseHistory=state.settings.doublesMixPauses||{},pauseTotals=Object.fromEntries(players.map(name=>[name,0])),joinRounds=state.settings.doublesMixJoinRounds||{};
  Object.entries(pauseHistory).forEach(([savedRound,names])=>{if(+savedRound<round)for(const name of names||[])if(name in pauseTotals)pauseTotals[name]++});
  const pauseOrder=shuffle(players).sort((a,b)=>Number(joinRounds[a]===round)-Number(joinRounds[b]===round)||pauseTotals[a]-pauseTotals[b]),pauses=pauseOrder.slice(0,pauseCount),active=players.filter(name=>!pauses.includes(name)),counts=doublesMixHistory(history);let best=null,bestScore=Infinity;
  const attempts=Math.max(400,Math.min(2400,active.length*80));
  for(let attempt=0;attempt<attempts;attempt++){
    const order=shuffle(active),games=[];let score=0;
    for(let i=0;i<order.length;i+=4){const teamA=[order[i],order[i+1]],teamB=[order[i+2],order[i+3]];score+=(counts.partners.get(doublesMixPairKey(...teamA))||0)*1000+(counts.partners.get(doublesMixPairKey(...teamB))||0)*1000;for(const a of teamA)for(const b of teamB)score+=(counts.opponents.get(doublesMixPairKey(a,b))||0)*25;games.push([teamA,teamB])}
    if(score<bestScore){bestScore=score;best=games;if(score===0)break}
  }
  state.settings.doublesMixPauses={...pauseHistory,[round]:pauses};
  return(best||[]).map(([teamA,teamB])=>attachMatchPlayerIds({a:teamA.join(' & '),b:teamB.join(' & '),teamA,teamB,sa:null,sb:null,round,bracket:'doublesmix'}))
}
const DOUBLES_LOTTERY_GAMES=[
  {game:'301-do',gameLabel:'301 Double Out'},
  {game:'301-di-do',gameLabel:'301 Double In / Double Out'},
  {game:'cricket',gameLabel:'Cricket',resultEntry:'leg-wins-only',scoringEngine:'external-board'}
];
function doublesLotteryPlayerKey(name,playerIds={},profileIds={}){return mappedPlayerValue(playerIds,name)||profilePlayerId(mappedPlayerValue(profileIds,name))||T20DataSchema.legacyPlayerId(name)}
function doublesLotteryHistoryKey(a,b,playerIds={},profileIds={}){return[doublesLotteryPlayerKey(a,playerIds,profileIds),doublesLotteryPlayerKey(b,playerIds,profileIds)].sort().join('\u0000')}
function doublesLotteryPartnerHistory(seasonId){
  const counts=new Map(),season=seasonStore.seasons.find(item=>String(item.id)===String(seasonId||''));
  for(const tournament of season?.tournaments||[]){
    if(tournament.planned||(tournament.mode||tournament.settings?.mode)!=='doubleslottery')continue;
    const seen=new Set();
    for(const match of tournament.matches||[])for(const team of [matchSidePlayers(match,'a'),matchSidePlayers(match,'b')])if(team.length===2)seen.add(doublesLotteryHistoryKey(team[0],team[1],tournament.playerIds||{},tournament.playerProfileIds||{}));
    seen.forEach(key=>counts.set(key,(counts.get(key)||0)+1));
  }
  return counts;
}
function doublesLotteryEligibility(count){if(count<4)return{valid:false,reason:'Für die Doppel-Lotterie werden mindestens vier Personen benötigt.'};if(count%4!==0)return{valid:false,reason:`Mit ${count} Personen können feste Doppel in drei unterschiedlichen Disziplinen nicht gleich oft spielen. Verwende 4, 8, 12, 16 … Personen oder den Modus „Doppel-Mix“.`};return{valid:true,reason:''}}
function doublesLotteryDrawMetrics(teams,history,pairKey){return teams.reduce((metrics,team)=>{const previous=history.get(pairKey(team))||0;if(previous){metrics.repeats++;metrics.score+=previous}return metrics},{repeats:0,score:0})}
function betterDoublesLotteryDraw(left,right){return !right||left.repeats<right.repeats||(left.repeats===right.repeats&&left.score<right.score)}
function improveDoublesLotteryTeams(teams,history,pairKey){
  const metrics=items=>doublesLotteryDrawMetrics(items,history,pairKey),next=teams.map(team=>[...team]);let changed=true;
  while(changed){changed=false;for(let left=0;left<next.length&&!changed;left++)for(let right=left+1;right<next.length&&!changed;right++){const [a,b]=next[left],[c,d]=next[right],current=[next[left],next[right]],alternatives=[[[a,c],[b,d]],[[a,d],[b,c]]],best=alternatives.sort((x,y)=>{const aMetrics=metrics(x),bMetrics=metrics(y);return aMetrics.repeats-bMetrics.repeats||aMetrics.score-bMetrics.score})[0];if(betterDoublesLotteryDraw(metrics(best),metrics(current))){next[left]=best[0];next[right]=best[1];changed=true}}}
  return next;
}
function drawDoublesLotteryTeams(players,history=new Map()){
  const eligibility=doublesLotteryEligibility(players.length);if(!eligibility.valid)return{teams:[],repeats:0,score:0,error:eligibility.reason};
  const pairKey=team=>doublesLotteryHistoryKey(team[0],team[1],state.playerIds||{},state.playerProfileIds||{}),names=shuffle(players);
  if(names.length<=16){
    const memo=new Map(),solve=list=>{
      if(!list.length)return{teams:[],repeats:0,score:0};
      const key=[...list].sort().join('\u0000');if(memo.has(key))return memo.get(key);
      const first=list[0],rest=list.slice(1),candidates=[];
      for(let index=0;index<rest.length;index++){const partner=rest[index],previous=history.get(pairKey([first,partner]))||0,tail=solve(rest.filter((_,i)=>i!==index));candidates.push({teams:[[first,partner],...tail.teams],repeats:Number(previous>0)+tail.repeats,score:previous+tail.score})}
      const ordered=candidates.sort((a,b)=>a.repeats-b.repeats||a.score-b.score),best=shuffle(ordered.filter(candidate=>candidate.repeats===ordered[0].repeats&&candidate.score===ordered[0].score))[0];memo.set(key,best);return best;
    };
    return solve(names);
  }
  let best=null;const attempts=Math.min(16,Math.max(6,names.length/2));
  for(let attempt=0;attempt<attempts;attempt++){
    const order=shuffle(names),graph=order.map((player,index)=>order.map((partner,other)=>({partner,other})).filter(item=>item.other!==index&&!(history.get(pairKey([player,item.partner]))||0)).map(item=>item.other)),matching=maximumCardinalityMatching(graph),used=new Set(),teams=[];
    for(let index=0;index<order.length;index++){const partner=matching[index];if(partner!==-1&&!used.has(index)&&!used.has(partner)){used.add(index);used.add(partner);teams.push([order[index],order[partner]])}}
    const unmatched=order.filter((_,index)=>!used.has(index));while(unmatched.length>1){const player=unmatched.shift(),choice=unmatched.map((partner,index)=>({index,previous:history.get(pairKey([player,partner]))||0})).sort((a,b)=>a.previous-b.previous||a.index-b.index)[0];teams.push([player,unmatched.splice(choice?.index??0,1)[0]])}
    const improved=improveDoublesLotteryTeams(teams,history,pairKey),metrics=doublesLotteryDrawMetrics(improved,history,pairKey),candidate={teams:improved,...metrics};if(betterDoublesLotteryDraw(candidate,best))best=candidate;if(!candidate.repeats)break;
  }
  return best;
}
function doublesLotteryMatches(){
  const seriesId=state.settings.doublesLotterySeasonId||state.scheduledSeasonId||'',draw=drawDoublesLotteryTeams(state.players,doublesLotteryPartnerHistory(seriesId)),teams=draw.teams;
  if(draw.error){state.settings.doublesLotteryDrawError=draw.error;state.settings.doublesLotteryTeams=[];state.settings.doublesLotteryRepeatPairs=0;state.settings.doublesLotteryRepeatHistory=0;state.settings.doublesLotteryOpponentRepeats=0;return[]}
  delete state.settings.doublesLotteryDrawError;
  state.settings.doublesLotteryTeams=teams.map(team=>[...team]);
  state.settings.doublesLotteryRepeatPairs=draw.repeats;
  state.settings.doublesLotteryRepeatHistory=draw.score;
  const matches=[],opponents=new Set();let opponentRepeats=0,rotation=[...teams];
  for(let round=1;round<=DOUBLES_LOTTERY_GAMES.length;round++){
    const format=DOUBLES_LOTTERY_GAMES[round-1];
    for(let index=0;index<rotation.length/2;index++){
      const teamA=rotation[index],teamB=rotation[rotation.length-1-index];
      const opponentKey=[teamA.map(doublesLotteryPlayerKey).sort().join('&'),teamB.map(doublesLotteryPlayerKey).sort().join('&')].sort().join('|');if(opponents.has(opponentKey))opponentRepeats++;else opponents.add(opponentKey);
      matches.push(attachMatchPlayerIds({a:teamA.join(' & '),b:teamB.join(' & '),teamA:[...teamA],teamB:[...teamB],sa:null,sb:null,round,bracket:'doubleslottery',...format}));
    }
    if(rotation.length>2)rotation=[rotation[0],rotation.at(-1),...rotation.slice(1,-1)];
  }
  state.settings.doublesLotteryOpponentRepeats=opponentRepeats;
  return matches;
}
function hasPlayed(matches,a,b){return matches.some(m=>(m.a===a&&m.b===b)||(m.a===b&&m.b===a))}
function withdrawnPlayers(){return state.withdrawn||[]}
function activeTournamentPlayers(){return state.players.filter(p=>!withdrawnPlayers().includes(p))}
function activeSwissPlayers(){return activeTournamentPlayers()}
function seasonSeededPlayers(players){return sortBySeasonWins(players)}
// Edmonds' Blossom: maximale Paarung im allgemeinen Graphen der noch nie gespielten Begegnungen.
function maximumCardinalityMatching(graph){
  const size=graph.length,match=Array(size).fill(-1),parent=Array(size),base=Array(size),used=Array(size),blossom=Array(size),queue=[];
  const lowestCommonAncestor=(a,b)=>{const seen=Array(size).fill(false);while(true){a=base[a];seen[a]=true;if(match[a]===-1)break;a=parent[match[a]]}while(true){b=base[b];if(seen[b])return b;b=parent[match[b]]}};
  const markPath=(vertex,root,child)=>{while(base[vertex]!==root){blossom[base[vertex]]=blossom[base[match[vertex]]]=true;parent[vertex]=child;child=match[vertex];vertex=parent[match[vertex]]}};
  const findPath=root=>{used.fill(false);parent.fill(-1);for(let i=0;i<size;i++)base[i]=i;queue.length=0;queue.push(root);used[root]=true;for(let head=0;head<queue.length;head++){const vertex=queue[head];for(const next of graph[vertex]){if(base[vertex]===base[next]||match[vertex]===next)continue;if(next===root||(match[next]!==-1&&parent[match[next]]!==-1)){const currentBase=lowestCommonAncestor(vertex,next);blossom.fill(false);markPath(vertex,currentBase,next);markPath(next,currentBase,vertex);for(let i=0;i<size;i++)if(blossom[base[i]]){base[i]=currentBase;if(!used[i]){used[i]=true;queue.push(i)}}}else if(parent[next]===-1){parent[next]=vertex;if(match[next]===-1){let current=next;while(current!==-1){const previous=parent[current],following=previous===-1?-1:match[previous];match[current]=previous;if(previous!==-1)match[previous]=current;current=following}return true}const paired=match[next];used[paired]=true;queue.push(paired)}}}return false};
  for(let vertex=0;vertex<size;vertex++)if(match[vertex]===-1)findPath(vertex);return match;
}
function swissPairingMetrics(pairs,history,scores={}){const gap=(a,b)=>Math.abs((scores[a]||0)-(scores[b]||0));return{repeats:pairs.filter(([a,b])=>hasPlayed(history,a,b)).length,scoreGap:pairs.reduce((sum,[a,b])=>sum+gap(a,b),0)}}
function improveSwissPairings(pairs,history,scores={}){
  const metrics=items=>swissPairingMetrics(items,history,scores),better=(left,right)=>left.repeats<right.repeats||(left.repeats===right.repeats&&left.scoreGap<right.scoreGap),next=pairs.map(pair=>[...pair]);let changed=true;
  while(changed){changed=false;for(let left=0;left<next.length&&!changed;left++)for(let right=left+1;right<next.length&&!changed;right++){const [a,b]=next[left],[c,d]=next[right],current=[next[left],next[right]],currentMetrics=metrics(current),alternatives=[[[a,c],[b,d]],[[a,d],[b,c]]],best=alternatives.sort((x,y)=>{const aMetrics=metrics(x),bMetrics=metrics(y);return aMetrics.repeats-bMetrics.repeats||aMetrics.scoreGap-bMetrics.scoreGap})[0];if(better(metrics(best),currentMetrics)){next[left]=best[0];next[right]=best[1];changed=true}}}
  return next;
}
function largeSwissPairings(players,history,scores={}){
  const gap=(a,b)=>Math.abs((scores[a]||0)-(scores[b]||0)),graph=players.map((player,index)=>players.map((opponent,other)=>({other,opponent})).filter(item=>item.other!==index&&!hasPlayed(history,player,item.opponent)).sort((a,b)=>gap(player,a.opponent)-gap(player,b.opponent)||a.other-b.other).map(item=>item.other)),matching=maximumCardinalityMatching(graph),used=new Set(),pairs=[];
  for(let index=0;index<players.length;index++){const partner=matching[index];if(partner!==-1&&!used.has(index)&&!used.has(partner)){used.add(index);used.add(partner);pairs.push([players[index],players[partner]])}}
  const unmatched=players.filter((_,index)=>!used.has(index)).sort((a,b)=>(scores[a]||0)-(scores[b]||0)||a.localeCompare(b,'de'));while(unmatched.length>1){const player=unmatched.shift(),partnerIndex=unmatched.map((opponent,index)=>({index,gap:gap(player,opponent)})).sort((a,b)=>a.gap-b.gap||a.index-b.index)[0]?.index??0;pairs.push([player,unmatched.splice(partnerIndex,1)[0]])}
  const improved=improveSwissPairings(pairs,history,scores),metrics=swissPairingMetrics(improved,history,scores);return{pairs:improved,...metrics};
}
function swissPairings(players,history,scores={}){
  const gap=(a,b)=>Math.abs((scores[a]||0)-(scores[b]||0));
  if(players.length<2)return{pairs:[],repeats:0,scoreGap:0};
  if(players.length>16)return largeSwissPairings(players,history,scores);
  const memo=new Map(),solve=list=>{
    if(list.length<2)return{pairs:[],repeats:0,scoreGap:0};
    const key=list.join('\u0000');if(memo.has(key))return memo.get(key);
    const a=list[0],rest=list.slice(1),order=rest.map((b,i)=>i).sort((i,j)=>Number(hasPlayed(history,a,rest[i]))-Number(hasPlayed(history,a,rest[j]))||gap(a,rest[i])-gap(a,rest[j])||i-j);let best=null;
    for(const i of order){const b=rest[i],repeat=hasPlayed(history,a,b)?1:0,pairGap=gap(a,b);if(best&&repeat>best.repeats)continue;const tail=solve(rest.filter((_,idx)=>idx!==i)),candidate={pairs:[[a,b],...tail.pairs],repeats:repeat+tail.repeats,scoreGap:pairGap+tail.scoreGap};if(!best||candidate.repeats<best.repeats||(candidate.repeats===best.repeats&&candidate.scoreGap<best.scoreGap))best=candidate}
    const result=best||{pairs:[],repeats:0,scoreGap:0};memo.set(key,result);return result;
  };
  return solve(players);
}
function swissRound(round,history=[]){
  const active=activeSwissPlayers(),arr=[],rows=round===1?[]:standingsFor(active,history),ranked=round===1?seasonSeededPlayers(active):rows.map(r=>r.name),scores=Object.fromEntries((round===1?ranked.map(name=>({name,pts:0})):rows).map(r=>[r.name,r.pts||0])),players=[...ranked];
  if(players.length%2){
    const byeCounts=Object.fromEntries(players.map(player=>[player,history.filter(match=>match.a===player&&match.b==='Freilos').length])),lastRound=Math.max(0,...history.map(match=>match.round||0)),lastBye=new Set(history.filter(match=>(match.round||0)===lastRound&&match.b==='Freilos').map(match=>match.a)),bye=[...players].sort((a,b)=>byeCounts[a]-byeCounts[b]||Number(lastBye.has(a))-Number(lastBye.has(b))||(scores[a]||0)-(scores[b]||0)||ranked.indexOf(b)-ranked.indexOf(a))[0];
    players.splice(players.indexOf(bye),1);arr.push(attachMatchPlayerIds({a:bye,b:'Freilos',sa:1,sb:0,round,bracket:'swiss'}));
  }
  swissPairings(players,history,scores).pairs.forEach(([a,b])=>arr.push(attachMatchPlayerIds({a,b,sa:null,sb:null,round,bracket:'swiss'})));
  return arr;
}
function makeMatches(){
  const arr=[];
  delete state.settings.doubleKoPlan;
  if(state.settings.mode==='double'){state.groups=[];const draw=state.settings.doubleKoDrawOrder?.length===state.players.length?state.settings.doubleKoDrawOrder:shuffle(state.players);state.settings.doubleKoPlan=T20DoubleKO.create(draw);return T20DoubleKO.evaluate(state.settings.doubleKoPlan).matches.map(match=>attachMatchPlayerIds(match))}
  if(state.settings.mode==='roundrobin'){
    const amount=Math.min(state.settings.groupCount||1,state.players.length),groups=Array.from({length:amount},()=>[]);shuffle(state.players).forEach((p,i)=>groups[i%amount].push(p));state.groups=groups;
    groups.forEach((players,group)=>{let ps=[...players];if(ps.length%2)ps.push(null);const count=ps.length;for(let round=1;round<count;round++){for(let i=0;i<count/2;i++){const a=ps[i],b=ps[count-1-i];if(a&&b)arr.push({a,b,sa:null,sb:null,round,group})}ps=[ps[0],ps[count-1],...ps.slice(1,count-1)]}});arr.sort((a,b)=>a.round-b.round||a.group-b.group);
  }else if(state.settings.mode==='swiss'){state.groups=[];arr.push(...swissRound(1,[]))}
  else if(state.settings.mode==='doublesmix'){state.groups=[];state.settings.doublesMixPauses={};arr.push(...doublesMixRound(1,[]))}
  else if(state.settings.mode==='doubleslottery'){state.groups=[];arr.push(...doublesLotteryMatches())}
  else addPairs(arr,shuffle(state.players),1,'upper');
  return arr.map(match=>attachMatchPlayerIds(match));
}

const api={addPairs,matchSidePlayers,matchPlayerSide,doublesMixPairKey,doublesMixHistory,doublesMixRound,doublesLotteryPlayerKey,doublesLotteryHistoryKey,doublesLotteryPartnerHistory,doublesLotteryEligibility,doublesLotteryDrawMetrics,betterDoublesLotteryDraw,improveDoublesLotteryTeams,drawDoublesLotteryTeams,doublesLotteryMatches,hasPlayed,withdrawnPlayers,activeTournamentPlayers,activeSwissPlayers,seasonSeededPlayers,maximumCardinalityMatching,swissPairingMetrics,improveSwissPairings,largeSwissPairings,swissPairings,swissRound,makeMatches};
Object.assign(global,api);
global.T20TournamentEngine=Object.freeze({...api,DOUBLES_LOTTERY_GAMES});
})(window);

