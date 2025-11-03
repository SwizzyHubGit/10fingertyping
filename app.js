// ===== Utility =====
function fmtTime(ms){const s=Math.floor(ms/1000);const m=Math.floor(s/60);const r=s%60;return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}

// ===== State =====
let target=""; let idx=0; let correct=0; let total=0; let start=null; let timer=null; let finished=false;

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
    customText:document.getElementById('customText'),
    customTextContainer:document.getElementById('customTextContainer'),
    newText:document.getElementById('newText'),
    restart:document.getElementById('restart'),
    themeSwitch:document.getElementById('themeSwitch'),
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
    let text=hasSpace?chunks.join(' '):chunks.join('');
    return text.slice(0,length).replace(/\s{2,}/g,' ').trimEnd();
}

// ===== Rendering & stats =====
function render(){
    el.text.innerHTML=[...target].map((ch,i)=>{
        if(i<idx) return `<span class="token done correct">${ch}</span>`;
        if(i===idx) return `<span class="token current">${ch}</span>`;
        return `<span class="token">${ch}</span>`;
    }).join('');
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
    if(timer) clearInterval(timer);
    timer=null;
    updateStats();
    render();
}

function newLesson(){
    reset();
    if(el.lesson.value==='custom'){
        // Use custom text directly
        target=el.customText.value.trim();
        if(target.length===0){
            target='Please enter or paste your text in the textarea above.';
        }
    } else {
        // Generate lesson from allowed keys
        target=generateLesson(el.lesson.value,parseInt(el.len.value)||160);
    }
    render();
}

function toggleCustomTextMode(){
    const isCustom=el.lesson.value==='custom';
    el.customTextContainer.style.display=isCustom?'block':'none';
    el.lengthLabel.style.display=isCustom?'none':'flex';
    if(isCustom){
        el.customText.focus();
    }
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
    
    if(e.key.length===1){
        if(!start){
            start=Date.now();
            timer=setInterval(updateStats,100);
        }
        
        // Hard mode: only advance if correct
        if(e.key===target[idx]){
            idx++;
            correct++;
            total++;
            if(idx>=target.length){
                finished=true;
                if(timer) clearInterval(timer);
                saveBestScores();
                updateStats();
            }
            render();
        } else {
            // Wrong key - visual feedback
            el.text.classList.add('shake');
            setTimeout(()=>el.text.classList.remove('shake'),150);
            total++;
            updateStats();
        }
        e.preventDefault();
    }
}

// ===== Event Listeners =====
el.newText.addEventListener('click',newLesson);
el.restart.addEventListener('click',reset);
el.themeSwitch.addEventListener('change',toggleTheme);
document.addEventListener('keydown',handleKey);

// Add listener to regenerate text when lesson or length changes
el.lesson.addEventListener('change',()=>{
    toggleCustomTextMode();
    // Auto-regenerate when lesson changes
    newLesson();
});

// Add listener for custom text changes
el.customText.addEventListener('input',()=>{
    // Auto-regenerate when custom text changes
    if(el.lesson.value==='custom'){
        newLesson();
    }
});

el.len.addEventListener('change',()=>{
    // Optional: auto-regenerate when length changes
    // Uncomment the next line if you want auto-regeneration:
    // newLesson();
});

// ===== Initialization =====
initTheme();
loadBestScores();
newLesson();