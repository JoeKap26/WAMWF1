
    (() => {
      const effectPlayers=new Set();
      let effectsEnabled=true;
      try{effectsEnabled=localStorage.getItem('wf-sound-effects')!=='off';}catch{}
      
      function stopEffects(){for(const sound of effectPlayers){sound.onended=null;sound.pause();}effectPlayers.clear();}
      function playEffect(name,options={}){
        if(!effectsEnabled)return;
        stopEffects();
        const sound=new Audio('audio/effects/'+name+'.mp3');
        sound.dataset.wordFamilyEffect='true';sound.volume=options.volume??.45;sound.loop=!!options.loop;
        effectPlayers.add(sound);
        sound.onended=()=>{effectPlayers.delete(sound);if(options.after)options.after();};
        sound.onerror=()=>{effectPlayers.delete(sound);};
        const pending=sound.play();if(pending)pending.catch(()=>effectPlayers.delete(sound));
      }
      document.addEventListener('play',event=>{if(event.target instanceof HTMLMediaElement&&!event.target.dataset.wordFamilyEffect)stopEffects();},true);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)stopEffects();});
      function addEffectsSetting(){
        const host=document.getElementById('parentSettingsContent');if(!host||document.getElementById('soundEffectsToggle'))return;
        const label=document.createElement('label');label.style.cssText='display:flex;gap:12px;align-items:center;margin:16px 0;font-weight:700;';
        const input=document.createElement('input');input.type='checkbox';input.id='soundEffectsToggle';input.checked=effectsEnabled;
        input.addEventListener('change',()=>{effectsEnabled=input.checked;if(!effectsEnabled)stopEffects();try{localStorage.setItem('wf-sound-effects',effectsEnabled?'on':'off');}catch{}});
        label.append(input,document.createTextNode('Sound Effects'));host.append(label);
      }

      function isRecord(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      }
      function readStoredRecord(key) {
        try {
          const value = JSON.parse(localStorage.getItem(key) || '{}');
          return isRecord(value) ? value : {};
        } catch { return {}; }
      }

      const families = window.WORD_FAMILIES || [];
      // Mark only the family label or the matching ending, preserving spoken text.
      function familyLabel(element, before, name, after = '') {
        const text = before + name + after;
        if (element.textContent === text && element.querySelector('.family-label')?.textContent === name) return;
        const span = document.createElement('span'); span.className = 'family-label'; span.textContent = name;
        element.replaceChildren(document.createTextNode(before), span, document.createTextNode(after));
      }
      function familyWord(element, word, family) {
        const ending = (family || '').replace(/^-/, '');
        if (ending && word.toLowerCase().endsWith(ending.toLowerCase())) {
          familyLabel(element, word.slice(0, -ending.length), word.slice(-ending.length));
        } else element.textContent = word;
      }
      function familySentence(element, item) {
        if (!item) return;
          // Whole-word matching keeps short words from highlighting inside other words.
          const escaped = item.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'i').exec(item.text);
          if (match) {
            const focusWord = document.createElement('strong');
            familyWord(focusWord, match[0], item.family);
            element.append(document.createTextNode(item.text.slice(0, match.index)), focusWord,
              document.createTextNode(item.text.slice(match.index + match[0].length)));
          } else element.textContent = item.text;
      }
      // Preserve the first matching family when a word appears more than once.
      const familyByWord = new Map();
      for (const family of families) {
        for (const word of family.words) {
          if (!familyByWord.has(word)) familyByWord.set(word, family.family);
        }
      }
      function wordFamily(word) { return familyByWord.get(word) || ''; }
      const sentencesPage = document.querySelector('#sentencesPage');
      const sentenceGrid = document.querySelector('#sentenceGrid');
      const sentenceMessage = document.querySelector('#sentenceMessage');
      const sentenceChallengeButton = document.querySelector('#sentenceChallenge');
      let sentenceTarget = null;
      const foundSentences = new Set();
      const sentenceData = window.WORD_SENTENCES || [];
      const sentenceById = new Map(sentenceData.map(item => [item.file, item]));
      // Curriculum data is static: index it once rather than scan it per tile/render.
      const sentencesByFamily = new Map();
      for (const sentence of sentenceData) {
        if (!sentencesByFamily.has(sentence.family)) sentencesByFamily.set(sentence.family, []);
        sentencesByFamily.get(sentence.family).push(sentence);
      }
      const familySentences = name => sentencesByFamily.get(name) || [];
      const knownWords = new Set(familyByWord.keys());
      const validSentenceIds = new Set(sentenceById.keys());
      const cleanSentences = value => Array.isArray(value) ? [...new Set(value.filter(id => validSentenceIds.has(id)))] : [];
      const sentenceQueue = [];
      let sentencePlaying = false;
      const homePage = document.querySelector('#homePage');
      const wordsPage = document.querySelector('#wordsPage');
      const familyPickerGrid = document.querySelector('#familyPickerGrid');
      const grid = document.querySelector('#wordGrid');
      const title = document.querySelector('#familyTitle');
      const pageCount = document.querySelector('#pageCount');
      const levelCount = document.querySelector('#levelCount');
      const message = document.querySelector('#gameMessage');
      const challengeButton = document.querySelector('#challenge');
      const burst = document.querySelector('#burst');
      const validWordKeys = new Set(families.flatMap(f => f.words.map(word => `${f.family}:${word}`)));
      const cleanWords = value => Array.isArray(value) ? [...new Set(value.filter(key => validWordKeys.has(key)))] : [];
      const cleanIndex = value => Number.isInteger(value) && value >= 0 && value < families.length ? value : 0;
      const cleanName = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 32) : '';
      const nameKey = value => value.normalize('NFKC').toLocaleLowerCase();
      const cleanQuizTotals = value => ({
        correct: Number.isSafeInteger(value?.correct) && value.correct >= 0 ? value.correct : 0,
        wrong: Number.isSafeInteger(value?.wrong) && value.wrong >= 0 ? value.wrong : 0
      });
      function cleanQuizRound(value) {
        if (!value || !Array.isArray(value.targets) || value.targets.length !== families.length) return null;
        const known = knownWords;
        if (new Set(value.targets).size !== value.targets.length || value.targets.some(w => !known.has(w))) return null;
        if (!Number.isInteger(value.position) || value.position < 0 || value.position >= value.targets.length) return null;
        const solved = value.solved === true;
        if (!Array.isArray(value.answers) || value.answers.length !== value.position + Number(solved)) return null;
        if (value.answers.some((a, i) => !a || a.word !== value.targets[i] || !Number.isSafeInteger(a.attempts) || a.attempts < 1)) return null;
        const options = Array.isArray(value.options) && value.options.length === 6 && new Set(value.options).size === 6
          && value.options.every(w => known.has(w)) && value.options.includes(value.targets[value.position]) ? [...value.options] : null;
        return { targets: [...value.targets], position: value.position, answers: value.answers.map(a => ({word: a.word, attempts: a.attempts})),
          attempts: Number.isSafeInteger(value.attempts) && value.attempts >= 0 ? value.attempts : 0,
          solved, options, level: 'six-choices', scope: 'one-random-word-per-family' };
      }
      const profilesKey = 'ari-elara-users-v1';
      const curriculumRevision = 'core50-v1';
      function restoredFamily(user, revision) {
        const name = user.familyName || (revision === curriculumRevision ? families[user.family]?.family : window.LEGACY_FAMILY_ORDER?.[user.family]);
        const position = families.findIndex(f => f.family === name);
        return position < 0 ? 0 : position;
      }
      let users = [];
      let activeUser = null;
      // Private on-device practice history, stored independently from learning progress.
      const usageKey = 'elari-wordfamilies-usage-v1';
      const usageIdleLimitMs = 90000;
      let usageSession = null;
      let usageLastInteraction = 0;
      let usageLastCounted = 0;
      function usageRead() {
        return readStoredRecord(usageKey);
      }
      function usageWrite(data) { try { localStorage.setItem(usageKey, JSON.stringify(data)); } catch {} }
      function usageCommit(now = Date.now()) {
        if (!usageSession) return;
        const until = Math.min(now, usageLastInteraction + usageIdleLimitMs);
        if (until > usageLastCounted) {
          usageSession.activeMs += until - usageLastCounted;
          usageLastCounted = until;
        }
        const data = usageRead();
        const history = Array.isArray(data[usageSession.userId]) ? data[usageSession.userId] : [];
        const saved = {start: usageSession.start, end: new Date(now).toISOString(), activeMs: Math.round(usageSession.activeMs)};
        const at = history.findIndex(item => item && item.id === usageSession.id);
        if (at >= 0) history[at] = {...saved, id: usageSession.id};
        else history.push({...saved, id: usageSession.id});
        data[usageSession.userId] = history.slice(-500);
        usageWrite(data);
      }
      function usageEnd() { usageCommit(); usageSession = null; }
      function usageStart(user) {
        usageEnd();
        if (!user || document.hidden) return;
        const now = Date.now();
        usageSession = {id: String(now) + '-' + Math.random().toString(36).slice(2,8), userId: user.id, start: new Date(now).toISOString(), activeMs: 0};
        usageLastInteraction = usageLastCounted = now;
        usageCommit(now);
      }
      function usageTouch() {
        if (!activeUser || document.hidden || startPage.hidden === false) return;
        if (!usageSession || usageSession.userId !== activeUser.id) usageStart(activeUser);
        const now = Date.now();
        usageCommit(now);
        usageLastInteraction = now;
        usageLastCounted = now;
      }
      for (const type of ['pointerdown','keydown']) document.addEventListener(type, usageTouch, {passive:true, capture:true});
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) usageEnd();
        else if (activeUser && startPage.hidden) usageStart(activeUser);
      });
      window.addEventListener('pagehide', usageEnd);
      setInterval(() => { if (!document.hidden && usageSession) usageCommit(); }, 15000);
      function usageDuration(ms) {
        const total = Math.floor(Math.max(0, ms || 0) / 60000);
        return total >= 60 ? `${Math.floor(total/60)}h ${total%60}m` : `${total} min`;
      }
      // Help requests are private to this browser and separated by player ID.
      const helpStorageKey='elari-wordfamilies-help-requests-v1';
      function helpRead(){try{const data=JSON.parse(localStorage.getItem(helpStorageKey)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch(e){return {};}}
      function helpWrite(data){try{localStorage.setItem(helpStorageKey,JSON.stringify(data));return true;}catch(e){console.warn('Could not save help requests',e);return false;}}
      function requestBuildHelp(){
        if(!activeUser?.id||!readPopupEntry||readPopupEntry.kind!=='words')return;
        const word=String(readPopupEntry.word||'').toLowerCase().trim();if(!word)return;
        const all=helpRead(),id=activeUser.id;const current=Array.isArray(all[id])?all[id]:[];
        if(!current.includes(word))all[id]=[...current,word];
        const ok=helpWrite(all);
        const button=document.getElementById('buildHelp');
        if(button){button.classList.remove('help-confirm');void button.offsetWidth;button.classList.add('help-confirm');setTimeout(()=>button.classList.remove('help-confirm'),850);}
        buildFeedback.textContent=ok?'Help request saved for '+word+'.':'Could not save request on this device.';
        wordReadStatus.textContent=ok?'Help requested for '+word+'.':'Unable to save help request.';
      }
      // Parent reports use the selected profile; no practice-time table is shown.
      function usageRender() {
        const host=document.getElementById('parentSettingsContent');
        let section=document.getElementById('parentUsageSection');
        if(!section){section=document.createElement('section');section.id='parentUsageSection';}
        // One player selector controls every result in Parent Settings.
        host.prepend(section);
        const selected=section.dataset.selectedUserId || activeUser?.id;
        section.replaceChildren();
        const heading=document.createElement('h3');heading.textContent='Player Results for';section.append(heading);
        const label=document.createElement('label');label.className='parent-player-label';label.textContent='';
        const select=document.createElement('select');select.id='parentPlayerSelect';select.setAttribute('aria-label','Choose player report');
        users.forEach(u=>{const o=document.createElement('option');o.value=u.id;o.textContent=u.name;select.append(o);});
        select.value=users.some(u=>u.id===selected)?selected:(activeUser?.id||users[0]?.id||'');
        label.append(select);section.append(label);
        const output=document.createElement('div');output.className='parent-report';section.append(output);
        function panel(title,opened){const d=document.createElement('details');d.className='parent-report-panel';d.open=opened;const summary=document.createElement('summary');summary.textContent=title;d.append(summary);output.append(d);return d;}
        function tile(parent,label,value){const tile=document.createElement('div');tile.className='parent-stat-tile';const strong=document.createElement('strong');strong.textContent=value;const small=document.createElement('span');small.textContent=label;tile.append(strong,small);parent.append(tile);}
        function draw(){
          // Preserve the existing results node before removing old report panels.
          const preservedFinalRecord = document.getElementById('finalChallengeRecord');
          // Keep this permanent report node out of the disposable report panels
          // until their new layout is ready.
          if (preservedFinalRecord) host.append(preservedFinalRecord);
          output.replaceChildren();
          const user=users.find(u=>u.id===select.value);
          const events=activityStatsRead()[select.value]||[];
          const right=events.filter(e=>e.correct).length;
          const builds=Object.values(wordStatsRead()[select.value]||{});
          const attempts=builds.flatMap(w=>(w.attempts||[]).filter(a=>a.first));
          const firstCorrect=attempts.filter(a=>a.correct).length;
          const trouble= new Set(events.filter(e=>!e.correct).map(e=>e.item));
          const overview=document.createElement('div');overview.className='parent-stat-grid';output.append(overview);
          tile(overview,'Answer accuracy',events.length?Math.round(right/events.length*100)+'%':'—');
          tile(overview,'Answers attempted',String(events.length));
          tile(overview,'Build the Word: First Try',attempts.length?Math.round(firstCorrect/attempts.length*100)+'%':'—');
          tile(overview,'Items missed',String(trouble.size));
          if(preservedFinalRecord){preservedFinalRecord.hidden=true;preservedFinalRecord.style.setProperty('display','none','important');}
          // Requests made in Build the Word are stored for each child separately.
          const helpBox=document.createElement('section');helpBox.className='parent-help-section';
          const helpTitle=document.createElement('h3');helpTitle.textContent='🆘 Words Needing Extra Help';helpBox.append(helpTitle);
          const helpIntro=document.createElement('p');helpIntro.className='parent-overview-note';helpIntro.textContent='Your child asked for help with these words.';helpBox.append(helpIntro);
          const helpItems=helpRead()[select.value]||[];
          if(!helpItems.length){const empty=document.createElement('p');empty.className='parent-help-empty';empty.textContent='No help requests right now.';helpBox.append(empty);}
          else {const wrap=document.createElement('div');wrap.className='parent-help-list';
            helpItems.forEach(word=>{const b=document.createElement('button');b.type='button';b.className='parent-help-word';b.textContent=word+'  ×';b.title='Remove '+word+' from the help list';b.setAttribute('aria-label','Mark '+word+' as helped and remove');b.addEventListener('click',()=>{const all=helpRead();all[select.value]=(all[select.value]||[]).filter(w=>w!==word);helpWrite(all);draw();});wrap.append(b);});helpBox.append(wrap);}
          output.append(helpBox);
          const activities=panel('🎧 Listen & Select / Family Challenge',false);
          activityStatsRender(select.value,activities);
          const challengeResults=panel('📝 Word / Sentence Challenge Results',false);
          renderActivityTotals(events,challengeResults,[['Word Challenge','final'],['Sentence Challenge','final-sentences']]);
          updateAllQuizTotals(user||activeUser,true);
        }
        select.addEventListener('change',()=>{section.dataset.selectedUserId=select.value;draw();});
        section.dataset.selectedUserId=select.value;draw();addEffectsSetting();
      }
      const activityStatsKey='ari-elara-activity-results-v1';
      function activityStatsRead() {
        const data = readStoredRecord(activityStatsKey);
        for (const [id, entries] of Object.entries(data)) {
          data[id] = Array.isArray(entries) ? entries.filter(isRecord) : [];
        }
        return data;
      }
      function activityStatsEvent(activity,item,correct){
        
        if(!activeUser?.id||!item)return;
        const data=activityStatsRead(),rows=data[activeUser.id]||(data[activeUser.id]=[]);
        rows.push({at:new Date().toISOString(),activity,item:String(item),correct:!!correct});
        if(rows.length>5000)rows.splice(0,rows.length-5000);
        try{localStorage.setItem(activityStatsKey,JSON.stringify(data));}catch{}
      }
      function renderActivityTotals(entries,target,activities){
        const table=document.createElement('table');table.className='word-difficulty-table';
        const head=table.createTHead().insertRow();
        for(const label of ['Activity','Correct','Incorrect','Accuracy']){
          const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);
        }
        const body=table.createTBody();
        for(const [label,key] of activities){
          const items=entries.filter(entry=>entry.activity===key),correct=items.filter(entry=>entry.correct).length;
          const row=body.insertRow();
          for(const value of [label,correct,items.length-correct,items.length?Math.round(correct*100/items.length)+'%':'—']){
            row.insertCell().textContent=value;
          }
        }
        target.append(table);
      }
      function activityStatsRender(userId,target){
        
        
        const entries=activityStatsRead()[userId]||[];
        renderActivityTotals(entries,target,[['Listen & Select — Words','words'],['Listen & Select — Sentences','sentences'],['Family Challenge','family']]);
        if(!entries.length)return;
        // Only missed words from the lesson activities shown in this panel.
        // Sentence selections are intentionally excluded from this word-focused shortlist.
        const grouped=new Map();
        entries.filter(e=>['words','family'].includes(e.activity)).forEach(e=>{
          const word=String(e.item||'').trim().toLowerCase();
          if(!word || /\s/.test(word)) return;
          const r=grouped.get(word)||{item:word,total:0,wrong:0};
          r.total++;if(!e.correct)r.wrong++;grouped.set(word,r);
        });
        const difficult=[...grouped.values()].filter(r=>r.wrong>0)
          .sort((a,b)=>b.wrong-a.wrong||b.wrong/b.total-a.wrong/a.total||a.item.localeCompare(b.item))
          .slice(0,5);
        const subtitle=document.createElement('h4');subtitle.textContent='5 Most Missed Words';target.append(subtitle);
        if(!difficult.length){const ok=document.createElement('p');ok.textContent='No incorrect word selections recorded.';target.append(ok);return;}
        const detail=document.createElement('table');detail.className='word-difficulty-table';const hr=document.createElement('tr');
        ['Word','Incorrect','Total selections'].forEach(t=>{const th=document.createElement('th');th.textContent=t;hr.append(th);});detail.append(hr);
        difficult.forEach(r=>{const tr=document.createElement('tr');[r.item,r.wrong,r.total].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});detail.append(tr);});target.append(detail);
      }

      // Per-player word practice diagnostics (locally stored on this device).
      const wordStatsKey = 'ari-elara-word-diagnostics-v1';
      function wordStatsRead() {
        const data = readStoredRecord(wordStatsKey);
        for (const [id, records] of Object.entries(data)) {
          if (!isRecord(records)) { data[id] = {}; continue; }
          for (const [word, record] of Object.entries(records)) {
            if (!isRecord(record)) { delete records[word]; continue; }
            record.attempts = Array.isArray(record.attempts) ? record.attempts.filter(isRecord) : [];
            record.extraListens = Number.isSafeInteger(record.extraListens) && record.extraListens >= 0 ? record.extraListens : 0;
          }
        }
        return data;
      }
      function wordStatsEvent(word,type,extra={}){
        if(!activeUser?.id || !word)return;
        const all=wordStatsRead(),user=all[activeUser.id]||(all[activeUser.id]={});
        const key=String(word).toLowerCase().trim(), record=user[key]||(user[key]={attempts:[],extraListens:0});
        if(type==='listen')record.extraListens=(record.extraListens||0)+1;
        if(type==='attempt')record.attempts.push({at:new Date().toISOString(),correct:!!extra.correct,first:!!extra.first});
        record.attempts=record.attempts.slice(-300);
        try{localStorage.setItem(wordStatsKey,JSON.stringify(all));}catch{}
      }
      function wordStatsRender(userId, target){
        const records=wordStatsRead()[userId]||{};
        const rows=Object.entries(records).map(([word,r])=>{
          const attempts=Array.isArray(r.attempts)?r.attempts:[];
          const first=attempts.filter(a=>a.first);
          const correct=first.filter(a=>a.correct).length;
          const recent=first.slice(-5),earlier=first.slice(0,5);
          const rate=a=>a.length?Math.round(a.filter(v=>v.correct).length*100/a.length):null;
          return {word,first,correct,extra:r.extraListens||0,errors:attempts.filter(a=>!a.correct).length,early:rate(earlier),recent:rate(recent)};
        }).sort((a,b)=>(b.first.length-b.correct)-(a.first.length-a.correct)||b.extra-a.extra||a.word.localeCompare(b.word));
        
        
        if(!rows.length){
          const p=document.createElement('p');
          p.textContent='No Build the Word attempts or repeat-audio taps recorded yet. These statistics are tracked separately from Listen & Select.';
          target.append(p);
          const missed=new Map();
          (activityStatsRead()[userId]||[]).filter(e=>['words','family','final'].includes(e.activity)).forEach(e=>{
            const word=String(e.item||'').trim().toLowerCase();
            if(!word||/\s/.test(word))return;
            const r=missed.get(word)||{word,incorrect:0,total:0};
            r.total++;if(!e.correct)r.incorrect++;missed.set(word,r);
          });
          const top=[...missed.values()].filter(r=>r.incorrect).sort((a,b)=>b.incorrect-a.incorrect||a.word.localeCompare(b.word)).slice(0,5);
          if(top.length){
            const heading=document.createElement('h4');heading.textContent='Missed in Listen & Select / Challenges';target.append(heading);
            const table=document.createElement('table');table.className='word-difficulty-table';
            const header=document.createElement('tr');['Word','Incorrect','Total selections'].forEach(k=>{const th=document.createElement('th');th.textContent=k;header.append(th);});table.append(header);
            top.forEach(r=>{const tr=document.createElement('tr');[r.word,r.incorrect,r.total].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});table.append(tr);});target.append(table);
          }
          return;
        }
        const totals=rows.reduce((n,r)=>({tries:n.tries+r.first.length,correct:n.correct+r.correct}),{tries:0,correct:0});
        const sum=document.createElement('p');sum.textContent=`${rows.length} words practiced · ${totals.tries?Math.round(100*totals.correct/totals.tries):0}% first-try correct · ${rows.reduce((n,r)=>n+r.extra,0)} repeat-audio taps`;target.append(sum);
        const table=document.createElement('table');table.className='word-difficulty-table';
        const head=document.createElement('thead'),tr=document.createElement('tr');
        ['Word','First try','Incorrect builds','Repeat audio','Trend'].forEach(t=>{const th=document.createElement('th');th.textContent=t;tr.append(th);});head.append(tr);table.append(head);
        const body=document.createElement('tbody');
        rows.forEach(r=>{
          const tr=document.createElement('tr');
          const trend=r.first.length<6?'Not enough history':(r.recent>r.early?'Improving':r.recent<r.early?'Needs support':'Steady');
          [r.word,`${r.correct}/${r.first.length} (${r.first.length?Math.round(r.correct*100/r.first.length):0}%)`,String(r.errors),String(r.extra),trend].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});body.append(tr);
        });table.append(body);target.append(table);
      }
      let lastUserId = null;
      try {
        const saved = JSON.parse(localStorage.getItem(profilesKey) || 'null');
        if (saved && saved.version === 1 && Array.isArray(saved.users)) {
          if (saved.curriculumRevision !== curriculumRevision) {
            const backupKey = profilesKey + ':backup-before-core50-v1';
            try { if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(saved)); } catch {}
          }
          const seenIds = new Set(), seenNames = new Set();
          users = saved.users.flatMap(user => {
            if (!user || typeof user.id !== 'string' || !cleanName(user.name)) return [];
            const name = cleanName(user.name), key = nameKey(name);
            if (seenIds.has(user.id) || seenNames.has(key)) return [];
            seenIds.add(user.id); seenNames.add(key);
            return [{ id: user.id, name, read: cleanWords(user.read), found: cleanWords(user.found), foundSentences: cleanSentences(user.foundSentences), familyQuiz: cleanWords(user.familyQuiz), familyQuizTargets: cleanFamilyQuizTargets(user.familyQuizTargets), allWordsQuizTotals: cleanQuizTotals(saved.curriculumRevision === curriculumRevision ? user.allWordsQuizTotals : null), allWordsQuizRound: saved.curriculumRevision === curriculumRevision ? cleanQuizRound(user.allWordsQuizRound) : null, family: restoredFamily(user, saved.curriculumRevision), familyName: families[restoredFamily(user, saved.curriculumRevision)].family }];
          });
          lastUserId = saved.lastUserId;
        } else if (!saved) {
          const name = cleanName(localStorage.getItem('ari-elara-learner-name'));
          if (name) {
            users.push({ id: 'legacy-user', name,
              read: cleanWords(JSON.parse(localStorage.getItem('ari-elara-read') || '[]')),
              found: cleanWords(JSON.parse(localStorage.getItem('ari-elara-found') || '[]')),
              foundSentences: [], family: restoredFamily({family: Number(localStorage.getItem('ari-elara-family') || 0)}, null) });
            lastUserId = 'legacy-user';
          }
        }
      } catch {}
      const readWords = new Set();
      const foundWords = new Set();
      let index = 0;
      let target = null;

      const audioPlayer = new Audio();
      // One playback speed for every MP3 activity, including reading popups.
      const AUDIO_PLAYBACK_SPEED = 1;
      audioPlayer.preload = 'auto';
      let activeAudio = null;
      let cancelFamilyCelebration = () => {};
      let autoAdvanceTimer = null;
      let autoAdvancePending = false;
      let autoAdvanceGeneration = 0;
      function cancelAutoAdvance() {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
        autoAdvancePending = false;
        autoAdvanceGeneration += 1;
      }
      function scheduleAutoAdvance(next, stillCurrent, delayMs = 2400) {
        cancelAutoAdvance();
        autoAdvancePending = true;
        const generation = autoAdvanceGeneration;
        const queue = () => {
          if (generation !== autoAdvanceGeneration) return;
          autoAdvanceTimer = setTimeout(() => {
            autoAdvanceTimer = null;
            autoAdvancePending = false;
            if (generation === autoAdvanceGeneration && stillCurrent()) next();
          }, delayMs);
        };
        if (activeAudio) {
          const audio = activeAudio, ended = audio.onended, failed = audio.onerror;
          audio.onended = () => { if (ended) ended(); queue(); };
          audio.onerror = () => { if (failed) failed(); queue(); };
        } else queue();
      }

      let playbackId = 0;

      function ensureFamilyTiles() {
        if (familyPickerGrid.childElementCount) return;
        const fragment = document.createDocumentFragment();
      families.forEach((item, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'family-tile';
        button.dataset.familyIndex = i;
        button.setAttribute('aria-label', `Practice the ${item.family} family`);
        const circle = document.createElement('span');
        circle.className = 'family-circle';
        circle.textContent = item.family;
        const number = document.createElement('span');
        number.className = 'family-tile-example';
        familyWord(number, item.words[0], item.family);
        button.append(circle, number);
        button.addEventListener('click', () => {
          if (familyIsComplete(item, activeUser)) {
            playRecording('songs', item.family);
          } else {
            openFamily(i);
          }
        });
        fragment.append(button);
      });
        familyPickerGrid.append(fragment);
      }

      

      function updateHomeActionBars() {
        const found=new Set(activeUser?.found||[]);
        const learned=families.reduce((n,f)=>n+f.words.filter(w=>found.has(`${f.family}:${w}`)).length,0);
        const total=families.reduce((n,f)=>n+f.words.length,0);
        const vocabulary=knownWords;
        const answered=new Set();
        const rounds=activeUser ? [...quizHistory(activeUser),activeUser.allWordsQuizRound].filter(Boolean) : [];
        for(const round of rounds) for(const answer of round.answers||[]) if(vocabulary.has(answer.word)) answered.add(answer.word);
        for(const [id,value,max,label] of [
          ['learningProgressBar',learned,total,'Learning words completed'],
          ['challengeProgressBar',answered.size,vocabulary.size,'Challenge words completed']
        ]) {
          const bar=document.getElementById(id);if(!bar)continue;
          const percent=max?Math.min(100,Math.round(value/max*100)):0;
          bar.setAttribute('aria-valuenow',String(percent));
          bar.setAttribute('aria-valuetext',`${value} of ${max} words completed`);
          bar.setAttribute('aria-label',label);
          bar.title=`${value} of ${max} words completed (${percent}%)`;
          bar.firstElementChild.style.width=percent+'%';
        }
      }

