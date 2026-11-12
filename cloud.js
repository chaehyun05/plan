(() => {
'use strict';
window.myPlanCloudBooted = true;
const {url:SUPABASE_URL='',key:SUPABASE_KEY=''}=window.MYPLAN_CONFIG||{};
function reason(e){
 const message=e?.message||String(e);
 if(message.includes('PGRST202')||message.includes('Could not find the function'))return 'Supabase에서 필요한 함수를 찾지 못했습니다. setup.sql 전체를 같은 프로젝트의 SQL Editor에서 실행하세요. 상세: '+message;
 if(message.includes('permission denied')||message.includes('42501'))return '데이터 접근 권한이 없습니다. setup.sql 전체를 다시 실행하세요. 상세: '+message;
 if(message.includes('Invalid API key')||message.includes('401'))return '프로젝트 주소와 공개 키가 맞는지 확인하세요. 상세: '+message;
 if(e?.name==='AbortError')return '서버 응답이 15초 이상 지연됐습니다. Supabase 프로젝트 상태와 인터넷 연결을 확인하고 다시 시도하세요.';
 if(message.includes('Failed to fetch')||message.includes('Load failed'))return '서버에 연결하지 못했습니다. 인터넷·차단 확장 프로그램·Supabase 프로젝트 상태를 확인하세요.';
 return message;
}
function createClient(url,key){return {rpc:async(name,args)=>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:{'apikey':key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:controller.signal});
 const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{throw Error('서버가 올바른 JSON을 반환하지 않았습니다. HTTP '+response.status);}
 if(!response.ok)throw Error((data?.code||response.status)+': '+(data?.message||text));
 return {data,error:null};
 }catch(e){return {data:null,error:Error(reason(e))};}finally{clearTimeout(timeout);}
 }};}
