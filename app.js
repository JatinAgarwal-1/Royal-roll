// Load Supabase on demand so a CDN/import failure cannot prevent lobby buttons
// from being registered. Failures are shown in the lobby when the user taps.
const SUPABASE_URL = 'https://xkltfcpfrnrcdjcnzvmv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JUh8KHF3yT876jLxev5ehA_cO5Olew-';
const supabaseConfigured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_') && !SUPABASE_ANON_KEY.includes('YOUR_');
let supabase = null;
let supabasePromise = null;
async function ensureSupabase(){
  if(!supabaseConfigured) throw new Error('Supabase URL or publishable key is missing.');
  if(supabase) return supabase;
  if(!supabasePromise){
    supabasePromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(({createClient}) => { supabase = createClient(SUPABASE_URL,SUPABASE_ANON_KEY); return supabase; })
      .catch(err => { supabasePromise = null; throw new Error('Could not load the online service. Check your internet connection and refresh. '+(err?.message||'')); });
  }
  return supabasePromise;
}

const COLORS = ['red','green','yellow','blue'];
const COLOR_NAMES = {red:'Red',green:'Green',yellow:'Yellow',blue:'Blue'};
const STARTS = {red:0,green:13,yellow:26,blue:39};
const SAFE = [0,8,13,21,26,34,39,47];
const TRACK = [[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6]];
const LANES = {red:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],green:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],yellow:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],blue:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]};
const BASES = [{color:'red',x:0,y:0},{color:'green',x:9,y:0},{color:'yellow',x:9,y:9},{color:'blue',x:0,y:9}];
const $ = id => document.getElementById(id);
let room = null, channel = null, localPlayerId = localStorage.getItem('rr-player-id') || crypto.randomUUID();
localStorage.setItem('rr-player-id',localPlayerId);
let isHost = false, busy = false, toastTimer, audioContext = null, soundEnabled = true, lastAnimatedMoveKey = '', syncTimer = null, refreshInFlight = false;

function initialState(code, host, teamMode=true) { return {code, hostId:host.id, status:'waiting', teamMode, shuffleTeamsOnFull:false, players:[host], turn:0, dice:null, lastRoll:null, message:'Waiting for players to join.', winner:null, updatedAt:Date.now(), revision:0}; }
function newPlayer(name,color,id=crypto.randomUUID(),team=null) { return {id,name,color,team,tokens:[-1,-1,-1,-1],connected:true}; }
function teamName(team){return team==='A'?'Team Sun':'Team Moon'}
function shuffleTeamsLocal(){
  const shuffled=[...room.players].sort(()=>Math.random()-.5);
  shuffled.forEach((p,i)=>p.team=i<2?'A':'B');
}
function shuffleTeams(){
  if(!room||!room.teamMode||room.players.length!==4||!isHost)return;
  shuffleTeamsLocal(); room.message='Teams shuffled! Two players on each side. Good luck!';
  publish();render();
}
function assignDefaultTeams(){
  const pairs={red:'A',yellow:'A',green:'B',blue:'B'};
  room.players.forEach(p=>p.team=pairs[p.color]);
}
function teamHasWon(team){
  const members=room.players.filter(p=>p.team===team);
  return members.length===2 && members.every(p=>p.tokens.every(t=>t===57));
}
function showToast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function unlockAudio(){
  try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;audioContext=audioContext||new Ctx();if(audioContext.state==='suspended')audioContext.resume();return audioContext;}catch(e){return null}
}
function playSound(type){
  if(!soundEnabled)return;
  const ctx=unlockAudio();if(!ctx)return;
  const patterns={roll:[[180,.08],[260,.08],[360,.12],[480,.15]],move:[[520,.08],[680,.12]],release:[[330,.1],[520,.1],[740,.16]],safe:[[660,.12],[880,.18],[1040,.2]],capture:[[300,.1],[210,.13],[130,.22]],win:[[523,.12],[659,.12],[784,.18],[1046,.3]]};
  const notes=patterns[type]||patterns.move;
  const schedule=()=>{const now=ctx.currentTime;notes.forEach(([freq,d],i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type==='roll'?'triangle':'sine';o.frequency.setValueAtTime(freq,now+i*.11);g.gain.setValueAtTime(.0001,now+i*.11);g.gain.exponentialRampToValueAtTime(.16,now+i*.11+.015);g.gain.exponentialRampToValueAtTime(.0001,now+i*.11+d);o.connect(g);g.connect(ctx.destination);o.start(now+i*.11);o.stop(now+i*.11+d+.03);});};
  if(ctx.state==='running')schedule();else ctx.resume().then(()=>{if(ctx.state==='running')schedule()}).catch(()=>{});
}
document.addEventListener('pointerdown',unlockAudio,{once:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&room)refreshRoom()});
function toggleSound(){soundEnabled=!soundEnabled;$('sound-toggle').textContent=soundEnabled?'Sound: On':'Sound: Off';if(soundEnabled)playSound('safe')}
function canStartGame(){return !!room&&(room.teamMode?room.players.length===4:room.players.length>=2)}
async function startGame(){if(!room||!isRoomHost()||room.status!=='waiting'||!canStartGame())return;playSound('win');room.status='playing';room.turn=0;room.dice=null;room.message=`${getMe()?.name||'Host'} started the game. Good luck!`;await publish();render()}
function setError(msg){$('lobby-error').textContent=msg||''}
function setConnection(online){$('connection-label').textContent=online?'Live multiplayer':'Offline demo';$('connection-label').previousElementSibling.classList.toggle('live',online)}
function randomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s}
function getMe(){return room?.players.find(p=>p.id===localPlayerId)}
function isRoomHost(){return !!room&&(room.hostId?room.hostId===localPlayerId:(room.players?.[0]?.id===localPlayerId||isHost))}
function currentPlayer(){return room?.players[room.turn]}
function saveLocal(){localStorage.setItem('rr-last-room',room.code)}
function setViews(inGame){$('lobby').classList.toggle('hidden',inGame);$('game').classList.toggle('hidden',!inGame)}

