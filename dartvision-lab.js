(function(global){
'use strict';

function emptyDartVisionBoard(){return{started:false,playerA:'Spieler 1',playerB:'Spieler 2',startScore:501,bestOf:3,scores:[501,501],legs:[0,0],activePlayer:0,winner:'',history:[],updatedAt:''}}
function loadDartVisionLab(){
  const parsed=safeJsonParse(localStorage.getItem(DARTVISION_LAB_KEY),{}),stored=parsed&&typeof parsed==='object'?parsed:{},boards={};
  for(let number=1;number<=4;number++){const board=stored?.boards?.[number]||{};boards[number]={...emptyDartVisionBoard(),...board,scores:Array.isArray(board.scores)?board.scores:[board.startScore||501,board.startScore||501],legs:Array.isArray(board.legs)?board.legs:[0,0],history:Array.isArray(board.history)?board.history:[]}}
  return{version:1,activeBoard:Math.min(4,Math.max(1,+stored.activeBoard||1)),boards}
}
function saveDartVisionLab(){localStorage.setItem(DARTVISION_LAB_KEY,JSON.stringify(dartVisionLab))}
function dartVisionBoard(){return dartVisionLab.boards[dartVisionLab.activeBoard]}
function dartVisionLegsToWin(board=dartVisionBoard()){return Math.floor((+board.bestOf||3)/2)+1}
function renderDartVisionLab(){
  const box=$('#dartVisionLabContent');if(!box)return;if(!isFullAdmin()){box.innerHTML='';return}
  const board=dartVisionBoard(),boardTabs=Array.from({length:4},(_,index)=>`<button type="button" data-dartvision-board="${index+1}" class="${dartVisionLab.activeBoard===index+1?'active':''}">Board ${index+1}${dartVisionLab.boards[index+1].started?' · läuft':''}</button>`).join('');
  if(!board.started){box.innerHTML=`<div class="dartvision-board-tabs">${boardTabs}</div><form id="dartVisionSetupForm" class="card slim-card dartvision-setup"><div><span class="eyebrow">VIRTUELLES BOARD ${dartVisionLab.activeBoard}</span><h3>Testspiel vorbereiten</h3><p>Hier testen wir zuerst Spiellogik und Bedienung. Kameradaten werden später an genau dieselbe Schnittstelle angeschlossen.</p></div><div class="grid"><label>Spieler 1<input id="dartVisionPlayerA" maxlength="30" value="${esc(board.playerA)}" required></label><label>Spieler 2<input id="dartVisionPlayerB" maxlength="30" value="${esc(board.playerB)}" required></label><label>Spielmodus<select id="dartVisionStartScore"><option value="301" ${board.startScore===301?'selected':''}>301</option><option value="501" ${board.startScore===501?'selected':''}>501</option></select></label><label>Legs<select id="dartVisionBestOf"><option value="1" ${board.bestOf===1?'selected':''}>Best of 1</option><option value="3" ${board.bestOf===3?'selected':''}>Best of 3</option><option value="5" ${board.bestOf===5?'selected':''}>Best of 5</option></select></label></div><button class="primary" type="submit">TESTSPIEL STARTEN <span>→</span></button></form>`;return}
  const names=[board.playerA,board.playerB],needed=dartVisionLegsToWin(board),winner=board.winner,history=board.history.slice(-8).reverse();
  box.innerHTML=`<div class="dartvision-board-tabs">${boardTabs}</div><section class="dartvision-scoreboard"><header><div><span class="eyebrow">BOARD ${dartVisionLab.activeBoard} · ${board.startScore} · BEST OF ${board.bestOf}</span><h3>${winner?`${esc(winner)} gewinnt`:`Leg ${board.legs[0]+board.legs[1]+1}`}</h3></div><button class="danger" type="button" data-dartvision-reset>Testspiel löschen</button></header><div class="dartvision-players">${names.map((name,index)=>`<article class="${!winner&&board.activePlayer===index?'is-active':''} ${winner===name?'is-winner':''}"><small>${index===0?'SPIELER 1':'SPIELER 2'}</small><h2>${esc(name)}</h2><strong>${board.scores[index]}</strong><span>${board.legs[index]} / ${needed} Legs</span></article>`).join('')}</div>${winner?`<div class="dartvision-finished"><p>Das Testspiel bleibt ausschließlich lokal gespeichert.</p><button class="primary" type="button" data-dartvision-new>Neues Testspiel</button></div>`:`<form id="dartVisionThrowForm" class="dartvision-throw"><label>Aufnahme für <b>${esc(names[board.activePlayer])}</b><input id="dartVisionThrowScore" type="number" inputmode="numeric" min="0" max="180" step="1" placeholder="0–180" required autofocus></label><button class="primary" type="submit">AUFNAHME EINTRAGEN</button><button class="secondary" type="button" data-dartvision-undo ${board.history.length?'':'disabled'}>Rückgängig</button></form>`}<div class="dartvision-history"><h4>Letzte Aufnahmen</h4>${history.length?history.map(entry=>`<div><span>${esc(entry.player)}</span><b>${entry.score}</b><small>${esc(entry.note||'')}</small></div>`).join(''):'<p>Noch keine Aufnahme eingetragen.</p>'}</div></section>`;
}
function showDartVisionLab(updateUrl=true){if(!isFullAdmin()){showLogin(updateUrl);return}hideMainSections();$('#dartVisionLabSection')?.classList.remove('hidden');renderDartVisionLab();renderNavigation();if(updateUrl)updateAppUrl('dartvision-lab')}
function startDartVisionTest(){
  const board=dartVisionBoard(),startScore=+$('#dartVisionStartScore').value||501;Object.assign(board,{started:true,playerA:$('#dartVisionPlayerA').value.trim(),playerB:$('#dartVisionPlayerB').value.trim(),startScore,bestOf:+$('#dartVisionBestOf').value||3,scores:[startScore,startScore],legs:[0,0],activePlayer:0,winner:'',history:[],updatedAt:new Date().toISOString()});saveDartVisionLab();renderDartVisionLab()
}
function enterDartVisionThrow(score){
  const board=dartVisionBoard();if(!board.started||board.winner||!Number.isInteger(score)||score<0||score>180)return false;const before={scores:[...board.scores],legs:[...board.legs],activePlayer:board.activePlayer,winner:board.winner},player=board.activePlayer,next=board.scores[player]-score;let note='';
  if(next<0||next===1){note='Überworfen';board.activePlayer=1-player}else if(next===0){board.legs[player]++;note='Leg gewonnen';if(board.legs[player]>=dartVisionLegsToWin(board)){board.winner=player===0?board.playerA:board.playerB}else{board.scores=[board.startScore,board.startScore];board.activePlayer=1-player}}else{board.scores[player]=next;board.activePlayer=1-player}
  board.history.push({player:player===0?board.playerA:board.playerB,score,note,before});board.history=board.history.slice(-100);board.updatedAt=new Date().toISOString();saveDartVisionLab();renderDartVisionLab();return true
}
function undoDartVisionThrow(){const board=dartVisionBoard(),entry=board.history.pop();if(!entry)return;Object.assign(board,entry.before);board.updatedAt=new Date().toISOString();saveDartVisionLab();renderDartVisionLab()}
async function resetDartVisionBoard(){const current=dartVisionBoard();if(current.started&&!await appConfirm(`Testspiel auf Board ${dartVisionLab.activeBoard} wirklich löschen?`))return;dartVisionLab.boards[dartVisionLab.activeBoard]=emptyDartVisionBoard();saveDartVisionLab();renderDartVisionLab()}

const api={emptyDartVisionBoard,loadDartVisionLab,saveDartVisionLab,dartVisionBoard,dartVisionLegsToWin,renderDartVisionLab,showDartVisionLab,startDartVisionTest,enterDartVisionThrow,undoDartVisionThrow,resetDartVisionBoard};
Object.assign(global,api);
global.T20DartVisionLab=Object.freeze(api);
})(window);

