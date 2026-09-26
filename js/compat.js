(function(){
"use strict";
var SAVE_URL="./save.json";
var gamepadPrev={};
var lastPoll=0;
var loaded=false;
var bots={};
var nextBotId=910000;
var lastZone="";
var lastBotSpawn=0;
var BOT_COUNT=3;
var lastBotMove=0;

function getGame(){ return (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]) || null; }
function getKeys(){
  var g=getGame();
  if(!g || !g.input || !g.input.keyboard || !window.Phaser) return null;
  return {
    up:g.input.keyboard.addKey(Phaser.Keyboard.UP),
    down:g.input.keyboard.addKey(Phaser.Keyboard.DOWN),
    left:g.input.keyboard.addKey(Phaser.Keyboard.LEFT),
    right:g.input.keyboard.addKey(Phaser.Keyboard.RIGHT),
    enter:g.input.keyboard.addKey(Phaser.Keyboard.ENTER),
    escape:g.input.keyboard.addKey(Phaser.Keyboard.ESC),
    space:g.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR)
  };
}
var keys=null;
var aliases={w:"up",a:"left",s:"down",d:"right",arrowup:"up",arrowdown:"down",arrowleft:"left",arrowright:"right"};
function setKey(name,val){
  if(!keys) keys=getKeys();
  if(keys && keys[name]) keys[name].isDown=!!val;
}
window.addEventListener("keydown",function(e){
  if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  var k=(e.key||"").toLowerCase(), a=aliases[k];
  if(a){ setKey(a,true); e.preventDefault(); }
  if(k==="h") openHouseEditor();
});
window.addEventListener("keyup",function(e){
  var k=(e.key||"").toLowerCase(), a=aliases[k];
  if(a){ setKey(a,false); e.preventDefault(); }
});

function pollPad(){
  var pads=navigator.getGamepads ? navigator.getGamepads() : [];
  var p=null; for(var i=0;i<pads.length;i++) if(pads[i]){p=pads[i];break;}
  if(!p) return;
  if(!keys) keys=getKeys();
  if(!keys) return;
  var ax=(p.axes&&p.axes[0])||0, ay=(p.axes&&p.axes[1])||0;
  setKey("left",ax < -0.28 || !!(p.buttons&&p.buttons[14]&&p.buttons[14].pressed));
  setKey("right",ax > 0.28 || !!(p.buttons&&p.buttons[15]&&p.buttons[15].pressed));
  setKey("up",ay < -0.28 || !!(p.buttons&&p.buttons[12]&&p.buttons[12].pressed));
  setKey("down",ay > 0.28 || !!(p.buttons&&p.buttons[13]&&p.buttons[13].pressed));
  var a=!!(p.buttons&&p.buttons[0]&&p.buttons[0].pressed);
  var b=!!(p.buttons&&p.buttons[1]&&p.buttons[1].pressed);
  var x=!!(p.buttons&&p.buttons[2]&&p.buttons[2].pressed);
  var y=!!(p.buttons&&p.buttons[3]&&p.buttons[3].pressed);
  setKey("enter",a); setKey("escape",b); setKey("space",x||y);
}
function gamepadLoop(t){
  if(t-lastPoll>30){lastPoll=t;pollPad();}
  requestAnimationFrame(gamepadLoop);
}
requestAnimationFrame(gamepadLoop);

