/* Prism pocket card. Buildless, local-first, no runtime network dependencies. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const defaults = {version:1,name:'',role:'',url:'',shape:'auto',fit:'contain',overlay:false,finish:'gloss',shine:55,sensitivity:80,front:null,back:null,imageRatio:2/3,theme:'light'};
  let state={...defaults,theme:document.documentElement.dataset.theme==='dark'?'dark':'light'}, db=null, saved=false, saveTimer, saveGeneration=0, toastTimer, qrUrl='', qrSVG='';
  const card=$('card'), stage=$('stage'), mobile=matchMedia('(max-width:760px)'), reduced=matchMedia('(prefers-reduced-motion:reduce)');
  let sensorOn=false, sensorWaiting=false, sensorTimer, neutral=null, latestQ=null, lastSensorAt=0, dragging=false, activePointer=null;
  let target={x:0,y:0,z:0}, position={x:0,y:0,z:0}, velocity={x:0,y:0,z:0}, lastFrame=0, animation=0, presenting=false;
  let steering=false, cardWidth=280, cardRatio=2/3, stageWidth=1, stageHeight=1;
  let tiltWanted=true, sensorStarting=false, gestureRetryUsed=false;

  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
  function storageStatus(ok){saved=ok;$('saveStatus').classList.toggle('unsaved',!ok);$('saveStatus').textContent=ok?'Saved on this device':'Not saved · export a backup';$('saveStatus').prepend(document.createElement('i'));}
  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('prism-pocket-card',1);req.onupgradeneeded=()=>req.result.createObjectStore('setup');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Storage is blocked'));});}
  function dbGet(){return new Promise((resolve,reject)=>{const req=db.transaction('setup').objectStore('setup').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function dbPut(value){return new Promise((resolve,reject)=>{const tx=db.transaction('setup','readwrite');tx.objectStore('setup').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  function scheduleSave(){const generation=++saveGeneration;clearTimeout(saveTimer);$('saveStatus').textContent='Saving…';saveTimer=setTimeout(async()=>{try{if(!db)throw Error('Unavailable');await dbPut({...state});if(generation===saveGeneration)storageStatus(true);}catch{if(generation===saveGeneration){storageStatus(false);toast('Browser storage is unavailable. Export a backup to keep your setup.');}}},300);}
  function validURL(value){if(!value.trim())return '';try{const u=new URL(value.trim());if(!['https:','http:'].includes(u.protocol)||!u.hostname||u.username||u.password)return '';return u.href;}catch{return '';}}
  function drawQR(value){qrUrl=validURL(value);qrSVG='';$('urlError').hidden=!value.trim()||!!qrUrl;$('url').setAttribute('aria-invalid',String(!!value.trim()&&!qrUrl));$('urlError').textContent='Use a complete http:// or https:// link, without a username or password.';
    if(qrUrl){try{const qr=qrcode(0,'M');qr.addData(qrUrl,'Byte');qr.make();const n=qr.getModuleCount(),size=n+8;let path='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;
      qrSVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Scan to open your contact link" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black"/></svg>`;
    }catch{qrUrl='';$('urlError').hidden=false;$('urlError').textContent='This link is too long for a QR code. Try a shorter destination.';}}
    $('miniQr').innerHTML=qrSVG;$('miniQr').hidden=!qrSVG;$('backQrEmpty').hidden=!!qrSVG;$('qrLarge').innerHTML=qrSVG;$('qrLarge').hidden=!qrSVG;
    $('backHint').textContent=qrUrl?'Scan to connect, or tap Show QR.':'Add your link in Customize to create your QR code.';
    $('qrDestination').textContent=qrUrl;$('qrDestination').hidden=!qrUrl;$('qrEmpty').hidden=!!qrUrl;$('qrCustomize').hidden=!!qrUrl;$('copyBtn').hidden=!qrUrl;
  }
  function applyTheme(){
    const dark=state.theme==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]').setAttribute('content',dark?'#111113':'#f5f5f7');
    const label=dark?'Switch to light mode':'Switch to dark mode';
    $('themeBtn').setAttribute('aria-label',label);$('themeBtn').setAttribute('title',label);
    $('themeBtn').setAttribute('aria-pressed',String(dark));$('themeIcon').setAttribute('href',dark?'#i-sun':'#i-moon');
    try{localStorage.setItem('prism-theme',state.theme);}catch{}
  }
  $('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';applyTheme();scheduleSave();};
  function applyState(fillInputs=true){
    applyTheme();
    if(fillInputs){for(const key of ['name','role','url','shape','fit','shine','sensitivity'])$(key).value=state[key];$('overlay').checked=state.overlay;}
    $('cardLabel').textContent=state.name.trim()||'Your name';$('cardRole').textContent=state.role.trim()||'Let’s connect';
    $('backName').textContent=state.name.trim()||'Your name';$('backRole').textContent=state.role.trim()||'Let’s stay in touch.';
    $('displayTitle').textContent=state.name.trim()||'Your card.';$('qrName').textContent=state.name.trim()||'Let’s connect.';
    $('captionText').textContent=state.role.trim()||'Ready for your next introduction.';
    for(const side of ['front','back']){const el=$(side+'Image');el.hidden=!state[side];if(state[side]){if(el.getAttribute('src')!==state[side])el.src=state[side];}else el.removeAttribute('src');}card.classList.toggle('has-art',!!state.front);
    $('demoArt').hidden=!!state.front;$('frontCopy').hidden=!!state.front&&!state.overlay;$('backCopy').hidden=!!state.back;
    for(const el of [$('frontImage'),$('backImage')])el.style.objectFit=state.fit;
    const ratio=state.shape==='portrait'?2/3:state.shape==='landscape'?1.586:state.front?state.imageRatio:2/3;
    card.style.aspectRatio=String(ratio);card.classList.toggle('landscape',ratio>1);
    card.classList.toggle('holo',state.finish==='holo');card.classList.toggle('matte',state.finish==='matte');
    document.documentElement.style.setProperty('--shine',state.shine/100);
    $('shineValue').value=state.shine+'%';$('sensitivityValue').value=state.sensitivity<60?'Subtle':state.sensitivity>110?'Expressive':'Balanced';
    document.querySelectorAll('[data-finish]').forEach(b=>{const selected=b.dataset.finish===state.finish;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    $('uploadTitle').textContent=state.front?'Replace front image':'Choose front image';
    $('backUploadLabel').textContent=state.back?'Replace back background':'Add back background';$('removeBackBtn').hidden=!state.back;
    $('overlay').disabled=!state.front;$('overlayHint').hidden=!!state.front;
    $('shine').disabled=state.finish==='matte';$('shineControl').classList.toggle('disabled',state.finish==='matte');
    drawQR(state.url);fitCard();
  }
  function fitCard(){
    const ratio=state.shape==='portrait'?2/3:state.shape==='landscape'?1.586:state.front?state.imageRatio:2/3;
    const maxWidth=presenting?(ratio>1?650:400):(ratio>1?450:mobile.matches?285:325);
    const width=Math.max(1,Math.min(stage.clientHeight*.84*ratio,stage.clientWidth*.84,maxWidth));
    cardWidth=width;cardRatio=ratio;stageWidth=stage.clientWidth;stageHeight=stage.clientHeight;
    card.style.width=width+'px';card.style.setProperty('--card-width',width+'px');card.style.setProperty('--back-qr-size',Math.min(width*.56,width/ratio*.56,220)+'px');wake();
  }
  function setEditor(open,moveFocus=false){
    const modal=open&&mobile.matches,editor=$('editor');
    document.body.classList.toggle('editor-closed',!open);$('editBtn').setAttribute('aria-expanded',String(open));
    $('sheetBackdrop').hidden=!modal;document.body.style.overflow=modal?'hidden':'';
    $('viewer').inert=modal;$('appHeader').inert=modal;editor.setAttribute('aria-hidden',String(!open));
    if(modal){editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');}
    else{editor.removeAttribute('role');editor.removeAttribute('aria-modal');}
    if(moveFocus){if(open)$('closeEditor').focus();else if(!presenting)$('editBtn').focus();}
    requestAnimationFrame(fitCard);
  }
  setEditor(!mobile.matches);
  $('editBtn').onclick=()=>setEditor(document.body.classList.contains('editor-closed'),true);
  $('closeEditor').onclick=$('doneBtn').onclick=()=>setEditor(false,true);
  $('sheetBackdrop').onclick=()=>setEditor(false,true);
  $('editor').addEventListener('keydown',e=>{
    if(e.key!=='Tab'||!mobile.matches||document.body.classList.contains('editor-closed'))return;
    const items=[...$('editor').querySelectorAll('button:not([disabled]),input:not([hidden]):not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length>0);
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  mobile.addEventListener('change',()=>setEditor(!mobile.matches));new ResizeObserver(fitCard).observe(stage);

  for(const key of ['name','role','url','shape','fit','shine','sensitivity'])$(key).addEventListener(['shape','fit'].includes(key)?'change':'input',()=>{state[key]=['shine','sensitivity'].includes(key)?Number($(key).value):$(key).value;applyState(false);scheduleSave();});
  $('overlay').onchange=()=>{state.overlay=$('overlay').checked;applyState(false);scheduleSave();};
  document.querySelectorAll('[data-finish]').forEach(b=>b.onclick=()=>{state.finish=b.dataset.finish;applyState(false);scheduleSave();});

  async function readImage(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG, or WebP image.');if(file.size>20*1024*1024)throw Error('Please choose an image smaller than 20 MB.');
    const bitmap=await createImageBitmap(file);try{if(!bitmap.width||!bitmap.height)throw Error('This image could not be opened.');const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return {data:canvas.toDataURL('image/webp',.94),ratio:bitmap.width/bitmap.height};}finally{bitmap.close();}}
  async function upload(file,side){try{toast('Preparing your artwork…');const img=await readImage(file);state[side]=img.data;if(side==='front'){state.imageRatio=img.ratio;state.overlay=false;state.shape='auto';}applyState();scheduleSave();toast(side==='front'?'Your artwork is ready.':'Reverse artwork added. Flip your card to see it.');}catch(e){toast(e.message||'Could not open this image.');}}
  for(const side of ['front','back'])$(side+'Upload').onchange=async e=>{await upload(e.target.files[0],side);e.target.value='';};
  document.querySelectorAll('label[role=button]').forEach(label=>label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$(label.htmlFor).click();}}));
  const zone=$('uploadZone');for(const type of ['dragenter','dragover'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.add('dragging');});for(const type of ['dragleave','drop'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.remove('dragging');if(type==='drop'&&e.dataTransfer.files[0])upload(e.dataTransfer.files[0],'front');});
  $('demoBtn').onclick=()=>{state.front=null;state.back=null;state.shape='auto';state.imageRatio=2/3;applyState();scheduleSave();toast('Demo artwork restored. Your details are kept.');};
  $('removeBackBtn').onclick=()=>{state.back=null;applyState();scheduleSave();toast('Back image removed. Your QR design is restored.');};
  $('flipBtn').onclick=()=>{card.classList.toggle('flipped');$('frontFace').setAttribute('aria-hidden',String(card.classList.contains('flipped')));$('backFace').setAttribute('aria-hidden',String(!card.classList.contains('flipped')));$('flipBtnLabel').textContent=card.classList.contains('flipped')?'Show front':'Flip card';card.setAttribute('aria-label',card.classList.contains('flipped')?'Back of business card. Press Enter to flip.':'Front of business card. Press Enter to flip.');};card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('flipBtn').click();}});

  function motionStatus(message,active=false){if($('motionText').textContent!==message)$('motionText').textContent=message;$('motionStatus').classList.toggle('active',active);}
  function multiply(a,b){return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];}
  function quaternion(e){const r=Math.PI/360,a=(e.alpha||0)*r,b=e.beta*r,g=e.gamma*r;return multiply(multiply([Math.cos(a),0,0,Math.sin(a)],[Math.cos(b),Math.sin(b),0,0]),[Math.cos(g),0,Math.sin(g),0]);}
  function orientation(e){if(!sensorOn||e.beta==null||e.gamma==null||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;latestQ=quaternion(e);lastSensorAt=performance.now();if(!neutral)neutral=latestQ.slice();
    if(sensorWaiting){sensorWaiting=false;clearTimeout(sensorTimer);$('motionBtnLabel').textContent='Disable tilt';$('motionBtn').setAttribute('aria-label','Disable phone tilt');$('motionBtn').disabled=false;motionStatus('Phone tilt is on.',true);}
    if(dragging)return;const rel=multiply([neutral[0],-neutral[1],-neutral[2],-neutral[3]],latestQ),[w,x,y,z]=rel;
    const pitch=Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))*180/Math.PI,yaw=Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x))))*180/Math.PI;
    const angle=((screen.orientation&&screen.orientation.angle)||0)*Math.PI/180,gain=state.sensitivity/100;
    const forward=-(pitch*Math.cos(angle)+yaw*Math.sin(angle)),side=yaw*Math.cos(angle)-pitch*Math.sin(angle);
    target.x=clamp(forward*gain,-18,18);target.y=clamp(side*gain,-18,18);
    steerCard(forward);wake();
  }
  function steerCard(forward){
    // Two reading orientations. Separate turn/return thresholds prevent chatter.
    if(!steering&&forward>=38)steering=true;
    else if(steering&&forward<=8)steering=false;
    target.z=steering?180:0;
  }
  function stopSensor(message='Drag the card to preview.'){sensorOn=false;sensorWaiting=false;clearTimeout(sensorTimer);window.removeEventListener('deviceorientation',orientation);neutral=null;latestQ=null;lastSensorAt=0;$('motionBtnLabel').textContent='Enable tilt';$('motionBtn').setAttribute('aria-label','Enable phone tilt');$('motionBtn').disabled=false;$('motionBtn').setAttribute('aria-pressed','false');motionStatus(message);target={x:0,y:0,z:0};steering=false;wake();}
  function motionNotice(message){$('motionNoticeText').textContent=message;$('motionNotice').hidden=false;}
  $('dismissMotionNotice').onclick=()=>{$('motionNotice').hidden=true;};
  async function startSensor({automatic=false}={}){
    $('motionNotice').hidden=true;
    if(sensorOn||sensorStarting)return;
    if(!window.isSecureContext){motionStatus('Phone tilt needs HTTPS.');if(!automatic)motionNotice('Phone tilt needs a secure HTTPS address. You can still drag the card while testing on your local network.');return;}
    if(!('DeviceOrientationEvent'in window)){motionStatus('Drag the card to preview.');if(!automatic)motionNotice('Motion sensors aren’t available in this browser. You can still drag the card.');return;}
    sensorStarting=true;
    try{
      if(typeof DeviceOrientationEvent.requestPermission==='function'){
        const permission=await DeviceOrientationEvent.requestPermission();
        if(permission!=='granted')throw Error('Motion access was declined. Allow motion access in your browser settings to try again. Dragging still works.');
      }
      sensorOn=true;sensorWaiting=true;neutral=null;lastSensorAt=0;
      $('motionBtnLabel').textContent='Connecting…';$('motionBtn').setAttribute('aria-label','Cancel phone tilt connection');$('motionBtn').setAttribute('aria-pressed','true');motionStatus('Hold your phone comfortably.');
      window.addEventListener('deviceorientation',orientation);
      sensorTimer=setTimeout(()=>{if(sensorWaiting){stopSensor('No motion data received · tap Enable tilt to retry.');if(!automatic)motionNotice('Open the HTTPS page directly in Chrome and check its Motion sensors permission. You can still drag the card.');}},3500);
    }catch(e){stopSensor(automatic?'Tap anywhere to allow phone tilt.':'Drag the card to preview.');if(!automatic)motionNotice(e.message||'Could not enable motion. Check your browser permissions and try again.');}
    finally{sensorStarting=false;}
  }
  $('motionBtn').onclick=()=>{if(sensorOn){tiltWanted=false;stopSensor();}else{tiltWanted=true;startSensor();}};
  // Some browsers require the first real interaction before allowing sensors.
  // Retry once from that interaction, while respecting an explicit Off choice.
  window.addEventListener('click',e=>{
    if(!e.isTrusted||!tiltWanted||gestureRetryUsed||sensorStarting||(sensorOn&&!sensorWaiting)||e.target===$('motionBtn')||e.target?.closest?.('#motionBtn'))return;
    gestureRetryUsed=true;
    if(sensorOn)stopSensor();
    startSensor({automatic:true});
  },{capture:true});
  $('recenterBtn').onclick=()=>{if(sensorOn&&latestQ){neutral=latestQ.slice();target={x:0,y:0,z:0};steering=false;toast('Centered at your current holding angle.');}else{target={x:0,y:0,z:0};steering=false;toast('Card centered.');}wake();};
  if(screen.orientation)screen.orientation.addEventListener('change',()=>{neutral=null;target={x:0,y:0,z:0};steering=false;wake();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(animation);animation=0;lastFrame=0;}else{neutral=null;lastSensorAt=performance.now();wake();}});
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function pointerTarget(e){const rect=stage.getBoundingClientRect();target.y=clamp(((e.clientX-rect.left)/rect.width-.5)*38,-18,18);target.x=clamp(-((e.clientY-rect.top)/rect.height-.5)*38,-18,18);wake();}
  card.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;activePointer=e.pointerId;card.setPointerCapture(e.pointerId);pointerTarget(e);});
  card.addEventListener('pointermove',e=>{if(dragging&&e.pointerId===activePointer)pointerTarget(e);});
  function endDrag(e){if(e.pointerId!==activePointer)return;dragging=false;activePointer=null;if(!sensorOn)target={x:0,y:0,z:0};steering=false;wake();}
  card.addEventListener('pointerup',endDrag);card.addEventListener('pointercancel',endDrag);
  stage.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!dragging&&!sensorOn&&!reduced.matches)pointerTarget(e);});
  stage.addEventListener('pointerleave',()=>{if(!sensorOn&&!dragging){target={x:0,y:0,z:0};steering=false;wake();}});
  function wake(){if(!animation&&!document.hidden)animation=requestAnimationFrame(frame);}
  function animateTurn(dt){
    if(reduced.matches){position.z=target.z;velocity.z=0;return false;}
    // Exact damped-spring integration: momentum survives a direction change.
    // A softer torsional spring gives the card weight without a fixed timeline.
    const offset=position.z-target.z,decay=Math.exp(-8*dt),frequency=Math.sqrt(11);
    const c=Math.cos(frequency*dt),s=Math.sin(frequency*dt),speed=velocity.z;
    position.z=target.z+decay*(offset*c+(speed+8*offset)/frequency*s);
    velocity.z=decay*(speed*c-(8*speed+75*offset)/frequency*s);
    if(Math.abs(position.z-target.z)<.005&&Math.abs(velocity.z)<.01){position.z=target.z;velocity.z=0;return false;}
    return true;
  }
  function frame(now){animation=0;const dt=Math.min((now-(lastFrame||now-16))/1000,1/30);lastFrame=now;
    if(sensorOn&&!sensorWaiting&&lastSensorAt&&now-lastSensorAt>3500){motionStatus('Waiting for motion data…');target={x:0,y:0,z:0};steering=false;}else if(sensorOn&&!sensorWaiting)motionStatus('Phone tilt is on.',true);
    let moving=animateTurn(dt);for(const axis of ['x','y']){const force=(target[axis]-position[axis])*150-velocity[axis]*23;velocity[axis]+=force*dt;position[axis]+=velocity[axis]*dt;if(Math.abs(target[axis]-position[axis])>.005||Math.abs(velocity[axis])>.01)moving=true;else{position[axis]=target[axis];velocity[axis]=0;}}
    const turn=position.z*Math.PI/180,height=cardWidth/cardRatio,diagonal=Math.hypot(cardWidth,height);
    const angle=Math.acos(Math.min(1,Math.abs(Math.cos(turn))));
    // Fit only as the real rotation needs it. No anticipatory zoom or pullback.
    const widthBound=angle<Math.atan2(height,cardWidth)?cardWidth*Math.cos(angle)+height*Math.sin(angle):diagonal;
    const heightBound=angle<Math.atan2(cardWidth,height)?height*Math.cos(angle)+cardWidth*Math.sin(angle):diagonal;
    const scale=Math.min(1,stageWidth*.9/widthBound,stageHeight*.9/heightBound);
    card.style.setProperty('--turn-scale',String(Math.max(.01,scale)));card.style.setProperty('--rz',position.z.toFixed(3)+'deg');
    card.style.setProperty('--rx',position.x.toFixed(3)+'deg');card.style.setProperty('--ry',position.y.toFixed(3)+'deg');card.style.setProperty('--lx',(50+position.y*2.1).toFixed(2)+'%');card.style.setProperty('--ly',(30-position.x*2.2).toFixed(2)+'%');$('floorShadow').style.transform=`translate(${position.y*.9}px,${Math.abs(position.x)*.15}px) scale(${1+Math.abs(position.y)/130})`;
    if(moving||sensorOn)wake();else lastFrame=0;
  }
  let ownsFullscreen=false,fullscreenPending=false,presentationRun=0,exitTimer=null,presentationOrigin=$('presentBtn');
  function presentationView(on){
    presenting=on;document.body.classList.toggle('presenting',on);
    $('presentationControls').hidden=!on;
    const exit=$('exitPresent');exit.hidden=!on;exit.disabled=false;exit.classList.remove('exiting');
    clearTimeout(exitTimer);exitTimer=null;
    if(on){setEditor(false);clearTimeout(toastTimer);$('toast').classList.remove('visible');}
    requestAnimationFrame(fitCard);
    if(on)exit.focus();else presentationOrigin.focus();
  }
  async function presentation(on,{origin=$('presentBtn')}={}){
    if(!on){
      ++presentationRun;
      const leaveFullscreen=ownsFullscreen&&document.fullscreenElement===document.documentElement;
      ownsFullscreen=false;presentationView(false);
      if(leaveFullscreen&&typeof document.exitFullscreen==='function'){
        try{await document.exitFullscreen();}catch{motionStatus('Presentation closed. Use your browser’s fullscreen exit control if needed.');}
      }
      return;
    }
    if(presenting)return;
    if(fullscreenPending){motionStatus('Fullscreen is still updating. Try again in a moment.');return;}
    const run=++presentationRun;
    presentationOrigin=origin;presentationView(true);
    // Request in the original click handler, before awaiting anything, to retain user activation.
    if(document.fullscreenElement)return;
    if(document.fullscreenEnabled===false||typeof document.documentElement.requestFullscreen!=='function'){
      return;
    }
    fullscreenPending=true;
    try{
      await document.documentElement.requestFullscreen({navigationUI:'hide'});
      if(!presenting||run!==presentationRun){
        if(document.fullscreenElement===document.documentElement&&typeof document.exitFullscreen==='function')await document.exitFullscreen();
        return;
      }
      ownsFullscreen=document.fullscreenElement===document.documentElement;
    }catch{
      // The controls-hidden view is the fallback; no additional app popup is needed.
    }finally{fullscreenPending=false;requestAnimationFrame(fitCard);}
  }
  $('presentFlip').onclick=()=>$('flipBtn').click();
  $('presentRecenter').onclick=()=>$('recenterBtn').click();
  $('presentBtn').onclick=()=>presentation(true);
  $('previewBtn').onclick=()=>presentation(true,{origin:$('previewBtn')});
  $('exitPresent').onclick=()=>{
    if(!presenting||exitTimer!==null)return;
    if(reduced.matches)return presentation(false);
    const exit=$('exitPresent');exit.classList.add('exiting');exit.disabled=true;
    exitTimer=setTimeout(()=>{exitTimer=null;presentation(false);},560);
  };
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===document.documentElement&&presenting&&fullscreenPending)ownsFullscreen=true;
    else if(!document.fullscreenElement&&presenting&&(ownsFullscreen||fullscreenPending)){
      ++presentationRun;ownsFullscreen=false;presentationView(false);
    }
    requestAnimationFrame(fitCard);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!$('qrDialog').open){
      if(presenting)presentation(false);else if(mobile.matches)setEditor(false,true);
    }
  });
  $('scanBtn').onclick=()=>{drawQR(state.url);$('qrDialog').showModal();};$('closeQr').onclick=()=>$('qrDialog').close();$('qrDialog').addEventListener('click',e=>{if(e.target===$('qrDialog')){const r=$('qrDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('qrDialog').close();}});
  $('qrCustomize').onclick=()=>{$('qrDialog').close();if(presenting)presentation(false);setEditor(true);$('url').focus();};
  $('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(qrUrl);toast('Link copied.');}catch{toast('Clipboard unavailable. Your destination is shown below the code.');}};
  function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('exportBtn').onclick=()=>{download('prism-card-backup.json',JSON.stringify({app:'prism-pocket-card',...state},null,2),'application/json');toast('Backup exported. Keep it somewhere safe.');};
  function validateBackup(raw){if(!raw||raw.app!=='prism-pocket-card'||raw.version!==1)throw Error('Choose a Prism version 1 backup.');const s={...defaults};if(raw.theme!=null&&!['light','dark'].includes(raw.theme))throw Error('This backup has an unsupported appearance.');s.theme=raw.theme??state.theme;for(const [key,max]of [['name',50],['role',80],['url',1000]]){if(typeof raw[key]!=='string'||raw[key].length>max)throw Error('This backup has invalid text fields.');s[key]=raw[key];}
    for(const[key,values]of [['shape',['auto','portrait','landscape']],['fit',['contain','cover']],['finish',['gloss','holo','matte']]]){if(!values.includes(raw[key]))throw Error('This backup contains unsupported settings.');s[key]=raw[key];}
    if(typeof raw.overlay!=='boolean'||!Number.isFinite(raw.shine)||raw.shine<0||raw.shine>100||!Number.isFinite(raw.sensitivity)||raw.sensitivity<25||raw.sensitivity>150)throw Error('This backup has invalid effect settings.');s.overlay=raw.overlay;s.shine=raw.shine;s.sensitivity=raw.sensitivity;
    for(const side of ['front','back']){if(raw[side]!==null&&(typeof raw[side]!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw[side])))throw Error('This backup has invalid artwork.');s[side]=raw[side];}return s;
  }
  $('importFile').onchange=async e=>{const file=e.target.files[0];try{if(!file)return;if(file.size>20*1024*1024)throw Error('Backup must be under 20 MB.');const next=validateBackup(JSON.parse(await file.text()));for(const side of ['front','back'])if(next[side]){const img=await readImage(await(await fetch(next[side])).blob());next[side]=img.data;if(side==='front')next.imageRatio=img.ratio;}
      state=next;applyState();scheduleSave();toast('Your setup has been restored.');}catch(err){toast(err instanceof SyntaxError?'This file is not a valid JSON backup.':err.message||'Could not restore this backup.');}finally{e.target.value='';}};
  async function init(){applyState();try{db=await openDB();const stored=await dbGet();if(stored){const next=validateBackup({app:'prism-pocket-card',...stored});next.imageRatio=Number.isFinite(stored.imageRatio)&&stored.imageRatio>0?stored.imageRatio:2/3;state=next;applyState();}storageStatus(true);}catch{storageStatus(false);toast('Local saving is unavailable here. Export a backup before closing.');}}
  window.addEventListener('pagehide',()=>{if(db){clearTimeout(saveTimer);dbPut({...state}).catch(()=>{});}});
  startSensor({automatic:true});
  init();
})();
