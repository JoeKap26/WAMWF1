(() => {
'use strict';
// Keep one working Parent Settings button, positioned above the Users button.
const parentControl = document.getElementById('parentSettingsButton');
const headerNavigation = document.querySelector('.site-header .header-navigation');
if (parentControl && headerNavigation) headerNavigation.prepend(parentControl);

// Put the real score and the learner's name together on one line.
const headerStatus = document.getElementById('headerStatus');
const headerStars = document.querySelector('#practicePage .stars');
if (headerStatus && headerStars) headerStatus.prepend(headerStars);


// Child-friendly visual shortcuts use the original app's existing navigation.
document.getElementById('kidLearn').addEventListener('click',()=>document.getElementById('openAllWords').click());
document.getElementById('kidChallenge').addEventListener('click',()=>document.getElementById('homeFinal').click());
// Completed Families navigation is owned by completed-navigation.js.
document.getElementById('completedInfo').addEventListener('click',()=>{
  const dialog=document.getElementById('completedFamiliesHelpDialog');if(dialog && !dialog.open)dialog.showModal();
});
document.getElementById('kidContinue').addEventListener('click',()=>document.getElementById('homeContinue').click());
document.getElementById('kidChangeUser').addEventListener('click',()=>document.getElementById('practiceUsers').click());
// kidSettings is wired to openParentSettings alongside the main button.
// Only these two explicit instruction buttons speak. No hover or general interface narration.
// Prefer pre-recorded MP3s when provided, with browser voice as an optional fallback.
document.querySelectorAll('.kid-speak').forEach(button=>button.addEventListener('click',()=>{
 const sentence=button.dataset.instruction==='word'
 ? 'Listen, then choose the word you hear.'
 : 'Listen, then choose the sentence you hear.';
 const file='audio/instructions/'+(button.dataset.instruction==='word'?'choose-word.mp3':'choose-sentence.mp3');
 if(window.speechSynthesis)window.speechSynthesis.cancel();
 const clip=new Audio(file);
 clip.onerror=()=>{
   if(window.speechSynthesis){
     const utterance=new SpeechSynthesisUtterance(sentence);
     utterance.rate=.85;window.speechSynthesis.speak(utterance);
   } else {button.setAttribute('title',sentence);}
 };
 clip.play().catch(()=>clip.onerror());
}));


// Match visual and reading order: completed families, then learner.
{const status=document.getElementById('headerStatus');const badge=status?.querySelector('.stars');const name=document.getElementById('learnerTitle');if(status&&badge&&name){status.prepend(badge);badge.after(name);}}
})();
