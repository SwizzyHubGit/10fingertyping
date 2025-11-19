// ===== Utility =====
function fmtTime(ms){const s=Math.floor(ms/1000);const m=Math.floor(s/60);const r=s%60;return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}

// ===== State =====
let target=""; let idx=0; let correct=0; let total=0; let start=null; let timer=null; let finished=false;
let keyErrors={}; // Track errors per key in current session
let keyAttempts={}; // Track attempts per key in current session
// Temporary debug flag for paste behavior
const DEBUG_PASTE = true;

// ===== DOM =====
const el={
text:document.getElementById('textToType'),
wpm:document.getElementById('wpm'),
acc:document.getElementById('accuracy'),
time:document.getElementById('timer'),
bestWpm:document.getElementById('bestWpm'),
bestAcc:document.getElementById('bestAcc'),
    lesson:document.getElementById('lesson'),
len:document.getElementById('len'),
    lengthLabel:document.getElementById('lengthLabel'),
    // Note: custom text now uses the main `#textToType` element (made contentEditable when needed)
newText:document.getElementById('newText'),
restart:document.getElementById('restart'),
    themeSwitch:document.getElementById('themeSwitch'),
    badges:document.getElementById('badges'),
    calendarBtn:document.getElementById('calendarBtn'),
    calendarModal:document.getElementById('calendarModal'),
    modalOverlay:document.getElementById('modalOverlay'),
    calendarGrid:document.getElementById('calendarGrid'),
    streakCount:document.getElementById('streakCount'),
    toggleKeyboardBtn:document.getElementById('toggleKeyboardBtn'),
    fullscreenBtn:document.getElementById('fullscreenBtn'),
    achToggle:document.getElementById('achToggle'),
    adaptive:document.getElementById('adaptive'),
    nextHint:document.getElementById('nextHint'),
};

// ===== Theme Management =====
function initTheme(){
    const savedTheme=localStorage.getItem('theme')||'light';
    document.documentElement.setAttribute('data-theme',savedTheme);
    el.themeSwitch.checked=(savedTheme==='dark');
}

function toggleTheme(){
    const currentTheme=document.documentElement.getAttribute('data-theme');
    const newTheme=currentTheme==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',newTheme);
    localStorage.setItem('theme',newTheme);
}

// ===== Generation (rule-based for now) =====
function generateLesson(allowedStr,length){
let allowed=[...new Set([...allowedStr])].filter(c=>c && c!=="\n");
    if(allowed.length===0) allowed=[...'jklö '];
const letters=allowed.filter(c=>c!==' ');
const hasSpace=allowed.includes(' ');
const chunks=[];
let count=0;
while(count<length){
const wordLen=3+Math.floor(Math.random()*4);
let w="";
for(let i=0;i<wordLen;i++){ w+=letters[Math.floor(Math.random()*letters.length)] }
chunks.push(w);
count+=w.length+(hasSpace?1:0);
}
// If spaces are allowed, occasionally insert newline separators so Enter is practiced.
if(hasSpace){
    const parts=[];
    const enterProb=0.06; // ~6% chance to insert an Enter between words
    for(let i=0;i<chunks.length;i++){
        parts.push(chunks[i]);
        if(i<chunks.length-1){
            parts.push(Math.random()<enterProb ? '\n' : ' ');
        }
    }
    var text = parts.join('');
} else {
    var text = chunks.join('');
}
return text.slice(0,length).replace(/\s{2,}/g,' ').trimEnd();
}

// ===== Rendering & stats =====
function render(){
    el.text.innerHTML=[...target].map((ch,i)=>{
        if(ch==='\n'){
            // Render a real line break. Keep a span to preserve token indexing.
            if(i<idx) return `<span class="token done correct newline"><br></span>`;
            if(i===idx) return `<span class="token current newline"><br></span>`;
            return `<span class="token newline"><br></span>`;
        }
        if(i<idx) return `<span class="token done correct">${ch}</span>`;
        if(i===idx) return `<span class="token current">${ch}</span>`;
        return `<span class="token">${ch}</span>`;
    }).join('');
    // Update keyboard highlight for expected key
    updateKeyboardHighlight();
}