function showFamilySelection(focusSelected = false) {

 updateHomeActionBars();
 
        ensureFamilyTiles();
        document.querySelector('#practiceSummary').textContent = families.every(f => familyIsComplete(f, activeUser)) ? '🏆 All families complete!' : 'Choose a family or continue your practice.';
        updateAllQuizTotals();
        familyGroupQuizPage.hidden = true;
        stopAudio();
        sentenceTarget = null;
        target = null;
        burst.classList.remove('show');
        wordsPage.hidden = true;
        sentencesPage.hidden = true;
        homePage.hidden = false;
        [...familyPickerGrid.children].forEach((button, i) => {
        const item = families[i];

const completed = familyIsComplete(item, activeUser);

button.classList.toggle('completed', completed);
button.setAttribute('aria-label', completed ? `Play the ${item.family} family song` : `Practice the ${item.family} family`);
let completedBadge = button.querySelector('.completed-family-badge');
let completedName = button.querySelector('.completed-family-name');
if (completed) {
  if (!completedBadge) {
    completedBadge = document.createElement('img');
    completedBadge.className = 'completed-family-badge';
    completedBadge.src = 'images/rewards/classCompleted.png';
    completedBadge.alt = 'Class Completed';
    button.prepend(completedBadge);
  }
  if (!completedName) {
    completedName = document.createElement('span');
    completedName.className = 'completed-family-name';
    completedBadge.after(completedName);
  }
  completedName.textContent = item.family;
} else {
  if (completedBadge) completedBadge.remove();
  if (completedName) completedName.remove();
}

button.classList.toggle('started', completed || item.words.some(word => foundWords.has(`${item.family}:${word}`)) || familySentences(item.family).some(sentence => foundSentences.has(sentence.file)) || familyQuizCount(item) > 0);

let label = button.querySelector('.family-completion');

if (completed && !label) {
  label = document.createElement('span');
  label.className = 'family-completion';
  label.textContent = '';
  button.append(label);
} else if (!completed && label) {
  label.remove();
}
          let progress = button.querySelector('.family-progress');
          const wordsDone = item.words.filter(word => foundWords.has(`${item.family}:${word}`)).length;
          const sentencesDone = familySentences(item.family).filter(sentence => foundSentences.has(sentence.file)).length;
          const quizDone = familyQuizCount(item);
          const visibleCounts = [
            ['Words', wordsDone, item.words.length], ['Sentences', sentencesDone, familySentences(item.family).length], ['Challenge', quizDone, 6]
          ].filter(([, count]) => count > 0);
          if (!completed && visibleCounts.length) {
            if (!progress) {
              progress = document.createElement('span');
              progress.className = 'family-progress';
              button.append(progress);
            }
            progress.replaceChildren();
            for (const [label, count, total] of visibleCounts) {
              const line = document.createElement('span');
              line.textContent = `${label} ${count}/${total}`;
              progress.append(line);
            }
          } else progress?.remove();
          if (i === index) button.setAttribute('aria-current', 'true');
          else button.removeAttribute('aria-current');
        });
        // The main Home screen is the menu; the 50-family grid has its own page.
        document.querySelector('#kidFamilyList').hidden=true;
        document.querySelector('#homePage .kid-home').hidden=false;
        if (focusSelected) document.querySelector('#kidContinue')?.focus();
      }

      function showWordsAt(familyIndex) {
        familyGroupQuizPage.hidden = true;
        index = familyIndex;
        homePage.hidden = true;
        sentencesPage.hidden = true;
        wordsPage.hidden = false;
        render();
        document.querySelector('#familySound').focus();
      }

      function stopAudio(clearSentences = true) {
        cancelFamilyCelebration();
        stopEffects();
        cancelAutoAdvance();
        cancelFamilyQuizAudio();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (clearSentences) {
          sentenceQueue.length = 0;
          sentencePlaying = false;
          sentenceGrid.querySelectorAll('.playing, .queued').forEach(button => {
            button.classList.remove('playing', 'queued');
            button.removeAttribute('aria-busy');
          });
          sentenceMessage.textContent = '';
        }
        playbackId += 1;
        if (activeAudio) {
          activeAudio.onended = null;
          activeAudio.onerror = null;
          activeAudio.pause();
          activeAudio.currentTime = 0;
          activeAudio = null;
        }
      }

      window.wordFamiliesAudio = Object.freeze({ stop: () => stopAudio() });

      function audioFileName(value) {
        return value.toLowerCase()
          .replace(/[’']/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }

      function playRecording(kind, value, after, onFailure, keepSentenceQueue = false, volume = 1) {
        stopAudio(!keepSentenceQueue);
        const id = playbackId;
        const sentenceEntry = kind === 'sentences' ? sentenceById.get(value) : null;
        const recordingName = kind === 'instructions' ? String(value).replace(/\.mp3$/i,'') : kind === 'family-examples' ? String(value).toLowerCase().trim() : (sentenceEntry ? sentenceEntry.text.toLowerCase().trim().replace(/[.!?]+$/g, '') : audioFileName(value));
        const source = `audio/${kind}/${encodeURIComponent(recordingName)}.mp3?v=family-example-spaces-v2`;
        const audio = audioPlayer;
        audio.src = source;
        audio.volume = volume;
        audio.playbackRate = AUDIO_PLAYBACK_SPEED;
        audio.preservesPitch = true;
        activeAudio = audio;
        let settled = false;
        const failed = () => {
          if (settled || id !== playbackId) return;
          settled = true;
          activeAudio = null;

          if (onFailure) onFailure();
          else message.textContent = 'Sound could not play. Tap the sound or word to try again.';
        };
        audio.onended = () => {
          if (settled || id !== playbackId) return;
          settled = true;
          activeAudio = null;
          if (after) after();
        };
        audio.onerror = failed;
        audio.play().catch(failed);
      }

      function playNextSentence() {
        if (sentencePlaying || !sentenceQueue.length) return;
        const { item, button } = sentenceQueue.shift();
        sentencePlaying = true;
        button.classList.remove('queued');
        button.classList.add('playing');
        button.setAttribute('aria-busy', 'true');
        sentenceMessage.textContent = `Listening: ${item.text}`;
        const finish = () => {
          button.classList.remove('playing');
          button.removeAttribute('aria-busy');
          sentencePlaying = false;
        };
        playRecording('sentences', item.file, () => {
          finish();
          button.classList.add('heard');
          sentenceMessage.textContent = 'Great listening! Try reading it yourself.';
          playNextSentence();
        }, () => {
          finish();
          sentenceQueue.length = 0;
          sentenceGrid.querySelectorAll('.queued').forEach(row => row.classList.remove('queued'));
          sentenceMessage.textContent = 'Sound could not play. Tap a sentence to try again.';
        }, true);
      }

      function showSentences() {
        familyGroupQuizPage.hidden = true;
        stopAudio();
        sentenceTarget = null;
        target = null;
        burst.classList.remove('show');
        updateChallengeButton();
        saveProgress();
        homePage.hidden = true;
        wordsPage.hidden = true;
        sentencesPage.hidden = false;
        const family = families[index];
        document.querySelector('#sentencesTitle').textContent = `${family.family} Family Sentences`;
        document.querySelector('#sentencesCount').textContent = `Family ${index + 1} of ${families.length}`;
        sentenceGrid.replaceChildren();
        familySentences(family.family).forEach(item => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'sentence-button' + (foundSentences.has(item.file) ? ' solved' : '');
          button.dataset.sentenceId = item.file;
          button.disabled = foundSentences.has(item.file);
          button.setAttribute('aria-label', `Hear the sentence: ${item.text}`);
          const icon = document.createElement('span');
          icon.className = 'sentence-icon';
          icon.textContent = foundSentences.has(item.file) ? '⭐' : '🔊';
          icon.setAttribute('aria-hidden', 'true');
          const text = document.createElement('span');
          // Whole-word matching keeps short words from highlighting inside other words.
          const escaped = item.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'i').exec(item.text);
          if (match) {
            const focusWord = document.createElement('strong');
            familyWord(focusWord, match[0], item.family);
            text.append(document.createTextNode(item.text.slice(0, match.index)), focusWord,
              document.createTextNode(item.text.slice(match.index + match[0].length)));
          } else text.textContent = item.text;
          button.append(icon, text);
          button.addEventListener('click', () => {
            if (autoAdvancePending) return;
            if (sentenceTarget) { handleSentenceAnswer(item, button); return; }
            // A new tap interrupts the previous recording and plays immediately.
            playRecording('sentences',item.file,()=>{button.classList.add('heard');sentenceMessage.textContent='Great listening! Try reading it yourself.';});
          });
          sentenceGrid.append(button);
        });
        updateSentenceChallenge();
        document.querySelector('#sentencesTitle').focus();
        if(remainingSentences().length)chooseSentenceChallenge();
      }

      function remainingSentences() {
        return sentenceData.filter(item => item.family === families[index].family && !foundSentences.has(item.file));
      }

      function setPracticeButtonImage(button, file, label) {
        button.classList.toggle('practice-image-button', !!file);
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
        // Do not tear down/recreate a large PNG unless the artwork changes.
        const existing = button.querySelector(':scope > img');
        if (!file) {
          if (!existing && button.textContent === label) return;
          button.textContent = label;
          return;
        }
        if (existing && existing.getAttribute('src') === file) {
          if (existing.alt !== label) existing.alt = label;
          return;
        }
        const image=document.createElement('img');
        image.src=file; image.alt=label;

        button.replaceChildren(image);
      }

      function updateSentenceChallenge() {
        const complete = remainingSentences().length === 0;
        sentenceChallengeButton.disabled = complete;
        sentenceChallengeButton.classList.toggle('active', !!sentenceTarget);
        setPracticeButtonImage(sentenceChallengeButton, complete ? 'images/rewards/all3SentencesFound.png' : 'images/buttons/hearItAgain.png', complete ? '🏆 All 3 Sentences Found' : 'Hear it Again');
      }

      function playChallengeSentence(item, volume = 1) {
        playRecording('sentences', item.file, undefined, () => {
          sentenceMessage.textContent = 'Sound could not play. Tap Hear the Sentence Again to retry.';
        }, false, volume);
      }

      function chooseSentenceChallenge() {
        if (autoAdvancePending) return;
        stopAudio();
        if (!sentenceTarget) {
          const remaining = remainingSentences();
          if (!remaining.length) { updateSentenceChallenge(); return; }
          sentenceTarget = remaining[Math.floor(Math.random() * remaining.length)];
        }
        playChallengeSentence(sentenceTarget);
        sentenceMessage.textContent = 'Listen carefully… then tap the sentence you heard!';
        updateSentenceChallenge();
      }

      function handleSentenceAnswer(item, button) {
        if (autoAdvancePending || !sentenceTarget) return;
        const correct = item.file === sentenceTarget.file;
        activityStatsEvent('sentences',sentenceTarget.text,correct);
        if (correct) {
          foundSentences.add(item.file);
          button.classList.add('solved');
          button.disabled = true;
          button.querySelector('.sentence-icon').textContent = '⭐';
          sentenceTarget = null;
          saveProgress();
          updateSentenceChallenge();
          const sentenceComplete = remainingSentences().length === 0;
          const familyComplete = familyIsComplete(families[index], activeUser);
          sentenceMessage.textContent = familyComplete ? 'All three activities are complete! Great work!' : sentenceComplete ? 'You found all 3 sentences! Great work!' : 'Yes! You found the right sentence!';
          celebrateProgress('sentences');
          if (!sentenceComplete) {
            const userId = activeUser?.id, familyIndex = index;
            scheduleAutoAdvance(chooseSentenceChallenge, () => !sentencesPage.hidden && activeUser?.id === userId && index === familyIndex);
          } else {
            sentenceMessage.textContent = '⭐ All 3 sentences found! Next: Family Challenge.';
            const userId = activeUser?.id, familyIndex = index;
            scheduleAutoAdvance(() => showFamilyQuizActivity(), () => !sentencesPage.hidden && activeUser?.id === userId && index === familyIndex);
          }
        } else {
          playChallengeSentence(item, 0.4);
          button.classList.add('wrong');
          setTimeout(() => button.classList.remove('wrong'), 400);
          sentenceMessage.textContent = 'That is a different sentence. Try again, or hear the sentence again!';
        }
      }
      sentenceChallengeButton.addEventListener('click', chooseSentenceChallenge);

      document.querySelector('#readSentences').addEventListener('click', showSentences);
      document.querySelector('#sentencesBack').addEventListener('click', () => {
        stopAudio();
        sentencesPage.hidden = true;
        wordsPage.hidden = false;
        render();
        document.querySelector('#readSentences').focus();
      });
      document.querySelector('#sentencesFamilies').addEventListener('click', () => {
        saveProgress();
        showFamilySelection(true);
      });


      // Popup uses phoneme MP3s rather than speech synthesis letter names.
      const wordReadDialog = document.getElementById('wordReadDialog');
      const popupReadImage = document.querySelector('#readWholeWord img');

      const wordReadParts = document.getElementById('wordReadParts');
      const wordReadSentence = document.getElementById('wordReadSentence');
      const wordReadStatus = document.getElementById('wordReadStatus');
      const sentenceStepListen = document.getElementById('sentenceStepListen');
      const wordReadTitle = document.getElementById('wordReadTitle');
      let readPopupEntry = null, readPopupToken = 0, readPopupTimer = null;
       // Sound-to-spelling map. Files are optional until you add the MP3 recordings.
       // Longest matching spelling is selected first. Irregular words need manual review.
       const phonemeCodes = {
         a:'short_a',b:'b',c:'k',d:'d',e:'short_e',f:'f',g:'g',h:'h',i:'short_i',j:'j',k:'k',l:'l',m:'m',n:'n',o:'short_o',p:'p',r:'r',s:'s',t:'t',u:'short_u',v:'v',w:'w',y:'y',z:'z',
         kn:'n',sh:'sh',ch:'ch',th:'th_unvoiced',wh:'w',ph:'f',ck:'k',ng:'ng',ee:'long_e',ay:'long_a',ai:'long_a',oa:'long_o',igh:'long_i',ar:'ar',or:'or',er:'er',ir:'er',ur:'er',ow:'ow',ou:'ow',oi:'oy',oy:'oy',au:'aw',aw:'aw'
       };
       const soundSpellings = Object.keys(phonemeCodes).sort((a,b)=>b.length-a.length);
       function soundChunks(word){
         const clean=String(word||'').toLowerCase().replace(/[^a-z]/g,'');
         const chunks=[];
         for(let i=0;i<clean.length;){
           const part=soundSpellings.find(spelling=>clean.startsWith(spelling,i)) || clean[i];
           chunks.push({part,code:phonemeCodes[part]||null});i+=part.length;
         }
         return chunks;
       }
      // Group the ending of each listed word family into a single sound tile.
      function popupFamilyParts(word){
        const clean=String(word||'').toLowerCase().replace(/[^a-z]/g,'');
        const families=window.WORD_FAMILIES||[];
        const match=families.find(f=>Array.isArray(f.words)&&f.words.some(w=>String(w).toLowerCase()===clean));
        const ending=String(match?.family||'').replace(/^-/, '').toLowerCase();
        if(!ending || !clean.endsWith(ending) || clean.length<=ending.length)return {chunks:soundChunks(word),ending:null};
        const first=clean.slice(0,-ending.length);
        return {chunks:[...soundChunks(first),{part:ending,code:null,family:true}],ending};
      }
      function clearPopupTiming(){ if(readPopupTimer!==null)clearTimeout(readPopupTimer);readPopupTimer=null; }
      function setPopupAudioStage(stage){
        const stages={hear:'readHearSounds',blend:'readBlendSounds',read:'readWholeWord',build:'readBuildWord',sentence:'readSentenceStep'};
        Object.entries(stages).forEach(([name,id])=>{const button=document.getElementById(id);button.classList.toggle('audio-stage-active',name===stage);if(name===stage)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      }
      function popupCancelAudio(){readPopupToken++;clearPopupTiming();setPopupAudioStage(null);audioPlayer.ontimeupdate=null;stopAudio();if('speechSynthesis' in window)window.speechSynthesis.cancel();}
      function closeReadPopup(){popupCancelAudio();browsePopupFamily=null;if(wordReadDialog.open)wordReadDialog.close();}
      function renderPopupParts(word){
        wordReadParts.replaceChildren();
        popupFamilyParts(word).chunks.forEach(({part})=>{const el=document.createElement('span');el.className='sound-part';el.textContent=part;wordReadParts.append(el);});
      }
      function renderPopupSentence(sentence){
        wordReadSentence.replaceChildren();
        const words=(sentence.match(/\S+/g)||[]);
        words.forEach((word,i)=>{
          const line=document.createElement('div');line.className='sentence-build-line';
          line.textContent=words.slice(0,i+1).join(' ');
          wordReadSentence.append(line);
        });
      }
      const readPrevious = document.getElementById('readPrevious');
      const readNext = document.getElementById('readNext');
      let browsePopupFamily = null; // Only set while opening a word from Word List.
      function popupSequence(){
        if(!readPopupEntry)return [];
        if(readPopupEntry.kind==='sentences'){
          return familySentences(families[index].family)
            .map(item=>({kind:'sentences',word:item.word,sentence:item.text,file:item.file,
              after:()=>{sentenceMessage.textContent='Great listening! Try reading it yourself.';}}));
        }
        const popupFamily = browsePopupFamily ? families.find(f=>f.family===browsePopupFamily) : families[index];
        return (popupFamily?.words||[]).map(word=>({kind:'words',word,sentence:wordExampleSentence(word),
          after:()=>{readWords.add(keyFor(word));saveProgress();message.textContent=`You heard “${word}.”`;}}));
      }
      function popupPosition(){
        const entries=popupSequence();
        const position=entries.findIndex(item=>readPopupEntry.kind==='sentences'
          ? item.file===readPopupEntry.file : item.word===readPopupEntry.word);
        return {entries,position};
      }
      function updatePopupNavigation(){
        const {entries,position}=popupPosition();
        const sentence=readPopupEntry?.kind==='sentences';
        function setNavigationLabel(button,arrow,word,arrowFirst){
          button.replaceChildren();
          if(!word)return;
          const arrowSpan=document.createElement('span');arrowSpan.className='nav-arrow';arrowSpan.textContent=arrow;
          const wordSpan=document.createElement('span');wordSpan.textContent=word;
          if(arrowFirst)button.append(arrowSpan,document.createTextNode(' '),wordSpan);
          else button.append(wordSpan,document.createTextNode(' '),arrowSpan);
        }
        setNavigationLabel(readPrevious,'⬅',position>0?entries[position-1].word:'',true);
        setNavigationLabel(readNext,'➡',position>=0&&position<entries.length-1?entries[position+1].word:'',false);
        readPrevious.hidden=position<=0;
        readNext.hidden=position<0||position>=entries.length-1;
      }
      function navigatePopup(direction){
        const {entries,position}=popupPosition();
        const target=entries[position+direction];
        if(target)showReadPopup(target);
      }
      readPrevious.addEventListener('click',()=>navigatePopup(-1));
      readNext.addEventListener('click',()=>navigatePopup(1));
      // Advance only after the current recording finishes. Every transition uses
      // the same cancelable timer, so leaving the popup or selecting another
      // control cannot start playback from an outdated stage.
      function advanceWordStage(nextStage){
        const token=readPopupToken;
        clearPopupTiming();
        readPopupTimer=setTimeout(()=>{
          readPopupTimer=null;
          if(token!==readPopupToken || !wordReadDialog.open || readPopupEntry?.kind!=='words')return;
          if(nextStage==='blend')guidedSounds('blend',()=>advanceWordStage('read'));
          else if(nextStage==='read')beginWordReading(()=>advanceWordStage('sentence'));
          else if(nextStage==='sentence')beginSentenceStep(()=>advanceWordStage('build'));
          else if(nextStage==='build')beginBuildWord();
        },500);
      }
      // Local image matching: images/words/cat.png and
      // images/sentences/The cat sat.png (sentence text without terminal punctuation).
      // Missing files are hidden; the original popup remains fully functional.
      const wordPicture=document.getElementById('wordPicture');
      const sentencePicture=document.getElementById('sentencePicture');
      function loadLearningPicture(img,folder,name){
        img.hidden=true;
        img.removeAttribute('src');
        const filename=String(name||'').trim().replace(/[.!?]+$/,'').replace(/[^a-zA-Z0-9 '-]/g,'').replace(/\s+/g,' ').trim();
        if(!filename)return;
        img.alt=filename;
        img.onload=()=>{img.hidden=false;};
        img.onerror=()=>{img.hidden=true;};
        img.src=`images/${folder}/${encodeURIComponent(filename.toLowerCase())}.png`;
      }
      function showReadPopup(entry){
        if(popupReadImage) popupReadImage.src = 'images/buttons/read.png';
        hideSentenceStep();
        popupCancelAudio();clearTimeout(buildResultTimer);buildPanel.classList.remove('build-wrong','build-correct');readPopupEntry=entry;document.getElementById('buildWordExercise').hidden=true;
        document.getElementById('wordReadTitle').textContent=entry.kind==='sentences' ? '' : '';
        renderPopupParts(entry.word || '');
        wordReadParts.hidden=false;
        renderPopupSentence(entry.kind === 'sentences' ? (entry.sentence || '') : '');
        loadLearningPicture(sentencePicture,'sentences',entry.kind==='sentences' ? entry.sentence : '');
        loadLearningPicture(wordPicture,'words',entry.kind==='words' ? entry.word : '');
        wordReadSentence.hidden = entry.kind !== 'sentences';
        
        wordReadStatus.textContent='';
         document.getElementById('guidedBlendActions').querySelectorAll('button').forEach(button=>{button.hidden=entry.kind==='sentences'&&button.id!=='readWholeWord';});
        if(!wordReadDialog.open)wordReadDialog.showModal();
        updatePopupNavigation();
        // Start word popups with individual phonemes; sentence popups retain normal playback.
        if(entry.kind==='words') { guidedSounds('hear',()=>advanceWordStage('blend')); }
        else readPopupWhole();
      }
      
// Independent decoding and letter-building inside the existing word popup.
      const buildPanel=document.getElementById('buildWordExercise');
      const buildSlots=document.getElementById('buildSlots');
      const buildLetters=document.getElementById('buildLetters');
      const buildFeedback=document.getElementById('buildFeedback');
      let buildChoices=[],buildSelected=[],buildResultTimer=null,buildAttemptNumber=0;
      function refreshBuildWord(){
        const word=String(readPopupEntry?.word||'').toLowerCase().replace(/[^a-z]/g,'');
        buildPanel.dataset.letters=String(Math.min(8,Math.max(3,word.length)));
        buildSlots.replaceChildren();
        for(let i=0;i<word.length;i++){
          const cell=document.createElement('span');cell.className='build-slot';
          cell.textContent=buildSelected[i]===undefined?'_':buildChoices[buildSelected[i]].letter;
          buildSlots.append(cell);
        }
        buildLetters.replaceChildren();
        buildChoices.forEach((choice,i)=>{
          const button=document.createElement('button');button.type='button';button.textContent=choice.letter;
          button.disabled=buildSelected.includes(i)||buildSelected.length===word.length;
          button.addEventListener('click',()=>{playEffect('letterPop',{volume:.35});buildSelected.push(i);refreshBuildWord();});
          buildLetters.append(button);
        });
        if(buildSelected.length===word.length){
          const answer=buildSelected.map(i=>buildChoices[i].letter).join('');
          const token=readPopupToken;
          wordStatsEvent(word,'attempt',{correct:answer===word,first:buildAttemptNumber===0});
          buildAttemptNumber++;
          clearTimeout(buildResultTimer);
          if(answer===word){
            playEffect('wordComplete');buildFeedback.textContent='Correct!';
            buildResultTimer=setTimeout(()=>{
              if(token!==readPopupToken||!wordReadDialog.open)return;
              const {entries,position}=popupPosition();
              if(position>=0 && position<entries.length-1)navigatePopup(1);
              else {buildPanel.classList.add('build-correct');wordReadStatus.textContent='Great work! You finished the words in this family.';}
            },500);
          }else{
            buildFeedback.textContent='Try again.';
            buildPanel.classList.remove('build-wrong');
            void buildPanel.offsetWidth;
            buildPanel.classList.add('build-wrong');
            buildResultTimer=setTimeout(()=>{
              if(token!==readPopupToken||!wordReadDialog.open)return;
              buildPanel.classList.remove('build-wrong');
              buildSelected=[];refreshBuildWord();
            },500);
          }
        }else buildFeedback.textContent='';
      }
      function randomizeBuildChoices(word){
        // Fisher-Yates shuffle: fresh order each time Build opens or Reset is pressed.
        // Avoid revealing the correct spelling when an alternative ordering exists.
        if(buildChoices.length<2)return;
        for(let attempt=0;attempt<12;attempt++){
          for(let i=buildChoices.length-1;i>0;i--){
            const j=Math.floor(Math.random()*(i+1));
            [buildChoices[i],buildChoices[j]]=[buildChoices[j],buildChoices[i]];
          }
          if(buildChoices.map(tile=>tile.letter).join('')!==word)return;
        }
        // Guaranteed different order if the random draws repeatedly land on the answer.
        const swapIndex=buildChoices.findIndex((tile,i)=>i>0&&tile.letter!==buildChoices[0].letter);
        if(swapIndex>0)[buildChoices[0],buildChoices[swapIndex]]=[buildChoices[swapIndex],buildChoices[0]];
      }
      function beginBuildWord(){
        if(!readPopupEntry||readPopupEntry.kind!=='words')return;
        popupCancelAudio();clearTimeout(buildResultTimer);hideSentenceStep();buildPanel.classList.remove('build-wrong','build-correct');
        const word=String(readPopupEntry.word).toLowerCase().replace(/[^a-z]/g,'');
        buildChoices=[...word].map((letter,i)=>({letter,id:i}));
        randomizeBuildChoices(word);
        buildSelected=[];buildAttemptNumber=0;buildPanel.hidden=false;wordReadParts.hidden=true;refreshBuildWord();
        wordReadStatus.textContent='Build the word using the letter tiles.';setPopupAudioStage('build');
        buildPanel.scrollIntoView({block:'nearest',behavior:'smooth'});
      }
      function hideSentenceStep(){
        wordReadDialog.classList.remove('sentence-step-active','word-step-active');
        sentenceStepListen.hidden=true;
        sentenceStepListen.disabled=false;
        sentenceStepListen.onclick=null;
        wordReadTitle.replaceChildren();
        wordReadSentence.hidden=true;
        sentencePicture.hidden=true;
        sentencePicture.onload=null;
      }
      // Let the child decode the word before choosing to hear its recording.
      function beginWordReading(onComplete=null){
        if(!readPopupEntry || readPopupEntry.kind!=='words')return;
        popupCancelAudio();clearTimeout(buildResultTimer);hideSentenceStep();
        buildPanel.hidden=true;wordReadParts.hidden=false;
        renderPopupParts(readPopupEntry.word);
        wordReadDialog.classList.add('word-step-active');
        wordReadTitle.replaceChildren(
          document.createTextNode('Try Reading it First'),document.createElement('br'),
          document.createTextNode('Then Click Listen to Hear it'));
        sentenceStepListen.hidden=false;
        sentenceStepListen.setAttribute('aria-label','Listen to this word');
        wordReadStatus.textContent='';setPopupAudioStage('read');
        sentenceStepListen.onclick=()=>{
          if(sentenceStepListen.disabled || !wordReadDialog.classList.contains('word-step-active'))return;
          wordStatsEvent(readPopupEntry.word,'listen');
          sentenceStepListen.disabled=true;
          readPopupWhole(()=>{
            sentenceStepListen.disabled=false;
            setPopupAudioStage('read');
            onComplete?.();
          });
        };
      }
      // Read the sentence pyramid inside the same word dialog as the other steps.
      function prepareSentenceReading(sentence,onComplete,token){
        const words=sentence.match(/\S+/g)||[];
        const lines=words.map((_,i)=>words.slice(0,i+1).join(' '));
        const rows=[...wordReadSentence.children];
        let position=0;
        const isCurrent=()=>token===readPopupToken && wordReadDialog.open &&
          wordReadDialog.classList.contains('sentence-step-active');
        function ready(){
          rows.forEach(row=>row.classList.remove('is-reading'));
          sentenceStepListen.disabled=false;
          wordReadStatus.textContent='';
        }
        function done(){
          if(!isCurrent())return;
          rows[position].classList.remove('is-reading');
          rows[position].classList.add('is-read');
          if(++position<lines.length){ready();return;}
          sentenceStepListen.disabled=true;
          wordReadStatus.textContent='Great reading!';
          onComplete?.();
        }
        sentenceStepListen.onclick=()=>{
          if(sentenceStepListen.disabled || !isCurrent())return;
          sentenceStepListen.disabled=true;
          wordReadStatus.textContent='Listening…';
          rows.forEach((row,i)=>row.classList.toggle('is-reading',i===position));
          const text=lines[position];
          const file='audio/sentences/'+encodeURIComponent(text.toLowerCase().trim().replace(/[.!?]+$/g,''))+'.mp3';
          popupPlayFile(file,done,()=>{
            if(!isCurrent())return;
            if(!('speechSynthesis' in window)){
              ready();wordReadStatus.textContent='Recording unavailable. Tap the speaker to retry.';return;
            }
            const speech=new SpeechSynthesisUtterance(text);speech.rate=.8;
            speech.onend=done;
            speech.onerror=()=>{if(isCurrent()){ready();wordReadStatus.textContent='Tap the speaker to try again.';}};
            window.speechSynthesis.speak(speech);
          });
        };
        ready();
      }
      function beginSentenceStep(onComplete=null){
        if(!readPopupEntry || readPopupEntry.kind!=='words')return;
        popupCancelAudio();clearTimeout(buildResultTimer);hideSentenceStep();
        buildPanel.hidden=true;wordReadParts.hidden=true;
        wordReadDialog.classList.add('sentence-step-active');
        const example=sentenceData.find(item=>String(item.word).toLowerCase()===String(readPopupEntry.word).toLowerCase());
        const sentence=readPopupEntry.sentence || example?.text || '';
        if(!sentence){wordReadStatus.textContent='No example sentence is available for this word.';setPopupAudioStage('sentence');onComplete?.();return;}
        wordReadTitle.replaceChildren(
          document.createTextNode('Try Reading it First'),document.createElement('br'),
          document.createTextNode('Then Click Listen to Hear it'));
        sentenceStepListen.hidden=false;
        sentenceStepListen.setAttribute('aria-label','Listen to this sentence line');
        renderPopupSentence(sentence);wordReadSentence.hidden=false;
        loadLearningPicture(sentencePicture,'sentences',sentence);
        setPopupAudioStage('sentence');
        const token=readPopupToken;
        prepareSentenceReading(sentence,onComplete,token);
      }
      document.getElementById('readSentenceStep').addEventListener('click',()=>beginSentenceStep(()=>advanceWordStage('build')));
      document.getElementById('readBuildWord').addEventListener('click',beginBuildWord);
      document.getElementById('buildReset').addEventListener('click',()=>{clearTimeout(buildResultTimer);buildPanel.classList.remove('build-wrong','build-correct');buildSelected=[];randomizeBuildChoices(String(readPopupEntry?.word||'').toLowerCase().replace(/[^a-z]/g,''));refreshBuildWord();});
      document.getElementById('buildHelp').addEventListener('click',requestBuildHelp);
      document.getElementById('buildSpeak').addEventListener('click',()=>{
        wordStatsEvent(readPopupEntry?.word,'listen');
        if(!readPopupEntry || readPopupEntry.kind!=='words')return;
        const word=readPopupEntry.word;
        popupCancelAudio();setPopupAudioStage('build');
        popupPlayFile(`audio/words/${audioFileName(word)}.mp3`,()=>setPopupAudioStage('build'),()=>{wordReadStatus.textContent='Word audio unavailable.';});
      });
      
function popupPlayFile(path, onDone, onError, rate = AUDIO_PLAYBACK_SPEED, onProgress = null) {
  stopAudio();
  const token=readPopupToken, id=playbackId, player=audioPlayer;
  let settled=false;
  const current=()=>token===readPopupToken && id===playbackId;
  const finish=(callback)=>{
    if(settled || !current())return;
    settled=true;activeAudio=null;player.ontimeupdate=null;callback?.();
  };
  activeAudio=player;player.ontimeupdate=null;
  player.src=path;player.volume=1;player.playbackRate=rate;player.preservesPitch=true;
  player.ontimeupdate=onProgress?()=>{
    if(current() && !settled && Number.isFinite(player.duration) && player.duration>0)
      onProgress(Math.min(1,player.currentTime/player.duration));
  }:null;
  player.onended=()=>finish(onDone);
  player.onerror=()=>finish(onError);
  player.play().catch(()=>finish(onError));
}

      // Progressive sentence builder. Use shared phrase recordings from audio/sentences/.
      // The final line uses the app's existing full-sentence recording.
      // Filename pattern: The cat.mp3, Dad can.mp3, etc. Each unique phrase is stored once.
      function readSentenceBuilder(entry,token){
        const lines=[...wordReadSentence.querySelectorAll('.sentence-build-line')];
        const recorded=sentenceData.find(item=>item.file===entry.file);
        let position=0;
        // Pause only between sentence-pyramid lines, never after the last line.
        function advanceAfterPause(){
          if(token!==readPopupToken)return;
          if(position>=lines.length){finish();return;}
          clearPopupTiming();
          readPopupTimer=setTimeout(()=>{
            readPopupTimer=null;
            if(token===readPopupToken)next();
          },500);
        }
        function finish(){
          if(token!==readPopupToken)return;
          wordReadStatus.textContent='';setPopupAudioStage(null);entry.after?.();
        }
        function next(){
          if(token!==readPopupToken)return;
          if(position>=lines.length){finish();return;}
          const i=position++;
          lines.forEach((line,j)=>line.classList.toggle('active',i===j));
          wordReadStatus.textContent=`Reading ${i+1} of ${lines.length}`;
          const final=i===lines.length-1;
          const name=final
            ? `audio/sentences/${encodeURIComponent((entry.sentence || recorded?.text || "").toLowerCase().trim().replace(/[.!?]+$/g, ""))}.mp3`
            : `audio/sentences/${encodeURIComponent(lines[i].textContent.toLowerCase().trim().replace(/[.!?]+$/g, ''))}.mp3`;
          popupPlayFile(name,advanceAfterPause,()=>{
            // Browser speech is a fallback until an optional prefix MP3 is installed.
            if(token!==readPopupToken)return;
            if(!('speechSynthesis' in window)){
              wordReadStatus.textContent=`Missing audio: ${name}`;return;
            }
            stopAudio();
            const speech=new SpeechSynthesisUtterance(lines[i].textContent);
            speech.rate=0.8;
            speech.onend=()=>{if(token===readPopupToken)advanceAfterPause();};
            speech.onerror=()=>{if(token===readPopupToken)wordReadStatus.textContent=`Missing audio: ${name}`;};
            window.speechSynthesis.speak(speech);
          });
        }
        next();
      }
      function readPopupWhole(onComplete=null){
        if(!readPopupEntry)return;
        popupCancelAudio();setPopupAudioStage('read');const token=readPopupToken;
        const entry=readPopupEntry;
        const parts=[...wordReadParts.children];
        parts.forEach(p=>p.classList.remove('active','all'));
        wordReadSentence.querySelectorAll('.sentence-build-line').forEach(p=>p.classList.remove('active'));
        if(entry.kind==='sentences'){readSentenceBuilder(entry,token);return;}
        wordReadStatus.textContent='Reading...';
        parts.forEach(p=>p.classList.add('all'));
        popupPlayFile(`audio/words/${audioFileName(entry.word)}.mp3`,()=>{
          if(token!==readPopupToken)return;
          wordReadStatus.textContent='';entry.after?.();setPopupAudioStage(null);onComplete?.();
        },()=>{if(token===readPopupToken){wordReadStatus.textContent='Audio unavailable.';sentenceStepListen.disabled=false;setPopupAudioStage(null);}});
      }
       // Event-driven timing: advance highlighting on actual audio completion,
       // not guessed phoneme durations. Missing recordings stop gracefully.
       function guidedSounds(mode,onComplete=null){
         if(!readPopupEntry?.word || readPopupEntry.kind!=='words')return;
         popupCancelAudio();setPopupAudioStage(mode);
         const token=readPopupToken,entry=readPopupEntry;
         const chunks=popupFamilyParts(entry.word).chunks,spans=[...wordReadParts.children];
         const wordKey=String(entry.word).toLowerCase().replace(/[^a-z0-9]/g,'');
         // Use the complete word-specific blend recording when supplied.
         // Hear remains phoneme-by-phoneme; Read remains the original word audio.
         if(mode==='blend'){
           spans.forEach(span=>span.classList.remove('active','blend','all'));
           wordReadStatus.textContent='Blending the sounds together...';
           const customBlend=`audio/blend/${wordKey}.mp3`;
           // The full-word recording has no phoneme timestamps. Track playback
           // progress and move the highlight across its visible sound tiles.
           // This is approximate synchronization, not phoneme-level alignment.
           const totalLetters=chunks.reduce((sum,chunk)=>sum+chunk.part.length,0);
           const highlightBlendProgress=(progress)=>{
             if(token!==readPopupToken)return;
             const letterPosition=Math.min(progress,.999999)*totalLetters;
             let end=0;
             const current=chunks.findIndex(chunk=>(end+=chunk.part.length)>letterPosition);
             spans.forEach((span,i)=>{
               span.classList.remove('blend','all');
               span.classList.toggle('active',i===current);
             });
           };
           highlightBlendProgress(0);
           // Fall back to the original phoneme-based sequence for missing recordings.
           popupPlayFile(customBlend,()=>{
             if(token!==readPopupToken)return;
             spans.forEach(span=>{span.classList.remove('active','blend');span.classList.add('all');});
             wordReadStatus.textContent='Great blending! Tap Read to hear the word again.';
             entry.after?.();setPopupAudioStage(null);onComplete?.();
           },()=>{
             if(token!==readPopupToken)return;
             spans.forEach(span=>span.classList.remove('active','blend','all'));
             guidedBlendFallback();
           },1,highlightBlendProgress);
           return;
         }
         // Hear the beginning sound(s), then play the entire family ending as ONE sound.
         // This prevents silent-e families (e.g. -ame) from being read letter by letter.
         guidedBlendFallback();
         function guidedBlendFallback(){
         let position=0;
         function highlight(count){
           spans.forEach((span,i)=>{
             span.classList.toggle('active',i===count-1);
             span.classList.remove('blend');
             span.classList.remove('all');
           });
         }
         function finish(){
           if(token!==readPopupToken)return;
           spans.forEach(span=>{span.classList.remove('active','blend');span.classList.add('all');});
           if(mode==='hear'){
             wordReadStatus.textContent='Now tap Blend Sounds to put them together.';
             setPopupAudioStage(null);onComplete?.();return;
           }
           wordReadStatus.textContent='Listen to the whole word.';
           popupPlayFile(`audio/words/${audioFileName(entry.word)}.mp3`,()=>{
             if(token!==readPopupToken)return;
             wordReadStatus.textContent='Great blending! Tap Read Word to hear it again.';
             entry.after?.();setPopupAudioStage(null);onComplete?.();
           },()=>{if(token===readPopupToken)wordReadStatus.textContent='Whole-word audio unavailable.';});
         }
         // New, word-specific recordings take priority. Missing recordings
         // fall back to the shared phoneme library while you're creating them.
         // Files: audio/words/cat/hear-01.mp3 and blend-01.mp3, etc.
         const legacyNames={short_a:'a-short',short_e:'e-short',short_i:'i-short',short_o:'o-short',short_u:'u-short',long_e:'ee',long_a:'ai',long_o:'oa',long_i:'igh',th_unvoiced:'th',oy:'oi'};
         function next(){
           if(token!==readPopupToken)return;
           if(position>=chunks.length){finish();return;}
           const item=chunks[position];
           position++;
           highlight(position);
           wordReadStatus.textContent=item.family ? `Word-family sound: -${item.part}` : (mode==='hear' ? `Sound ${position} of ${chunks.length}` : `Blend ${position} of ${chunks.length}`);
           const number=String(position).padStart(2,'0');
           const recorded=item.family
             ? `audio/family-first-sounds/${encodeURIComponent(item.part)}.mp3`
             : `audio/words/${wordKey}/${mode}-${number}.mp3`;
           // MP3s can be added one at a time; use existing phoneme audio otherwise.
           const legacy=item.code;
           // Hear: wait one full second AFTER each sound ends, except the last.
           // The timer is canceled when the popup closes or another action starts.
           const afterSound=()=>{
             if(token!==readPopupToken)return;
             if(mode==='hear' && position<chunks.length){
               clearPopupTiming();
               readPopupTimer=setTimeout(()=>{
                 readPopupTimer=null;
                 if(token===readPopupToken)next();
               },500);
             }else{
               next();
             }
           };
           popupPlayFile(recorded,afterSound,()=>{
             if(token!==readPopupToken)return;
             if(!item.code){wordReadStatus.textContent=`Missing recording: ${recorded}`;setPopupAudioStage(null);return;}
             popupPlayFile(`audio/phonemes/${legacy}.mp3`,afterSound,()=>{
               if(token===readPopupToken)wordReadStatus.textContent=`Missing recording: ${recorded}`;
             },1);
           },1);
         }
         next();
         }
       }
       document.getElementById('readHearSounds').addEventListener('click',()=>{wordStatsEvent(readPopupEntry?.word,'listen');hideSentenceStep();buildPanel.hidden=true;wordReadParts.hidden=false;guidedSounds('hear');});
       document.getElementById('readBlendSounds').addEventListener('click',()=>{wordStatsEvent(readPopupEntry?.word,'listen');hideSentenceStep();buildPanel.hidden=true;wordReadParts.hidden=false;guidedSounds('blend');});
      document.getElementById('readWholeWord').addEventListener('click',()=>{if(readPopupEntry?.kind==='words')beginWordReading();else readPopupWhole();});
      
      
      wordReadDialog.addEventListener('cancel',event=>{event.preventDefault();closeReadPopup();});
      // Close only when the pointer lands on the dialog backdrop.
      wordReadDialog.addEventListener('click',event=>{if(event.target===wordReadDialog)closeReadPopup();});
      const wordSentenceExamples={"cat": "the cat can nap", "hat": "my hat is red", "mat": "the mat is soft", "chat": "we can chat", "sat": "the dog sat", "pat": "i pat the dog", "can": "we can jump", "fan": "the fan can spin", "man": "the man can run", "pan": "the pan is hot", "ran": "the dog ran", "van": "the van is red", "bad": "the milk smells bad", "dad": "my dad can cook", "had": "i had a nap", "mad": "the cat is mad", "pad": "i need a pad", "sad": "the boy is sad", "cap": "my cap is red", "gap": "mind the gap", "lap": "the cat sits on my lap", "map": "i have a map", "nap": "i need a nap", "tap": "i tap the drum", "bag": "my bag is big", "rag": "the rag is wet", "tag": "read the name tag", "wag": "dogs wag their tails", "gag": "a bad smell can make me gag", "lag": "we must not lag behind", "bed": "my bed is soft", "fed": "i fed the cat", "led": "dad led the way", "red": "the brick is red", "wed": "they will wed in may", "sled": "the sled is fast", "get": "i can get it", "jet": "the jet is fast", "let": "let us play", "net": "the net is big", "pet": "my pet is small", "wet": "my socks are wet", "den": "the fox has a den", "hen": "the hen has eggs", "men": "the men can help", "pen": "i have a pen", "ten": "i see ten ducks", "then": "we eat and then play", "bit": "i ate a bit", "fit": "the shoes fit me", "hit": "i hit the ball", "kit": "my art kit is new", "pit": "the pit is deep", "sit": "please sit with me", "bin": "the bin is full", "fin": "the fish has a fin", "pin": "the pin is small", "tin": "the tin is full", "win": "we can win", "chin": "my chin is wet", "dip": "i dip my toes", "hip": "my hip feels fine", "lip": "my lip is sore", "rip": "do not rip it", "sip": "i sip my milk", "zip": "zip up your coat", "big": "the dog is big", "dig": "we dig a pit", "fig": "i ate a fig", "pig": "the pig is pink", "wig": "the wig is red", "spring": "flowers bloom in spring", "bid": "i bid on a toy", "did": "i did my best", "hid": "the cat hid", "kid": "the kid can jump", "lid": "put on the lid", "rid": "we got rid of the trash", "spot": "i see a spot", "dot": "i draw a dot", "hot": "the sun is hot", "lot": "we have a lot", "not": "i am not sad", "pot": "the pot is hot", "hop": "the frog can hop", "mop": "i mop the floor", "pop": "bubbles can pop", "top": "the top can spin", "cop": "the cop can help", "stop": "we stop and look", "dog": "the dog can sit", "fog": "the fog is thick", "hog": "the hog is big", "jog": "we jog at dawn", "log": "the log is wet", "frog": "the frog can jump", "cob": "i see a corn cob", "job": "dad has a job", "mob": "a mob filled the street", "throb": "my sore toes throb", "sob": "i heard him sob", "knob": "turn the door knob", "bun": "i ate a bun", "fun": "we have fun", "run": "we can run", "sun": "the sun is bright", "stun": "loud bangs can stun me", "spun": "the top spun fast", "bug": "the bug is small", "dug": "the dog dug a pit", "hug": "i hug my dad", "jug": "the jug is full", "mug": "my mug is blue", "rug": "the rug is soft", "but": "i tried but fell", "cut": "i cut the paper", "hut": "the hut is small", "nut": "the squirrel found a nut", "gut": "my gut feels full", "shut": "please shut the gate", "ham": "i ate some ham", "jam": "i like berry jam", "ram": "the ram has horns", "yam": "the yam is soft", "dam": "the dam holds water", "clam": "the clam has a shell", "cub": "the cub is small", "rub": "i rub my hands", "tub": "the tub is full", "hub": "the wheel has a hub", "sub": "we ate a sub", "club": "i joined the art club", "dim": "the light is dim", "him": "i can help him", "rim": "the cup has a rim", "swim": "we can swim", "trim": "please trim my hair", "slim": "the pencil is slim", "gum": "i chew some gum", "hum": "we hum a song", "sum": "the sum is ten", "drum": "i tap the drum", "plum": "i ate a plum", "yum": "i say yum when i eat cake", "bell": "ring the little bell", "fell": "the leaf fell down", "sell": "we sell fresh eggs", "tell": "tell me a story", "well": "i feel well", "yell": "please do not yell", "bill": "dad paid the bill", "fill": "please fill my cup", "hill": "we run up the hill", "mill": "the mill grinds grain", "pill": "dad takes a pill", "still": "please stand very still", "back": "please come back", "pack": "i pack my bag", "sack": "the sack is full", "jack": "we use a jack to lift the car", "snack": "i need a snack", "black": "the cat is black", "kick": "i kick the ball", "brick": "the brick is red", "pick": "i pick a flower", "sick": "i feel sick", "stick": "the stick is long", "chick": "the chick is yellow", "dock": "we sit on the dock", "lock": "please lock the door", "rock": "the rock is smooth", "sock": "my sock is wet", "clock": "the clock can tick", "block": "i stack a block", "duck": "the duck can swim", "luck": "i wish you luck", "muck": "my boots have muck", "puck": "the puck slides fast", "tuck": "i tuck in my shirt", "yuck": "i say yuck when food tastes bad", "cash": "i pay with cash", "dash": "we dash to class", "mash": "we mash the yam", "splash": "we splash in puddles", "flash": "i see a flash", "trash": "put trash in the bin", "band": "the band can play", "hand": "please hold my hand", "land": "we live on land", "sand": "the sand is warm", "stand": "please stand by me", "grand": "we had a grand time", "bent": "the twig is bent", "dent": "the can has a dent", "rent": "we rent a van", "sent": "i sent a card", "tent": "we sleep in a tent", "went": "we went to the park", "best": "i did my best", "nest": "the nest has eggs", "rest": "i need some rest", "test": "i took a test", "pest": "the pest ate a leaf", "chest": "the chest holds toys", "bang": "i heard a bang", "fang": "the snake has a fang", "hang": "hang up your coat", "rang": "the bell rang twice", "sang": "we sang a song", "gang": "the whole gang came to play", "king": "the king has a crown", "ring": "my ring is shiny", "sing": "we sing a song", "wing": "the bird hurt its wing", "bring": "please bring your bag", "swing": "we swing at the park", "bank": "we went to the bank", "rank": "we rank our favorite games", "sank": "the boat sank slowly", "tank": "the tank holds water", "drank": "i drank some milk", "blank": "the page is blank", "pink": "my hat is pink", "sink": "wash in the sink", "wink": "i wink at dad", "link": "each link joins the chain", "rink": "we skate at the rink", "drink": "i drink some water", "camp": "we camp in tents", "damp": "the towel is damp", "lamp": "turn on the lamp", "ramp": "we use the ramp", "stamp": "i need a stamp", "clamp": "the clamp holds wood", "bump": "i felt a bump", "jump": "we jump for joy", "lump": "the clay has a lump", "pump": "we pump up the ball", "dump": "we dump out the sand", "stump": "we sit on a stump", "bee": "the bee can fly", "fee": "we paid the fee", "see": "i see a bird", "tree": "the tree is tall", "free": "the bird is free", "three": "i have three books", "feed": "we feed the hens", "need": "i need a hug", "seed": "we plant a seed", "reed": "the reed grows tall", "deed": "helping is a kind deed", "speed": "the car gains speed", "beep": "i heard a beep", "jeep": "the jeep is red", "keep": "please keep this safe", "peep": "we peep through the window", "sleep": "i sleep at night", "sheep": "the sheep eats grass", "day": "we play each day", "hay": "the horse eats hay", "may": "may i sit here", "pay": "we pay for milk", "say": "say it with me", "way": "show me the way", "ball": "i hit the ball", "call": "please call my dad", "fall": "leaves fall from trees", "hall": "we walk down the hall", "tall": "the pine is tall", "wall": "the wall is blue", "bake": "we bake a cake", "cake": "the cake is sweet", "lake": "we swim in the lake", "make": "we make a kite", "rake": "i rake the leaves", "snake": "the snake is long", "date": "we set a date", "gate": "please close the gate", "late": "we are not late", "mate": "the bird found a mate", "hate": "i hate getting wet", "plate": "my plate is clean", "came": "my friend came over", "game": "we play a game", "name": "please say your name", "same": "we have the same hat", "tame": "the rabbit is tame", "flame": "the flame is bright", "dine": "we dine at home", "fine": "i feel fine", "line": "stand in a line", "mine": "the red hat is mine", "nine": "i see nine stars", "pine": "the pine is tall", "hide": "we hide and seek", "ride": "we ride the bus", "side": "sit by my side", "wide": "the road is wide", "tide": "the tide comes in", "slide": "we slide down together"};
      function wordExampleSentence(word){return wordSentenceExamples[String(word).toLowerCase()] || '';}

      function speakWord(word, after, volume = 1) {
        playRecording('words', word, after, undefined, false, volume);
      }

      function keyFor(word) { return `${families[index].family}:${word}`; }
      function persistUsers() {
        try {
          // Commit a family's progress only after Words, Sentences AND its 6-question Challenge.
          // Unfinished progress remains available in this open session but is never stored.
          const committedUsers = users.map(user => {
            const completedFamilies = new Set(families.filter(f => familyIsComplete(f, user)).map(f => f.family));
            const copy = {...user};
            copy.read = (user.read || []).filter(key => completedFamilies.has(key.split(':')[0]));
            copy.found = (user.found || []).filter(key => completedFamilies.has(key.split(':')[0]));
            copy.foundSentences = (user.foundSentences || []).filter(id => {
              const sentence = sentenceById.get(id);
              return sentence && completedFamilies.has(sentence.family);
            });
            copy.familyQuiz = (user.familyQuiz || []).filter(key => completedFamilies.has(key.split(':')[0]));
            copy.familyQuizTargets = Object.fromEntries(Object.entries(user.familyQuizTargets || {}).filter(([family]) => completedFamilies.has(family)));
            return copy;
          });
          localStorage.setItem(profilesKey, JSON.stringify({ version: 1, curriculumRevision, users:committedUsers, lastUserId }));
          document.querySelector('#storageNotice').hidden = true;
        } catch {
          document.querySelector('#storageNotice').hidden = false;
        }
      }


      function updateFamilyLearningPath() {
        const path = document.getElementById('familyLearningPath');
        if (!path) return;
        const visible = !!activeUser && (!wordsPage.hidden || !sentencesPage.hidden || !familyGroupQuizPage.hidden);
        path.hidden = !visible;
        if (!visible || !families[index]) return;
        const family = families[index];
        const rows = familySentences(family.family);
        const wordDone = family.words.every(word => foundWords.has(`${family.family}:${word}`));
        const sentenceDone = rows.length === 3 && rows.every(row => foundSentences.has(row.file));
        const challengeDone = familyQuizCount(family) >= 6;
        const complete = [wordDone,sentenceDone,challengeDone];
        const current = complete.indexOf(false);
        path.dataset.completed = String(complete.filter(Boolean).length);
        path.querySelectorAll('.learning-step').forEach((step,i) => {
          const done = complete[i];
          step.classList.toggle('is-complete',done);
          step.classList.toggle('is-current',i === current);
          step.querySelector('.learning-node').textContent = String(i + 1);
          const status = done ? 'completed' : i === current ? 'next' : 'not yet started';
          step.setAttribute('aria-label',step.querySelector('.learning-label').textContent + ': ' + status);
        });
      }
      function saveProgress() {
        updateFamilyLearningPath();
        const liveProgress=activeUser?{...activeUser,found:[...foundWords],foundSentences:[...foundSentences]}:null;
        const completedFamilyCount=families.filter(item=>familyIsComplete(item,liveProgress)).length;
        const currentLevel = Math.min(completedFamilyCount + 1, families.length);
        levelCount.textContent = `${currentLevel}/${families.length}`;
        levelCount.parentElement.setAttribute('aria-label',`Families ${currentLevel} of ${families.length}`);
        if (!activeUser) return;
        activeUser.read = [...readWords];
        activeUser.found = [...foundWords];
        activeUser.foundSentences = [...foundSentences];
        activeUser.family = index;
        activeUser.familyName = families[index].family;
        // Progress is saved without forcing a full layout pass mid-question.
        // Navigation is refreshed when the learner actually changes screens.
        persistUsers();
      }

      function celebrate(symbol = '🌟', count = 1, starMultiplier = 1, withSound = true) {
        burst.classList.remove('show');
        const trophy = symbol === '🏆';
        if(trophy && withSound)playEffect('familyComplete');
        const imageReward = true; // PNG rewards for word, sentence, family quiz, and final challenge.
        burst.classList.toggle('image-stars', imageReward && !trophy);
        burst.classList.toggle('complete', trophy);
        burst.replaceChildren();
        const positions = [[18,18],[82,80],[80,18],[20,80],[50,10],[50,90],[10,50],[90,50],[68,65]];
        const sizes = [140,90,170,110,130,80,155,100,120];
        if(!trophy){
          starMultiplier *= 2;
          const basePositions=positions.slice(),baseSizes=sizes.slice();
          for(let group=1;group<starMultiplier;group++){
            positions.push(...basePositions.map(([x,y])=>[Math.max(5,Math.min(95,x+(group%2?4:-4))),Math.max(5,Math.min(95,y+(group%2?-5:5)))]));
            sizes.push(...baseSizes);
          }
        }
        const order = positions.map((_,i)=>i);
        if(imageReward) for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}

        for (let i = 0; i < Math.min(count * starMultiplier, positions.length); i++) {
          const emoji = document.createElement('span');
          emoji.className = 'celebration-emoji';
          if(imageReward){
            const image=document.createElement('img');image.src=trophy?'images/rewards/prize.png':'images/rewards/star.png';image.alt='';
            image.className='reward-image';emoji.append(image);
            if(!trophy)emoji.style.animationDelay=(i*.055)+'s';
          }else emoji.textContent = symbol;
          emoji.style.left = '50%';
          emoji.style.top = '50%';
          if (!trophy) {
            const dx = (positions[order[i]][0] - 50) * window.innerWidth / 100;
            const dy = (positions[order[i]][1] - 50) * window.innerHeight / 100;
            emoji.style.setProperty('--shoot-x', dx + 'px');
            emoji.style.setProperty('--shoot-y', dy + 'px');
            emoji.style.setProperty('--trail-angle', Math.atan2(dy, dx) * 180 / Math.PI + 'deg');
          }
          emoji.style.fontSize = trophy ? 'clamp(8rem, 32vw, 16rem)' : `clamp(${sizes[i] / 2}px, ${sizes[i] / 10}vw, ${sizes[i]}px)`;
          burst.append(emoji);
        }
        void burst.offsetWidth;
        burst.classList.add('show');
      }

      function speakCompletionPraise() {
        const userName = activeUser.name;
        const userId = activeUser.id;
        const familyIndex = index;
        const recordingId = playbackId;
        let played = false;
        const speak = () => {
          if (played || playbackId !== recordingId || activeUser?.id !== userId || index !== familyIndex || practicePage.hidden) return;
          played = true;
          const fallback = () => {
            if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
            const utterance = new SpeechSynthesisUtterance(`Great job, ${userName}!`);
            utterance.lang = 'en-US';
            utterance.rate = 0.88;
            window.speechSynthesis.speak(utterance);
          };
          const name = userName.trim().toLocaleLowerCase();
          if (name === 'ari' || name === 'elara') playRecording('praise', name, undefined, fallback);
          else { stopAudio(); fallback(); }
        };
        if (activeAudio) {
          const audio = activeAudio;
          const ended = audio.onended;
          const failed = audio.onerror;
          audio.onended = () => { if (ended) ended(); speak(); };
          audio.onerror = () => { if (failed) failed(); speak(); };
        } else speak();
      }

      function celebrateProgress(activity) {
        const wordsDone = families[index].words.filter(word => foundWords.has(keyFor(word))).length;
        const sentences = familySentences(families[index].family);
        const sentencesDone = sentences.filter(item => foundSentences.has(item.file)).length;
        if (familyIsComplete(families[index], activeUser)) {
          celebrate('🏆', 1);
          return;
        }
        const count = activity === 'words' ? wordsDone : sentencesDone;
        const total = activity === 'words' ? families[index].words.length : sentences.length;
        if (count === total) celebrate('🏆');
        else celebrate('🌟', count);
      }

      function remainingChallengeWords() {
        return families[index].words.filter((word) => !foundWords.has(keyFor(word)));
      }

      let wordChallengeStarted=false;
      function startWordSelection(){
        if(autoAdvancePending)return;
        if(target){speakWord(target);return;}
        if(wordChallengeStarted){chooseChallenge();return;}
        wordChallengeStarted=true;
        setPracticeButtonImage(challengeButton,'images/buttons/hearItAgain.png','Hear it Again');
        chooseChallenge();
      }
      function updateChallengeButton() {
        challengeButton.classList.remove('active');
        const complete = remainingChallengeWords().length === 0;
        challengeButton.disabled = complete;
        setPracticeButtonImage(challengeButton, complete ? 'images/rewards/all6WordsFound.png' : wordChallengeStarted ? 'images/buttons/hearItAgain.png' : 'images/buttons/startFamilyChallenge.png', complete ? '🏆 All 6 Words Found' : wordChallengeStarted ? 'Hear it Again' : 'Start Family Challenge');
      }

      function chooseChallenge() {
        if (autoAdvancePending) return;

        const remaining = remainingChallengeWords();
        if (!remaining.length) {
          target = null;
          updateChallengeButton();
          message.textContent = 'You found all 6 words in this family!';
          return;
        }
        target = remaining[Math.floor(Math.random() * remaining.length)];
        challengeButton.classList.add('active');
        setPracticeButtonImage(challengeButton, 'images/buttons/hearItAgain.png', 'Hear it Again');
        message.textContent = 'Listen carefully… then tap the word!';
        speakWord(target);
      }

      function handleWord(button, word) {
        if (autoAdvancePending) return;

        if (target) {
          activityStatsEvent('words',target,word===target);
          if (word === target) {
            foundWords.add(keyFor(word));
            button.classList.remove('read');
            button.classList.add('found', 'correct');
            button.disabled = true;
            setTimeout(() => button.classList.remove('correct'), 500);
            saveProgress();
            message.textContent = `Yes! You found “${word}”!`;
            target = null;
            // Preserve the current Listen artwork until the next question starts.
            // Avoid a selectWord -> hearAgain image flash on every correct answer.
            if (remainingChallengeWords().length === 0) updateChallengeButton();
            if (remainingChallengeWords().length === 0) {
              message.textContent = 'You found all 6 words! Amazing!';
            }
            celebrateProgress('words');
            if (remainingChallengeWords().length) {
              const userId = activeUser?.id, familyIndex = index;
              scheduleAutoAdvance(chooseChallenge, () => !wordsPage.hidden && activeUser?.id === userId && index === familyIndex);
            } else {
              message.textContent = '⭐ All 6 words found! Next: Sentences.';
              const userId = activeUser?.id, familyIndex = index;
              scheduleAutoAdvance(() => showSentences(), () => !wordsPage.hidden && activeUser?.id === userId && index === familyIndex);
            }
          } else {
            button.classList.add('wrong');
            setTimeout(() => button.classList.remove('wrong'), 400);
            message.textContent = `That word is “${word}.” Try again!`;
            speakWord(word, undefined, 0.4);
          }
          return;
        }
        const progressKey = keyFor(word);
        browsePopupFamily=null;
        showReadPopup({kind:'words',word,sentence:wordExampleSentence(word),after:()=>{
          readWords.add(progressKey);
          if (!foundWords.has(progressKey)) button.classList.add('read');
          saveProgress();
          message.textContent = `You heard “${word}.”`;
        }});
      }

      function render() {
        wordChallengeStarted=false;
        burst.classList.remove('show');
        sentenceTarget = null;
        if (!families.length) return;
        stopAudio();
        index = (index + families.length) % families.length;
        const item = families[index];
        const previousFamily =
            families[(index - 1 + families.length) % families.length].family;
        document.querySelector('#previous').textContent =
            `Previous Word Family (${previousFamily})`;
        const nextFamily =
            families[(index + 1) % families.length].family;
            document.querySelector('#next').textContent =
            `Next Word Family (${nextFamily})`;

        const titleEnding = document.createElement('span');
        titleEnding.className = 'family-title-ending';
        titleEnding.textContent = item.family;
        title.replaceChildren(document.createTextNode('The '), titleEnding, document.createTextNode(' Family'));
        pageCount.textContent = `Family ${index + 1} of ${families.length}`;
        grid.replaceChildren();
        target = null;

        message.textContent = '';
        item.words.forEach((word) => {
          const button = document.createElement('button');
          const progressClass = foundWords.has(keyFor(word)) ? ' found' : readWords.has(keyFor(word)) ? ' read' : '';
          button.className = `word${progressClass}`;
          button.disabled = foundWords.has(keyFor(word));
          const ending = item.family.replace('-', '');
          const endingStart = word.toLowerCase().lastIndexOf(ending);
          if (endingStart >= 0 && endingStart + ending.length === word.length) {
            const endingSpan = document.createElement('span');
            endingSpan.className = 'family-ending';
            endingSpan.textContent = word.slice(endingStart);
            button.append(document.createTextNode(word.slice(0, endingStart)), endingSpan);
          } else {
            button.textContent = word;
          }
          button.setAttribute('aria-label', `Hear the word ${word}`);
          button.addEventListener('click', () => handleWord(button, word));
          grid.append(button);
        });
        updateChallengeButton();
        saveProgress();
      }

      document.querySelector('#previous').addEventListener('click', () => { index -= 1; render(); });
      document.querySelector('#next').addEventListener('click', () => { index += 1; render(); });
      document.querySelector('#familyBack').addEventListener('click', () => { saveProgress(); showFamilySelection(true); });
      const familyExampleRecordings={"-ake": "ake, like bake", "-et": "et, like get", "-ine": "ine, like dine", "-un": "un, like bun", "-ub": "ub, like cub", "-ob": "ob, like cob", "-it": "it, like bit", "-am": "am, like ham", "-ay": "ay, like day", "-en": "en, like den", "-ip": "ip, like dip", "-ang": "ang, like bang", "-ot": "ot, like spot", "-amp": "amp, like camp", "-est": "est, like best", "-in": "in, like bin", "-im": "im, like dim", "-ee": "ee, like bee", "-ag": "ag, like bag", "-um": "um, like gum", "-ack": "ack, like back", "-and": "and, like band", "-ut": "ut, like but", "-ump": "ump, like bump", "-eep": "eep, like beep", "-ad": "ad, like bad", "-og": "og, like dog", "-an": "an, like can", "-uck": "uck, like duck", "-ame": "ame, like came", "-ick": "ick, like kick", "-ug": "ug, like bug", "-ank": "ank, like bank", "-ell": "ell, like bell", "-all": "all, like ball", "-ill": "ill, like bill", "-ide": "ide, like hide", "-ed": "ed, like bed", "-ock": "ock, like dock", "-op": "op, like hop", "-ap": "ap, like cap", "-ink": "ink, like pink", "-ing": "ing, like king", "-ig": "ig, like big", "-ent": "ent, like bent", "-ate": "ate, like date", "-ash": "ash, like cash", "-id": "id, like bid", "-at": "at, like cat", "-eed": "eed, like feed"};
      document.querySelector('#familySound').addEventListener('click', () => {

        if (autoAdvancePending) return;
        const sound = families[index].family.replace('-', '');
        playRecording('family-examples', familyExampleRecordings[families[index].family]);
      });
      challengeButton.addEventListener('click', startWordSelection);
      const startPage = document.querySelector('#startPage');
      const practicePage = document.querySelector('#practicePage');
      const nameInput = document.querySelector('#learnerName');
      const nameError = document.querySelector('#nameError');
      const nameForm = document.querySelector('#nameForm');
      const previousUserPanel = document.querySelector('#previousUserPanel');
      const previousUser = document.querySelector('#previousUser');

      function familyIsComplete(item, user) {
        if (!user) return false;
        const words = new Set(user.found || []), sentences = new Set(user.foundSentences || []), quiz = new Set(user.familyQuiz || []);
        const rows = familySentences(item.family);
        return item.words.every(w => words.has(`${item.family}:${w}`)) && item.words.filter(w => quiz.has(`${item.family}:${w}`)).length >= 6
          && rows.length === 3 && rows.every(row => sentences.has(row.file));
      }
      function unfinishedActivity(item, user, preferred) {
        if (!user) return null;
        const keys = item.words.map(w => `${item.family}:${w}`);
        const found = new Set(user.found || []), quiz = new Set(user.familyQuiz || []), sentences = new Set(user.foundSentences || []);
        const remaining = {
          words: keys.some(k => !found.has(k)),
          sentences: familySentences(item.family).some(s => !sentences.has(s.file)),
          quiz: keys.filter(k => quiz.has(k)).length < 6
        };
        if (preferred && remaining[preferred]) return preferred;
        return ['words', 'sentences', 'quiz'].find(k => remaining[k]) || null;
      }
      function continueFamily(user) {
        return families.findIndex(item => unfinishedActivity(item, user));
      }
      function nearbyUnfinishedFamily(direction) {
        for (let step=1;step<=families.length;step++) {
          const next=(index+direction*step+families.length)%families.length;
          if (unfinishedActivity(families[next],activeUser)) return next;
        }
        return index;
      }
      // Family completion waits for the learner to choose the next family.
      
      let stopFamilyFireworks = () => {};
      function startFamilyFireworks(dialog, stillCurrent = () => dialog.open) {
        stopFamilyFireworks();
        const canvas=document.createElement('canvas');
        canvas.setAttribute('popover','manual');canvas.setAttribute('aria-hidden','true');
        canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;pointer-events:none;z-index:2147483647;overflow:hidden;';
        document.body.append(canvas);
        if(canvas.showPopover)canvas.showPopover();
        const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
        let frame,particles=[],last=0,next=0,stopped=false;
        const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        function resize(){canvas.width=innerWidth;canvas.height=innerHeight;}
        resize();window.addEventListener('resize',resize);
        function explode(){
          const x=canvas.width*(.08+Math.random()*.84),y=canvas.height*(.08+Math.random()*.7);
          const hue=Math.random()*360;
          for(let i=0;i<(reduced?18:64);i++){
            const angle=Math.PI*2*i/(reduced?18:64),speed=160+Math.random()*380;
            particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1.4+Math.random()*.8,hue:hue+Math.random()*40});
          }
        }
        function stop(){if(stopped)return;stopped=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);dialog.removeEventListener('close',stop);canvas.remove();particles=[];}
        stopFamilyFireworks=stop;dialog.addEventListener('close',stop,{once:true});
        function draw(now){
          if(!stillCurrent()){stop();return;}
          const dt=Math.min((now-last)/1000||.016,.04);last=now;
          ctx.clearRect(0,0,canvas.width,canvas.height);
          if(now>=next){explode();next=now+(reduced?1400:340);}
          particles=particles.filter(p=>p.life>0);
          for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=85*dt;p.vx*=.99;
            ctx.globalAlpha=Math.min(1,p.life);ctx.fillStyle=`hsl(${p.hue},100%,65%)`;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=reduced?0:16;
            ctx.beginPath();ctx.arc(p.x,p.y,reduced?3:5,0,Math.PI*2);ctx.fill();}
          ctx.globalAlpha=1;frame=requestAnimationFrame(draw);
        }
        frame=requestAnimationFrame(draw);
      }

      function beginFamilyFinishCelebration() {
        const state = familyQuizState, userId = activeUser?.id, familyIndex = index;
        const dialog = document.getElementById('familyFinishDialog');
        let timer = null;
        const stillCurrent = () => familyQuizState === state && activeUser?.id === userId
          && index === familyIndex && !familyGroupQuizPage.hidden;
        function cleanup() {
          clearTimeout(timer);
          stopFamilyFireworks();
          stopEffects();
          burst.classList.remove('show');
          dialog.removeEventListener('close', cleanup);
          cancelFamilyCelebration = () => {};
        }
        cancelFamilyCelebration = cleanup;
        dialog.addEventListener('close', cleanup, {once:true});
        // Use the same 3.2-second prize animation as Words and Sentences.
        // Keep one continuous fireworks animation and recording through both stages.
        startFamilyFireworks(dialog, stillCurrent);
        playEffect('fireworks', {volume:.3, loop:true});
        timer = setTimeout(() => {
          timer = null;
          if (!stillCurrent()) { cleanup(); return; }
          burst.classList.remove('show');
          showFamilyFinishCelebration();
        }, 3200);
      }

      function showFamilyFinishCelebration() {
        const dialog = document.getElementById('familyFinishDialog');
        const next = nearbyUnfinishedFamily(1);
        const hasNext = next !== index;
        const currentFamily = families[index].family;
        document.getElementById('familyFinishTitle').textContent = `${currentFamily} Family Complete!`;
        
        const button = document.getElementById('familyFinishContinue');
        button.textContent = hasNext ? `Continue to ${families[next].family} Family →` : 'Back to Home';
        button.onclick = () => {
          dialog.close();
          if (hasNext) resumeFamily(next); else showFamilySelection();
        };
        // Outside clicks dismiss the prize, revealing the completed Family Challenge screen.
        // Clicking the Continue button still opens the named next family.
        dialog.onclick = event => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
          if (outside) { dialog.close(); }
        };

        if (!dialog.open) dialog.showModal();

        }
      function openFamily(familyIndex) {
        if (activeUser && familyIsComplete(families[familyIndex], activeUser)) {
          stopAudio();
          showWordsAt(familyIndex);
          return;
        }
        resumeFamily(familyIndex);
      }
      function resumeFamily(familyIndex, preferred) {
        if (!activeUser) return;
        const start = (familyIndex + families.length) % families.length;
        for (let offset = 0; offset < families.length; offset++) {
          const next = (start + offset) % families.length;
          const activity = unfinishedActivity(families[next], activeUser, offset === 0 ? preferred : null);
          if (!activity) continue;
          stopAudio(); closeWordHub(); index = next;
          familyGroupQuizPage.hidden = true;
          if (activity === 'words') { showWordsAt(index); }
          else if (activity === 'sentences') { render(); showSentences(); }
          else { render(); showFamilyQuizActivity(); }
          syncLayout(); window.scrollTo({top: 0, behavior: 'instant'});
          return;
        }
        showFamilySelection();
        document.querySelector('#practiceSummary').textContent = '🏆 All families complete!';
        syncLayout();
      }
      function updateContinueDetail() {
        const user = users.find(u => u.id === previousUser.value);
        document.querySelector('#continuePractice').disabled = !user;
        document.querySelector('#continueDetail').textContent = user
          ? (continueFamily(user) < 0 ? 'All families complete!' : `${families[continueFamily(user)].family} family · Next unfinished activity`) : '';
      }
      previousUser.addEventListener('change', updateContinueDetail);
      document.querySelector('#continuePractice').addEventListener('click', () => {
        const user = users.find(u => u.id === previousUser.value);
        if (user) { startUser(user); }
      });
      function showUserPicker() {
        usageEnd();
        familyGroupQuizPage.hidden = true;
        closeWordHub();
        stopAudio();
        sentenceTarget = null;
        target = null;
        burst.classList.remove('show');
        practicePage.hidden = true;
        startPage.hidden = false;
        // On returning to the login screen, restore access to Parent Settings immediately.
        const parentSettingsNav = document.getElementById('parentSettingsButton');
        if (parentSettingsNav) {
          parentSettingsNav.disabled = false;
          parentSettingsNav.removeAttribute('aria-disabled');
          parentSettingsNav.classList.remove('header-inactive');
        }
        syncLayout();
        nameError.hidden = true;
        previousUser.replaceChildren();
        users.forEach(user => {
          const option = document.createElement('option');
          option.value = user.id;
          option.textContent = user.name;
          previousUser.append(option);
        });
        if (users.some(user => user.id === lastUserId)) previousUser.value = lastUserId;
        previousUserPanel.hidden = users.length === 0;
        nameForm.hidden = users.length > 0;
        document.querySelector('#cancelNewUser').hidden = users.length === 0;
        updateContinueDetail();
      }

      function startUser(user, resume = false) {
        usageStart(user);
        stopAudio();
        activeUser = user;
        lastUserId = user.id;
        readWords.clear();
        foundWords.clear();
        foundSentences.clear();
        user.read.forEach(key => readWords.add(key));
        user.found.forEach(key => foundWords.add(key));
        (user.foundSentences || []).forEach(id => foundSentences.add(id));
        index = resume && continueFamily(user) >= 0 ? continueFamily(user) : cleanIndex(user.family);
        const heading = document.querySelector('#learnerTitle');
        heading.textContent = user.name;
        document.querySelector('#learnerFooter').textContent = 'Elara and Ari • Love, Dad';
        startPage.hidden = true;
        practicePage.hidden = false;
        burst.classList.remove('show');
        render();
        showFamilySelection(); // All players land on Home after login; saved progress remains available.
      }

      document.querySelector('#userForm').addEventListener('submit', event => {
        event.preventDefault();
        const user = users.find(user => user.id === previousUser.value);
        if (user) startUser(user);
      });
      document.querySelector('#createNewUser').addEventListener('click', () => {
        previousUserPanel.hidden = true;
        nameForm.hidden = false;
        nameInput.value = '';
        nameError.hidden = true;
        document.querySelector('#cancelNewUser').hidden = false;
        nameInput.focus();
      });
      // Remove only the selected player's records; shared maps contain other learners.
      function clearPlayerRecords(playerId) {
        for (const key of [activityStatsKey, wordStatsKey, usageKey, helpStorageKey]) {
          const records = readStoredRecord(key);
          delete records[playerId];
          try { localStorage.setItem(key, JSON.stringify(records)); } catch {}
        }
        for (const key of [
          `ari-elara-word-quiz-core50-v1:${playerId}`,
          `ari-elara-sentence-quiz-core50-v1:${playerId}`,
        ]) {
          try { localStorage.removeItem(key); } catch {}
        }
      }
      document.querySelector('#deleteUser').addEventListener('click', () => {
        const user = users.find(user => user.id === previousUser.value);
        if (!user || !confirm(`Delete ${user.name}? This removes their saved stars, word highlights, and family progress from this device.`)) return;
        if (usageSession?.userId === user.id) usageEnd();
        clearPlayerRecords(user.id);
        users = users.filter(item => item.id !== user.id);
        if (activeUser?.id === user.id) {
          activeUser = null;
          readWords.clear();
          foundWords.clear();
        foundSentences.clear();
          index = 0;
        }
        if (lastUserId === user.id) lastUserId = users[0]?.id || null;
        persistUsers();
        nameInput.value = '';
        showUserPicker();
        if (users.length) previousUser.focus();
        else nameInput.focus();
      });
      document.querySelector('#cancelNewUser').addEventListener('click', showUserPicker);
      nameForm.addEventListener('submit', event => {
        event.preventDefault();
        const name = cleanName(nameInput.value);
        const existing = users.find(user => nameKey(user.name) === nameKey(name));
        if (!name || existing) {
          nameError.textContent = existing ? 'That name is already saved. Choose it from previous users.' : 'Type your name to start.';
          nameError.hidden = false;
          nameInput.focus();
          return;
        }
        nameError.hidden = true;
        const user = { id: crypto.randomUUID(), name, read: [], found: [], foundSentences: [], family: 0 };
        users.push(user);
        startUser(user);
      });
      document.querySelector('#changeName').addEventListener('click', () => {
        saveProgress();
        showUserPicker();
        previousUser.focus();
      });
      document.querySelector('#resetProgress').addEventListener('click', () => {
        const selectedId = document.getElementById('parentPlayerSelect')?.value;
        const target = users.find(user => user.id === selectedId) || activeUser;
        if (!target || !confirm(`Reset ALL progress and statistics for ${target.name}? This clears stars, lesson progress, incorrect answers, word-building attempts, repeated listens, activity reports, and challenge results. Other users will not be affected.`)) return;
        const isPlaying = activeUser?.id === target.id;
        target.allWordsQuizRound = null;
        target.allWordsQuizTotals = { correct: 0, wrong: 0 };
        target.familyQuiz = []; target.familyQuizTargets = {};
        target.read = []; target.found = []; target.foundSentences = [];
        target.family = 0;
        target.familyName = families[0].family;
        clearPlayerRecords(target.id);
        // An in-flight usage session must not restore the cleared history on its next commit.
        if (usageSession?.userId === target.id) usageSession = null;
        if (isPlaying) {
          closeWordHub();
          readWords.clear(); foundWords.clear(); foundSentences.clear();
          index = 0;
          burst.classList.remove('show');
          if (wordsPage.hidden) showFamilySelection();
          else render();
        }
        persistUsers();
        updateAllQuizTotals(target, true);
        usageRender();
      });
      // Extra activities use separate per-user quiz storage; original family activities remain intact.
      const hub = document.querySelector('#allWordsPage');
      const q = id => document.getElementById(id);
      const entries = families.flatMap(f => f.words.map(word => ({word, family:f.family})));
      const vocabulary = [...new Set(entries.map(e => e.word))];
      const shuffle = list => { const a=[...list]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
      let quizState=null, quizBusy=false, quizAudioTicket=0, quizMode='words';
      const quizKey = () => `ari-elara-word-quiz-core50-v1:${activeUser.id}`;
      function quizHistory(user = activeUser) { try { if (!user) return []; const x=JSON.parse(localStorage.getItem(`ari-elara-word-quiz-core50-v1:${user.id}`)||'[]'); return Array.isArray(x)?x.filter(r=>r && Array.isArray(r.answers)).slice(-100):[]; } catch {return [];} }
      const sentenceStoreKey = user => `ari-elara-sentence-quiz-core50-v1:${user.id}`;
      function sentenceRecord(user=activeUser){
        try { const value=JSON.parse(localStorage.getItem(sentenceStoreKey(user))||'{}');return value && typeof value==='object' ? value : {}; } catch { return {}; }
      }
      function sentenceRound(user=activeUser){return window.sentenceChallenge.cleanRound(sentenceRecord(user).round);}
      function sentenceHistory(user=activeUser){const value=sentenceRecord(user).history;return Array.isArray(value)?value.filter(r=>r&&Array.isArray(r.answers)).slice(-100):[];}
      function writeSentenceRecord(value){try{localStorage.setItem(sentenceStoreKey(activeUser),JSON.stringify(value));return true;}catch{q('quizFeedback').textContent='Progress could not be saved in this browser.';return false;}}
      function challengeUnit(){return quizMode==='sentences'?'sentence':'word';}
      function challengeListenImage(){return `images/buttons/listenAndSelect${quizMode==='sentences'?'Sentence':'Word'}.png`;}
      function resetQuizHistory(){ if(activeUser)try{localStorage.removeItem(quizKey());}catch{} }
      function closeWordHub(){cancelQuizAdvance();hub.hidden=true;quizAudioTicket++;quizBusy=false;quizState=null;}
      function hubStop(){cancelQuizAdvance();quizAudioTicket++;quizBusy=false;stopAudio();}
      function setupQuiz(){
        ensureFinalRecord();q('quizCheckpoint').hidden=true;hubStop();quizState=null;
        q('quizSetup').hidden=false;q('quizRound').hidden=true;q('quizResults').hidden=true;
        q('changeChallengeMode').hidden=true;q('quizSetupMessage').textContent='';
        q('quizPanel').classList.remove('sentence-challenge');
        const wordRound=cleanQuizRound(activeUser?.allWordsQuizRound),sentences=sentenceRound();
        q('chooseWordChallenge').setAttribute('aria-label',wordRound?`Word Challenge — resume at question ${wordRound.position+1} of 50`:'Word Challenge');
        q('chooseSentenceChallenge').setAttribute('aria-label',sentences?`Sentence Challenge — resume at question ${sentences.position+1} of 50`:'Sentence Challenge');
      }
      function choosePlayerChallenge(mode){quizMode=mode;q('startQuiz').onclick();}
      q('chooseWordChallenge').onclick=()=>choosePlayerChallenge('words');
      q('chooseSentenceChallenge').onclick=()=>choosePlayerChallenge('sentences');
      q('changeChallengeMode').onclick=()=>{saveQuizRound();choosePlayerChallenge(quizMode==='sentences'?'words':'sentences');q('changeChallengeMode').focus();};
      function renderBrowse(){
        const term=q('browseFamilyFilter').value;
        const results=q('browseResults');results.replaceChildren();
        const prompt=q('browsePanel').querySelector('.prompt');
        prompt.textContent=term?'Tap a word to explore its sounds.':'Tap the Family to Explore its Words';
        if(!term){
          const grid=document.createElement('div');grid.className='browse-words browse-families';
          families.forEach(f=>{
            const b=document.createElement('button');b.type='button';b.className='browse-word browse-family';
            b.textContent=f.family;b.setAttribute('aria-label',`Explore ${f.family} family words`);
            b.onclick=()=>{hubStop();q('browseFamilyFilter').value=f.family;renderBrowse();};grid.append(b);
          });results.append(grid);
          q('browseCount').textContent=`${families.length} families`;
          return;
        }
        const index=families.findIndex(f=>f.family===term);if(index<0)return;
        const f=families[index];
        const navigation=document.createElement('nav');navigation.className='browse-family-navigation';
        navigation.setAttribute('aria-label','Explore neighboring families');
        const navigate=offset=>{hubStop();q('browseFamilyFilter').value=families[(index+offset+families.length)%families.length].family;renderBrowse();};
        const previous=document.createElement('button');previous.type='button';previous.className='nav';
        familyLabel(previous,'⬅ ',families[(index-1+families.length)%families.length].family);
        previous.setAttribute('aria-label','Previous family '+families[(index-1+families.length)%families.length].family);
        previous.onclick=()=>navigate(-1);
        const back=document.createElement('button');back.type='button';back.className='nav';back.textContent='Family List';
        back.onclick=()=>{hubStop();q('browseFamilyFilter').value='';renderBrowse();};
        const next=document.createElement('button');next.type='button';next.className='nav';
        familyLabel(next,'',families[(index+1)%families.length].family,' ➡');
        next.setAttribute('aria-label','Next family '+families[(index+1)%families.length].family);
        next.onclick=()=>navigate(1);
        navigation.append(previous,back,next);results.append(navigation);
        const h=document.createElement('h3');familyLabel(h,'',f.family,' Family');
        const grid=document.createElement('div');grid.className='browse-words';
        f.words.forEach(w=>{const b=document.createElement('button');b.type='button';b.className='browse-word';familyWord(b,w,f.family);b.setAttribute('aria-label',`Explore ${w}`);b.onclick=()=>{hubStop();browsePopupFamily=f.family;showReadPopup({kind:'words',word:w,sentence:wordExampleSentence(w),after:()=>{}});};grid.append(b);});
        results.append(h,grid);q('browseCount').textContent=`${f.words.length} words`;
      }
      q('browseFamilyFilter').replaceChildren(new Option('Choose a Family', ''));
      families.forEach(f=>q('browseFamilyFilter').add(new Option(f.family+' Family',f.family)));
      q('browseFamilyFilter').onchange=()=>{hubStop();renderBrowse();};
      q('openAllWords').onclick=()=>{q('browseFamilyFilter').value='';stopAudio();sentenceTarget=null;target=null;homePage.hidden=true;wordsPage.hidden=true;sentencesPage.hidden=true;hub.hidden=false;q('browsePanel').hidden=false;q('quizPanel').hidden=true;renderBrowse();q('allWordsTitle').focus();};
      q('allWordsBack').onclick=()=>{hubStop();closeWordHub();showFamilySelection(true);};
      q('browseTab').onclick=()=>{q('browseFamilyFilter').value='';saveQuizRound();hubStop();quizState=null;q('browsePanel').hidden=false;q('quizPanel').hidden=true;renderBrowse();};
      q('quizTab').onclick=()=>{q('browsePanel').hidden=true;q('quizPanel').hidden=false;setupQuiz();q('chooseWordChallenge').focus();};
      function quizPool(){ return [...vocabulary]; }
      // Player Trivia: distractors should look alike at the beginning (hat / hate / hay),
      // rather than being unrelated random words. Use words already taught in this level.
      function quizOptions(word){
        if(quizMode==='sentences')return window.sentenceChallenge.options(word,shuffle);
        const alternatives = shuffle(quizState.pool.filter(w => w !== word));
        const commonStart = (a,b) => {
          let i=0; while(i<a.length && i<b.length && a[i]===b[i]) i++;
          return i;
        };
        // Prefer the same first two letters, then the same first letter.
        // Within each group, prefer similar word lengths to make meaningful choices.
        alternatives.sort((a,b) => {
          const score = w => {
            const n=commonStart(word.toLowerCase(),w.toLowerCase());
            return (n>=2 ? 200 : n===1 ? 100 : 0) + Math.min(n,4)*10 - Math.abs(w.length-word.length);
          };
          return score(b)-score(a);
        });
        return shuffle([word, ...alternatives.slice(0,5)]);
      }
      // Count every answer selection, including retries, and keep a per-user record.
      function roundResponseScore(round) {
        if(!round)return {correct:0,total:0};
        return {correct:round.answers.length,total:round.answers.reduce((n,a)=>n+a.attempts,0)+(!round.solved?(round.attempts||0):0)};
      }
      function finalChallengeScore(){if(quizMode==='sentences')return roundResponseScore(quizState||sentenceRound()||sentenceHistory().at(-1));const history=activeUser?quizHistory():[];return roundResponseScore(quizState||cleanQuizRound(activeUser?.allWordsQuizRound)||history.at(-1));}
      function ensureFinalRecord(){
        if(!activeUser)return;
        const rounds=[...quizHistory(),...(cleanQuizRound(activeUser.allWordsQuizRound)?[cleanQuizRound(activeUser.allWordsQuizRound)]:[])];
        const inferred=rounds.reduce((n,r)=>{const score=roundResponseScore(r);n.correct+=score.correct;n.wrong+=score.total-score.correct;return n;},{correct:0,wrong:0});
        const saved=cleanQuizTotals(activeUser.allWordsQuizTotals);
        activeUser.allWordsQuizTotals={correct:Math.max(saved.correct,inferred.correct),wrong:Math.max(saved.wrong,inferred.wrong)};
        persistUsers();
      }
      function updateAllQuizTotals(displayUser = activeUser, parentView = false){
        const historyForUser = quizHistory(displayUser);
        const latestRound = parentView ? (cleanQuizRound(displayUser?.allWordsQuizRound) || historyForUser.at(-1)) : null;
        const score = parentView ? roundResponseScore(latestRound) : finalChallengeScore();
        const saved=cleanQuizTotals(displayUser?.allWordsQuizTotals);
        const text=`Current / Latest Round · Correct answers: ${score.correct} · Total responses: ${score.total}`;
        // Parent report elements are updated only when the parent dialog is open.
        // Quiz responses must never mutate a hidden report panel while trivia runs.
        const shouldRenderParent = parentView && document.getElementById('parentSettings')?.open;
        if (!shouldRenderParent) {
          if (!parentView && q('allWordsQuizTotals').textContent !== text) q('allWordsQuizTotals').textContent = text;
          return;
        }
        if(q('finalRoundRecord').textContent!==text)q('finalRoundRecord').textContent=text;
        const record=`Saved Record · Correct answers: ${saved.correct} · Total responses: ${saved.correct+saved.wrong}`;
        if(q('finalSavedRecord').textContent!==record)q('finalSavedRecord').textContent=record;
        if(!parentView && q('allWordsQuizTotals').textContent!==text)q('allWordsQuizTotals').textContent=text;
        const heading=`${displayUser?.name||''} — Word Challenge Results`;
        if(q('finalRecordTitle').textContent!==heading)q('finalRecordTitle').textContent=heading;
        const history=historyForUser,signature=JSON.stringify({userId:displayUser?.id,history});
        if(q('finalHistoryRecord').dataset.history!==signature){
          q('finalHistoryRecord').dataset.history=signature;q('finalHistoryRecord').replaceChildren();
          if(history.length){
            const table=document.createElement('table'),caption=document.createElement('caption');caption.textContent='Completed Rounds';table.append(caption);
            const head=table.createTHead().insertRow();
            for(const label of ['Date','Correct answers','Total responses']){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}
            const body=table.createTBody();
            for(const round of [...history].reverse()){
              const score=roundResponseScore(round),row=body.insertRow();
              const date=new Date(round.date);for(const value of [Number.isNaN(date.getTime())?'Saved round':date.toLocaleDateString(),score.correct,score.total])row.insertCell().textContent=value;
            }
            q('finalHistoryRecord').append(table);
          }
        }

      }
      function trackAllQuizSelection(correct){
        if(!activeUser || quizMode==='sentences')return;
        const saved=cleanQuizTotals(activeUser.allWordsQuizTotals);saved[correct?'correct':'wrong']++;
        activeUser.allWordsQuizTotals=saved;persistUsers();
      }
let quizAdvanceTimer = null;
      function cancelQuizAdvance() { if (quizAdvanceTimer !== null) clearTimeout(quizAdvanceTimer); quizAdvanceTimer = null; }
      function scheduleQuizAdvance() {
        cancelQuizAdvance();
        const state = quizState, userId = activeUser?.id, position = state?.position;
        quizAdvanceTimer = setTimeout(() => {
          quizAdvanceTimer = null;
          if (quizState !== state || activeUser?.id !== userId || state?.position !== position || !state.solved || q('quizPanel').hidden || q('quizRound').hidden) return;
          q('quizNext').onclick();
        }, 2000);
      }
            function setQuizButtons(){q('quizHear').disabled=!quizState||quizState.solved; q('quizChoices').querySelectorAll('button').forEach(b=>b.disabled=!quizState?.heard||quizState?.solved);q('quizNext').disabled=quizBusy;}
      function quizPlay(word,done){const ticket=++quizAudioTicket;quizBusy=true;setQuizButtons();playRecording(quizMode==='sentences'?'sentences':'words',word,()=>{if(ticket!==quizAudioTicket)return;quizBusy=false;done?.();setQuizButtons();},()=>{if(ticket!==quizAudioTicket)return;quizBusy=false;q('quizFeedback').textContent='Sound could not play. Tap Hear Again to retry.';setQuizButtons();});}
      let playerChallengeStarted=false;
      function hearQuiz(){
        if(!quizState||quizState.solved)return;
        playerChallengeStarted=true;quizState.heard=true;
        setPracticeButtonImage(q('quizHear'),'images/buttons/hearItAgain.png','Hear it Again');
        q('quizFeedback').textContent='Listen carefully…';
        quizPlay(quizState.targets[quizState.position],()=>{
          quizState.heard=true;q('quizFeedback').textContent=`Tap the ${challengeUnit()} you heard.`;
        });
      }
      function saveQuizRound() {
        if (!activeUser || !quizState || quizState.position >= quizState.targets.length) return;
        const savedRound = {
          targets: [...quizState.targets], position: quizState.position,
          answers: quizState.answers.map(a => ({...a})), attempts: quizState.attempts || 0,
          solved: !!quizState.solved, options: quizState.options ? [...quizState.options] : null
        };
        if(quizMode==='sentences'){const record=sentenceRecord();record.round=savedRound;writeSentenceRecord(record);}
        else {activeUser.allWordsQuizRound=savedRound;persistUsers();}
      }
      function showQuizQuestion(resuming = false) {
        hubStop();
        q('quizCheckpoint').hidden = true;
        if (!resuming) { quizState.attempts = 0; quizState.solved = false; quizState.options = null; }
        quizState.heard = false;
        q('quizCounter').textContent = `Question ${quizState.position + 1} of ${quizState.targets.length}`;
        q('triviaQuestionCount').textContent = q('quizCounter').textContent;
        q('quizFeedback').textContent = quizState.solved ? 'Correct! Next question in 2 seconds…' : `Tap Listen & Select the ${quizMode==='sentences'?'Sentence':'Word'} to start.`;
        setPracticeButtonImage(q('quizHear'), playerChallengeStarted ? 'images/buttons/hearItAgain.png' : challengeListenImage(), playerChallengeStarted ? 'Hear it Again' : `Listen & Select the ${quizMode==='sentences'?'Sentence':'Word'}`);
        q('quizNext').hidden = true;
        q('quizNext').textContent=quizState.position+1===quizState.targets.length?'See My Results':`Next ${quizMode==='sentences'?'Sentence':'Word'}`;
        q('quizChoices').replaceChildren();
        const word = quizState.targets[quizState.position];
        if (!quizState.options) quizState.options = quizOptions(word);
        quizState.options.forEach(w => {
          const b = document.createElement('button'); b.className = 'quiz-choice'; b.type = 'button'; if(quizMode==='sentences')familySentence(b,sentenceById.get(w));else familyWord(b,w,wordFamily(w));
          if (quizState.solved && w === word) b.classList.add('right');
          b.onclick = () => answerQuiz(w, b); q('quizChoices').append(b);
        });
        setQuizButtons(); saveQuizRound();updateAllQuizTotals();
        if(quizState.solved){const state=quizState;scheduleQuizAdvance();}
      }
      function answerQuiz(word,button){if(!quizState||!quizState.heard||quizState.solved)return;hubStop();quizState.attempts++;const correct=word===quizState.targets[quizState.position];trackAllQuizSelection(correct);activityStatsEvent(quizMode==='sentences'?'final-sentences':'final',quizMode==='sentences'?window.sentenceChallenge.text(quizState.targets[quizState.position]):quizState.targets[quizState.position],correct);if(!correct){saveQuizRound();updateAllQuizTotals();button.classList.add('wrong');q('quizFeedback').textContent='Try again!';quizPlay(quizState.targets[quizState.position],()=>{q('quizFeedback').textContent=`Try again! Listen for the ${challengeUnit()} you need to find.`;});return;}quizState.solved=true;quizState.answers.push({word,attempts:quizState.attempts});saveQuizRound();button.classList.add('right');q('quizFeedback').textContent='Correct! Next question in 2 seconds…';q('quizNext').hidden=true;q('quizNext').textContent=quizState.position+1===quizState.targets.length?'See My Results':`Next ${quizMode==='sentences'?'Sentence':'Word'}`;setQuizButtons();updateAllQuizTotals();celebrate('🎉',Math.min(quizState.answers.length,9));const state=quizState;scheduleQuizAdvance();}
      q('startQuiz').onclick = () => {
        playerChallengeStarted=false;hubStop();
        const sentences=quizMode==='sentences';
        const saved=sentences?sentenceRound():cleanQuizRound(activeUser?.allWordsQuizRound);
        const targets=saved?.targets || (sentences?window.sentenceChallenge.targets(families,shuffle):shuffle(families.map(f=>f.words[Math.floor(Math.random()*f.words.length)])));
        if(!targets){q('quizSetupMessage').textContent='Not enough matching sentences are available for a 50-question round.';return;}
        quizState=saved?{...saved,pool:sentences?[]:[...vocabulary]}:{pool:sentences?[]:[...vocabulary],targets,position:0,answers:[],level:sentences?'three-sentence-choices':'six-choices',scope:sentences?'one-sentence-per-family':'one-random-word-per-family'};
        q('quizPanel').classList.toggle('sentence-challenge',sentences);
        q('finalChallengeInstruction').textContent=`Listen, then choose the ${challengeUnit()} you hear.`;
        q('quizSetup').hidden=true;q('quizResults').hidden=true;q('quizRound').hidden=false;q('changeChallengeMode').hidden=false;
        const switchLabel=sentences?'Word Challenge':'Sentence Challenge';
        q('changeChallengeMode').querySelector('.challenge-switch-label').textContent=switchLabel;
        q('changeChallengeMode').setAttribute('aria-label',`Switch to ${switchLabel}`);
        showQuizQuestion(!!saved);
        // A challenge selection is also the learner's request to hear its prompt.
        hearQuiz();
      };
      q('quizHear').onclick=hearQuiz;
      q('quizNext').onclick=()=>{
        if(!quizState?.solved||quizBusy)return;
        if(++quizState.position<quizState.targets.length){showQuizQuestion();hearQuiz();return;}
        let saved=true;
        const result={date:new Date().toISOString(),level:quizState.level,scope:quizState.scope,answers:quizState.answers};
        if(quizMode==='sentences'){
          const record=sentenceRecord();record.round=null;record.history=[...sentenceHistory(),result].slice(-100);saved=writeSentenceRecord(record);
        }else{
          activeUser.allWordsQuizRound=null;persistUsers();
          try{localStorage.setItem(quizKey(),JSON.stringify([...quizHistory(),result].slice(-100)));}catch{saved=false;}
        }
        q('quizRound').hidden=true;q('quizResults').hidden=false;q('quizSummary').replaceChildren();
        for(const line of ['🏆',`${quizMode==='sentences'?'Sentence':'Word'} Challenge complete!`,'Your results are in Parent Settings.',...(saved?[]:['This browser could not save your quiz results.'])]){
          const p=document.createElement('p');if(line==='🏆'){const image=document.createElement('img');image.src='images/rewards/prize.png';image.alt='Challenge complete';image.style.cssText='display:block;width:120px;height:120px;object-fit:contain;margin:auto';p.append(image);}else p.textContent=line;q('quizSummary').append(p);
        }celebrate('🏆');
      };
      q('quizAgain').onclick=()=>q('startQuiz').onclick();

      // A six-question, three-choice listening quiz using only the current family's words.
      const familyGroupQuizPage = document.getElementById('familyGroupQuizPage');
      function showFamilyQuizActivity() {
        stopAudio(); sentenceTarget = null; target = null; updateSentenceChallenge();
        sentencesPage.hidden = true; homePage.hidden = true; wordsPage.hidden = true;
        hub.hidden = true; familyGroupQuizPage.hidden = false;
        resetFamilyWordQuiz();
        document.getElementById('familyWordHear').focus();
        if(!familyQuizState.complete)fq('familyWordHear').click();
      }
      document.getElementById('openFamilyGroupQuiz').addEventListener('click', () => resumeFamily(index, 'quiz'));
      document.getElementById('familyQuizBack').addEventListener('click', () => { stopAudio(); showSentences(); });
      document.getElementById('familyQuizFamilies').addEventListener('click', () => { stopAudio(); saveProgress(); showFamilySelection(true); });
      function familyQuizCount(item) {
        const saved = new Set(activeUser?.familyQuiz || []);
        return Math.min(6,item.words.filter(word => saved.has(`${item.family}:${word}`)).length);
      }
      function recordFamilyQuizWord(word) {
        if (!activeUser) return true;
        const saved = new Set(activeUser.familyQuiz || []);
        saved.add(`${families[index].family}:${word}`);
        activeUser.familyQuiz = [...saved];
        saveProgress();
        try {
          const stored = JSON.parse(localStorage.getItem(profilesKey) || 'null');
          return !!stored?.users?.find(u => u.id === activeUser.id)?.familyQuiz?.includes(`${families[index].family}:${word}`);
        } catch { return false; }
      }
      let familyQuizState = null;
      let familyQuizBusy = false;
      const fq = id => document.getElementById(id);
      function cancelFamilyQuizAudio() {
        if (familyQuizBusy && familyQuizState) familyQuizState.heard = false;
        familyQuizBusy = false;
        updateFamilyQuizControls();
      }
      function updateFamilyQuizControls() {
        fq('familyWordHear').disabled = !familyQuizState || familyQuizState.solved || familyQuizState.complete;
        fq('familyWordChoices').querySelectorAll('button').forEach(b => {
          b.disabled = !familyQuizState?.heard || familyQuizState?.solved;
        });
      }
      function cleanFamilyQuizTargets(value) {
        const result={};
        for(const item of families){
          const targets=value?.[item.family];
          if(Array.isArray(targets)&&targets.length===6&&new Set(targets).size===6&&targets.every(w=>item.words.includes(w)))result[item.family]=targets;
        }
        return result;
      }
      function resetFamilyWordQuiz() {
        familyQuizBusy = false;
        const item=families[index],saved=new Set(activeUser.familyQuiz||[]);
        activeUser.familyQuizTargets=cleanFamilyQuizTargets(activeUser.familyQuizTargets);
        let targets=activeUser.familyQuizTargets[item.family];
        if(!targets){
          const done=item.words.filter(w=>saved.has(keyFor(w))).slice(0,6);
          targets=shuffle([...done,...shuffle(item.words.filter(w=>!saved.has(keyFor(w)))).slice(0,6-done.length)]);
          activeUser.familyQuizTargets[item.family]=targets;persistUsers();
        }
        familyQuizState={words:targets.filter(w=>!saved.has(keyFor(w))),position:0,heard:false,solved:false,complete:false};
        fq('familyWordTitle').textContent=`Find the ${item.family} Family Word`;
        if(familyQuizCount(item)===6){familyQuizState.complete=true;fq('familyWordChoices').replaceChildren();fq('familyWordCounter').textContent='6 of 6 words found!';setPracticeButtonImage(fq('familyWordHear'), 'images/rewards/all6WordsFound.png', '🏆 All 6 Words Found');updateFamilyQuizControls();return;}
        renderFamilyWordQuestion();
      }
      function renderFamilyWordQuestion() {
        const state = familyQuizState;
        state.heard = false; state.solved = false;
        fq('familyWordCounter').textContent = `Question ${familyQuizCount(families[index]) + 1} of 6`;
        const headingCounter=document.getElementById('familyQuestionProgress');
        if(headingCounter)headingCounter.textContent=fq('familyWordCounter').textContent;
        fq('familyWordFeedback').textContent = '';
        setPracticeButtonImage(fq('familyWordHear'), 'images/buttons/hearItAgain.png', 'Hear the Word');
        fq('familyWordNext').hidden = true;
        fq('familyWordChoices').replaceChildren();
        const targetWord = state.words[state.position];
        const choices = shuffle([targetWord, ...shuffle(families[index].words.filter(w => w !== targetWord)).slice(0, 2)]);
        choices.forEach(word => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'quiz-choice'; familyWord(b,word,families[index].family);
          b.addEventListener('click', () => answerFamilyWord(word, b));
          fq('familyWordChoices').append(b);
        });
        updateFamilyQuizControls();
      }
      function playFamilyQuizWord(word, after, volume = 1) {
        const state = familyQuizState;
        playRecording('words', word, () => {
          if (familyQuizState !== state || familyGroupQuizPage.hidden) return;
          familyQuizBusy = false; after(); updateFamilyQuizControls();
        }, () => {
          familyQuizBusy = false;
          fq('familyWordFeedback').textContent = 'Sound could not play. Tap Hear Again to retry.';
          updateFamilyQuizControls();
        }, false, volume);
        familyQuizBusy = true; updateFamilyQuizControls();
      }
      fq('familyWordHear').addEventListener('click', () => {
        if (!familyQuizState || autoAdvancePending || familyQuizState.solved || familyQuizState.complete) return;
        // Switching to this quiz ends the sentence challenge without recording a sentence answer.
        sentenceTarget = null; updateSentenceChallenge();
        fq('familyWordFeedback').textContent = 'Listen carefully…';
        playFamilyQuizWord(familyQuizState.words[familyQuizState.position], () => {
          familyQuizState.heard = true;
          setPracticeButtonImage(fq('familyWordHear'), 'images/buttons/hearItAgain.png', 'Hear Again');
          fq('familyWordFeedback').textContent = 'Tap the word you heard.';
        });
        familyQuizState.heard = true;
        updateFamilyQuizControls();
      });
      function answerFamilyWord(word, button) {
        const state = familyQuizState;
        if (!state || !state.heard || state.solved || state.complete) return;
        stopAudio();
        state.heard = true;
        activityStatsEvent('family',state.words[state.position],word===state.words[state.position]);
        if (word !== state.words[state.position]) {
          button.classList.add('wrong');
          fq('familyWordFeedback').textContent = 'Try again!';
          playFamilyQuizWord(word, () => {
            state.heard = true;
            fq('familyWordFeedback').textContent = 'Try again! Hear Again repeats the word to find.';
          }, 0.4);
          return;
        }
        state.solved = true; button.classList.add('right');
        const resultSaved = recordFamilyQuizWord(word);
        if(familyQuizCount(families[index])===6)setPracticeButtonImage(fq('familyWordHear'),'images/rewards/all6WordsFound.png','All 6 Words Found');
        fq('familyWordFeedback').textContent = resultSaved ? 'Correct!' : 'Correct! Progress could not be saved in this browser.';
        fq('familyWordNext').hidden = true;
        fq('familyWordNext').textContent = state.position + 1 === state.words.length ? 'Finish Challenge' : 'Next Word';
        updateFamilyQuizControls();
        if (state.position + 1 === state.words.length) {
          // Finish in this tap so the prize, fireworks and sound start together.
          fq('familyWordNext').click();
          return;
        }
        celebrate('🎉', Math.min(state.position + 1, 9), 2);
        scheduleAutoAdvance(() => fq('familyWordNext').click(), () => !familyGroupQuizPage.hidden && familyQuizState === state);
      }
      fq('familyWordNext').addEventListener('click', () => {
        if (!familyQuizState?.solved || familyQuizBusy || familyQuizState.complete) return;
        stopAudio();
        if (++familyQuizState.position < familyQuizState.words.length) { renderFamilyWordQuestion(); fq('familyWordHear').click(); return; }
        familyQuizState.complete = true;
        fq('familyWordCounter').textContent = '6 of 6 words found!';
        fq('familyWordFeedback').textContent = '🏆 Family complete! Your progress is saved.';
        setPracticeButtonImage(fq('familyWordHear'), 'images/rewards/all6WordsFound.png', '🏆 All 6 Words Found');
        saveProgress();
        // Show the completion reward until Continue is chosen.
        fq('familyWordNext').hidden = true; updateFamilyQuizControls();
        celebrate('🏆', 1, 1, false);
        syncLayout();
        beginFamilyFinishCelebration();
      });


      // Keep one primary listening control below the answer choices.
      for (const [buttonId, gridId] of [['challenge', 'wordGrid'], ['sentenceChallenge', 'sentenceGrid']]) {
        const choices = document.getElementById(gridId), controls = document.createElement('div');
        controls.className = 'actions'; controls.append(document.getElementById(buttonId)); choices.after(controls);
      }
      const layout = id => document.getElementById(id);
      const headingRow = layout('layoutTitle').parentElement.parentElement;
      headingRow.classList.add('centered-heading');
      /* Star badge stays inside headerStatus; do not move it during navigation. */
      
      headingRow.append(layout('layoutProgress'));
      const familyQuestionProgress=document.createElement('p');
      familyQuestionProgress.id='familyQuestionProgress';
      familyQuestionProgress.setAttribute('role','status');
      familyQuestionProgress.hidden=true;
      headingRow.append(familyQuestionProgress);
      layout('layoutTitle').after(layout('familySound'));
      const familyNavigation = document.createElement('nav'); familyNavigation.className='family-navigation';
      familyNavigation.setAttribute('aria-label','Family navigation');
      familyNavigation.append(layout('layoutPreviousFamily'),layout('layoutContinue'));
      headingRow.after(familyNavigation);
      const homeNavigation = document.createElement('nav'); homeNavigation.className='header-navigation';
      homeNavigation.append(layout('practiceUsers'),layout('layoutFamilies'));
      document.querySelector('.site-header').append(homeNavigation);
      const selectionNavigation = document.querySelector('.shared-navigation');
      const legacyBack=layout('layoutBack');document.querySelector('#changeName').parentElement.append(legacyBack);
      selectionNavigation.replaceChildren(layout('homeContinue'),layout('parentSettingsButton'),layout('openAllWords'),layout('homeFinal'));
      layout('layoutBack').hidden=true;
      headingRow.after(selectionNavigation);
      layout('parentSettingsContent').append(layout('finalChallengeRecord'),layout('resetProgress'));
      layout('openAllWords').className='nav';
      layout('layoutBrowse').textContent='📚 Family List';
      layout('layoutAllQuiz').textContent='🏆 Final Challenge';
      layout('hubTabs').prepend(layout('browseFamilyFilter'));
      layout('browseFamilyFilter').setAttribute('aria-label','Choose a Family');
      document.querySelector('.browse-filter-label').remove();
      layout('familyWordChoices').after(layout('familyWordHear'));
      layout('quizChoices').after(layout('quizHear'));
      const whackDialog = layout('whackGameDialog');
      const whackFrame = layout('whackGameFrame');
      layout('kidWhack').addEventListener('click', () => {
        if (!activeUser || whackDialog.open) return;
        leaveActivity();
        const params = new URLSearchParams({player: activeUser.id, name: activeUser.name});
        whackFrame.src = 'whackamole/index.html?' + params;
        whackDialog.showModal();
      });
      let whackCloseTimer = null;
      function finishClosingWhackGame() {
        clearTimeout(whackCloseTimer);
        whackCloseTimer = null;
        if (whackDialog.open) whackDialog.close();
      }
      function closeWhackGame() {
        if (!whackDialog.open || whackCloseTimer !== null) return;
        // Wait for the iframe to confirm its save before unloading it.
        // Fall back if the game has failed to load or cannot respond.
        whackCloseTimer = setTimeout(finishClosingWhackGame, 1000);
        whackFrame.contentWindow?.postMessage({type:'wordfamilies-whack-save'}, '*');
      }
      whackDialog.addEventListener('cancel', event => { event.preventDefault(); closeWhackGame(); });
      whackDialog.addEventListener('close', () => {
        clearTimeout(whackCloseTimer);
        whackCloseTimer = null;
        whackFrame.removeAttribute('src');
        goFamilies();
       
        layout('kidWhack').focus();
      });
      window.addEventListener('message', event => {
        if (event.source !== whackFrame.contentWindow) return;
        if (event.data?.type === 'wordfamilies-whack-exit' ||
            (event.data?.type === 'wordfamilies-whack-saved' && whackCloseTimer !== null)) {
          finishClosingWhackGame();
        }
      });
      function leaveActivity(){saveQuizRound();hubStop();closeWordHub();saveProgress();}
      function goFamilies(){
        // Always provide a working route back to the family grid.
        // A failed progress write must not trap a learner inside an activity.
        try { leaveActivity(); } catch (error) { console.error('Error ending activity:', error); }
        try {
          closeWordHub();
          showFamilySelection();
        } catch (error) {
          console.error('Error updating family grid:', error);
          // Restore the primary navigation even if one progress tile fails.
          familyGroupQuizPage.hidden=true;
          wordsPage.hidden=true;
          sentencesPage.hidden=true;
          homePage.hidden=false;
          document.getElementById('allWordsPage').hidden=true;
        }
        syncLayout();
      }
      function goUsers(){leaveActivity();showUserPicker();syncLayout();}
      // Phase 4: Keep the navigation destinations in one place. These handlers
      // preserve the existing page transitions, save behavior, and event order.
      function resumeCurrentFamily() {
        resumeFamily(Math.max(0, continueFamily(activeUser)));
      }
      function openFinalChallenge() {
        q('openAllWords').click();
        q('quizTab').click();
      }
      function openFamilyActivity(activity) {
        resumeFamily(index, activity);
      }
      function openHubActivity(tabId) {
        q(tabId).click();
      }
      function moveToNearbyFamily(direction) {
        resumeFamily(nearbyUnfinishedFamily(direction));
      }
      const navigationActions = {
        practiceUsers: goUsers,
        layoutBack: goUsers,
        layoutFamilies: goFamilies,
        homeContinue: resumeCurrentFamily,
        homeFinal: openFinalChallenge,
        layoutWords: () => openFamilyActivity('words'),
        layoutSentences: () => openFamilyActivity('sentences'),
        layoutQuiz: () => openFamilyActivity('quiz'),
        layoutBrowse: () => openHubActivity('browseTab'),
        layoutAllQuiz: () => openHubActivity('quizTab'),
        layoutPreviousFamily: () => moveToNearbyFamily(-1),
        layoutContinue: () => moveToNearbyFamily(1)
      };
      for (const [buttonId, navigate] of Object.entries(navigationActions)) {
        layout(buttonId).onclick = navigate;
      }
      // Manage the entire parent-dialog lifecycle instead of relying on backdrop clicks.
      const parentDialog = layout('parentSettings');
      function restoreParentSettingsNavigation() {
        const button = layout('parentSettingsButton');
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
        button.classList.remove('header-inactive');
      }
      function closeParentSettings() {
        if (parentDialog.open) parentDialog.close();
        restoreParentSettingsNavigation();
      }
      function showUnlockedParentSettings() {
        // Both entry points use the same dialog logic; never dispatch synthetic clicks.
        if (parentDialog.open) return;
        restoreParentSettingsNavigation();
        // Open the dialog first: a reporting error must not disable Parent Settings.
        parentDialog.showModal();
        try { ensureFinalRecord(); usageRender(); }
        catch (error) { console.error('Parent report refresh failed:', error); }
      }
      const pinDialog = layout('parentPinDialog');
      const pinInput = layout('parentPinInput');
      const pinError = layout('parentPinError');
      function openParentSettings() {
        if (parentDialog.open || pinDialog.open) return;
        pinInput.value = '';
        pinError.textContent = '';
        pinInput.removeAttribute('aria-invalid');
        pinDialog.showModal();
        pinInput.focus();
      }
      layout('parentPinForm').addEventListener('submit', event => {
        event.preventDefault();
        if (pinInput.value !== '8675309') {
          pinError.textContent = 'Incorrect PIN. Please try again.';
          pinInput.setAttribute('aria-invalid', 'true');
          pinInput.value = '';
          pinInput.focus();
          return;
        }
        pinDialog.close();
        showUnlockedParentSettings();
      });

      pinDialog.addEventListener('click', event => {
        if (event.target !== pinDialog) return;
        const rect = pinDialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) {
          pinDialog.close();
        }
      });
      pinDialog.addEventListener('close', () => {
        pinInput.value = '';
        pinError.textContent = '';
        pinInput.removeAttribute('aria-invalid');
      });
      layout('parentSettingsButton').addEventListener('click', openParentSettings);
      layout('kidSettings').addEventListener('click', openParentSettings);
      parentDialog.addEventListener('close', () => { restoreParentSettingsNavigation(); });
      parentDialog.addEventListener('click', event => {
        // Close only for a true backdrop click, not clicks inside report content.
        if (event.target !== parentDialog) return;
        const rect = parentDialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) closeParentSettings();
      });
      
      
