(function(){
  const header=document.querySelector('.site-header');
  const pageSpeaker=document.createElement('button');
  pageSpeaker.id='pageInstructionSpeaker';
  pageSpeaker.type='button';
  const infoImage=document.createElement('img');infoImage.src='images/buttons/info.png';infoImage.alt='Info';pageSpeaker.append(infoImage);
  pageSpeaker.setAttribute('aria-label','Play audio instructions for this page');
  pageSpeaker.title='Play audio instructions';
  header.append(pageSpeaker);
  const speakerNavigation=header.querySelector('.header-navigation');
  function positionPageSpeaker(){
    const showWithNavigation=speakerNavigation && !speakerNavigation.hidden;
    const destination=showWithNavigation?speakerNavigation:header;
    if(pageSpeaker.parentElement!==destination) destination.prepend(pageSpeaker);
  }
  if(speakerNavigation){
    new MutationObserver(positionPageSpeaker).observe(speakerNavigation,{attributes:true,attributeFilter:['hidden']});
    positionPageSpeaker();
  }
  const instructionFiles={
    login:'infoLogin.mp3',home:'infoHome.mp3',families:'infoAllFamilies.mp3',words:'infoFamily.mp3',
    sentences:'infoFamily.mp3',challenge:'infoPlayerTrivia.mp3',
    browse:'infoWordList.mp3',final:'infoPlayerTrivia.mp3'
  };
  let instructionAudio=null;
  // Stop page instructions immediately when any button is pressed.
  // Capture phase ensures playback is stopped before the button's own action starts.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button, [role="button"], input[type="button"], input[type="submit"]');
    if(!button)return;
    if(button===pageSpeaker)return; // Allow the Info button to start its own recording.
    if(instructionAudio){instructionAudio.pause();instructionAudio.currentTime=0;instructionAudio=null;}
    if(window.speechSynthesis)window.speechSynthesis.cancel();
  },true);
  pageSpeaker.addEventListener('click',()=>{
    window.wordFamiliesAudio?.stop();
    const visible=id=>{const el=document.getElementById(id);return el&&!el.hidden};
    let page='login';
    if(visible('practicePage')){
      if(visible('homePage') && document.querySelector('.kid-home') && !document.querySelector('.kid-home').hidden && document.querySelector('.kid-home').getClientRects().length){page='home';}
      else page=visible('allWordsPage')?(visible('quizPanel')?'final':'browse'):
      visible('wordsPage')?'words':visible('sentencesPage')?'sentences':
      visible('familyGroupQuizPage')?'challenge':'families';
    }
    if(instructionAudio){instructionAudio.pause();instructionAudio.currentTime=0;instructionAudio=null;}
    if(window.speechSynthesis)window.speechSynthesis.cancel();
    const audio=new Audio('audio/instructions/'+instructionFiles[page]);
    instructionAudio=audio;
    audio.play().catch(()=>{if(instructionAudio===audio)instructionAudio=null;});
  });
  const bar=document.createElement('div');bar.className='new-family-bar';
  const prev=document.createElement('button'),name=document.createElement('button'),next=document.createElement('button');
  prev.type=next.type=name.type='button';
  prev.className='family-prev';name.className='family-audio-title';next.className='family-next';
  name.setAttribute('aria-label','Hear this word family sound');
  bar.append(prev,name,next);
  const heading=document.getElementById('layoutTitle');
  // render() refreshes this heading on every family change, including arrows.
  const familyHeading=document.getElementById('familyTitle');
  heading.parentElement.append(bar);
  // Place the learning path below the entire Previous / Family / Next row.
  const learningPath=document.getElementById('familyLearningPath');
  if(learningPath)bar.insertAdjacentElement('afterend',learningPath);
  function update(){
    const visible=['wordsPage','sentencesPage','familyGroupQuizPage'].some(id=>!document.getElementById(id).hidden);
    bar.hidden=!visible;
    const wordsVisible=!document.getElementById('wordsPage').hidden;
    prev.hidden=next.hidden=!wordsVisible;
    bar.classList.toggle('without-family-arrows',!wordsVisible);
    if(!visible)return;
    // The app's render() already knows the true curriculum order and writes
    // the previous/next family names to its original (hidden) buttons.
    const previousText=document.getElementById('previous').textContent;
    const nextText=document.getElementById('next').textContent;
    const prevMatch=previousText.match(/\((-?[a-z]+)\)/i);
    const nextMatch=nextText.match(/\((-?[a-z]+)\)/i);
    const title=familyHeading.textContent.trim();
    const titleMatch=title.match(/-([a-z]+)\s+Family/i);
    if(titleMatch){
      const ending='-'+titleMatch[1];
      name.replaceChildren();
      const red=document.createElement('span');red.className='family-ending';red.textContent=ending;
      name.append(red,document.createTextNode(' Family'));
    }
    // Build the labels as DOM nodes so the family ending is red.
    // textContent prevents the family names from being treated as HTML.
    function setArrowLabel(button, label, arrowFirst) {
      const ending=document.createElement('span');
      ending.className='family-ending';
      ending.textContent=label;
      button.replaceChildren();
      if(arrowFirst) button.append(document.createTextNode('⬅ '),ending);
      else button.append(ending,document.createTextNode(' ➡'));
    }
    setArrowLabel(prev,prevMatch?prevMatch[1]:'',true);
    setArrowLabel(next,nextMatch?nextMatch[1]:'',false);
    prev.disabled=!prevMatch;
    next.disabled=!nextMatch;
  }
  prev.addEventListener('click',()=>document.getElementById('previous').click());
  next.addEventListener('click',()=>document.getElementById('next').click());
  name.addEventListener('click',()=>document.getElementById('familySound').click());
  const observer=new MutationObserver(update);
  observer.observe(familyHeading,{childList:true,subtree:true,characterData:true});
  observer.observe(document.getElementById('previous'),{childList:true,subtree:true,characterData:true});
  observer.observe(document.getElementById('next'),{childList:true,subtree:true,characterData:true});
  ['wordsPage','sentencesPage','familyGroupQuizPage'].forEach(id=>observer.observe(document.getElementById(id),{attributes:true,attributeFilter:['hidden']}));
  update();
})();

