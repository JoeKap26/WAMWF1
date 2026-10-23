
(()=>{
  'use strict';
  const silentEFamilies=new Set(['ake','ate','ame','ine','ide']);
  const dlg=document.getElementById('silentEDialog');
  const title=document.getElementById('layoutTitle');
  const listenButton=document.getElementById('silentEListenButton');
  const songButton=document.getElementById('silentESongButton');
  let activeAudio=null;
  function stopAudio(){ if(activeAudio){activeAudio.pause();activeAudio.currentTime=0;activeAudio=null;} }
  function playFile(path){
    stopAudio();
    const audio=new Audio(path);activeAudio=audio;
    audio.play().catch(()=>{ if(activeAudio===audio) activeAudio=null; });
    audio.addEventListener('ended',()=>{if(activeAudio===audio)activeAudio=null;},{once:true});
  }
  function playWord(word){playFile('audio/words/'+encodeURIComponent(word)+'.mp3');}
  document.getElementById('silentEWithoutButton').addEventListener('click',()=>playWord('slid'));
  document.getElementById('silentEWithButton').addEventListener('click',()=>playWord('slide'));
  document.getElementById('silentEHatButton').addEventListener('click',()=>playWord('hat'));
  document.getElementById('silentEHateButton').addEventListener('click',()=>playWord('hate'));
  listenButton?.addEventListener('click',()=>playFile('audio/rules/silente.mp3'));
  songButton?.addEventListener('click',()=>playFile('audio/songs/silentE.mp3'));
  // Click on the backdrop (outside the dialog's visible rectangle) to close.
  dlg.addEventListener('click',(e)=>{
    if(e.target!==dlg)return;
    const r=dlg.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dlg.close();
  });
  dlg.addEventListener('close',stopAudio);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudio();});
  window.addEventListener('pagehide',stopAudio);
  function launch(){
    window.wordFamiliesAudio?.stop();stopAudio();dlg.showModal();
    playFile('audio/rules/silente.mp3');
  }
  const button=document.createElement('button');button.type='button';button.className='silent-e-rule-button';
  button.innerHTML='<img src="images/buttons/silentE.png" alt="Learn the Rule Silent E">';button.hidden=true;
  const bar=document.querySelector('.new-family-bar');if(!bar)return;
  const rulesRow=document.createElement('div');rulesRow.id='phonicsRuleButtonsRow';
  (document.getElementById('familyLearningPath') || bar).insertAdjacentElement('afterend',rulesRow);
  rulesRow.appendChild(button);
  function update(){
    const match=title.textContent.match(/-([a-z]+)\s+Family/i);
    const family=match?.[1]?.toLowerCase();
    const wordsPage=document.getElementById('wordsPage');
    button.hidden=!silentEFamilies.has(family)||wordsPage.hidden;
  }
  button.addEventListener('click',launch);
  new MutationObserver(update).observe(title,{childList:true,subtree:true,characterData:true});
  new MutationObserver(update).observe(document.getElementById('wordsPage'),{attributes:true,attributeFilter:['hidden']});
  update();
})();

