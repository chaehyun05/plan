(()=>{

'use strict';
document.querySelectorAll('[data-habit-control]').forEach(b=>b.addEventListener('click',()=>{
 const target=document.getElementById('habit-frame').contentDocument?.getElementById(b.dataset.habitControl);
 if(!target){alert('습관 트래커 로딩을 기다려주세요.');return;}
 target.click();
}));

function syncTopTools(){
 document.querySelectorAll('[data-tools-for]').forEach(bar=>{
  const panel=document.getElementById('panel-'+bar.dataset.toolsFor);
  bar.hidden=!panel||panel.hidden;
 });
}
const toolsObserver=new MutationObserver(syncTopTools);
document.querySelectorAll('[role=tabpanel]').forEach(panel=>toolsObserver.observe(panel,{attributes:true,attributeFilter:['hidden']}));
syncTopTools();

// 탭이 화면보다 넓을 때 양옆을 흐리게 표시하고, 선택한 탭을 화면 안으로 스크롤
const tabBar=document.querySelector('.app-tabs');
function syncTabHint(){if(!tabBar)return;const max=tabBar.scrollWidth-tabBar.clientWidth;tabBar.classList.toggle('more-right',tabBar.scrollLeft<max-4);tabBar.classList.toggle('more-left',tabBar.scrollLeft>4);}
if(tabBar){tabBar.addEventListener('scroll',syncTabHint,{passive:true});window.addEventListener('resize',syncTabHint);
 tabBar.addEventListener('click',e=>{const t=e.target.closest('[role=tab]');if(t)t.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});});syncTabHint();}
// 더보기 메뉴: 바깥을 누르면 닫기
document.addEventListener('click',e=>{document.querySelectorAll('.more-tools[open]').forEach(d=>{if(!d.contains(e.target))d.open=false;});});
document.querySelectorAll('.more-tools [data-page-clear]').forEach(b=>b.addEventListener('click',()=>{b.closest('details').open=false;}));

const $=id=>document.getElementById(id);
const names={week:'주간계획',meal:'주간식단',todo:'할일',mandal:'만다라트',habits:'습관트래커'};
function targets(kind){
 if(kind==='week')return [$('sheet')];
 if(kind==='meal')return [$('meal-table').closest('section')];
 if(kind==='todo')return [$('todo-sheet')];
 if(kind==='mandal')return [...$('mandal-list').querySelectorAll('.sheet')];
 const doc=$('habit-frame').contentDocument;const page=doc?.querySelector('.page');if(!page)throw Error('습관 트래커를 먼저 열고 로딩을 기다려주세요.');return [page];
}
async function capture(el){
 if(!window.html2canvas)throw Error('이미지 라이브러리를 불러오지 못했습니다. 인터넷 연결 후 새로고침하세요.');
 if(el.ownerDocument.fonts?.ready)await el.ownerDocument.fonts.ready;
 const width=Math.max(el.scrollWidth,el.clientWidth);const height=Math.max(el.scrollHeight,el.clientHeight);
 return window.html2canvas(el,{backgroundColor:'#fff',scale:Math.min(2,Math.sqrt(14000000/Math.max(1,width*height))),width,height,windowWidth:Math.max(1280,width+80),windowHeight:height+80,onclone(doc){
 doc.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=false);
 doc.querySelectorAll('[data-page-tools],.tools,.sleepform,.meal-remove,.qty-step,.meal-day-tabs,[data-target]').forEach(n=>n.style.display='none');
 doc.querySelectorAll('.meal-table [data-di]').forEach(n=>n.style.display='');
 doc.querySelectorAll('.meal-table').forEach(n=>n.style.minWidth='1100px');
 doc.querySelectorAll('.scroll,.meal-scroll,.sheet-wrap').forEach(n=>{n.style.overflow='visible';n.style.maxHeight='none';});
 doc.querySelectorAll('.block.selected').forEach(n=>n.classList.remove('selected'));
 }});
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportPage(kind,type,button){
 button.disabled=true;const label=button.textContent;button.textContent='저장 준비 중…';
 try{const els=targets(kind);if(!els.length)throw Error('저장할 내용이 없어요.');let pdf;
 if(type==='pdf'){if(!window.jspdf)throw Error('PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결 후 새로고침하세요.');pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});}
 let pages=0;
 for(let i=0;i<els.length;i++){
 const canvas=await capture(els[i]);
 if(type==='png'){const blob=await new Promise(resolve=>canvas.toBlob(resolve));if(!blob)throw Error('이미지 생성에 실패했습니다.');download(blob,`myplan-${names[kind]}-${i+1}.png`);await new Promise(r=>setTimeout(r,300));}
 else{
 const sliceHeight=Math.max(1,Math.floor(canvas.width*190/277));
 for(let y=0;y<canvas.height;y+=sliceHeight){if(pages++)pdf.addPage();const h=Math.min(sliceHeight,canvas.height-y),part=document.createElement('canvas');part.width=canvas.width;part.height=h;part.getContext('2d').drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);pdf.addImage(part.toDataURL('image/png'),'PNG',10,10,277,h/canvas.width*277);}
 }
 }
 if(pdf)pdf.save(`myplan-${names[kind]}.pdf`);
 }catch(e){alert('저장 실패: '+e.message);}finally{button.disabled=false;button.textContent=label;}
}
document.querySelectorAll('[data-page-png]').forEach(b=>b.addEventListener('click',()=>exportPage(b.dataset.pagePng,'png',b)));
document.querySelectorAll('[data-page-pdf]').forEach(b=>b.addEventListener('click',()=>exportPage(b.dataset.pagePdf,'pdf',b)));
document.querySelectorAll('[data-page-clear]').forEach(b=>b.addEventListener('click',()=>{
 const kind=b.dataset.pageClear;
 const desc=kind==='meal'?'이번 주 식단을 모두 지울까요? 등록된 메뉴는 유지됩니다.':kind==='habits'?'모든 월의 습관 체크와 수면 기록을 지울까요? 습관 목록은 유지됩니다.':names[kind]+' 내용을 모두 지울까요? 다른 페이지는 유지됩니다.';
 if(!confirm(desc))return;
 try{if(kind==='meal')window.myPlanMeals.clearWeek();else if(kind==='habits'){const api=$('habit-frame').contentWindow.myPlanHabitActions;if(!api)throw Error('습관 트래커 로딩을 기다려주세요.');api.clearAll();}else window.myPlanPageData.clear(kind);}catch(e){alert('삭제하지 못했습니다: '+e.message);}
}));
})();