function minutes(){ return start? (Date.now()-start)/60000 : 0 }
function wpm(){ const m=Math.max(minutes(),1/60); return Math.round((correct/5)/m) }
function acc(){ return total===0?100:Math.round((correct/total)*100) }

function updateStats(){
el.wpm.textContent=`WPM: ${wpm()}`;
el.acc.textContent=`Accuracy: ${acc()}%`;
el.time.textContent=`Time: ${fmtTime(start?Date.now()-start:0)}`;
}

function loadBestScores(){
    const bestWpm=localStorage.getItem('bestWpm')||'0';
    const bestAcc=localStorage.getItem('bestAcc')||'0';
    el.bestWpm.textContent=bestWpm;
    el.bestAcc.textContent=bestAcc+'%';
}

// ===== Mistake Tracking =====
function loadKeyStats(){
    try{
        const saved=localStorage.getItem('keyStats');
        return saved?JSON.parse(saved):{};
    } catch(e){
        return {};
    }
}

function saveKeyStats(stats){
    try{
        localStorage.setItem('keyStats',JSON.stringify(stats));
    } catch(e){
        console.error('Failed to save key stats:',e);
    }
}

function updateKeyStats(key,isError){
    const stats=loadKeyStats();
    if(!stats[key]){
        stats[key]={attempts:0,errors:0};
    }
    stats[key].attempts++;
    if(isError){
        stats[key].errors++;
    }
    saveKeyStats(stats);
}

function getWeakestKeys(limit=5){
    const stats=loadKeyStats();
    const keys=Object.keys(stats).filter(k=>k!==' ');
    const keyRates=keys.map(key=>{
        const s=stats[key];
        const rate=s.attempts>0?s.errors/s.attempts:0;
        return {key,rate,attempts:s.attempts,errors:s.errors};
    });
    // Sort by error rate (highest first), then by total errors
    keyRates.sort((a,b)=>{
        if(Math.abs(a.rate-b.rate)>0.05) return b.rate-a.rate;
        return b.errors-a.errors;
    });
    return keyRates.slice(0,limit).filter(k=>k.attempts>=3&&k.rate>0.1); // Only include keys with at least 3 attempts and >10% error rate
}

function generateSuggestedLesson(weakKeys){
    if(weakKeys.length===0) return null;
    
    const keys=weakKeys.map(k=>k.key);
    const hasSpace=true;
    
    // Map keys to their row and hand
    const homeRow='asdfjklö';
    const topRow='qwertyuiop';
    const bottomRow='zxcvbnm,';
    
    const homeKeys=keys.filter(k=>homeRow.includes(k));
    const topKeys=keys.filter(k=>topRow.includes(k));
    const bottomKeys=keys.filter(k=>bottomRow.includes(k));
    
    // Determine which lesson to suggest
    if(homeKeys.length>0&&topKeys.length>0){
        return homeRow+topRow+(hasSpace?' ':'');
    } else if(homeKeys.length>0&&bottomKeys.length>0){
        return homeRow+bottomRow+(hasSpace?' ':'');
    } else if(topKeys.length>0&&bottomKeys.length>0){
        return topRow+bottomRow+(hasSpace?' ':'');
    } else if(homeKeys.length>0){
        return homeRow+(hasSpace?' ':'');
    } else if(topKeys.length>0){
        return topRow+(hasSpace?' ':'');
    } else if(bottomKeys.length>0){
        return bottomRow+(hasSpace?' ':'');
    }
    
    // Fallback: include all weak keys
    return [...new Set(keys)].join('')+(hasSpace?' ':'');
}