function setNavLabel(id, src, label) {
  const button = document.getElementById(id);
  if (!button) return;
  // Keep existing DOM nodes intact when a progress update refreshes navigation.
  // Replacing the image and text every time causes visible flashes on some iPads.
  if (button.dataset.navIcon === src && button.dataset.navLabel === label &&
      button.querySelector('img.header-nav-icon')) return;
  const icon = document.createElement('img');
  icon.className = 'header-nav-icon';
  icon.src = src;
  icon.alt = '';
  button.replaceChildren(icon, document.createTextNode(' ' + label));
  button.dataset.navIcon = src;
  button.dataset.navLabel = label;
}
function setLayoutText(id,value){if(layout(id).textContent!==value)layout(id).textContent=value;}
      function syncLayout(){
        layout('activityTabs').hidden=true;
        const picking=!startPage.hidden;
        // Parent Settings remains available through the PIN dialog on every screen.
        const parentButton=layout('parentSettingsButton');
        parentButton.disabled=false;
        parentButton.setAttribute('aria-disabled','false');
        parentButton.classList.remove('header-inactive');
        const shortcut=document.getElementById('kidSettings');
        if(shortcut){shortcut.disabled=false;shortcut.setAttribute('aria-disabled','false');}

        document.querySelector('.site-header .header-navigation')?.removeAttribute('hidden');
        layout('learnerTitle').hidden=picking;
        document.querySelector('.stars').hidden=picking;
        // Login: Users is intentionally unavailable; Home is the current page on the picker.
        const usersButton=layout('practiceUsers'), familiesButton=layout('layoutFamilies');
        if (!usersButton.querySelector('img.header-nav-icon')) setNavLabel('practiceUsers','images/icons/users.png','Users');
        usersButton.disabled=picking;
        usersButton.classList.toggle('header-inactive',picking);
        usersButton.setAttribute('aria-disabled',String(picking));
        const onFamilies=!picking && !homePage.hidden;
        // Keep Home clickable while a learner is signed in.
        // Clicking it from the grid simply refreshes the family selection.
        familiesButton.disabled=picking;
        familiesButton.classList.toggle('header-inactive',picking);
        familiesButton.setAttribute('aria-disabled',String(picking));
        document.querySelector('.site-header').classList.toggle('login-header',picking);
        
        const familyActivity=!picking && (!wordsPage.hidden||!sentencesPage.hidden||!familyGroupQuizPage.hidden);
        updateFamilyLearningPath();
        headingRow.classList.toggle('family-activity-heading',familyActivity);
        familyQuestionProgress.hidden=!familyActivity || familyGroupQuizPage.hidden;
        if(!familyQuestionProgress.hidden){
          setLayoutText('familyQuestionProgress',familyQuizState?.complete?'Question 6 of 6':fq('familyWordCounter').textContent);
        }
        layout('activityTabs').hidden=true;
        familyNavigation.hidden=!familyActivity;homeNavigation.hidden=false;
        if(familyActivity){
          const card=(!wordsPage.hidden?wordsPage:!sentencesPage.hidden?sentencesPage:familyGroupQuizPage).querySelector('.card');
          // The activities now advance sequentially; no activity tabs.
        }
        layout('browseFamilyFilter').hidden=picking||hub.hidden||!q('quizPanel').hidden;
        layout('hubTabs').classList.toggle('browse-navigation',!q('browseFamilyFilter').hidden);
        selectionNavigation.hidden=picking||homePage.hidden;
        layout('hubTabs').hidden=true;
        headingRow.hidden=!familyActivity && !hub.hidden && (q('quizPanel').hidden || !q('quizSetup').hidden);
        layout('familySound').hidden=!familyActivity;
        layout('activityFooter').hidden=true;
        if(picking)return;
        let title='Choose a Family',progress='';
        if(familyActivity){
          title=`The ${families[index].family} Family`;progress=`Family ${index+1} of ${families.length}`;
          const item=families[index],rows=sentenceData.filter(s=>s.family===item.family);
          for(const [id,label,count,total,current] of [
            ['layoutWords','📖 Words',item.words.filter(w=>foundWords.has(keyFor(w))).length,item.words.length,!wordsPage.hidden],
            ['layoutSentences','📝 Sentences',rows.filter(s=>foundSentences.has(s.file)).length,rows.length,!sentencesPage.hidden],
            ['layoutQuiz','🎯 Family Challenge',familyQuizCount(item),6,!familyGroupQuizPage.hidden]]){
            const button=layout(id),done=count===total,summary=`${done?'✓ ':''}${label} ${count}/${total}`;
            if(button.dataset.summary!==summary){button.replaceChildren(document.createTextNode((done?'✓ ':'')+label));const small=document.createElement('small');small.textContent=`${count}/${total}`;button.append(small);button.dataset.summary=summary;}
            button.disabled=done;button.classList.toggle('activity-complete',done);
            if(current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
          }
          const suffix=item.family.slice(1),example=familyExampleRecordings[item.family].split(', like ')[1];
          setLayoutText('familySound',`🔊 ${item.family} — ${suffix}, like ${example}`);
          familyLabel(layout('layoutPreviousFamily'),'⬅️ Previous Family ',families[nearbyUnfinishedFamily(-1)].family);
          familyLabel(layout('layoutContinue'),'Next Family ',families[nearbyUnfinishedFamily(1)].family,' ➡️');
        }else if(!hub.hidden){title=q('quizPanel').hidden?'Family List':!q('quizSetup').hidden?'Player Challenge':quizMode==='sentences'?'Sentence Challenge':'Word Challenge';progress=!q('quizPanel').hidden&&!q('quizRound').hidden?q('quizCounter').textContent:'';}
        if(familyActivity)familyLabel(layout('layoutTitle'),'The ',families[index].family,' Family');else setLayoutText('layoutTitle',title);setLayoutText('layoutProgress',progress);
        setLayoutText('layoutBack','Users');setNavLabel('layoutFamilies','images/icons/families.png','Home');setNavLabel('practiceUsers','images/icons/users.png','Users');
        ['layoutBrowse','layoutAllQuiz'].forEach((id,i)=>{const selected=!hub.hidden&&(i===0?q('quizPanel').hidden:!q('quizPanel').hidden);if(selected)layout(id).setAttribute('aria-current','page');else layout(id).removeAttribute('aria-current');});
        updateAllQuizTotals();
      }
      let layoutPending = false;
      function scheduleLayout(records) {
        // Setting hidden to its existing value still creates a mutation. Ignore
        // those writes so syncLayout cannot schedule itself on every frame.
        if (!records.some(record => record.oldValue !== record.target.getAttribute('hidden')) || layoutPending) return;
        layoutPending = true;
        requestAnimationFrame(() => {
          layoutPending = false;
          syncLayout();
        });
      }
      const layoutObserver = new MutationObserver(scheduleLayout);
      layoutObserver.observe(practicePage, {subtree:true, attributes:true, attributeFilter:['hidden'], attributeOldValue:true});
      layoutObserver.observe(startPage, {attributes:true, attributeFilter:['hidden'], attributeOldValue:true});
      document.addEventListener('click', event => { if (event.target.closest('#layoutBack,#layoutFamilies,#layoutWords,#layoutSentences,#layoutQuiz,#layoutPreviousFamily,#layoutContinue,#layoutFooterSentences')) { syncLayout(); if (!practicePage.hidden) layout('layoutTitle').focus(); window.scrollTo({top:0,behavior:'instant'}); } });
      syncLayout();

      showUserPicker();
      document.getElementById('welcomeNotice').showModal();

    })();