function getPlayer(){
  var s=null; try{s=findScreen();}catch(e){}
  try{if(s&&s.user&&s.user.source)return s.user.source;}catch(e){}
  try{if(s&&s.player)return s.player;}catch(e){}
  try{if(window.__PRODIGY_PLAYER)return window.__PRODIGY_PLAYER;}catch(e){}
  return null;
}
function findScreen(){
  var g=getGame(); if(!g) return null;
  var root=null; try{root=g.state.getCurrentState();}catch(e){}
  if(!root) return null;
  if(root.setFakePlayer && root.addPlayer && root.playerList) return root;
  var seen=[];
  function scan(o,d){
    if(!o || d>5 || typeof o!=="object") return null;
    if(seen.indexOf(o)>=0) return null; seen.push(o);
    if(o.setFakePlayer && o.addPlayer && o.playerList) return o;
    var ks; try{ks=Object.keys(o);}catch(e){return null;}
    for(var i=0;i<ks.length;i++){
      var v; try{v=o[ks[i]];}catch(e){continue;}
      if(v && typeof v==="object") { var r=scan(v,d+1); if(r) return r; }
    }
    return null;
  }
  return scan(root,0);
}
function copyAppearance(p){
  try{return p.appearance && p.appearance.getData ? JSON.parse(JSON.stringify(p.appearance.getData())) : {};}catch(e){return {};}
}
function copyEquipment(p){
  try{return p.equipment && p.equipment.getData ? JSON.parse(JSON.stringify(p.equipment.getData())) : {};}catch(e){return {};} 
}
function copyData(p){
  try{return JSON.parse(JSON.stringify(p.data||{}));}catch(e){return {};} 
}
function makeBot(p,index,x,y){
  var id=nextBotId++;
  var fake={
    userID:id,
    target:{x:x,y:y},
    appearance:copyAppearance(p),
    equipment:copyEquipment(p),
    data:copyData(p),
    isMember:1
  };
  fake.data=fake.data||{};
  fake.data.name=["Alex","Nova","Kai","Mika","Riley","Sam"][index%6]+"_Bot";
  fake.data.username=fake.data.name;
  fake.data.level=20;
  fake.data.allowsHouseVisitors=true;
  if(fake.appearance) {
    if(fake.appearance.hair) fake.appearance.hair.color=(fake.appearance.hair.color||1);
    if(fake.appearance.faceColor==null) fake.appearance.faceColor=1;
  }
  return fake;
}
function clearBots(screen){
  if(!screen) return;
  for(var id in bots){
    try{screen.removePlayer(parseInt(id,10));}catch(e){
      try{if(screen.playerList[id]&&screen.playerList[id].destroy)screen.playerList[id].destroy();delete screen.playerList[id];}catch(_e){}
    }
  }
  bots={};
}
function spawnBots(){
  var now=Date.now();
  if(now-lastBotSpawn<1500) return;
  var screen=findScreen(), p=getPlayer();
  if(!screen || !p || !screen.playerList) return;
  var zone=screen.zoneName||screen.saveTag||screen.name||"";
  if(zone!==lastZone){clearBots(screen);lastZone=zone;lastBotSpawn=0;}
  var existing=Object.keys(bots).length;
  if(existing>=BOT_COUNT) return;
  var baseX=parseFloat(screen.user&&screen.user.x); var baseY=parseFloat(screen.user&&screen.user.y);
  if(!isFinite(baseX)) baseX=parseFloat(p.x)||640;
  if(!isFinite(baseY)) baseY=parseFloat(p.y)||360;
  var offsets=[[100,0],[-100,0],[0,100],[0,-100],[150,80],[-150,80]];
  while(Object.keys(bots).length<BOT_COUNT){
    var i=Object.keys(bots).length, off=offsets[i%offsets.length];
    var fake=makeBot(p,i,baseX+off[0],baseY+off[1]);
    try{
      screen.setFakePlayer(fake);
      // Older builds hide multiplayer players behind a feature gate. For local bots,
      // bypass only that gate while using the game's own player renderer.
      var fr=screen.featureRequirements, old=null;
      if(fr && fr.meetsRequirements){old=fr.meetsRequirements;fr.meetsRequirements=function(){return true;};}
      screen.addPlayer(fake);
      if(fr && old) fr.meetsRequirements=old;
      screen.movePlayer(fake);
      bots[fake.userID]=fake;
    }catch(e){console.warn("Bot spawn failed",e);break;}
  }
  lastBotSpawn=now;
}
function moveBots(){
  var now=Date.now(); if(now-lastBotMove<1200)return; lastBotMove=now;
  var screen=findScreen(); if(!screen) return;
  var p=screen.user; if(!p) return;
  var t=now/1000;
  var ids=Object.keys(bots);
  for(var i=0;i<ids.length;i++){
    var b=bots[ids[i]], o=[[90,0],[-90,0],[0,90]][i%3];
    try{screen.movePlayer({userID:b.userID,target:{x:p.x+o[0]+Math.sin(t*.7+i)*25,y:p.y+o[1]+Math.cos(t*.6+i)*25}});}catch(e){}
  }
}

function spawnOneBot(){
  var screen=findScreen(),p=getPlayer(); if(!screen||!p||!screen.playerList)return false;
  var i=Object.keys(bots).length, baseX=parseFloat(screen.user&&screen.user.x),baseY=parseFloat(screen.user&&screen.user.y);
  if(!isFinite(baseX))baseX=parseFloat(p.x)||640; if(!isFinite(baseY))baseY=parseFloat(p.y)||360;
  var off=[[100,0],[-100,0],[0,100],[0,-100],[150,80],[-150,80]][i%6];
  var fake=makeBot(p,i,baseX+off[0],baseY+off[1]);
  try{
    screen.setFakePlayer(fake);
    var fr=screen.featureRequirements, oldReq=null, oldCap=null;
    if(fr&&fr.meetsRequirements){oldReq=fr.meetsRequirements;fr.meetsRequirements=function(){return true;};}
    if(screen.canAddUsersToScreen){oldCap=screen.canAddUsersToScreen;screen.canAddUsersToScreen=function(){return true;};}
    screen.addPlayer(fake);
    if(fr&&oldReq)fr.meetsRequirements=oldReq;
    if(oldCap)screen.canAddUsersToScreen=oldCap;
    if(screen.playerList[fake.userID]){
      screen.movePlayer(fake);
      bots[fake.userID]=fake;
      return true;
    }
    console.warn("Bot was rejected by native player renderer");
    return false;
  }catch(e){console.warn("Bot spawn failed",e);return false;}
}
window.__spawnBot=spawnOneBot;
window.__toggleOldUI=function(){
  var on=localStorage.getItem("prodigyOldUI")==="1";
  localStorage.setItem("prodigyOldUI",on?"0":"1");
  // 3.15.3 does not contain a separate whole-game legacy UI implementation.
  // Keep the setting available without pretending it can switch the missing UI.
  window.__legacyUIEnabled=!on;
  try{window.location.reload();}catch(e){}
};

