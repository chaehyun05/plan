(()=>{
'use strict';
const $=id=>document.getElementById(id),days=['일','월','화','수','목','금','토'];
const rows=[
[1,'C++프로그래밍 · 공1217','10:30','12:20'],[1,'정역학 · 공4417','13:30','14:45'],[1,'기계제도및실습 · 공4521','15:00','18:45'],
[2,'프로그래밍언어론 · 공4113','09:00','10:15'],[2,'컴퓨터공학캡스톤디자인(1) · 공1300','12:30','16:20'],
[3,'정역학 · 공4417','09:00','10:15'],[3,'근로','10:50','12:50'],[3,'C++프로그래밍 · 공1217','13:30','15:20'],[3,'근로','16:00','19:00'],
[4,'근로','09:00','14:00'],[4,'프로그래밍언어론 · 공4113','15:00','16:15'],[4,'근로','17:00','19:00'],[5,'근로','09:00','18:00'],
...[1,2,3,4,5].map(d=>[d,'복싱','19:45','21:00'])];
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('preset-rows').innerHTML=rows.map((r,i)=>`<tr><td>${days[r[0]]}</td><td>${esc(r[1])}</td><td><input type="time" id="ps-${i}" value="${r[2]}" aria-label="${days[r[0]]} ${esc(r[1])} 시작"></td><td><input type="time" id="pe-${i}" value="${r[3]}" aria-label="${days[r[0]]} ${esc(r[1])} 종료"></td><td><input type="checkbox" id="pc-${i}" checked aria-label="${days[r[0]]} ${esc(r[1])} 포함"></td></tr>`).join('');
const minutes=s=>/^\d{2}:\d{2}$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
$('preset-open').addEventListener('click',()=>$('preset-dialog').showModal());
$('preset-close').addEventListener('click',()=>$('preset-dialog').close());
$('preset-import').addEventListener('click',()=>{
const input=[];const stamp=Date.now().toString(36);let seq=0;
function make(day,task,start,end){input.push({id:'preset-'+stamp+'-'+seq++,groupId:'preset-'+task,day,task,start,end});}
for(let i=0;i<rows.length;i++){
 if(!$('pc-'+i).checked)continue;
 const [day,task]=rows[i],start=minutes($('ps-'+i).value),end=minutes($('pe-'+i).value);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>1440||end<=start){$('preset-result').textContent=days[day]+' '+task+'의 시작·종료를 확인하세요. 아직 추가하지 않았습니다.';return;}
 make(day,task,start,end);
}
if(!input.length){$('preset-result').textContent='포함할 일정을 선택하세요.';return;}
if(!confirm('확인한 시작·종료 시각 그대로 시간표를 적용할까요? 근로 이동은 해당 블록 안에 포함하며 시간을 늘리지 않습니다. 직접 추가한 일정은 유지합니다.'))return;
try{const r=window.myPlanSchedule.add(input,true);$('preset-result').textContent=`${r.added}개 추가 · 동일 일정 ${r.skipped}개 건너뜀 · 겹치는 일정 ${r.conflicts}개 (주간 계획에서 확인하세요). 클라우드 저장 완료를 확인하세요.`;}catch(e){$('preset-result').textContent='추가 실패: '+e.message;}
});
})();
