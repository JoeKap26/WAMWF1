/* Recorded sentence questions: every choice has the same first word and word count. */
(() => {
  const sentences = window.WORD_SENTENCES || [];
  const byId = new Map(sentences.map(item => [item.file, item]));
  const groups = new Map();
  const signature = text => {
    const words = String(text).toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) || [];
    return `${words[0] || ''}:${words.length}`;
  };
  for (const item of sentences) {
    const key = signature(item.text);
    if (!groups.has(key)) groups.set(key, []);
    const group = groups.get(key);
    if (!group.some(other => other.text.toLowerCase() === item.text.toLowerCase())) group.push(item);
  }
  const peers = id => groups.get(signature(byId.get(id)?.text || '')) || [];
  const eligible = item => peers(item.file).length >= 3;
  window.sentenceChallenge = Object.freeze({
    signature,
    text: id => byId.get(id)?.text || '',
    targets(families, shuffle) {
      const targets = families.map(family => {
        const choices = sentences.filter(item => item.family === family.family && eligible(item));
        return shuffle(choices)[0]?.file;
      });
      if (targets.length !== 50 || targets.some(id => !id)) return null;
      return shuffle(targets);
    },
    options(id, shuffle) {
      const target = byId.get(id);
      if (!target || !eligible(target)) return [];
      const alternatives = shuffle(peers(id).filter(item => item.text.toLowerCase() !== target.text.toLowerCase()));
      // Prefer similar beginnings within the required first-word/word-count group.
      const prefix = text => { let n=0; while(n<text.length && n<target.text.length && text[n]===target.text[n]) n++; return n; };
      alternatives.sort((a,b) => prefix(b.text)-prefix(a.text));
      return shuffle([id, ...alternatives.slice(0,2).map(item => item.file)]);
    },
    cleanRound(value) {
      if (!value || !Array.isArray(value.targets) || value.targets.length !== 50 || new Set(value.targets).size !== 50) return null;
      if (value.targets.some(id => !byId.has(id) || !eligible(byId.get(id)))) return null;
      if (!Number.isInteger(value.position) || value.position<0 || value.position>=50) return null;
      const solved = value.solved === true;
      if (!Array.isArray(value.answers) || value.answers.length !== value.position+Number(solved)) return null;
      if (value.answers.some((a,i) => !a || a.word!==value.targets[i] || !Number.isSafeInteger(a.attempts) || a.attempts<1)) return null;
      const current=value.targets[value.position];
      const validOptions=Array.isArray(value.options) && value.options.length===3 && new Set(value.options).size===3 && value.options.includes(current) && new Set(value.options.map(id => byId.get(id)?.text.toLowerCase())).size===3
        && value.options.every(id => byId.has(id) && signature(byId.get(id).text)===signature(byId.get(current).text));
      return {targets:[...value.targets],position:value.position,answers:value.answers.map(a=>({word:a.word,attempts:a.attempts})),
        attempts:Number.isSafeInteger(value.attempts)&&value.attempts>=0?value.attempts:0,solved,options:validOptions?[...value.options]:null,
        level:'three-sentence-choices',scope:'one-sentence-per-family'};
    }
  });
})();