function updateSuggestedLesson(){
    const weakKeys=getWeakestKeys();
    const suggestedOpt=document.getElementById('suggestedLesson');
    const suggestedGroup=document.getElementById('suggestedGroup');
    
    if(weakKeys.length===0){
        // Remove suggested option and group if they exist
        if(suggestedOpt) suggestedOpt.remove();
        if(suggestedGroup) suggestedGroup.remove();
        return;
    }
    
    // Check if suggested group exists, create if not
    let group=suggestedGroup;
    if(!group){
        group=document.createElement('optgroup');
        group.id='suggestedGroup';
        group.label='💡 Suggested Practice';
        el.lesson.insertBefore(group,el.lesson.firstChild);
    }
    
    // Check if suggested option exists
    let opt=suggestedOpt;
    if(!opt){
        opt=document.createElement('option');
        opt.id='suggestedLesson';
        opt.value='suggested';
        group.appendChild(opt);
    }
    
    const suggestedKeys=generateSuggestedLesson(weakKeys);
    const weakKeyList=weakKeys.slice(0,3).map(k=>k.key).join(',');
    opt.textContent=`Practice ${weakKeyList}${weakKeys.length>3?'...':''} (${weakKeys.length} weak key${weakKeys.length>1?'s':''})`;
    opt.dataset.keys=suggestedKeys;
    // Update inline hint
    if(el.nextHint){
        el.nextHint.textContent=weakKeys.length?`${weakKeyList}${weakKeys.length>3?'...':''}`:'—';
    }
}

// ===== On-screen keyboard =====
let keyboardMap={};
function initKeyboard(){
    const keys=document.querySelectorAll('#keyboard .key');
    keyboardMap={};
    keys.forEach(k=>{
        const key=k.dataset.key;
        if(key) keyboardMap[key.toLowerCase()]=k;
    });
    // Apply weak-key markers initially
    markWeakKeys();
}

function updateKeyboardHighlight(){
    if(!keyboardMap) return;
    // Clear previous highlights
    Object.values(keyboardMap).forEach(k=>k.classList.remove('highlight'));
    const expected=target[idx];
    if(!expected) return;
    const keyEl=keyboardMap[expected.toLowerCase()];
    if(keyEl) keyEl.classList.add('highlight');
}

function flashWrongKey(ch){
    const keyEl=keyboardMap[(ch||'').toLowerCase()];
    if(!keyEl) return;
    keyEl.classList.add('wrong');
    setTimeout(()=>keyEl.classList.remove('wrong'),220);
}

function clearWeakKeyMarks(){
    Object.values(keyboardMap||{}).forEach(k=>{
        k.classList.remove('weak-1','weak-2','weak-3');
    });
}

function markWeakKeys(){
    clearWeakKeyMarks();
    const weak=getWeakestKeys(10);
    if(!weak || weak.length===0) return;
    // Assign intensity classes based on rank
    weak.forEach((w,i)=>{
        const elKey=keyboardMap[w.key.toLowerCase()];
        if(!elKey) return;
        const cls = i<1? 'weak-3' : i<3 ? 'weak-2' : 'weak-1';
        elKey.classList.add(cls);
    });
}

