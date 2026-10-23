
(()=>{
  const button=document.getElementById('browseSilentERule');
  const dialog=document.getElementById('silentEDialog');
  button?.addEventListener('click',()=>{
    const original=document.querySelector('#phonicsRuleButtonsRow .silent-e-rule-button');
    if(original){original.click();return;}
    if(dialog && !dialog.open){
      dialog.showModal();
      const intro=new Audio('audio/rules/silente.mp3');
      intro.play().catch(()=>{});
      dialog.addEventListener('close',()=>{intro.pause();intro.currentTime=0;},{once:true});
    }
  });
})();

