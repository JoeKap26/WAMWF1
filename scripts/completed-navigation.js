
(function () {
  const home = document.querySelector('#homePage .kid-home');
  const list = document.getElementById('kidFamilyList');
  const button = document.getElementById('kidCompleted');
  const back = document.getElementById('completedBack');
  if (!home || !list || !button || !back) return;
  function openCompleted(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const family = document.getElementById('homePage');
    const pages = ['wordsPage','sentencesPage','familyGroupQuizPage'];
    pages.forEach(id => {const el=document.getElementById(id);if(el)el.hidden=true;});
    if(family)family.hidden=false;
    home.hidden=true;
    list.hidden=false;
    const header=document.getElementById('familySelectionTitle');
    if(header)header.focus({preventScroll:true});
    window.scrollTo({top:0,left:0,behavior:'instant'});
  }
  function closeCompleted(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.wordFamiliesAudio?.stop();
    list.hidden=true;
    home.hidden=false;
    home.scrollIntoView({block:'start',behavior:'instant'});
  }
  button.addEventListener('click',openCompleted,true);
  back.addEventListener('click',closeCompleted,true);
})();