// ===== Achievement System =====
const achievements=[
    // Lesson completion badges
    {id:'first',name:'First Steps',icon:'🎯',desc:'Complete your first lesson',check:()=>getCompletedLessons()>=1},
    {id:'lesson5',name:'Getting Started',icon:'🌟',desc:'Complete 5 lessons',check:()=>getCompletedLessons()>=5},
    {id:'lesson10',name:'Dedicated',icon:'💪',desc:'Complete 10 lessons',check:()=>getCompletedLessons()>=10},
    {id:'lesson25',name:'Persistent',icon:'🔥',desc:'Complete 25 lessons',check:()=>getCompletedLessons()>=25},
    {id:'lesson50',name:'Master',icon:'👑',desc:'Complete 50 lessons',check:()=>getCompletedLessons()>=50},
    {id:'lesson100',name:'Legend',icon:'🏆',desc:'Complete 100 lessons',check:()=>getCompletedLessons()>=100},
    
    // Accuracy badges
    {id:'acc80',name:'Accurate',icon:'🎯',desc:'Achieve 80% accuracy',check:()=>acc()>=80},
    {id:'acc90',name:'Precise',icon:'✨',desc:'Achieve 90% accuracy',check:()=>acc()>=90},
    {id:'acc95',name:'Perfect Touch',icon:'💎',desc:'Achieve 95% accuracy',check:()=>acc()>=95},
    {id:'acc100',name:'Flawless',icon:'💯',desc:'Achieve 100% accuracy',check:()=>acc()===100},
    
    // Speed badges (WPM)
    {id:'wpm20',name:'Getting Faster',icon:'🚀',desc:'Type at 20 WPM',check:()=>wpm()>=20},
    {id:'wpm30',name:'Speed Demon',icon:'⚡',desc:'Type at 30 WPM',check:()=>wpm()>=30},
    {id:'wpm40',name:'Rapid Fire',icon:'🔥',desc:'Type at 40 WPM',check:()=>wpm()>=40},
    {id:'wpm50',name:'Lightning Fast',icon:'⚡',desc:'Type at 50 WPM',check:()=>wpm()>=50},
    {id:'wpm60',name:'Supersonic',icon:'🌪️',desc:'Type at 60 WPM',check:()=>wpm()>=60},
    {id:'wpm80',name:'Professional',icon:'💼',desc:'Type at 80 WPM',check:()=>wpm()>=80},
    {id:'wpm100',name:'Elite Typist',icon:'🏅',desc:'Type at 100 WPM',check:()=>wpm()>=100},
    
    // Combined badges
    {id:'combo1',name:'Balanced',icon:'⚖️',desc:'50+ WPM with 90%+ accuracy',check:()=>wpm()>=50&&acc()>=90},
    {id:'combo2',name:'Elite Combo',icon:'⭐',desc:'60+ WPM with 95%+ accuracy',check:()=>wpm()>=60&&acc()>=95},
    {id:'combo3',name:'Perfect Speed',icon:'💫',desc:'100+ WPM with 100% accuracy',check:()=>wpm()>=100&&acc()===100},
];

function getCompletedLessons(){
    return parseInt(localStorage.getItem('completedLessons')||'0');
}

function incrementCompletedLessons(){
    const count=getCompletedLessons()+1;
    localStorage.setItem('completedLessons',count.toString());
    // Mark today as practiced
    markDayAsPracticed();
    return count;
}

// ===== Streak Calendar System =====
function getDateKey(date=new Date()){
    // Use local date components to produce YYYY-MM-DD in the user's local timezone.
    // toISOString() returns a UTC date which can shift the day depending on timezone,
    // causing off-by-one-day issues for streak calculations. Construct the key
    // from local year/month/day so "today" matches the user's expectation.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function loadPracticeDays(){
    try{
        const saved=localStorage.getItem('practiceDays');
        return saved?JSON.parse(saved):[];
    } catch(e){
        return [];
    }
}

function savePracticeDays(days){
    try{
        localStorage.setItem('practiceDays',JSON.stringify(days));
    } catch(e){
        console.error('Failed to save practice days:',e);
    }
}

function markDayAsPracticed(){
    const today=getDateKey();
    const practiceDays=loadPracticeDays();
    if(!practiceDays.includes(today)){
        practiceDays.push(today);
        practiceDays.sort();
        savePracticeDays(practiceDays);
        updateCalendar();
    }
}

function calculateStreak(){
    const practiceDays=loadPracticeDays();
    if(practiceDays.length===0) return 0;
    
    const today=new Date();
    today.setHours(0,0,0,0);
    const todayKey=getDateKey(today);
    
    // If today is not practiced, streak is 0
    if(!practiceDays.includes(todayKey)){
        return 0;
    }
    
    // Count consecutive days backwards from today
    let streak=1; // Today counts as day 1
    let checkDate=new Date(today);
    checkDate.setDate(checkDate.getDate()-1);
    
    while(true){
        const dateKey=getDateKey(checkDate);
        if(practiceDays.includes(dateKey)){
            streak++;
            checkDate.setDate(checkDate.getDate()-1);
        } else {
            // Found a gap, streak ends
            break;
        }
    }
    
    return streak;
}

function getLast30Days(){
    const days=[];
    const today=new Date();
    for(let i=29;i>=0;i--){
        const date=new Date(today);
        date.setDate(date.getDate()-i);
        days.push(date);
    }
    return days;
}