const $=id=>document.getElementById(id),status=s=>$('cloud-status').textContent=s;
const keys=['myplan-data-v2','myplan-meals-v1','myplan-habits-v1','myplan-routine-v1'],rawSet=Storage.prototype.setItem;
const collect=()=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
let client,roomKey,revision=0,dirty=false,saving=false,loaded=false,blocked=false,timer,deleting=false;
const normalized=s=>s.normalize('NFC').trim();
async function hash(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('myplan-room-v1:'+s)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function validate(p){if(!p||typeof p!=='object'||Array.isArray(p))throw Error('클라우드 기록 형식 오류');for(const k of keys){if((k==='myplan-habits-v1'||k==='myplan-routine-v1')&&p[k]===undefined)p[k]=null;if(p[k]!==null&&typeof p[k]!=='string')throw Error('기록 형식 오류');if(p[k]!==null)JSON.parse(p[k]);}return p;}
function script(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src+'?v=20261112mat1';s.onload=ok;s.onerror=()=>no(Error(src+' 파일을 불러오지 못했습니다. GitHub 저장소 첫 화면에 이 파일이 있는지 확인하세요.'));document.body.appendChild(s);});}
function cache(){if(roomKey)rawSet.call(localStorage,'room-cache-'+roomKey,JSON.stringify(collect()));}
async function save(){if(!dirty||!loaded||blocked||saving||deleting)return;saving=true;const payload=collect();status('클라우드 저장 중…');try{const {data,error}=await client.rpc('save_shared_planner',{p_key:roomKey,p_payload:payload,p_expected:revision});if(error)throw error;revision=data;dirty=JSON.stringify(payload)!==JSON.stringify(collect());status(dirty?'추가 변경 저장 대기 중…':'클라우드 저장 완료');if(dirty)timer=setTimeout(save,800);}catch(e){if(e.message.includes('CONFLICT')){blocked=true;$('cloud-reload').hidden=false;status('다른 기기 변경과 충돌했습니다. 현재 기록을 백업한 뒤 최신 기록을 불러오세요.');}else status('저장 실패: '+e.message+' · 현재 기록을 백업하세요.');}finally{saving=false;}}
Storage.prototype.setItem=function(k,v){rawSet.call(this,k,v);if(this===localStorage&&keys.includes(k)&&loaded&&!deleting){cache();dirty=true;clearTimeout(timer);timer=setTimeout(save,900);}};
window.addEventListener('online',save);window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
$('cloud-reload').onclick=()=>{if(dirty&&!confirm('미저장 변경을 버리고 최신 기록을 불러올까요? 먼저 백업하세요.'))return;dirty=false;location.reload();};
$('cloud-logout').onclick=async()=>{await save();if(dirty||saving){status('미저장 변경이 있습니다. 먼저 백업 또는 저장하세요.');return;}cache();localStorage.removeItem('myplan-room-name');for(const k of keys)localStorage.removeItem(k);localStorage.removeItem('myplan-data-v1');location.reload();};
function clearCurrentLocal(){localStorage.removeItem('myplan-room-name');localStorage.removeItem('room-cache-'+roomKey);for(const k of keys)localStorage.removeItem(k);localStorage.removeItem('myplan-data-v1');}
$('cloud-delete').onclick=()=>{if(saving){status('저장 중입니다. 잠시 후 다시 눌러주세요.');return;}$('delete-password').value='';$('delete-error').textContent='';$('delete-dialog').showModal();};
$('delete-cancel').onclick=()=>$('delete-dialog').close();
$('delete-form').onsubmit=async e=>{e.preventDefault();if(saving||deleting)return;const password=$('delete-password').value;if(!password){return;}if(!confirm('현재 기록방의 모든 기록을 정말 삭제할까요? 삭제 후 이름 입력 화면으로 돌아갑니다.'))return;deleting=true;clearTimeout(timer);$('delete-form').querySelector('button[type=submit]').disabled=true;
try{const {error}=await client.rpc('delete_shared_planner',{p_key:roomKey,p_password:password,p_expected:revision});if(error)throw error;dirty=false;try{window.MyRooms&&window.MyRooms.dropSite&&window.MyRooms.dropSite(localStorage.getItem('myplan-room-name'),'plan')}catch(_){}clearCurrentLocal();$('delete-dialog').close();alert('습관 기록을 포함한 기록을 삭제했습니다. 같은 이름으로 다시 들어가면 빈 기록으로 시작합니다.');location.reload();}
catch(e){$('delete-error').textContent=e.message.includes('WRONG_PASSWORD')?'비밀번호가 틀렸습니다.':e.message.includes('CONFLICT')?'다른 기기에서 기록이 변경됐습니다. 최신 기록을 불러온 후 다시 삭제하세요.':'삭제 실패: '+e.message;}
finally{deleting=false;$('delete-form').querySelector('button[type=submit]').disabled=false;$('delete-password').value='';if(dirty&&!blocked)timer=setTimeout(save,1000);}};
async function open(name){if(loaded)return;name=normalized(name);if(name.length<2||name.length>80){status('기록방 이름은 2~80자로 입력하세요.');return;}$('cloud-form').querySelector('button').disabled=true;try{roomKey=await hash(name);status('기록방 불러오는 중…');const {data,error}=await client.rpc('read_shared_planner',{p_key:roomKey});if(error)throw error;let payload=data?validate(data.payload):Object.fromEntries(keys.map(k=>[k,null]));revision=data?data.revision:0;
if(data?.cleared)localStorage.removeItem('room-cache-'+roomKey);
const local=localStorage.getItem('room-cache-'+roomKey);if(local){const cached=validate(JSON.parse(local));if(JSON.stringify(cached)!==JSON.stringify(payload)&&confirm('이 기기에 클라우드와 다른 기록이 있습니다. 로컬 기록을 먼저 열어 백업할까요? 취소하면 클라우드 기록을 불러옵니다.')){payload=cached;blocked=true;$('cloud-reload').hidden=false;}}
for(const k of keys){if(payload[k]===null)localStorage.removeItem(k);else rawSet.call(localStorage,k,payload[k]);}localStorage.removeItem('myplan-data-v1');rawSet.call(localStorage,'myplan-room-name',name);{const tr=$('title-room');if(tr){tr.textContent=name;tr.title='기록방: '+name;tr.hidden=false;}}window.MyRooms&&window.MyRooms.remember(name);
document.body.classList.add('auth-ready');await script('script.js');await script('meal.js');await script('presets.js');await script('page-actions.js');loaded=true;const hf=document.getElementById('habit-frame');if(hf)hf.src='habits.html?v=23fix';const rf=document.getElementById('routine-frame');if(rf)rf.src='routine.html?v=3';cache();window.dispatchEvent(new Event('resize'));$('cloud-form').hidden=true;$('cloud-logout').hidden=false;$('cloud-delete').hidden=false;status(name+(blocked?' · 로컬 복구 모드. 백업 후 최신 기록을 불러오세요.':' · 연결됨.'+(name.length<8?' (이름이 짧아 남이 짐작하기 쉬워요. 긴 이름의 새 방으로 옮기는 걸 권해요.)':'')));if((!data||window.myPlanSeeded||window.myPlanScheduleCleaned)&&!blocked){dirty=true;save();}
}catch(e){if(!loaded)document.body.classList.remove('auth-ready');status('열기 실패: '+reason(e));}finally{$('cloud-form').querySelector('button').disabled=false;}}
$('cloud-form').onsubmit=e=>{e.preventDefault();if(client)open($('room-name').value);};
try{if(!SUPABASE_URL||!SUPABASE_KEY||SUPABASE_URL.includes('YOUR_PROJECT'))throw Error('먼저 supabase-config.js를 설정하세요. 시작안내.txt를 참고하세요.');if(location.protocol==='file:')throw Error('다운로드한 HTML이 아니라 GitHub Pages의 https 사이트 주소로 열어주세요.');client=createClient(SUPABASE_URL,SUPABASE_KEY);status('연결 준비 완료 · 기록방 이름을 2자 이상 입력하세요.');const name=localStorage.getItem('myplan-room-name');if(name){$('room-name').value=name;open(name);}}catch(e){status(e.message);}

})();