async function createRoom(){
  const button=$('create-room');setError('');
  const name=$('player-name').value.trim();
  if(!name){$('player-name').focus();setError('Please enter your player name before creating a room.');return}
  if(button.disabled)return;
  button.disabled=true;button.textContent='Creating room…';
  try{
    await ensureSupabase();
    let created=false,lastError=null;
    for(let attempt=0;attempt<3&&!created;attempt++){
      const code=randomCode(),host=newPlayer(name,'red',localPlayerId),nextRoom=initialState(code,host,$('team-mode').checked);
      if(nextRoom.teamMode){const pairs={red:'A',yellow:'A',green:'B',blue:'B'};nextRoom.players.forEach(p=>p.team=pairs[p.color]);}
      const {error}=await supabase.from('ludo_rooms').insert({room_code:code,state:nextRoom});
      if(!error){room=nextRoom;isHost=true;created=true;}else{lastError=error;if(error.code!=='23505')break;}
    }
    if(!created){room=null;setError('Room creation failed: '+(lastError?.message||lastError?.details||'No response from database.')+' Check Supabase table and RLS policies.');return;}
    await enterGame();
  }catch(err){room=null;setError('Could not create room: '+(err?.message||String(err)));console.error('Roll Royale createRoom error:',err);}
  finally{button.disabled=false;button.innerHTML='<span>＋</span> Create a private room <span class="btn-arrow">↗</span>';}
}
async function joinRoom(){
  setError('');
  const name=$('player-name').value.trim();
  if(!name){$('player-name').focus();setError('Please enter your player name before joining a room.');return}
  try{await ensureSupabase();}catch(err){setError(err?.message||String(err));return}
  const code=$('room-code-input').value.trim().toUpperCase(); if(code.length!==6){setError('Enter the 6-character room code.');return}
  const {data,error}=await supabase.from('ludo_rooms').select('state').eq('room_code',code).maybeSingle();
  if(error||!data){setError('Room not found. Check the code and try again.');return}
  room=data.state; isHost=room.hostId?room.hostId===localPlayerId:isHost; if(room.status==='finished'){setError('This game has already finished. Create a new room.');return}
  if(room.players.some(p=>p.id===localPlayerId)){isHost=false;await enterGame();return}
  if(room.players.length>=4){setError('This room is full (4 players).');return}
  const seats=room.teamMode?COLORS:['red','yellow','green','blue']; const color=seats[room.players.length]; room.players.push(newPlayer(name,color,localPlayerId));
  if(room.teamMode){
    assignDefaultTeams();
    if($('shuffle-on-join').checked)room.shuffleTeamsOnFull=true;
    if(room.players.length===4&&room.shuffleTeamsOnFull)shuffleTeamsLocal();
  }
  room.message=`${getMe().name} joined the table.`; room.updatedAt=Date.now();room.revision++;
  const {error:saveError}=await supabase.from('ludo_rooms').update({state:room,updated_at:new Date().toISOString()}).eq('room_code',code);
  if(saveError){setError('Could not join: '+saveError.message);return}
  isHost=false;await enterGame();
}
async function enterGame(){saveLocal();setViews(true);render();setConnection(true);if(syncTimer)clearInterval(syncTimer);syncTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshRoom()},650);
  if(channel)await supabase.removeChannel(channel);
  channel=supabase.channel(`ludo-${room.code}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'ludo_rooms',filter:`room_code=eq.${room.code}`},payload=>{if(payload.new?.state){const incoming=payload.new.state;if((incoming.revision||0)>(room.revision||0)){room=incoming;isHost=room.hostId?room.hostId===localPlayerId:isHost;render()}}}).subscribe(status=>{if(status==='SUBSCRIBED')setConnection(true);if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setConnection(false)});
  await refreshRoom();
}
async function refreshRoom(){if(!supabase||!room||refreshInFlight)return;refreshInFlight=true;try{const code=room.code;const {data,error}=await supabase.from('ludo_rooms').select('state').eq('room_code',code).maybeSingle();if(!error&&data?.state&&room?.code===code&&(data.state.revision||0)>(room.revision||0)){room=data.state;isHost=room.hostId?room.hostId===localPlayerId:isHost;render()}}finally{refreshInFlight=false}}
async function publish(){if(!supabase||!room)return;room.updatedAt=Date.now();room.revision=(room.revision||0)+1;const snapshot=structuredClone(room);const {error}=await supabase.from('ludo_rooms').update({state:snapshot,updated_at:new Date().toISOString()}).eq('room_code',room.code);if(error)showToast('Sync issue: '+error.message);}
async function leaveRoom(){if(syncTimer){clearInterval(syncTimer);syncTimer=null}if(channel){await supabase.removeChannel(channel);channel=null}room=null;isHost=false;setViews(false);setConnection(false)}
function coordFor(player,progress,index){if(progress===57)return [7,7];if(progress===-1){const base={red:[2.0,2.0],green:[11.0,2.0],yellow:[11.0,11.0],blue:[2.0,11.0]}[player.color];const offsets=[[0,0],[1.5,0],[0,1.5],[1.5,1.5]][index];return [base[0]+offsets[0],base[1]+offsets[1]]}if(progress>=51){const [x,y]=LANES[player.color][Math.min(5,progress-51)];return [x,y]}const [x,y]=TRACK[(STARTS[player.color]+progress)%52];return [x,y]}
function makeBoard(){const board=$('board');board.innerHTML='';
  BASES.forEach(({color,x,y})=>{const base=document.createElement('div');base.className=`base ${color}`;base.style.gridColumn=`${x+1}/span 6`;base.style.gridRow=`${y+1}/span 6`;const player=room?.players?.find(p=>p.color===color);const baseLabel=player?escapeHtml(player.name):(room?.status==='playing'?'':'Waiting');base.innerHTML=`${baseLabel?`<span class="base-name" title="${player?escapeHtml(player.name):'Waiting for player'}">${baseLabel}</span>`:''}<div class="base-inner">${[0,1,2,3].map(()=>`<i class="base-token" style="--token:var(--${color})"></i>`).join('')}</div>`;board.append(base)});
  TRACK.forEach(([x,y],i)=>{const cell=document.createElement('div');const startColor=Object.keys(STARTS).find(color=>STARTS[color]===i);cell.className='track-cell'+(SAFE.includes(i)?' safe':'')+(startColor?` start start-${startColor}`:'');cell.style.left=`${(x+.5)/15*100}%`;cell.style.top=`${(y+.5)/15*100}%`;board.append(cell)});
  Object.entries(LANES).forEach(([color,cells])=>cells.forEach(([x,y])=>{const el=document.createElement('div');el.className=`track-cell lane ${color}`;el.style.left=`${(x+.5)/15*100}%`;el.style.top=`${(y+.5)/15*100}%`;board.append(el)}));
  const center=document.createElement('div');center.className='center-home';center.innerHTML='<i class="home-triangle red"></i><i class="home-triangle green"></i><i class="home-triangle yellow"></i><i class="home-triangle blue"></i><i class="home-center-dot"></i>';board.append(center);
}
function renderTokens(){
  document.querySelectorAll('.token').forEach(e=>e.remove());if(!room)return;
  const entries=[];
  room.players.forEach(p=>p.tokens.forEach((progress,i)=>{
    const [x,y]=coordFor(p,progress,i);entries.push({p,progress,i,x,y,base:progress===-1});
  }));
  const stacks=new Map();
  entries.filter(e=>!e.base).forEach(e=>{const key=`${e.x},${e.y}`;if(!stacks.has(key))stacks.set(key,[]);stacks.get(key).push(e)});
  const spreadOffsets={2:[[-.30,0],[.30,0]],3:[[0,-.30],[-.30,.27],[.30,.27]],4:[[-.28,-.28],[.28,-.28],[-.28,.28],[.28,.28]]};
  entries.forEach(e=>{
    const {p,i,x,y,progress,base}=e,token=document.createElement('button');
    token.className=`token ${p.color}${base?' in-base':''}`;
    const lm=room.lastMove, isLast=lm?.playerId===p.id&&lm?.index===i;
    if(isLast){token.classList.add('token-moved');if(lm.safe)token.classList.add('token-safe');if(lm.fromBase)token.classList.add('token-release')}
    let dx=0,dy=0;
    if(!base){const stack=stacks.get(`${x},${y}`)||[],index=stack.indexOf(e),offsets=spreadOffsets[stack.length]||[];if(offsets[index]){[dx,dy]=offsets[index]}}
    const endLeft=(x+.5+dx)/15*100,endTop=(y+.5+dy)/15*100;
    token.style.left=`${endLeft}%`;token.style.top=`${endTop}%`;
    token.style.zIndex=String(5+(stacks.get(`${x},${y}`)||[]).indexOf(e));
    token.innerHTML='<i class="token-shine"></i><i class="token-stud"></i>';
    token.setAttribute('aria-label',`${p.name}, token ${i+1}`);
    const movable=!!room.dice&&currentPlayer()?.id===localPlayerId&&p.id===localPlayerId&&isLegalMove(p,i,room.dice);
    if(movable)token.classList.add('movable');
    token.disabled=!movable||busy;token.addEventListener('click',()=>moveToken(p.id,i));$('board').append(token);
    if(isLast&&lm.moveId&&lastAnimatedMoveKey!==lm.moveId&&Number.isFinite(lm.fromProgress)&&Number.isFinite(lm.toProgress)){
      const from=lm.fromProgress,to=lm.toProgress,steps=Math.max(1,to===0&&from===-1?1:to-from);
      const frames=[];
      for(let n=0;n<=steps;n++){
        const prog=from===-1?0:from+n;
        const [px,py]=coordFor(p,prog,i);
        frames.push({left:`${(px+.5)/15*100}%`,top:`${(py+.5)/15*100}%`,offset:n/steps,transform:n===steps?'scale(1)':'scale(1.08)'});
      }
      const duration=Math.min(steps*165,2400),elapsed=Math.max(0,Date.now()-(lm.at||Date.now()));
      const anim=token.animate(frames,{duration,easing:'linear',fill:'both'});
      anim.currentTime=Math.min(elapsed,duration);
      lastAnimatedMoveKey=lm.moveId;
    }
  });
}
function diceFace(value){
  if(!value)return '🎲';
  const patterns={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  return '<span class="dice-pips">'+patterns[value].map(n=>'<i class="pip p'+n+'"></i>').join('')+'</span>';
}
function render(){if(!room)return;const board=$('board');board.classList.remove('orient-red','orient-green','orient-yellow','orient-blue');const myPlayer=room.players.find(p=>p.id===localPlayerId);if(myPlayer)board.classList.add('orient-'+myPlayer.color);makeBoard();renderTokens();$('room-code-display').textContent=room.code;$('room-subtitle').textContent=room.status==='waiting'?'Waiting for your crew...':room.status==='finished'?`${room.winner} won the game!`:(room.teamMode?'2 vs 2 team battle':'Free-for-all');
  $('player-count').textContent=`${room.players.length} / 4`;
  $('players-list').innerHTML=COLORS.map(c=>{const p=room.players.find(p=>p.color===c);return `<div class="player-row" style="--player:var(--${c})"><i class="player-dot"></i><div class="player-info"><b>${p?`${c[0].toUpperCase()+c.slice(1)} player`:'Waiting for player'}</b><small>${p?`${p.tokens.filter(t=>t===57).length}/4 home${room.teamMode?' · '+teamName(p.team):''}`:'Open seat'}</small></div><span class="player-state">${p?(p.id===localPlayerId?'YOU':(room.players[room.turn]?.id===p.id?'TURN':'')):''}</span></div>`}).join('');
  const teamControls=$('team-controls');teamControls.classList.toggle('hidden',!room.teamMode);
  if(room.teamMode){
    const a=room.players.filter(p=>p.team==='A'),b=room.players.filter(p=>p.team==='B');
    $('team-summary').innerHTML=`<span class="team-pill sun">Team Sun: ${a.map(p=>escapeHtml(p.name)).join(' + ')||'Waiting'}</span><span class="team-pill moon">Team Moon: ${b.map(p=>escapeHtml(p.name)).join(' + ')||'Waiting'}</span>`;
    $('shuffle-teams').disabled=room.players.length!==4||room.status==='finished'||!isHost;
    $('shuffle-teams').title=isHost?'Randomly reassign two players to each team':'Only the room host can shuffle teams';
  }
  const cp=currentPlayer();$('turn-name').textContent=room.winner?`${room.winner} wins!`:cp?.name||'Waiting...';$('turn-hint').textContent=room.winner?'Game complete':room.status==='waiting'?(isRoomHost()?'Start when your players are ready':'Waiting for the host to start'):(room.teamMode&&room.players.length<4)?'Waiting for all four teammates':cp?.id===localPlayerId?'Your turn: make a move':`${cp?.name||'Player'} is playing`;$('turn-avatar').className=`turn-avatar ${cp?.color||'red'}`;$('dice').innerHTML=diceFace(room.dice);$('game-message').textContent=room.message||'';
  const myTurn=cp?.id===localPlayerId&&!room.winner&&room.status==='playing';
  $('dice').disabled=!myTurn||!!room.dice||(room.teamMode?room.players.length<4:room.players.length<2)||busy;
  $('dice').setAttribute('aria-label',room.dice?'Dice shows '+room.dice:myTurn?'Tap to roll the dice':'Waiting for your turn');
  $('dice').title=room.dice?'Choose a glowing token':myTurn?'Tap the dice to roll':'Waiting for your turn';
  const startBtn=$('start-game');startBtn.classList.toggle('hidden',!isRoomHost()||room.status!=='waiting');startBtn.disabled=!canStartGame();startBtn.textContent=canStartGame()?'Start game':'Waiting for players';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isLegalMove(player,index,roll){const pos=player.tokens[index];if(pos===57)return false;if(pos===-1)return roll===6;if(pos+roll>57)return false;return true}
async function rollDice(){
  if(busy||!room||room.status!=='playing'||currentPlayer()?.id!==localPlayerId||room.dice||(room.teamMode?room.players.length<4:room.players.length<2))return;
  busy=true;
  const roller=currentPlayer();
  $('dice').classList.add('dice-roll');playSound('roll');
  await new Promise(resolve=>setTimeout(resolve,850));
  $('dice').classList.remove('dice-roll');
  if(!room||currentPlayer()?.id!==localPlayerId){busy=false;return}
  const roll=1+Math.floor(Math.random()*6);room.dice=roll;room.lastRoll=roll;
  const p=currentPlayer();const legalMoves=p.tokens.map((pos,i)=>isLegalMove(p,i,roll)?i:-1).filter(i=>i>=0);
  room.message=legalMoves.length===1?`${p.name} rolled a ${roll}. Only one move available — moving token ${legalMoves[0]+1} automatically.`:legalMoves.length>1?`${p.name} rolled a ${roll}. Choose a token.`:roll===6?'No legal move — roll again!':`${p.name} rolled a ${roll}. No legal move.`;
  await publish();render();busy=false;
  if(!legalMoves.length){
    setTimeout(async()=>{if(!room||currentPlayer()?.id!==localPlayerId||room.dice!==roll)return;room.dice=null;if(roll!==6){nextTurn();room.message=`No legal move. Turn passed to ${currentPlayer()?.name||'next player'}.`;}else room.message='No move available. Roll again!';await publish();render()},900);
    return;
  }
  if(legalMoves.length===1){
    const roomCode=room.code,playerId=p.id,index=legalMoves[0];
    setTimeout(()=>{if(room?.code===roomCode&&room.status==='playing'&&currentPlayer()?.id===playerId&&room.dice===roll)moveToken(playerId,index)},550);
  }
}
async function moveToken(playerId,index){
  if(busy||!room||room.status!=='playing'||currentPlayer()?.id!==localPlayerId)return;
  const p=room.players.find(p=>p.id===playerId),roll=room.dice;
  if(!p||p.id!==localPlayerId||!roll||!isLegalMove(p,index,roll))return;
  busy=true;
  const start=p.tokens[index],leavingBase=start===-1,finalPos=leavingBase?0:start+roll;
  // Commit the complete move once. Every device animates the same path locally;
  // intermediate database writes cannot overwrite a newer turn or shorten a move.
  p.tokens[index]=finalPos;
  let captured=[];
  if(finalPos<=50){
    const square=(STARTS[p.color]+finalPos)%52;
    if(!SAFE.includes(square)){
      room.players.forEach(other=>{
        if(other.color===p.color)return;
        other.tokens.forEach((op,oi)=>{
          if(op>=0&&op<=50&&(STARTS[other.color]+op)%52===square){other.tokens[oi]=-1;captured.push(other.name)}
        });
      });
    }
  }
  const landedSafe=finalPos<=50&&SAFE.includes((STARTS[p.color]+finalPos)%52);
  room.lastMove={playerId:p.id,index,safe:landedSafe,fromBase:leavingBase,finished:finalPos===57,fromProgress:start,toProgress:finalPos,moveId:crypto.randomUUID(),at:Date.now()};
  if(captured.length)playSound('capture');
  else if(finalPos===57)playSound('win');
  else if(leavingBase)playSound('release');
  else if(landedSafe)playSound('safe');
  else playSound('move');
  if(room.teamMode?teamHasWon(p.team):p.tokens.every(t=>t===57)){
    room.status='finished';room.winner=room.teamMode?teamName(p.team):p.name;
    room.message=room.teamMode?`${teamName(p.team)} wins together! 🎉`:`${p.name} wins the game! 🎉`;
    room.dice=null;room.diceRolling=null;
  }else{
    const earnedBonus=roll===6||captured.length>0||finalPos===57;
    room.message=`${p.name} moved token ${index+1}${finalPos===57?' home': ''}${captured.length?` and captured ${captured.join(', ')}!`:''}${earnedBonus?' — roll again!':''}`;
    if(!earnedBonus)nextTurn();
    room.dice=null;room.diceRolling=null;
  }
  await publish();render();busy=false;
}
function nextTurn(){if(!room.players.length)return;room.turn=(room.turn+1)%room.players.length;room.dice=null}
async function copyCode(){if(!room)return;try{await navigator.clipboard.writeText(room.code);showToast('Room code copied!')}catch{showToast(`Room code: ${room.code}`)}}
$('create-room').addEventListener('click',createRoom);$('join-room').addEventListener('click',joinRoom);$('dice').addEventListener('click',rollDice);$('start-game').addEventListener('click',startGame);$('sound-toggle').addEventListener('click',toggleSound);$('leave-room').addEventListener('click',leaveRoom);$('copy-code').addEventListener('click',copyCode);$('shuffle-teams').addEventListener('click',shuffleTeams);$('room-code-input').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
if(!supabaseConfigured){$('connection-label').textContent='Setup required';$('lobby-error').textContent='Connect Supabase to enable online rooms. See README.md for setup.'}