function updateCalendar(){
    const practiceDays=loadPracticeDays();
    const streak=calculateStreak();
    el.streakCount.textContent=streak;
    
    const last30Days=getLast30Days();
    el.calendarGrid.innerHTML='';
    
    last30Days.forEach(date=>{
        const dateKey=getDateKey(date);
        const isPracticed=practiceDays.includes(dateKey);
        const isToday=dateKey===getDateKey();
        
        const dayEl=document.createElement('div');
        dayEl.className=`calendar-day ${isPracticed?'practiced':''} ${isToday?'today':''}`;
        dayEl.setAttribute('data-date',dateKey);
        dayEl.setAttribute('title',`${date.toLocaleDateString()}${isPracticed?' - Practiced':''}`);
        
        const dayNum=document.createElement('div');
        dayNum.className='calendar-day-num';
        dayNum.textContent=date.getDate();
        dayEl.appendChild(dayNum);
        
        const dayName=document.createElement('div');
        dayName.className='calendar-day-name';
        dayName.textContent=date.toLocaleDateString('en-US',{weekday:'short'}).charAt(0);
        dayEl.appendChild(dayName);
        
        el.calendarGrid.appendChild(dayEl);
    });
}

function openCalendar(){
    updateCalendar();
    el.calendarModal.classList.add('show');
    el.modalOverlay.classList.add('show');
    document.body.style.overflow='hidden';
}

function closeCalendar(){
    el.calendarModal.classList.remove('show');
    el.modalOverlay.classList.remove('show');
    document.body.style.overflow='';
}

// Initialize calendar on page load
function initCalendar(){
    updateCalendar();
}

function loadAchievements(){
    try{
        const saved=localStorage.getItem('achievements');
        return saved?JSON.parse(saved):[];
    } catch(e){
        return [];
    }
}

function saveAchievements(achieved){
    try{
        localStorage.setItem('achievements',JSON.stringify(achieved));
    } catch(e){
        console.error('Failed to save achievements:',e);
    }
}

function checkAchievements(){
    const achieved=loadAchievements();
    const newlyUnlocked=[];
    
    achievements.forEach(ach=>{
        if(!achieved.includes(ach.id)&&ach.check()){
            achieved.push(ach.id);
            newlyUnlocked.push(ach);
        }
    });
    
    if(newlyUnlocked.length>0){
        saveAchievements(achieved);
        showAchievementNotification(newlyUnlocked);
        renderBadges();
    }
    
    return newlyUnlocked;
}