function openHouseEditor(){
  try{
    var g=getGame();
    if(!g||!g.broadcaster) return;
    g.broadcaster.broadcast("Prodigy.Events.House.OPEN_EDITOR");
  }catch(e){console.warn("House editor unavailable",e);}
}
function houseFix(){
  try{
    var g=getGame(), p=getPlayer();
    if(!g||!p||!p.house) return;
    var h=p.house;
    // Keep the native editor's data model intact, but make every owned furniture item placeable.
    var items=h.data&&h.data.items;
    if(items){for(var id in items){if(items[id]&&items[id].N>0&&!Array.isArray(items[id].A))items[id].A=[];}}
  }catch(e){}
}

function getSaveURLFromLocation(){
  try{
    var q=window.location.search||"", h=window.location.hash||"";
    var m=q.match(/[?&](?:save|saveUrl|saveURL)=([^&]+)/i);
    if(!m) m=h.match(/[#&](?:save|saveUrl|saveURL)=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }catch(e){return "";}
}
function loadSaveFromURL(url){
  if(!url) return false;
  try{
    if(/^data:application\/json[,;]/i.test(url)){
      var comma=url.indexOf(',');
      var raw=decodeURIComponent(url.slice(comma+1));
      if(window.__loadProdigySave) window.__loadProdigySave(JSON.parse(raw),url);
      return true;
    }
    fetch(url,{credentials:"omit"}).then(function(r){
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.text();
    }).then(function(txt){
      var data=JSON.parse(txt);
      if(!window.__loadProdigySave) throw new Error("Save loader is not ready yet.");
      window.__loadProdigySave(data,url);
    }).catch(function(e){
      console.error("Save URL load failed",e);
      alert("Could not load the save from this URL. The server must allow browser CORS requests and return valid JSON.\n\n"+e.message);
    });
    return true;
  }catch(e){
    console.error("Save URL load failed",e);
    alert("Could not load the save URL.\n\n"+e.message);
    return false;
  }
}
window.LoadSaveURL=function(){
  var u=window.prompt("Enter the URL of a Prodigy save JSON file:","");
  if(u) loadSaveFromURL(u.trim());
};
function autoLoadSaveURL(){
  var u=getSaveURLFromLocation();
  if(u) setTimeout(function(){loadSaveFromURL(u);},1200);
}

function startRandomOffline(){
  if(window.__randomOfflineStarted) return;
  var g=getGame();
  try{
    var p=null;
    if(g && g.state && g.state.getCurrentState) {
      var st=g.state.getCurrentState();
      p=st.player||null;
    }
    if(!p && window.__PRODIGY_PLAYER) p=window.__PRODIGY_PLAYER;
    if(p && p.appearance){
      if(typeof p.appearance.randomize === "function") p.appearance.randomize();
      else if(typeof p.appearance.generateRandom === "function") p.appearance.generateRandom();
    }
    // Do not enter offline mode automatically. The login screen must remain visible.
    // OfflineMode is wrapped separately so clicking the native Offline button still
    // gets a randomized character before entering the game.
    window.__randomOfflineStarted=true;
  }catch(e){console.warn("Random offline start failed",e);}
}
function hookOfflineButton(){
  if(typeof window.OfflineMode !== "function" || window.__offlineWrapped) return;
  var original=window.OfflineMode;
  window.OfflineMode=function(){
    try{ randomizeNativePlayer(); }catch(e){ console.warn("Offline randomize failed",e); }
    return original.apply(this,arguments);
  };
  window.__offlineWrapped=true;
}

function randomizeNativePlayer(){
  var g=getGame(), p=null;
  try{
    if(g && g.state && g.state.getCurrentState) {
      var st=g.state.getCurrentState();
      p=st.player||null;
    }
  }catch(e){}
  if(!p && window.__PRODIGY_PLAYER) p=window.__PRODIGY_PLAYER;
  if(!p){ try{ p=findScreen() && findScreen().user && findScreen().user.source; }catch(e){} }
  if(p && p.appearance){
    if(typeof p.appearance.randomize === "function") p.appearance.randomize();
    else if(typeof p.appearance.generateRandom === "function") p.appearance.generateRandom();
  }
}

function loop(){
  hookOfflineButton();
  // Intentionally do NOT fetch, parse, or load save.json.
  // The offline character is generated by the game's native appearance system.
  if(!window.__randomOfflineStarted) startRandomOffline();
  moveBots();
  houseFix();
  moveBots();
  requestAnimationFrame(loop);
}
setTimeout(function(){autoLoadSaveURL();loop();},2500);
})();
