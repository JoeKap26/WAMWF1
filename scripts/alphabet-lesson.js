(()=>{
'use strict';
const row=document.getElementById('phonicsRuleButtonsRow');
if(!row)return;
const words=['apple','ball','cat','dog','egg','fish','goat','hat','insect','jam','kite','lion','moon','nest','octopus','pig','queen','rabbit','sun','turtle','umbrella','van','web','x-ray','yak','zebra'];
const button=document.createElement('button');button.type='button';button.id='alphabetRuleButton';button.className='level2-rule-button';button.setAttribute('aria-label','The Alphabet');button.innerHTML='<img src="images/buttons/theAlphabet.png" alt="The Alphabet">';row.prepend(button);
const dialog=document.createElement('dialog');dialog.id='alphabetDialog';dialog.setAttribute('aria-label','Alphabet sounds and pictures');
dialog.innerHTML='<nav class="alphabet-letter-links" aria-label="Choose a letter"></nav><div class="alphabet-pair"><button type="button" class="alphabet-letters" aria-label="Listen to the letter"></button><button type="button" class="alphabet-picture"><img alt=""><span></span></button></div><div class="alphabet-audio-actions"><button type="button" class="alphabet-listen" aria-label="Listen to recording"><img src="images/buttons/listen.png" alt="Listen"></button><button type="button" class="alphabet-song" aria-label="Play the Alphabet song"><img src="images/buttons/song.png" alt="Song"></button></div><nav class="alphabet-navigation" aria-label="Alphabet letters"><button type="button" class="alphabet-prev"></button><button type="button" class="alphabet-next"></button></nav>';
document.body.append(dialog);
let index=0,audio=null;
const letters=dialog.querySelector('.alphabet-letters'),picture=dialog.querySelector('.alphabet-picture'),prev=dialog.querySelector('.alphabet-prev'),next=dialog.querySelector('.alphabet-next');
const letterLinks=Array.from({length:26},(_,letterIndex)=>{
 const link=document.createElement('button');link.type='button';link.textContent=String.fromCharCode(65+letterIndex);link.setAttribute('aria-label','Show and hear '+link.textContent);
 link.addEventListener('click',()=>{index=letterIndex;render();play();});
 dialog.querySelector('.alphabet-letter-links').append(link);return link;
});
const pair=i=>String.fromCharCode(65+i)+String.fromCharCode(97+i);
function stop(){if(audio){audio.pause();audio.currentTime=0;audio=null;}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',stop);
function play(){stop();audio=new Audio('audio/alphabet/'+String.fromCharCode(97+index)+'.mp3');audio.play().catch(()=>{});}
function playSong(){stop();window.wordFamiliesAudio?.stop();audio=new Audio('audio/songs/theAlphabet.mp3');audio.play().catch(()=>{});}
function render(){letterLinks.forEach((link,i)=>{link.setAttribute('aria-pressed',String(i===index));});letters.textContent=pair(index);letters.setAttribute('aria-label','Listen to '+pair(index));picture.querySelector('img').src='images/alphabet/'+words[index]+'.png';picture.querySelector('img').alt=words[index];picture.querySelector('span').textContent=words[index];picture.setAttribute('aria-label','Listen: '+words[index]);prev.disabled=index===0;next.disabled=index===25;prev.innerHTML=index>0?'← <span class="alphabet-nav-letter">'+pair(index-1)+'</span>':'←';next.innerHTML=index<25?'<span class="alphabet-nav-letter">'+pair(index+1)+'</span> →':'→';}
function matchFamilyArrows(){
 const reference=document.querySelector('.new-family-bar .family-next');
 if(!reference)return;
 const rect=reference.getBoundingClientRect(),style=getComputedStyle(reference);
 if(!rect.width||!rect.height)return;
 [prev,next].forEach(control=>{
  ['background','border','borderRadius','boxShadow','fontFamily','fontSize','fontWeight','lineHeight','padding','color'].forEach(property=>{control.style.setProperty(property.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),style[property],'important');});
  control.style.setProperty('width',Math.min(rect.width,(dialog.clientWidth-58)/2)+'px','important');
  control.style.setProperty('height',rect.height+'px','important');
  control.style.setProperty('min-height','0','important');
  control.style.setProperty('box-sizing','border-box','important');
 });
}
window.addEventListener('resize',()=>{if(dialog.open)matchFamilyArrows();});
function step(delta){index=Math.max(0,Math.min(25,index+delta));render();play();}
button.addEventListener('click',()=>{document.querySelectorAll('audio,video').forEach(a=>a.pause());window.wordFamiliesAudio?.stop();if(window.speechSynthesis)window.speechSynthesis.cancel();index=0;render();dialog.showModal();matchFamilyArrows();play();});
document.getElementById('browseAlphabetRule')?.addEventListener('click',()=>button.click());
prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));letters.addEventListener('click',play);picture.addEventListener('click',play);dialog.querySelector('.alphabet-listen').addEventListener('click',play);dialog.querySelector('.alphabet-song').addEventListener('click',playSong);dialog.addEventListener('close',stop);dialog.addEventListener('cancel',stop);
dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const delta=e.key==='ArrowRight'?1:-1;if(index+delta>=0&&index+delta<26)step(delta);}});
dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
const page=document.getElementById('wordsPage');function update(){button.hidden=page.hidden;if(page.hidden&&dialog.open)dialog.close();}new MutationObserver(update).observe(page,{attributes:true,attributeFilter:['hidden']});update();
})();