function showAchievementNotification(unlocked){
    const notification=document.createElement('div');
    notification.className='achievement-notification';
    notification.innerHTML=`
        <div class="achievement-notification-content">
            <div class="achievement-icon">${unlocked[0].icon}</div>
            <div class="achievement-text">
                <div class="achievement-title">Achievement Unlocked!</div>
                <div class="achievement-name">${unlocked[0].name}</div>
                <div class="achievement-desc">${unlocked[0].desc}</div>
            </div>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(()=>{
        notification.classList.add('show');
    },100);
    
    setTimeout(()=>{
        notification.classList.remove('show');
        setTimeout(()=>notification.remove(),300);
    },3000);
}

function renderBadges(){
    const achieved=loadAchievements();
    el.badges.innerHTML='';
    
    achievements.forEach(ach=>{
        const badge=document.createElement('div');
        badge.className=`badge ${achieved.includes(ach.id)?'unlocked':'locked'}`;
        badge.innerHTML=`
            <div class="badge-icon">${ach.icon}</div>
            <div class="badge-info">
                <div class="badge-name">${ach.name}</div>
                <div class="badge-desc">${ach.desc}</div>
            </div>
        `;
        el.badges.appendChild(badge);
    });
}

function saveBestScores(){
    const currentWpm=wpm();
    const currentAcc=acc();
    const bestWpm=parseInt(localStorage.getItem('bestWpm')||'0');
    const bestAcc=parseInt(localStorage.getItem('bestAcc')||'0');
    
    if(currentWpm>bestWpm) {
        localStorage.setItem('bestWpm',currentWpm);
        el.bestWpm.textContent=currentWpm;
    }
    if(currentAcc>bestAcc) {
        localStorage.setItem('bestAcc',currentAcc);
        el.bestAcc.textContent=currentAcc+'%';
    }
}

function reset(){
    idx=0;
    correct=0;
    total=0;
    start=null;
    finished=false;
    keyErrors={};
    keyAttempts={};
    if(timer) clearInterval(timer);
    timer=null;
    updateStats();
    render();
}

function newLesson(){
    reset();
    if(el.lesson.value==='custom'){
        // Use the visible writing block as the source for custom text
        target = el.text.textContent.trim();
        if(!target || target.length===0){
            target = 'Please paste or type your custom text into the writing area above.';
        }
    } else if(el.lesson.value==='suggested'){
        // Use suggested lesson based on weakest keys
        const suggestedOpt=document.getElementById('suggestedLesson');
        if(suggestedOpt&&suggestedOpt.dataset.keys){
            target=generateLesson(suggestedOpt.dataset.keys,parseInt(el.len.value)||160);
        } else {
            // Fallback to default
            target=generateLesson('jklö ',parseInt(el.len.value)||160);
        }
    } else {
        // Generate lesson from allowed keys
        target=generateLesson(el.lesson.value,parseInt(el.len.value)||160);
    }
    render();
}

function toggleCustomTextMode(){
    const isCustom = el.lesson.value === 'custom';
    // Make the main writing area editable so users can paste directly into it
    el.text.contentEditable = isCustom ? 'true' : 'false';
    el.text.classList.toggle('editable', isCustom);
    el.lengthLabel.style.display = isCustom ? 'none' : 'flex';
    if(isCustom){
        // Focus the writing block so the user can paste immediately
        // Clear existing generated tokens to give a clean paste surface
        // Use textContent to remove any innerHTML tokens reliably
        el.text.textContent = '';
        el.text.classList.add('placeholder');
        el.text.focus();
        placeCaretAtEnd(el.text);
        // Attach paste handler so pasted text is inserted into the writing block
        el.text.addEventListener('paste', handleCustomPaste);
    } else {
        // Remove paste listener when leaving custom mode
        el.text.removeEventListener('paste', handleCustomPaste);
        updateSuggestedLesson();
    }
}

function placeCaretAtEnd(elNode){
    try{
        const range = document.createRange();
        range.selectNodeContents(elNode);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }catch(e){/* ignore */}
}

function handleCustomPaste(e){
    // Let the browser perform the default paste (so the actual clipboard content is inserted).
    // Then read the resulting textContent a moment later and start the lesson.
    // Some browsers/contexts don't expose clipboardData reliably, so allowing the default paste
    // ensures the user's clipboard contents end up in the editable element.
    // Use a MutationObserver to detect the actual content the browser inserts on paste.
    // Some Chrome setups can be flaky reading clipboard programmatically; letting the browser
    // paste and observing DOM changes is the most reliable way to capture the user's clipboard.

    // If handler was attached, we don't prevent default so the browser inserts the clipboard content.
    // We'll observe for changes and finalize when we detect inserted text.

    let settled = false;
    const htmlToTextWithNewlines = (html)=>{
        // Normalize common block tags and <br> into newlines, then strip remaining tags and decode entities.
        if(!html) return '';
    // Replace <br> and block tags (with any attributes) with newlines
    let s = html.replace(/<br[^>]*>/gi, '\n');
    s = s.replace(/<\/?p[^>]*>/gi, '\n');
    s = s.replace(/<\/?div[^>]*>/gi, '\n');
    s = s.replace(/<\/?li[^>]*>/gi, '\n');
        // Remove any remaining tags
        const tmp = document.createElement('div');
        tmp.innerHTML = s;
    let text = tmp.textContent || tmp.innerText || '';
    // Convert non-breaking spaces to regular spaces
    text = text.replace(/\u00A0/g,' ');
        // Normalize CRLF and multiple newlines
        text = text.replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').replace(/\n+/g,'\n').trim();
        return text;
    };

    const finalize = (rawHtml, rawTextFallback)=>{
        if(settled) return;
        settled = true;
        // Prefer HTML-aware conversion so pasted <div>/<br> become real newlines
        const cleaned = htmlToTextWithNewlines(rawHtml || rawTextFallback || '');
        if(DEBUG_PASTE){
            console.group('[paste-debug] raw content on paste');
            console.log('rawInnerHTML:', rawHtml);
            console.log('rawTextContent:', rawTextFallback);
            console.log('cleanedTextUsed:', cleaned);
            console.groupEnd();
        }
        el.text.textContent = cleaned;
        el.text.classList.remove('placeholder');
        el.text.removeEventListener('paste', handleCustomPaste);
        el.text.contentEditable = 'false';
        el.text.classList.remove('editable');
        // Directly set the lesson target and render so nothing else overwrites it
        reset();
        target = cleaned || 'Please paste or type your custom text into the writing area above.';
        render();
    };

    const obs = new MutationObserver((mutations, observer)=>{
        // Read the inserted HTML and finalize when non-empty
        const rawHtml = el.text.innerHTML || '';
        const rawText = el.text.textContent || '';
        if(rawText && rawText.trim().length>0){
            observer.disconnect();
            finalize(rawHtml, rawText);
        }
    });

    obs.observe(el.text, {childList:true,subtree:true,characterData:true});

    // Fallback: after a short timeout, if observer didn't fire, read content and finalize
    setTimeout(()=>{
        if(!settled){
            try{ obs.disconnect(); }catch(e){}
            const rawHtml = el.text.innerHTML || '';
            const rawText = el.text.textContent || '';
            finalize(rawHtml, rawText);
        }
    }, 400);

    // Do NOT call e.preventDefault(); allow the default paste to happen so the real clipboard data is inserted by the browser.
}

function handleKey(e){
    // Don't intercept keys when typing in input fields
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }
    
    if(finished) return;
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    
    if(e.key==='Backspace'){
        if(idx>0){
            idx--;
            if(target[idx]===e.target.value[idx]) correct--;
            total--;
            render();
        }
        e.preventDefault();
        return;
    }

    // Map special keys to chars used in target (Enter -> '\n')
    let pressed = e.key;
    if(e.key === 'Enter') pressed = '\n';

    if(pressed.length===1 || pressed === '\n'){
        if(!start){
            start=Date.now();
            timer=setInterval(updateStats,100);
        }

        const expectedKey=target[idx];
        if(pressed===expectedKey){
            idx++;
            correct++;
            total++;
            updateKeyStats(expectedKey,false);
            if(idx>=target.length){
                finished=true;
                if(timer) clearInterval(timer);
                saveBestScores();
                updateStats();
                incrementCompletedLessons();
                checkAchievements();
                updateSuggestedLesson();
                if(el.adaptive && el.adaptive.checked){
                    const suggestedOpt=document.getElementById('suggestedLesson');
                    if(suggestedOpt){
                        el.lesson.value='suggested';
                        setTimeout(()=>{ newLesson(); }, 600);
                    }
                }
            }
            render();
        } else {
            // Wrong key - visual feedback
            el.text.classList.add('shake');
            setTimeout(()=>el.text.classList.remove('shake'),150);
            total++;
            // Flash wrong key on on-screen keyboard (use printable if available)
            flashWrongKey(pressed);
            updateKeyStats(expectedKey,true);
            updateStats();
        }
        e.preventDefault();
    }
}

// ===== Fullscreen Management =====
function getFullscreenElement(){
    return document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement;
}

function enterFullscreen(){
    const elem=document.documentElement;
    if(elem.requestFullscreen){
        elem.requestFullscreen();
    } else if(elem.webkitRequestFullscreen){
        elem.webkitRequestFullscreen();
    } else if(elem.mozRequestFullScreen){
        elem.mozRequestFullScreen();
    } else if(elem.msRequestFullscreen){
        elem.msRequestFullscreen();
    }
}

function exitFullscreen(){
    if(document.exitFullscreen){
        document.exitFullscreen();
    } else if(document.webkitExitFullscreen){
        document.webkitExitFullscreen();
    } else if(document.mozCancelFullScreen){
        document.mozCancelFullScreen();
    } else if(document.msExitFullscreen){
        document.msExitFullscreen();
    }
}

function toggleFullscreen(){
    if(getFullscreenElement()){
        exitFullscreen();
    } else {
        enterFullscreen();
    }
}

function updateFullscreenIcon(){
    const isFullscreen=!!getFullscreenElement();
    el.fullscreenBtn.textContent=isFullscreen?'⛶':'⛶';
    el.fullscreenBtn.setAttribute('aria-label',isFullscreen?'Exit fullscreen':'Enter fullscreen');
    el.fullscreenBtn.classList.toggle('fullscreen-active',isFullscreen);
}

// Toggle visibility of on-screen keyboard
function toggleKeyboard(){
    const kb=document.getElementById('keyboard');
    if(!kb) return;
    const collapsed = kb.classList.toggle('collapsed');
    // hide the keyboard from assistive tech when collapsed
    kb.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    if(el.toggleKeyboardBtn){
        el.toggleKeyboardBtn.setAttribute('aria-expanded', (!collapsed).toString());
        // toggle CSS class which rotates the inline SVG arrow consistently
        el.toggleKeyboardBtn.classList.toggle('collapsed', collapsed);
        el.toggleKeyboardBtn.setAttribute('title', collapsed ? 'Show keyboard' : 'Hide keyboard');
    }
}

// Initialize fullscreen icon on load
updateFullscreenIcon();

// ===== Event Listeners =====
el.newText.addEventListener('click',newLesson);
el.restart.addEventListener('click',reset);
el.themeSwitch.addEventListener('change',toggleTheme);
el.calendarBtn.addEventListener('click',openCalendar);
el.fullscreenBtn.addEventListener('click',toggleFullscreen);
el.modalOverlay.addEventListener('click',closeCalendar);
document.querySelector('.modal-close').addEventListener('click',closeCalendar);
document.addEventListener('keydown',handleKey);
document.addEventListener('keydown',(e)=>{
    if(e.key==='Escape'){
        if(el.calendarModal.classList.contains('show')){
            closeCalendar();
            e.preventDefault();
        } else if(getFullscreenElement()){
            exitFullscreen();
            e.preventDefault();
        }
    }
});
if(el.toggleKeyboardBtn) el.toggleKeyboardBtn.addEventListener('click', toggleKeyboard);

// Listen for fullscreen changes
document.addEventListener('fullscreenchange',updateFullscreenIcon);
document.addEventListener('webkitfullscreenchange',updateFullscreenIcon);
document.addEventListener('mozfullscreenchange',updateFullscreenIcon);
document.addEventListener('MSFullscreenChange',updateFullscreenIcon);

// Achievements toggle
el.achToggle.addEventListener('click',()=>{
    const container=document.getElementById('achievements');
    const isCollapsed=container.classList.toggle('collapsed');
    el.achToggle.setAttribute('aria-expanded',(!isCollapsed).toString());
    // Use CSS class to rotate the inline SVG chevron so it matches the keyboard toggle
    el.achToggle.classList.toggle('collapsed', isCollapsed);
});

// Add listener to regenerate text when lesson or length changes
el.lesson.addEventListener('change',()=>{
    // Toggle custom mode UI first. If the new lesson is not 'custom', regenerate immediately.
    toggleCustomTextMode();
    if(el.lesson.value !== 'custom'){
        // Auto-regenerate when lesson changes (but don't auto-generate for 'custom' — wait for paste)
        newLesson();
    }
});

// No separate custom textarea; handle custom mode via contentEditable on #textToType

el.len.addEventListener('change',()=>{
    // Optional: auto-regenerate when length changes
    // Uncomment the next line if you want auto-regeneration:
    // newLesson();
});

// ===== Initialization =====
initTheme();
loadBestScores();
updateSuggestedLesson();
renderBadges();
initCalendar();
updateFullscreenIcon();
initKeyboard();
newLesson();