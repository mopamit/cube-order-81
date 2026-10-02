(() => {
  'use strict';

  const scene = document.getElementById('scene');
  const cubeStage = document.getElementById('cubeStage');
  const movedCountEl = document.getElementById('movedCount');
  const solvedBadge = document.getElementById('solvedBadge');
  const dimSolvedToggle = document.getElementById('dimSolvedToggle');
  const helpDialog = document.getElementById('helpDialog');
  const sequenceStrip = document.getElementById('sequenceStrip');
  const sequenceTools = document.getElementById('sequenceTools');
  const orderValue = document.getElementById('orderValue');
  const orderNote = document.getElementById('orderNote');
  const modeExplanation = document.getElementById('modeExplanation');

  let sequence = [];
  let interactionMode = 'direct';
  let animating = false;
  let queue = [];
  let viewX = -24;
  let viewY = 34;

  const cubies = [];
  const STEP = 71;
  const COLORS = {
    U: '#f5f1e8', D: '#ffd43b', F: '#f28a2a', B: '#d84f4f',
    R: '#3aaa61', L: '#3b69c7', core: '#1e2a34'
  };

  const idMat = () => [[1,0,0],[0,1,0],[0,0,1]];
  const cloneMat = m => m.map(r => r.slice());
  const matMul = (a,b) => a.map((r,i)=>b[0].map((_,j)=>r.reduce((s,_,k)=>s+a[i][k]*b[k][j],0)));
  const vecMul = (m,v) => m.map(r=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
  const round0 = n => Math.abs(n) < 1e-8 ? 0 : Math.round(n);

  function rotation(axis, dir){
    const d = dir >= 0 ? 1 : -1;
    if(axis === 'x') return [[1,0,0],[0,0,-d],[0,d,0]];
    if(axis === 'y') return [[0,0,d],[0,1,0],[-d,0,0]];
    return [[0,-d,0],[d,0,0],[0,0,1]];
  }

  const moveDefs = {
    U:{axis:'y',layer:1,dir:1}, D:{axis:'y',layer:-1,dir:-1},
    R:{axis:'x',layer:1,dir:1}, L:{axis:'x',layer:-1,dir:-1},
    F:{axis:'z',layer:1,dir:1}, B:{axis:'z',layer:-1,dir:-1}
  };

  function faceEl(cls, color, label=''){
    const f=document.createElement('div');
    f.className='face '+cls;
    f.style.setProperty('--sticker', color || COLORS.core);
    if(label){
      const badge=document.createElement('span');
      badge.className='face-label';
      badge.textContent=label;
      f.appendChild(badge);
    }
    return f;
  }

  function createCube(){
    scene.innerHTML=''; cubies.length=0;
    let id=0;
    for(let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++){
      const el=document.createElement('div');
      el.className='cubie';
      el.dataset.id=String(id);
      el.append(
        faceEl('front', z===1?COLORS.F:COLORS.core, x===0&&y===0&&z===1?'F':''),
        faceEl('back', z===-1?COLORS.B:COLORS.core, x===0&&y===0&&z===-1?'B':''),
        faceEl('right', x===1?COLORS.R:COLORS.core, x===1&&y===0&&z===0?'R':''),
        faceEl('left', x===-1?COLORS.L:COLORS.core, x===-1&&y===0&&z===0?'L':''),
        faceEl('top', y===1?COLORS.U:COLORS.core, x===0&&y===1&&z===0?'U':''),
        faceEl('bottom', y===-1?COLORS.D:COLORS.core, x===0&&y===-1&&z===0?'D':'')
      );
      scene.appendChild(el);
      const c={id:id++,el,pos:[x,y,z],homePos:[x,y,z],ori:idMat(),homeOri:idMat()};
      cubies.push(c); renderCubie(c,false);
    }
    updateMovedCount();
  }

  function currentStep(){
    const raw=getComputedStyle(document.documentElement).getPropertyValue('--step').trim();
    const n=parseFloat(raw); return Number.isFinite(n)?n:STEP;
  }

  function rotCss(m){
    const S=[[1,0,0],[0,-1,0],[0,0,1]];
    const c=matMul(S,matMul(m,S));
    return `matrix3d(${c[0][0]},${c[1][0]},${c[2][0]},0,${c[0][1]},${c[1][1]},${c[2][1]},0,${c[0][2]},${c[1][2]},${c[2][2]},0,0,0,0,1)`;
  }

  function transformFor(pos,ori){
    const step=currentStep(), [x,y,z]=pos;
    return `translate3d(${x*step}px,${-y*step}px,${z*step}px) ${rotCss(ori)}`;
  }

  function renderCubie(c,animate=true){
    c.el.style.transitionDuration=animate?'250ms':'0ms';
    c.el.style.transform=transformFor(c.pos,c.ori);
  }

  function getDef(move){
    const prime=move.endsWith("'"), base=move[0], d=moveDefs[base];
    return {...d,dir:prime?-d.dir:d.dir};
  }

  function isInLayer(c,def){
    const idx=def.axis==='x'?0:def.axis==='y'?1:2;
    return c.pos[idx]===def.layer;
  }

  function applyMoveInstantToState(state,move){
    const def=getDef(move), R=rotation(def.axis,def.dir);
    state.forEach(c=>{
      const idx=def.axis==='x'?0:def.axis==='y'?1:2;
      if(c.pos[idx]===def.layer){
        c.pos=vecMul(R,c.pos).map(round0);
        c.ori=matMul(R,c.ori).map(r=>r.map(round0));
      }
    });
  }

  function doMove(move){
    if(animating){ queue.push(move); return; }
    animating=true;
    const def=getDef(move), R=rotation(def.axis,def.dir);
    cubies.filter(c=>isInLayer(c,def)).forEach(c=>{
      c.pos=vecMul(R,c.pos).map(round0);
      c.ori=matMul(R,c.ori).map(r=>r.map(round0));
      renderCubie(c,true);
    });
    setTimeout(()=>{
      animating=false; updateMovedCount();
      if(queue.length) doMove(queue.shift());
    },270);
  }

  function runSequence(seq){
    if(!seq.length) return;
    seq.forEach((m,i)=>setTimeout(()=>doMove(m),i*300));
  }

  function resetCube(){
    queue=[]; animating=false;
    cubies.forEach(c=>{c.pos=c.homePos.slice();c.ori=cloneMat(c.homeOri);renderCubie(c,true)});
    setTimeout(updateMovedCount,270);
  }

  function sameState(a,b){
    return a.every((c,i)=>c.pos.join(',')===b[i].pos.join(',') && c.ori.flat().join(',')===b[i].ori.flat().join(','));
  }
  function cloneState(src){return src.map(c=>({id:c.id,pos:c.pos.slice(),ori:cloneMat(c.ori)}));}
  function identityState(){return cubies.map(c=>({id:c.id,pos:c.homePos.slice(),ori:cloneMat(c.homeOri)}));}

  function orderOf(seq){
    if(!seq.length) return null;
    const start=identityState(), state=cloneState(start);
    for(let n=1;n<=5000;n++){
      seq.forEach(m=>applyMoveInstantToState(state,m));
      if(sameState(state,start)) return n;
    }
    return '>5000';
  }

  function isHome(c){
    return c.pos.join(',')===c.homePos.join(',') && c.ori.flat().join(',')===c.homeOri.flat().join(',');
  }

  function updateMovedCount(){
    const moved=cubies.filter(c=>!isHome(c)).length;
    movedCountEl.textContent=String(moved);
    solvedBadge.textContent=moved===0?'הקובייה מסודרת':'הקובייה עדיין מעורבבת';
    solvedBadge.classList.toggle('unsolved',moved!==0);
    const dim=dimSolvedToggle.checked;
    cubies.forEach(c=>c.el.classList.toggle('dimmed',dim&&isHome(c)));
  }

  function prettyMove(m){return m.replace("'",'′');}
  function renderSequence(){
    sequenceStrip.innerHTML=sequence.length?sequence.map(m=>`<bdi dir="ltr">${prettyMove(m)}</bdi>`).join(' &nbsp; '):'בחרו פעולות';
    orderValue.textContent='—';
    orderNote.textContent=sequence.length?'לחצו על חישוב הסדר.':'בנו רצף כדי לחשב.';
  }

  function setMode(mode){
    interactionMode=mode;
    const direct=mode==='direct';
    document.getElementById('directModeBtn').classList.toggle('active',direct);
    document.getElementById('sequenceModeBtn').classList.toggle('active',!direct);
    sequenceTools.hidden=direct;
    modeExplanation.textContent=direct
      ? 'כל לחיצה מסובבת מיד את הפאה המתאימה בקובייה. שמות הפאות קבועים גם כשמסובבים את נקודת המבט.'
      : 'הלחיצות נשמרות כרצף. אחר כך אפשר להפעיל אותו ולחשב את הסדר שלו.';
  }

  function randomScramble(length=18){
    const bases=['U','R','F','D','L','B'];
    const moves=[];
    let lastBase='';
    for(let i=0;i<length;i++){
      let base;
      do { base=bases[Math.floor(Math.random()*bases.length)]; } while(base===lastBase);
      lastBase=base;
      moves.push(base+(Math.random()<.5?"'":''));
    }
    return moves;
  }

  function shuffleCube(){
    resetCube();
    const scramble=randomScramble(18);
    setTimeout(()=>runSequence(scramble),320);
    cubeStage.classList.remove('shuffle-flash');
    void cubeStage.offsetWidth;
    cubeStage.classList.add('shuffle-flash');
  }

  document.getElementById('moveGrid').querySelectorAll('[data-move]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const move=btn.dataset.move;
      if(interactionMode==='direct') doMove(move);
      else { sequence.push(move); renderSequence(); }
    });
  });

  document.getElementById('directModeBtn').addEventListener('click',()=>setMode('direct'));
  document.getElementById('sequenceModeBtn').addEventListener('click',()=>setMode('sequence'));
  document.getElementById('undoSequenceBtn').addEventListener('click',()=>{sequence.pop();renderSequence();});
  document.getElementById('clearSequenceBtn').addEventListener('click',()=>{sequence=[];renderSequence();});
  document.getElementById('runSequenceBtn').addEventListener('click',()=>runSequence(sequence));
  document.getElementById('calculateBtn').addEventListener('click',()=>{
    const o=orderOf(sequence);
    orderValue.textContent=o===null?'—':String(o);
    orderNote.textContent=o===null?'בנו רצף כדי לחשב.':`הקובייה חוזרת להתחלה אחרי ${o} ${o===1?'חזרה':'חזרות'} של הרצף.`;
  });

  document.getElementById('shuffleBtn').addEventListener('click',shuffleCube);
  document.getElementById('solvedBtn').addEventListener('click',resetCube);
  document.getElementById('resetBtn').addEventListener('click',()=>{
    resetCube(); sequence=[]; renderSequence(); setMode('direct'); dimSolvedToggle.checked=false; updateMovedCount();
  });
  document.getElementById('helpBtn').addEventListener('click',()=>helpDialog.showModal());
  dimSolvedToggle.addEventListener('change',updateMovedCount);

  let dragging=false,lastX=0,lastY=0;
  function updateView(){scene.style.transform=`rotateX(${viewX}deg) rotateY(${viewY}deg)`;}
  cubeStage.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;cubeStage.setPointerCapture(e.pointerId);});
  cubeStage.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
    viewY+=dx*.42;viewX-=dy*.34;viewX=Math.max(-78,Math.min(78,viewX));updateView();
  });
  cubeStage.addEventListener('pointerup',()=>dragging=false);
  cubeStage.addEventListener('pointercancel',()=>dragging=false);

  document.addEventListener('keydown',e=>{
    if(e.target.closest('dialog')) return;
    const k=e.key.toUpperCase();
    if('URFDLB'.includes(k) && k.length===1){
      const m=e.shiftKey?`${k}'`:k;
      if(interactionMode==='direct') doMove(m); else {sequence.push(m);renderSequence();}
    }
  });

  createCube(); updateView(); renderSequence(); setMode('direct');
})();
