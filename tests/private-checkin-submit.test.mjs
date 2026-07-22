import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/relationship-v2.js',import.meta.url),'utf8');
const polishSource=fs.readFileSync(new URL('../public/experience-polish.js',import.meta.url),'utf8');
const start=source.indexOf('window.submitPrivateCheckin=async function(){');
const end=source.indexOf('\nwindow.completePrivateAssignment=',start);
const submitSource=source.slice(start,end);

test('private check-in does not force a rerendering account refresh',()=>{
  assert.ok(start>=0&&end>start,'submit handler must exist');
  assert.doesNotMatch(submitSource,/\.refresh\s*\(/);
  assert.match(source,/privateCheckinSubmitting/);
  assert.match(source,/id="privateCheckinSubmit"/);
  assert.match(polishSource,/id="privateCheckinSubmit"/);
  assert.doesNotMatch(source,/usfr-private-state[^\n]+reflect/);
  assert.doesNotMatch(source,/usfr-profile-changed[^\n]+reflect/);
});

test('rapid duplicate submissions collapse into one request and retain the response',async()=>{
  let guideCalls=0;
  let refreshCalls=0;
  let resolveGuide;
  const guidePromise=new Promise(resolve=>{resolveGuide=resolve});
  const elements={
    privateEvent:{value:'We agreed to talk, but the conversation stopped.'},
    privateFeeling:{value:'dismissed'},
    privateNeed:{value:'clarity'},
    privateQuestion:{value:'What is the fairest next step?'},
    privateIntensity:{value:'7'},
    privateGuideResponse:{innerHTML:''},
    privateCheckinSubmit:{disabled:false,textContent:'Ask the Guide privately'},
  };
  const state={checkins:[]};
  const context={
    window:{},
    privateCheckinSubmitting:false,
    document:{getElementById:id=>elements[id]||null},
    fb:()=>({
      guideCall:async()=>{guideCalls+=1;return guidePromise},
      refresh:async()=>{refreshCalls+=1},
    }),
    state,
    save:()=>{},
    now:()=>new Date().toISOString(),
    toast:()=>{},
    escapeHtml:value=>String(value),
    console,
  };
  vm.createContext(context);
  vm.runInContext(submitSource,context);
  const first=context.window.submitPrivateCheckin();
  const second=context.window.submitPrivateCheckin();
  assert.equal(guideCalls,1);
  assert.equal(elements.privateCheckinSubmit.disabled,true);
  resolveGuide({response:'Keep the facts and the assumption separate.'});
  await Promise.all([first,second]);
  assert.equal(refreshCalls,0);
  assert.equal(state.checkins.length,1);
  assert.match(elements.privateGuideResponse.innerHTML,/Keep the facts and the assumption separate/);
  assert.equal(elements.privateCheckinSubmit.disabled,false);
});
