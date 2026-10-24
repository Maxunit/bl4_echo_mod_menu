'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const environment=require('./frontend_test_env')();
const {Node,ctx,doc,pending,records,events,documentEvents,nativeEvents,windowListeners,observers,removedNodes,captureFocusPolicy,dispatchElementFocus}=environment;
const dictionary=JSON.parse(fs.readFileSync(path.join(__dirname,'../ui/i18n.json'),'utf8'));
assert.deepStrictEqual(Object.keys(dictionary.en).sort(),Object.keys(dictionary.de).sort());
let source=fs.readFileSync(path.join(__dirname,'../ui/editor.js'),'utf8').replace('__ECHO_TRANSLATIONS__',JSON.stringify(dictionary));
vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/controller.js'),'utf8'),ctx);
vm.runInContext(source,ctx);
// Execute the exported original WidgetBase helper, including its real event name
// and ActiveTextInputs aggregation. Do not replace it with a permissive focus stub.
vm.runInContext('class GbxCustomElement {}\n'+fs.readFileSync(path.join(__dirname,'fixtures/widget_class.js'),'utf8')+'\nthis.NativeWidgetBase=WidgetBase;',ctx);
function nativeHost(widget,ident='def_bl4_empty_page_v40') {
 widget.WidgetIdent=ident;widget.InstId=0;widget.ActiveTextInputs=new Set();widget.WidgetDiv=widget;widget.CleanupAnimations=function(){};widget.TriggerWidgetEvent=ctx.NativeWidgetBase.prototype.TriggerWidgetEvent;
 widget.OnTextInputFocusedChanged=ctx.NativeWidgetBase.prototype.OnTextInputFocusedChanged;
 widget.MakeEventName=ctx.NativeWidgetBase.prototype.MakeEventName;
 return widget;
}
// The host is loaded while the inventory is open, before its own activation.
// Merely attaching it or updating data must not paint an interactive Mod Menu.
let dormantWidget=null,dormantState=null;
{
dormantWidget=nativeHost(new Node('widget-list-menu'));dormantWidget.IsActivated=false;
dormantWidget.DataModel=Object.freeze({entries:Object.freeze([])});
ctx.echoOnEditorLifecycle(dormantWidget,'attached');
dormantState=dormantWidget.EchoMenuState;

assert.strictEqual(dormantState.root.style.display,'none');assert.strictEqual(dormantState.root.style.pointerEvents,'none');
assert.strictEqual(dormantState.root.childElementCount,0);assert.strictEqual(pending.length,0);
for(const event of ['Event_DataUpdated','UpdateHintBar','attached'])ctx.echoOnEditorLifecycle(dormantWidget,event);
ctx.echoDraw(dormantState);ctx.echoFetch(dormantState);
assert.strictEqual(dormantState.root.style.display,'none');assert.strictEqual(pending.length,0);
}
function reenterNative(widget,state) {
 widget.IsActivated=true;ctx.echoOnEditorLifecycle(widget,'Event_Activate');
 const request=pending.pop();
 if(request)reply(request,{catalog:state.catalog,epoch:state.epoch,pending:Object.values(state.saved),queue_revision:state.queueRevision,preferences:{language:state.preference}});
}
const widget=new Node('widget-list-menu');widget.WidgetIdent='def_bl4_empty_page_v40';widget.IsActivated=true;widget.DataModel=Object.freeze({entries:Object.freeze([])});
nativeHost(widget);
const wrapper=widget.appendChild(new Node('div'));wrapper.className='list_wrapper';
ctx.echoOnEditorLifecycle(widget,'Event_Activate');
const state=widget.EchoMenuState;
assert.strictEqual(wrapper.style.display,'none');assert.strictEqual(pending.length,1);
const mods=[{id:'m1',name:'Example <script>safe</script>',author:'Example author',version:'1',description:'A mod',enabled:true,status:'Enabled',can_toggle:true,persistent:true,categories:[{id:'camera',name:'Camera',presets:[{label:'NEAR',values:{camera_offset_x:9}}]},{id:'other',name:'Other'}],options:[
 {id:'num',identifier:'camera_offset_x',name:'Offset',category:'camera',kind:'number',value:3,default:0,has_default:true,min:-10,max:10,step:1,integer:true,editable:true,description:'Camera offset',unit:'cm'},
 {id:'bool',name:'Toggle',category:'camera',kind:'boolean',value:true,default:false,has_default:true,editable:true},
 {id:'choice',name:'Mode',category:'other',kind:'choice',value:'A',default:'A',has_default:true,choices:['A','B'],editable:true},
 {id:'action',name:'Action',category:'other',kind:'action',value:null,editable:false,can_run:true}
]}, {id:'sdk',name:'Python SDK',version:'1',author:'SDK',enabled:true,status:'Loaded',can_toggle:false,persistent:false,categories:[],options:[]}];
const catalog={mods,errors:[]};
function reply(xhr,fields,status=200){xhr.status=status;xhr.responseText=JSON.stringify(Object.assign({ok:true,service:'echo-mod-menu-v1',epoch:'e1',active:true,catalog,pending:[],queue_revision:0,last_result:null,preferences:{language:'auto'}},fields));xhr.onload();}
reply(pending.shift(),{});
const persistentPanes=state.scrollPanes.slice();
const persistentNodes=persistentPanes.flatMap(p=>[p.frame,p.view,p.content,p.rail,p.track,p.thumb]);
const persistentCards=[state.modCards.m1,state.modCards.sdk];
assert.strictEqual(observers.length,2);
assert(observers.every(o=>o.targets.length===3));
assert.strictEqual(state.layoutMode,'batch_immediate_layout');
assert(state.scrollPanes.every(p=>!p.awaitLayout&&p.rail.style.opacity==='1'));
assert.strictEqual(ctx.echoLanguage(state),'de');
assert.strictEqual(state.root.querySelectorAll('.echo-mod-card').length,2);
assert(!state.root.querySelectorAll('*').some(n=>n.tagName==='SCRIPT'));
const button=text=>state.root.querySelectorAll('button').find(n=>n.textContent===text);
assert(state.root.textContent.includes('ECHO // MOD-MANAGER'));
assert(button('Speichern & Übernehmen').disabled);
assert.strictEqual(button('Speichern & Übernehmen').style.opacity,'0.45');
assert(state.root.querySelector('.echo-mode').textContent==='MOD-KONFIGURATION');
{
 assert(state.root.style.cssText.includes('background-color:transparent'));
 assert.strictEqual(state.root.querySelector('.echo-facets'),null);
}
assert.strictEqual(state.root.querySelectorAll('.echo-frame-corner').length,4);
assert.strictEqual(state.root.querySelector('.echo-editor').firstChild.className,'echo-categories');
assert.strictEqual(state.root.querySelector('.echo-mod-details').querySelector('button').textContent,'Deaktivieren');
assert(state.root.querySelector('.echo-mod-symbol'));
const cardHeights=state.root.querySelectorAll('.echo-mod-card').map(n=>n.style.cssText.match(/;height:([^;]+)/)[1]);
assert(cardHeights.every(h=>h===cardHeights[0]));
assert.strictEqual(state.root.querySelectorAll('.echo-scrollbar').length,2);
assert.strictEqual(state.root.querySelector('.echo-unit').textContent,'cm');
assert.strictEqual(state.optionRows[1].row.style.borderLeftColor,'#c17e24'); // Active boolean.
let input=state.root.querySelector('input');input.value='7';input.listeners.input();
assert.strictEqual(state.drafts['value:m1:num'].value,7);assert(!button('Speichern & Übernehmen').disabled);
assert.strictEqual(button('Speichern & Übernehmen').style.opacity,'1');
assert.strictEqual(state.statusNode.style.color,'#d7b071');
assert.strictEqual(state.optionRows[0].row.style.borderLeftColor,'#c17e24'); // Numeric draft.
input.value='7,5';input.listeners.input();assert(state.invalid['value:m1:num']);assert(button('Speichern & Übernehmen').disabled);
input.value='7';input.listeners.input();assert(!Object.keys(state.invalid).length);
button('Other').click();state.root.querySelector('.echo-choice').querySelectorAll('button')[1].click();
button('Aktion vormerken').click();assert(state.drafts['action:m1:action']);
button('Deaktivieren').click();assert.strictEqual(state.drafts['enabled:m1:'].value,false);
let card=state.root.querySelector('.echo-mod-selected');
assert(card.className.includes('echo-mod-on')); // Actual state stays active until native close/apply.
assert(card.querySelector('.echo-mod-preview').textContent==='Entwurf: Inaktiv');
assert.strictEqual(Object.keys(state.drafts).length,4);
button('Speichern & Übernehmen').click();
let request=pending.shift();assert(request.url.endsWith('/stage'));assert.strictEqual(request.body.commands.length,4);assert.strictEqual(request.body.epoch,'e1');
assert(state.busy);
reply(request,{pending:request.body.commands,queue_revision:1});
assert.strictEqual(Object.keys(state.saved).length,4);assert.strictEqual(ctx.echoDirty(state),0);
card=state.root.querySelector('.echo-mod-selected');
assert(card.className.includes('echo-mod-on'));
assert(card.querySelector('.echo-mod-preview').textContent==='Vorgemerkt: Inaktiv');
button('Camera').click();input=state.root.querySelector('input');input.value='8';input.listeners.input();
assert.strictEqual(ctx.echoDirty(state),1);
button('Entwurf verwerfen').click();assert.strictEqual(state.root.querySelector('input').value,'7');
button('Kategorie zurücksetzen').click();assert.strictEqual(state.drafts['value:m1:num'].value,0);assert.strictEqual(state.drafts['value:m1:bool'].value,false);
// Native tab deactivate retains draft/queued values and cancels active drag.
const before=JSON.stringify(state.drafts);widget.IsActivated=false;ctx.echoOnEditorLifecycle(widget,'Event_Deactivate');
widget.IsActivated=true;ctx.echoOnEditorLifecycle(widget,'Event_Activate');reply(pending.shift(),{pending:request.body.commands,queue_revision:1});assert.strictEqual(JSON.stringify(state.drafts),before);
button('EN').click();request=pending.shift();assert(request.url.endsWith('/preferences'));reply(request,{preferences:{language:'en'}});
assert(state.root.textContent.includes('Save & Apply'));assert.strictEqual(ctx.echoLanguage(state),'en');
button('Discard all changes').click();request=pending.shift();assert.deepStrictEqual(request.body.commands,[]);reply(request,{pending:[],queue_revision:2});assert.strictEqual(Object.keys(state.drafts).length,0);
// Slider is event-driven, not a timer, and stops at tab exit.
const track=state.root.querySelector('.echo-track');track.listeners.mousedown({clientX:240,button:0,stopPropagation(){}});assert.strictEqual(state.drafts['value:m1:num'].value,10);
documentEvents.mousemove({clientX:100});assert.strictEqual(state.drafts['value:m1:num'].value,-10);
documentEvents.mouseup();assert.strictEqual(ctx.echoEditorDrag,null);
// An old response after deactivate cannot overwrite a new session.
ctx.echoFetch(state);let stale=pending.shift();widget.IsActivated=false;ctx.echoOnEditorLifecycle(widget,'Event_Deactivate');reply(stale,{epoch:'bad',catalog:{mods:[],errors:[]}});assert.strictEqual(state.catalog.mods.length,2);
widget.IsActivated=true;ctx.echoOnEditorLifecycle(widget,'Event_Activate');reply(pending.shift(),{epoch:'e2',pending:[],queue_revision:0});assert.strictEqual(Object.keys(state.drafts).length,0);
// After an actual SDK state change, orange survives selection, hover, pointer exit and focus.
mods[0].enabled=false;ctx.echoFetch(state);reply(pending.shift(),{epoch:'e3',preferences:{language:'en'}});
card=state.root.querySelector('.echo-mod-selected');
assert(card.className.includes('echo-mod-off'));assert(card.querySelector('.echo-mod-state').textContent==='Inactive');
assert.strictEqual(card.style.backgroundColor,'#402719');assert(!card.querySelector('.echo-mod-preview'));
card.listeners.mouseenter();assert.strictEqual(card.style.backgroundColor,'#51321d');
card.listeners.focus();assert.strictEqual(card.style.outline,'1px solid #ffd0a1');
card.listeners.mouseleave();assert.strictEqual(card.style.backgroundColor,'#402719');
assert(card.style.backgroundImage.includes('#55351e')); // Orange gradient must survive pointer exit too.
card.listeners.blur();assert.strictEqual(card.style.outline,'none');
button('Enable').click();card=state.root.querySelector('.echo-mod-selected');
assert(card.className.includes('echo-mod-off'));assert(card.querySelector('.echo-mod-preview').textContent==='Draft: Active');
// Canceling a previously saved status is still a draft until the replacement save is acknowledged.
const change=state.drafts['enabled:m1:'];state.saved={'enabled:m1:':JSON.parse(JSON.stringify(change))};state.drafts={};ctx.echoDraw(state);
assert(state.root.querySelector('.echo-mod-preview').textContent==='Draft: Inactive');
state.saved={};ctx.echoDraw(state);
const tabs=state.root.querySelector('.echo-categories').querySelectorAll('button');
assert(tabs[0].style.cssText.includes('background-color:transparent'));
tabs[0].listeners.mouseenter();tabs[0].listeners.mouseleave();assert.strictEqual(tabs[0].style.backgroundColor,'transparent');
assert(tabs[0].style.backgroundImage.includes('linear-gradient'));
assert(!tabs[0].querySelector('.echo-button-corner'));
assert(state.root.querySelector('.echo-section').textContent.includes('2 options'));
assert(state.root.querySelector('.echo-body').style.cssText.includes('bottom:9.5rem'));
// Wheel, thumb, page clicks and buttons act on the same bounded viewport, without timers.
let pane=state.scrollPanes.find(p=>p.key.startsWith('options:'));
ctx.echoSyncScroll(pane);assert.strictEqual(pane.range,400);
pane.frame.listeners.wheel({deltaY:75,deltaMode:0,preventDefault(){},stopPropagation(){}});
assert.strictEqual(pane.view.scrollTop,75);assert.strictEqual(pane.thumb.style.top,'30px');
pane.thumb.listeners.mousedown({clientY:0,button:0,stopPropagation(){}});
documentEvents.mousemove({clientY:40});assert.strictEqual(pane.view.scrollTop,175);
documentEvents.mouseup();assert.strictEqual(ctx.echoScrollDrag,null);
pane.down.click();assert.strictEqual(pane.view.scrollTop,295);
ctx.echoDraw(state);pane=state.scrollPanes.find(p=>p.key.startsWith('options:'));assert.strictEqual(pane.view.scrollTop,295);
ctx.echoScrollTo(pane,99999);assert.strictEqual(pane.view.scrollTop,400);
pane.view._scrollHeight=50;ctx.echoSyncScroll(pane);assert(pane.down.disabled);assert.strictEqual(pane.rail.style.opacity,'0.25');
button('NEAR').click();assert.strictEqual(state.drafts['value:m1:num'].value,9);
pane=state.scrollPanes.find(p=>p.key.startsWith('options:'));
pane.thumb.listeners.mousedown({clientY:0,button:0,stopPropagation(){}});
widget.IsActivated=false;ctx.echoOnEditorLifecycle(widget,'Event_Deactivate');assert.strictEqual(ctx.echoScrollDrag,null);reenterNative(widget,state);
// Locked libraries cannot expose an activation button.
state.selected='sdk';ctx.echoDraw(state);assert(!button('Disable'));assert(state.root.textContent.includes(ctx.echoT(state,'locked')));
card=state.root.querySelector('.echo-mod-off');assert(!card.className.includes('echo-mod-selected'));
assert.strictEqual(card.style.backgroundColor,'#281d17');card.listeners.mouseenter();card.listeners.mouseleave();assert.strictEqual(card.style.backgroundColor,'#281d17');
state.catalog.mods[0].enabled=null;ctx.echoDraw(state);assert(state.root.querySelector('.echo-mod-unknown'));
// Category/mod changes never detach either viewport, rail, thumb or unchanged mod card.
assert.deepStrictEqual(state.scrollPanes,persistentPanes);
assert(persistentNodes.every(n=>!removedNodes.includes(n)));
assert.deepStrictEqual([state.modCards.m1,state.modCards.sdk],persistentCards);
assert(persistentCards.every(n=>!removedNodes.includes(n)));
assert.strictEqual(observers.length,2);
// No immediate-layout API: ResizeObserver resolves geometry after the renderer has settled,
// with no mouseenter/mousemove event, and without replacing the previous visible handle.
const flush=ctx.engine.executeImmediateLayoutSync;
delete ctx.engine.executeImmediateLayoutSync;
const oldThumbHeight=pane.thumb.style.height, oldOpacity=pane.rail.style.opacity;
state.selected='m1';state.category='camera';ctx.echoDraw(state);
pane=state.paneCache['echo-settings'];
assert(pane.awaitLayout);assert.strictEqual(state.layoutMode,'resize_observer');
assert.strictEqual(pane.thumb.style.height,oldThumbHeight);assert.strictEqual(pane.rail.style.opacity,oldOpacity);
pane.view._scrollHeight=900;environment.variables.layoutPending=false;pane.observer.deliver();
assert.strictEqual(pane.range,800);assert(!pane.awaitLayout);
assert(Math.abs(parseFloat(pane.thumb.style.height)-200/9)<0.001);
assert.strictEqual(pane.rail.style.opacity,'1');
// Zero-size intermediate layout is not an empty list and cannot erase the saved position.
ctx.echoScrollTo(pane,230);
const key=pane.key, expectedHeight=pane.thumb.style.height;
pane.view._clientHeight=0;pane.view._scrollHeight=0;pane.track._clientHeight=0;
const viewRect=pane.view.getBoundingClientRect, trackRect=pane.track.getBoundingClientRect;
pane.view.getBoundingClientRect=pane.track.getBoundingClientRect=()=>({left:0,top:0,width:0,height:0});
ctx.echoDraw(state);environment.variables.layoutPending=false;pane.observer.deliver();
assert(pane.awaitLayout);assert.strictEqual(state.positions[key],230);
assert.strictEqual(pane.thumb.style.height,expectedHeight);assert.strictEqual(pane.rail.style.opacity,'1');
pane.view._clientHeight=100;pane.view._scrollHeight=500;pane.track._clientHeight=200;
pane.view.getBoundingClientRect=viewRect;pane.track.getBoundingClientRect=trackRect;
pane.observer.deliver();assert.strictEqual(pane.view.scrollTop,230);assert(!pane.awaitLayout);
// Cohtml call rejection is contained and reported once; the observer path still works.
ctx.engine.executeImmediateLayoutSync=()=>{throw Error('unsupported layout call');};
ctx.echoDraw(state);ctx.echoDraw(state);environment.variables.layoutPending=false;pane.observer.deliver();
assert.strictEqual(records.filter(r=>r[0]==='scroll_layout_error').length,1);
assert(!pane.awaitLayout);
ctx.engine.executeImmediateLayoutSync=flush;
const callsBeforeResize=environment.variables.layoutCalls;events.resize();assert.strictEqual(environment.variables.layoutCalls,callsBeforeResize+1);
assert(!pane.awaitLayout);
// Switching mod while the pointer remains stationary does not allocate a new rail or card.
for(let i=0;i<30;i++) {state.selected=i%2?'m1':'sdk';ctx.echoDraw(state);}
assert.deepStrictEqual(state.scrollPanes,persistentPanes);assert.strictEqual(observers.length,2);
assert(persistentNodes.every(n=>!removedNodes.includes(n)));
assert(persistentCards.every(n=>!removedNodes.includes(n)));
// Empty filters hide the right content without destroying its scrollbar; clearing the
// filter restores the same frame/track/thumb and remembered category position.
state.filter='off';ctx.echoDraw(state);
assert.strictEqual(state.selected,null);assert.strictEqual(pane.frame.style.display,'none');
state.filter='all';ctx.echoDraw(state);
assert.strictEqual(pane.frame.style.display,'flex');
assert.deepStrictEqual(state.scrollPanes,persistentPanes);assert.strictEqual(observers.length,2);
assert(persistentNodes.every(n=>!removedNodes.includes(n)));
ctx.LanguageSettings.CurrentLangCode='fr';state.preference='auto';assert.strictEqual(ctx.echoLanguage(state),'en');
// Input regression: emulate Cohtml events without .key, actual focus/blur and
// value setters that move the caret. Enter is field confirmation, never /stage.
const inputWidget=new Node('widget-list-menu');inputWidget.WidgetIdent='def_bl4_empty_page_v40';inputWidget.IsActivated=true;
nativeHost(inputWidget);
const edit=ctx.echoMountEditor(inputWidget);
edit.active=true;edit.epoch='input-test';edit.preference='de';
edit.catalog={mods:[{id:'edit',name:'Input fixture',enabled:true,can_toggle:false,categories:[{id:'numbers',name:'Numbers'}],options:[
 {id:'float',name:'Float',kind:'number',category:'numbers',editable:true,value:1,min:-20,max:20,step:0.1,integer:false},
 {id:'integer',name:'Integer',kind:'number',category:'numbers',editable:true,value:2,min:-20,max:20,step:1,integer:true}
]}],errors:[]};ctx.echoDraw(edit);
const floatKey='value:edit:float', intKey='value:edit:integer';
let number=edit.root.querySelector('input'), leaked=0;
edit.root.addEventListener('keydown',()=>leaked++);edit.root.addEventListener('keyup',()=>leaked++);edit.root.addEventListener('keypress',()=>leaked++);
const queuedBefore=pending.length;
for(const shape of [{key:'Enter'},{key:'Unidentified',keyCode:13},{which:13},{code:'NumpadEnter'},{key:'Return'}]) {
 number.focus();assert(inputWidget.ActiveTextInputs.has(number),'Native text input must be registered before typing');number.value=' 7,50 ';
 const down=number.fire('keydown',shape);assert(down.defaultPrevented&&down.stopped);
 assert.strictEqual(number.value,'7.5');assert.strictEqual(edit.drafts[floatKey].value,7.5);
 assert.strictEqual(doc.activeElement,number); // Keep the release on the input.
 const press=number.fire('keypress',shape),up=number.fire('keyup',shape);
 assert(press.defaultPrevented&&up.defaultPrevented);assert(doc.activeElement===number,'Enter must keep DOM focus');
 number.blur();
 assert.strictEqual(number.style.borderColor,'#365b6c');
}
assert.strictEqual(pending.length,queuedBefore);assert.strictEqual(leaked,0);
// Ordinary editing keys keep native text defaults; input must not rewrite .value.
number.focus();number.value='12';number.selectionStart=number.selectionEnd=1;
const writes=number.valueWrites;number.fire('input');assert.strictEqual(number.valueWrites,writes);
assert.strictEqual(number.selectionStart,1);assert.strictEqual(edit.drafts[floatKey].value,12);
for(const key of ['ArrowLeft','ArrowRight','Backspace','Delete','Home','End','a','Tab']) {
 const event=number.fire('keydown',{key});assert(!event.defaultPrevented&&!event.stopped);
}
number.value=' 3,25 ';number.fire('change');assert.strictEqual(number.value,'3.25');assert.strictEqual(edit.drafts[floatKey].value,3.25);
number.value=' 4,25 ';number.blur();assert.strictEqual(number.value,'4.25');assert.strictEqual(edit.drafts[floatKey].value,4.25);
// Invalid confirmation stays focused, does not clamp or save, and remains invalid.
number.focus();number.value='999';number.fire('input');
number.fire('keydown',{keyCode:13});number.fire('keyup',{keyCode:13});
assert.strictEqual(doc.activeElement,number);assert.strictEqual(number.value,'999');
assert(edit.invalid[floatKey]);assert.strictEqual(number.style.borderColor,'#dd8866');
assert(edit.saveButton.disabled);assert.strictEqual(edit.drafts[floatKey].value,4.25);
// Escape restores the draft from focus entry, including after intermediate valid values.
number.value='8';number.fire('input');number.value='-';number.fire('input');
number.fire('keydown',{which:27});number.fire('keyup',{which:27});
assert.strictEqual(number.value,'4.25');assert.strictEqual(edit.drafts[floatKey].value,4.25);
assert(!edit.invalid[floatKey]);assert.strictEqual(doc.activeElement,null);
let integer=edit.root.querySelectorAll('input')[1];integer.focus();integer.value='3.5';integer.fire('input');
integer.fire('keydown',{key:'Enter'});integer.fire('keyup',{key:'Enter'});
assert(edit.invalid[intKey]);assert.strictEqual(doc.activeElement,integer);
integer.fire('keydown',{key:'Esc'});integer.fire('keyup',{key:'Esc'});
assert.strictEqual(integer.value,'2');assert(!edit.drafts[intKey]);assert(!edit.invalid[intKey]);
// Composition Enter must not finish a partial IME edit. A final Enter can confirm.
number.focus();number.value='6';let composing=number.fire('keydown',{key:'Enter',isComposing:true});
assert(!composing.defaultPrevented);assert.strictEqual(doc.activeElement,number);
number.fire('keyup',{key:'Enter',isComposing:true});assert.strictEqual(doc.activeElement,number);
number.fire('keydown',{key:'Enter'});number.fire('keyup',{key:'Enter'});assert.strictEqual(edit.drafts[floatKey].value,6);
assert.strictEqual(leaked,10); // Eight editing keys plus composing down/up may propagate.
// Stale, disabled, closed or foreign-session input handlers must not write drafts.
const detached=number;ctx.echoDraw(edit);let snapshot=JSON.stringify(edit.drafts);
detached.value='9';detached.fire('input');detached.fire('blur');detached.fire('keydown',{keyCode:13});detached.fire('mousedown',{button:0});detached.fire('click',{button:0});
assert.strictEqual(JSON.stringify(edit.drafts),snapshot);
number=edit.root.querySelector('input');edit.busy=true;number.value='9';number.fire('input');number.fire('change');number.fire('mousedown',{button:0});
assert.strictEqual(JSON.stringify(edit.drafts),snapshot);edit.busy=false;
edit.epoch='new-session';number.fire('keydown',{keyCode:13});assert.strictEqual(JSON.stringify(edit.drafts),snapshot);
ctx.echoDraw(edit);number=edit.root.querySelector('input');inputWidget.IsActivated=false;number.value='10';number.fire('blur');
assert.strictEqual(JSON.stringify(edit.drafts),snapshot);inputWidget.IsActivated=true;edit.closed=true;number.fire('input');
assert.strictEqual(JSON.stringify(edit.drafts),snapshot);
assert.strictEqual(pending.length,queuedBefore);
// Model keyboard forwarding as gated by the original widget's native focus
// notification. Unlike the old fixture, this path does not directly assign a
// value and claim the keyboard worked. No native focus => no delivered keys.
edit.closed=false;ctx.echoDraw(edit);number=edit.root.querySelector('input');
const nativeEventName='Event_def_bl4_empty_page_v40_0_TextInputHasFocusChanged';
function deliveredKey(fields,text) {
 const last=nativeEvents.filter(e=>e[0]===nativeEventName).at(-1);
 if(!last||last[1]!==true||!inputWidget.ActiveTextInputs.has(number)||doc.activeElement!==number)return false;
 const down=number.fire('keydown',fields);
 if(!down.defaultPrevented) {
  let start=number.selectionStart,end=number.selectionEnd;
  if(fields.keyCode===8) {if(start===end)start=Math.max(0,start-1);text='';}
  if(text!==undefined){number.value=number.value.slice(0,start)+text+number.value.slice(end);number.selectionStart=number.selectionEnd=start+text.length;number.fire('input');}
 }
 number.fire('keyup',fields);return true;
}
assert(!deliveredKey({keyCode:49},'1'));
number.focus();assert(inputWidget.ActiveTextInputs.has(number));assert(edit.nativeTextInput.input===number);
assert.deepStrictEqual(nativeEvents.at(-1),[nativeEventName,true,number.id]);
number.selectionStart=0;number.selectionEnd=number.value.length;
assert(deliveredKey({keyCode:49},'1'));assert.strictEqual(number.value,'1');
assert(deliveredKey({keyCode:98,code:'Numpad2'},'2'));assert.strictEqual(number.value,'12');
assert(deliveredKey({keyCode:8}));assert.strictEqual(number.value,'1');
assert(deliveredKey({keyCode:110,code:'NumpadDecimal'},','));assert.strictEqual(number.value,'1,');
assert(deliveredKey({keyCode:101,code:'Numpad5'},'5'));assert.strictEqual(edit.drafts[floatKey].value,1.5);
assert(deliveredKey({keyCode:13,code:'NumpadEnter'}));assert.strictEqual(number.value,'1.5');
assert(inputWidget.ActiveTextInputs.has(number));assert.strictEqual(doc.activeElement,number);
assert.strictEqual(edit.nativeTextInput.input,number);
number.blur();assert(!deliveredKey({keyCode:8}));assert.strictEqual(number.value,'1.5');
// Same-field re-entry: the previous fixture assumed .blur() always changed
// activeElement and the next edit always dispatched focus. Model both missing
// transitions explicitly; no other field is allowed to provide the reset.
function pointerClick(field) {
 field.fire('mousedown',{button:0});field.focus();field.fire('mouseup',{button:0});field.fire('click',{button:0});
}
// Repeated numeric edit sequence: 45 -> Backspace -> 4 -> Numpad0 -> 40 ->
// NumpadEnter -> click same field -> Backspace -> 4. Confirm cannot
// call blur or publish native text-focus false, even transiently.
const floatSpec=edit.catalog.mods[0].options[0];floatSpec.value=45;floatSpec.max=100;
edit.drafts={};edit.saved={};edit.invalid={};ctx.echoDraw(edit);number=edit.root.querySelector('input');
const initialEnterCount=edit.textEnterConfirmed||0;
for(let cycle=0;cycle<24;cycle++) {
 pointerClick(number);number.selectionStart=number.selectionEnd=number.value.length;
 if(cycle){number.selectionStart=0;number.selectionEnd=number.value.length;assert(deliveredKey({keyCode:52},'4'));assert(deliveredKey({keyCode:101,code:'Numpad5'},'5'));}
 assert.strictEqual(number.value,'45');
 assert(deliveredKey({keyCode:8}));assert.strictEqual(number.value,'4');
 assert(deliveredKey({keyCode:96,code:'Numpad0'},'0'));assert.strictEqual(number.value,'40');
 const released=edit.textFocusReleases||0,blurs=number.blurCount||0,eventsAt=nativeEvents.length;
 assert(deliveredKey({keyCode:13,code:'NumpadEnter'}));
 assert.strictEqual(number.blurCount||0,blurs,'Enter must keep editing the current field');
 assert.strictEqual(edit.textFocusReleases||0,released);
 assert.strictEqual(nativeEvents.length,eventsAt);
 assert.strictEqual(doc.activeElement,number);assert(inputWidget.ActiveTextInputs.has(number));
 assert.strictEqual(ctx.echoDirty(edit),1);assert.strictEqual(edit.drafts[floatKey].value,40);
 pointerClick(number);assert(deliveredKey({keyCode:8}));assert.strictEqual(number.value,'4');
 assert.strictEqual(edit.drafts[floatKey].value,4);assert.strictEqual(pending.length,queuedBefore);
}
assert.strictEqual(edit.textEnterConfirmed,initialEnterCount+24);
// Clicking inside an ordinary in-progress edit must preserve caret/selection
// and the Escape baseline; only a completed edit gets a new starting snapshot.
number.blur();pointerClick(number);const startingDraft=JSON.stringify(edit.drafts[floatKey]);
number.value='4';number.fire('input');number.selectionStart=number.selectionEnd=0;
const pointerWrites=number.valueWrites;pointerClick(number);
assert.strictEqual(number.valueWrites,pointerWrites);assert.strictEqual(number.selectionStart,0);
number.value='5';number.fire('input');number.fire('keydown',{key:'Escape'});number.fire('keyup',{key:'Escape'});
assert.strictEqual(JSON.stringify(edit.drafts[floatKey]),startingDraft);
// A different mouse button cannot reactivate an ended editor.
number.fire('mousedown',{button:2});assert.strictEqual(edit.nativeTextInput,null);
// Release happens before redraw removes a focused input, even without a DOM blur.
number.focus();const previous=number;ctx.echoDraw(edit);
assert(!inputWidget.ActiveTextInputs.has(previous));assert.strictEqual(edit.nativeTextInput,null);
number=edit.root.querySelector('input');number.focus();
inputWidget.IsActivated=false;ctx.echoOnEditorLifecycle(inputWidget,'Event_Deactivate');
assert.strictEqual(inputWidget.ActiveTextInputs.size,0);reenterNative(inputWidget,edit);
ctx.echoDraw(edit);number=edit.root.querySelector('input');number.focus();
events.blur();assert.strictEqual(inputWidget.ActiveTextInputs.size,0);
events.focus();assert(inputWidget.ActiveTextInputs.has(number));
// An unrelated widget and another native input on the same host retain their
// own ownership: never clear the whole native set or globally pause InputMgr.
const foreign=nativeHost(new Node('foreign'),'def_foreign'),foreignInput=new Node('input');
foreign.OnTextInputFocusedChanged(foreignInput,true,'foreign');
const sibling=new Node('input');inputWidget.OnTextInputFocusedChanged(sibling,true,'sibling');
number.blur();assert(inputWidget.ActiveTextInputs.has(sibling));assert(foreign.ActiveTextInputs.has(foreignInput));
assert.strictEqual(edit.nativeTextInput,null);inputWidget.OnTextInputFocusedChanged(sibling,false,'sibling');
const helper=inputWidget.OnTextInputFocusedChanged;inputWidget.OnTextInputFocusedChanged=undefined;
for(let i=0;i<2;i++){number.focus();number.blur();}
assert.strictEqual(records.filter(r=>r[0]==='text_input_focus_error'&&r[1].phase==='acquire').length,1);
assert.strictEqual(edit.nativeTextInput,null);
inputWidget.OnTextInputFocusedChanged=helper;
// If the native notification throws after adding to the Set, release the input
// again and contain the error instead of leaving an orphaned text-focus entry.
const trigger=ctx.engine.trigger;ctx.engine.trigger=(...args)=>{if(args[1]===true)throw Error('fixture rejected focus notification');trigger(...args);};
number.focus();assert.strictEqual(inputWidget.ActiveTextInputs.size,0);assert.strictEqual(edit.nativeTextInput,null);number.blur();
ctx.engine.trigger=trigger;number.focus();
// Keybind UI uses real registered values, including null. Text editing keeps
// the same native focus contract as numbers, but submits string/null values.
const keyWidget=nativeHost(new Node('widget-list-menu'));keyWidget.IsActivated=true;
ctx.echoOnEditorLifecycle(keyWidget,'Event_Activate');
const keyState=keyWidget.EchoMenuState;
const keyCatalog={mods:[{id:'km',name:'Key Fixture',version:'1',enabled:true,can_toggle:false,persistent:true,categories:[{id:'keybinds',label_key:'keybinds'}],options:[
 {id:'camera',identifier:'Dump Camera State',name:'Dump Camera State',category:'keybinds',kind:'keybind',value:null,default:'F8',has_default:true,editable:true},
 {id:'toggle',identifier:'Toggle',name:'Toggle',category:'keybinds',kind:'keybind',value:'F5',default:null,has_default:true,editable:true},
 {id:'locked',identifier:'Locked',name:'Locked',category:'keybinds',kind:'keybind',value:'F10',editable:false}
]}],errors:[]};
reply(pending.shift(),{catalog:keyCatalog,preferences:{language:'de'}});
const kbButton=text=>keyState.root.querySelectorAll('button').find(n=>n.textContent===text);
const cameraKey='value:km:camera',toggleKey='value:km:toggle';
let keyInput=keyState.root.querySelector('.echo-keybind-value');
assert.strictEqual(keyState.root.querySelectorAll('input').length,2);
assert.strictEqual(keyInput.value,'');assert.strictEqual(keyInput.placeholder,'Nicht belegt');
assert(keyState.root.textContent.includes('F10 · Tastenbelegung · nur lesbar'));
pointerClick(keyInput);assert(keyWidget.ActiveTextInputs.has(keyInput));
for(const value of ['F12','NumPadZero','ThumbMouseButton']) {
 keyInput.value=value;keyInput.fire('input');
 const releases=keyState.textFocusReleases||0;
 keyInput.fire('keydown',{code:'NumpadEnter',keyCode:13});keyInput.fire('keyup',{code:'NumpadEnter',keyCode:13});
 assert.strictEqual(keyState.drafts[cameraKey].value,value);assert.strictEqual(doc.activeElement,keyInput);
 assert.strictEqual(keyState.textFocusReleases||0,releases);assert(keyWidget.ActiveTextInputs.has(keyInput));
 pointerClick(keyInput);
}
keyInput.value='F 5';keyInput.fire('input');assert(keyState.invalid[cameraKey]);assert(kbButton('Speichern & Übernehmen').disabled);
keyInput.fire('keydown',{key:'Escape'});keyInput.fire('keyup',{key:'Escape'});
assert.strictEqual(keyInput.value,'ThumbMouseButton');assert(!keyState.invalid[cameraKey]);assert(!keyWidget.ActiveTextInputs.has(keyInput));
pointerClick(keyInput);keyInput.value='';keyInput.fire('input');keyInput.fire('keydown',{key:'Enter'});
assert(!keyState.drafts[cameraKey]); // null matches original unbound value.
keyInput.blur();
keyState.root.querySelectorAll('.echo-option-row')[1].querySelector('button').click();
assert.strictEqual(keyState.drafts[toggleKey].value,null);
kbButton('Kategorie zurücksetzen').click();assert.strictEqual(keyState.drafts[cameraKey].value,'F8');assert.strictEqual(keyState.drafts[toggleKey].value,null);
const staleKey=keyState.root.querySelector('.echo-keybind-value');staleKey.focus();
kbButton('Entwurf verwerfen').click();assert.strictEqual(Object.keys(keyState.drafts).length,0);assert(!keyWidget.ActiveTextInputs.has(staleKey));
staleKey.value='F11';staleKey.fire('input');assert.strictEqual(Object.keys(keyState.drafts).length,0);
keyState.root.querySelectorAll('.echo-option-row')[1].querySelector('button').click();
kbButton('Speichern & Übernehmen').click();const keyRequest=pending.shift();
assert.strictEqual(keyRequest.body.commands.length,1);assert.strictEqual(keyRequest.body.commands[0].value,null);assert.strictEqual(keyRequest.body.commands[0].expected,'F5');
reply(keyRequest,{catalog:keyCatalog,pending:keyRequest.body.commands,queue_revision:1,preferences:{language:'de'}});
assert.strictEqual(ctx.echoDirty(keyState),0);assert.strictEqual(keyState.saved[toggleKey].value,null);
assert.strictEqual(keyState.root.querySelectorAll('.echo-keybind-value')[1].value,'');
kbButton('EN').click();reply(pending.shift(),{catalog:keyCatalog,pending:keyRequest.body.commands,queue_revision:1,preferences:{language:'en'}});
assert.strictEqual(keyState.root.querySelector('.echo-keybind-value').placeholder,'Unbound');assert(kbButton('Unbind'));
console.log('PASS: editable registered key names/null, readonly fallback, same-field Enter, Escape, validation, unbind, defaults, discard, detached-field isolation, stage payload and DE/EN.');
// Decoder covers current Cohtml legacy events and modern logical keys. OEM
// punctuation and ambiguous Num Lock/side information must never be guessed.
for(const [fields,expected] of [
 [{key:'z',code:'KeyY',keyCode:90},'Z'],[{key:'y',code:'KeyZ',keyCode:89},'Y'],
 [{keyCode:90},'Z'],[{keyCode:89},'Y'],[{keyCode:65},'A'],
 [{keyCode:48},'Zero'],[{key:'5',code:'Digit5'},'Five'],
 [{key:'F10',keyCode:121},'F10'],[{keyCode:112},'F1'],[{keyCode:135},'F24'],
 [{key:'0',code:'Numpad0',keyCode:96,location:3},'NumPadZero'],
 [{keyCode:105},'NumPadNine'],[{keyCode:110,location:3},'Decimal'],
 [{code:'NumpadEnter',keyCode:13,location:3},'Enter'],
 [{key:'Shift',code:'ShiftLeft',location:1,shiftKey:true},'LeftShift'],
 [{keyCode:17,location:2,ctrlKey:true},'RightControl'],
 [{keyCode:164,altKey:true},'LeftAlt'],[{key:'Backspace',keyCode:8},'BackSpace'],
 [{key:'ArrowLeft',keyCode:37},'Left'],[{keyCode:32},'SpaceBar'],
 [{key:'Delete',keyCode:46},'Delete'],[{keyCode:27},'Escape'],
 [{key:'Insert',code:'Numpad0',keyCode:45,location:3},''],
 [{key:'Insert',keyCode:45,location:3},''],[{key:'0',location:3},''],
 [{key:'Shift',keyCode:16},''],[{key:'ü',code:'BracketLeft',keyCode:186},''],
 [{key:'Dead',keyCode:192},''],[{key:'Unidentified',keyCode:229},''],
 [{key:'a',keyCode:65,ctrlKey:true},''],[{key:'F10',shiftKey:true},''],
 [{key:'Shift',code:'ShiftLeft',shiftKey:true,ctrlKey:true},''],
 [{code:'NumpadDecimal',key:'Delete',keyCode:46,location:3},''],
 [{key:'Meta',keyCode:91},''],[{code:'KeyY'},''],[{key:'Gamepad_A'},'']
]) assert.strictEqual(ctx.echoCaptureKey(fields),expected,JSON.stringify(fields));
const captureButton=()=>keyState.root.querySelectorAll('button').find(n=>n.textContent==='Capture key');
function openCapture() {
 const existing=keyState.root.querySelector('.echo-keybind-value'), count=keyState.root.querySelectorAll('input').length;
 captureButton().focus();captureButton().click();const dialog=keyState.keyCapture;

 assert(dialog,JSON.stringify({error:keyState.error,tail:records.slice(-4)}));assert.strictEqual(dialog.input,existing);assert.strictEqual(keyState.root.querySelectorAll('input').length,count);assert(!keyState.root.querySelector('.echo-capture-overlay'));
 assert(dialog);assert.strictEqual(doc.activeElement,dialog.input);assert(keyWidget.ActiveTextInputs.has(dialog.input));
 assert(!dialog.input.readOnly);assert.strictEqual(dialog.phase,'listening');return dialog;
}
function captureStroke(dialog,fields) {
 const down=dialog.input.fire('keydown',fields);assert(down.defaultPrevented&&down.stopped);
 const up=dialog.input.fire('keyup',fields);assert(up.defaultPrevented&&up.stopped);
}
const networkBeforeCapture=pending.length;
let dialog=openCapture();const beforeCapture=JSON.stringify(keyState.drafts);
// Window capture callbacks see this ordinary button blur, but it is NOT loss
// of application focus. Capture, native ownership and editor drags must survive.
const targetButton=keyState.root.querySelectorAll('button').find(n=>n.textContent==='Cancel capture');
assert(ctx.echoIsWindowFocusEvent({target:ctx.window}));
assert(!ctx.echoIsWindowFocusEvent({target:targetButton}));
const dragSentinel={fixture:true};ctx.echoEditorDrag=dragSentinel;ctx.echoScrollDrag=dragSentinel;
dispatchElementFocus('blur',targetButton);
assert.strictEqual(keyState.keyCapture,dialog);assert(keyWidget.ActiveTextInputs.has(dialog.input));
assert.strictEqual(ctx.echoEditorDrag,dragSentinel);assert.strictEqual(ctx.echoScrollDrag,dragSentinel);
ctx.echoEditorDrag=null;ctx.echoScrollDrag=null;
dialog.input.fire('keydown',{keyCode:121});
assert.strictEqual(JSON.stringify(keyState.drafts),beforeCapture);assert.strictEqual(dialog.input.value,'F10');
dialog.input.fire('keydown',{keyCode:121,repeat:true});
dialog.input.fire('keyup',{keyCode:121});
assert.strictEqual(keyState.keyCapture,null);assert(!keyWidget.ActiveTextInputs.has(dialog.input));
assert.strictEqual(keyState.drafts[cameraKey].value,'F10');assert.strictEqual(pending.length,networkBeforeCapture);
assert.strictEqual(keyState.captureAccepted,1);
// Optional character/code strings can disappear between Cohtml down and up;
// identical virtual keys must still match without inventing a different key.
dialog=openCapture();dialog.input.fire('keydown',{keyCode:121,key:'F10',code:'F10'});
dialog.input.fire('keyup',{keyCode:121});assert.strictEqual(keyState.keyCapture,null);
assert.strictEqual(keyState.drafts[cameraKey].value,'F10');
// Reopening, NumPad/Enter capture, unsupported input, Escape and cancellation.
dialog=openCapture();captureStroke(dialog,{keyCode:96,code:'Numpad0',key:'0',location:3});
assert.strictEqual(keyState.drafts[cameraKey].value,'NumPadZero');
dialog=openCapture();captureStroke(dialog,{keyCode:13,code:'NumpadEnter',location:3});
assert.strictEqual(keyState.drafts[cameraKey].value,'Enter');
dialog=openCapture();const unchanged=JSON.stringify(keyState.drafts);
captureStroke(dialog,{key:'ü',keyCode:186});assert(keyState.keyCapture===dialog);
assert.strictEqual(JSON.stringify(keyState.drafts),unchanged);
captureStroke(dialog,{key:'Escape',keyCode:27});assert.strictEqual(keyState.keyCapture,null);
assert.strictEqual(JSON.stringify(keyState.drafts),unchanged);
dialog=openCapture();keyState.root.querySelectorAll('button').find(n=>n.textContent==='Cancel capture').click();
assert.strictEqual(keyState.keyCapture,null);assert.strictEqual(JSON.stringify(keyState.drafts),unchanged);
// A chord cannot silently bind its first modifier. Escape can cancel even
// while a chord remains held. A lost keyup also never writes a draft.
dialog=openCapture();dialog.input.fire('keydown',{key:'Control',keyCode:17,location:1,ctrlKey:true});
dialog.input.fire('keydown',{key:'a',keyCode:65,ctrlKey:true});
dialog.input.fire('keyup',{key:'a',keyCode:65,ctrlKey:true});
dialog.input.fire('keyup',{key:'Control',keyCode:17,location:1});
assert.strictEqual(JSON.stringify(keyState.drafts),unchanged);assert(keyState.keyCapture===dialog);
captureStroke(dialog,{key:'Shift',code:'ShiftRight',keyCode:16,location:2,shiftKey:true});
assert.strictEqual(keyState.drafts[cameraKey].value,'RightShift');
dialog=openCapture();dialog.input.fire('keydown',{keyCode:17,ctrlKey:true,location:1});
dialog.input.fire('keydown',{keyCode:65,ctrlKey:true});
captureStroke(dialog,{keyCode:27});assert.strictEqual(keyState.keyCapture,null);
const unchanged2=JSON.stringify(keyState.drafts);
for(const boundary of ['blur','redraw','deactivate','epoch']) {
 dialog=openCapture();dialog.input.fire('keydown',{keyCode:121});
 if(boundary==='blur')events.blur();
 if(boundary==='redraw')ctx.echoDraw(keyState);
 if(boundary==='deactivate'){keyWidget.IsActivated=false;ctx.echoOnEditorLifecycle(keyWidget,'Event_Deactivate');reenterNative(keyWidget,keyState);ctx.echoDraw(keyState);}
 if(boundary==='epoch'){keyState.epoch='fresh-epoch';ctx.echoDraw(keyState);}
 assert.strictEqual(keyState.keyCapture,null);assert(!keyWidget.ActiveTextInputs.has(dialog.input));
 dialog.input.fire('keyup',{keyCode:121});
 assert.strictEqual(JSON.stringify(keyState.drafts),unchanged2);
}
console.log('PASS: browser capture-phase focus/blur dispatch on Window and ancestors; opening button-to-input transfer keeps capture active, descendant blur preserves native ownership/drag, genuine Window blur still cancels.');
assert.strictEqual(pending.length,networkBeforeCapture);
assert.strictEqual(foreign.ActiveTextInputs.size,1);
// Capture now uses the existing manually editable input and the visible footer.
// Delayed focus is recovered by the same pointer path as normal text editing.
function waitingCapture() {
 captureButton().focus();captureButton().click();const value=keyState.keyCapture;
 assert(value);assert.strictEqual(value.phase,'waiting_focus');assert.strictEqual(keyState.error,'');
 assert(!keyWidget.ActiveTextInputs.has(value.input));
 assert(keyState.statusNode.textContent.includes('Capture ready'));
 assert(keyState.statusNode.textContent.includes('Dump Camera State'));
 assert(keyState.saveButton.disabled);return value;
}
let stableDraft=JSON.stringify(keyState.drafts);
captureFocusPolicy.defer=true;const focusCallsBefore=environment.variables.captureFocusCalls;
dialog=waitingCapture();assert.strictEqual(environment.variables.deferredCaptureFocus,dialog.input);
assert.strictEqual(environment.variables.captureFocusCalls,focusCallsBefore+1);
dialog.input.fire('keyup',{keyCode:121});assert.strictEqual(JSON.stringify(keyState.drafts),stableDraft);
captureFocusPolicy.defer=false;environment.variables.deferredCaptureFocus.focus();environment.variables.deferredCaptureFocus=null;
assert.strictEqual(dialog.phase,'listening');assert(keyWidget.ActiveTextInputs.has(dialog.input));
assert(keyState.statusNode.textContent.includes('Capturing Dump Camera State'));
captureStroke(dialog,{keyCode:119});assert.strictEqual(keyState.drafts[cameraKey].value,'F8');
assert.strictEqual(keyState.captureNotice,null);
captureFocusPolicy.deny=true;dialog=waitingCapture();
captureFocusPolicy.deny=false;pointerClick(dialog.input);assert.strictEqual(dialog.phase,'listening');
captureStroke(dialog,{keyCode:96,code:'Numpad0',location:3,key:'0'});
assert.strictEqual(keyState.drafts[cameraKey].value,'NumPadZero');
// Press then lose focus: no ordinary text commit may convert capture's temporary
// value into a draft. A new pointer activation starts with no pending key.
dialog=openCapture();stableDraft=JSON.stringify(keyState.drafts);
dialog.input.fire('keydown',{keyCode:121});dialog.input.fire('input');dialog.input.fire('change');
assert.strictEqual(JSON.stringify(keyState.drafts),stableDraft);
dialog.input.blur();assert.strictEqual(dialog.phase,'waiting_focus');assert.strictEqual(dialog.pending,null);
assert(!keyWidget.ActiveTextInputs.has(dialog.input));
dialog.input.fire('keyup',{keyCode:121});assert.strictEqual(JSON.stringify(keyState.drafts),stableDraft);
pointerClick(dialog.input);captureStroke(dialog,{keyCode:27});assert.strictEqual(keyState.keyCapture,null);
assert.strictEqual(JSON.stringify(keyState.drafts),stableDraft);
// Reusing a laid-out input needs no extra layout API, window, modal or listener.
const immediateLayout=ctx.engine.executeImmediateLayoutSync;
ctx.engine.executeImmediateLayoutSync=undefined;dialog=openCapture();captureStroke(dialog,{keyCode:27});
ctx.engine.executeImmediateLayoutSync=immediateLayout;
captureFocusPolicy.throwFocus=true;dialog=waitingCapture();captureFocusPolicy.throwFocus=false;
pointerClick(dialog.input);assert.strictEqual(dialog.phase,'listening');captureStroke(dialog,{keyCode:27});
const captureHelper=keyWidget.OnTextInputFocusedChanged;
keyWidget.OnTextInputFocusedChanged=undefined;captureButton().focus();captureButton().click();dialog=keyState.keyCapture;
assert(dialog);assert.strictEqual(dialog.phase,'focus_error');assert(!keyWidget.ActiveTextInputs.has(dialog.input));
assert(keyState.statusNode.textContent.includes('Text input focus'));
keyWidget.OnTextInputFocusedChanged=captureHelper;pointerClick(dialog.input);
assert.strictEqual(dialog.phase,'listening');captureStroke(dialog,{keyCode:27});
// Cancellation restores the original raw invalid text and draft, not temporary
// capture captions. After cancel, the same field is an ordinary editor again.
let originalInput=keyState.root.querySelector('.echo-keybind-value');pointerClick(originalInput);
originalInput.value='F 5';originalInput.fire('input');assert(keyState.invalid[cameraKey]);
dialog=openCapture();captureStroke(dialog,{keyCode:27});
assert.strictEqual(originalInput.value,'F 5');assert(keyState.invalid[cameraKey]);
pointerClick(originalInput);originalInput.value='F8';originalInput.fire('input');originalInput.fire('keydown',{key:'Enter'});
assert(!keyState.invalid[cameraKey]);assert.strictEqual(keyState.drafts[cameraKey].value,'F8');
stableDraft=JSON.stringify(keyState.drafts);
// Delayed focus after a redraw must not resurrect detached capture state. For a
// canceled but still attached field, later typing follows its normal editor.
for(const boundary of ['cancel','window_blur','redraw']) {
 captureFocusPolicy.defer=true;dialog=waitingCapture();const previous=dialog.input;
 if(boundary==='cancel')keyState.root.querySelectorAll('button').find(n=>n.textContent==='Cancel capture').click();
 else if(boundary==='window_blur')events.blur();else ctx.echoDraw(keyState);
 assert.strictEqual(keyState.keyCapture,null);assert.strictEqual(keyState.captureNotice,null);captureFocusPolicy.defer=false;
 previous.fire('keyup',{keyCode:121});assert(!keyWidget.ActiveTextInputs.has(previous));
 assert.strictEqual(JSON.stringify(keyState.drafts),stableDraft);
}
assert.strictEqual(pending.length,networkBeforeCapture);assert.strictEqual(foreign.ActiveTextInputs.size,1);
assert(keyState.captureFocusTrace.length<=32);
assert(records.some(r=>r[0]==='editor_capture_clicked'));
assert(records.some(r=>r[0]==='editor_capture_focus'&&r[1].stage==='keydown'));
console.log('PASS: existing-input identity/no modal, visible armed/listening/press states, delayed/denied focus and pointer recovery, input/change isolation, invalid-text restore, manual edit after cancel, no extra layout/global hooks/polling/backend writes.');
dialog=openCapture();dialog.input.fire('keydown',{keyCode:121});
console.log('PASS: logical QWERTZ/legacy/numpad/modifier decoding; release-to-draft capture, repeats, chords, Escape, unsupported input, lost release, cancel, blur/redraw/deactivate/session isolation, no backend writes during capture.');
// API v1 data uses the same editor: translated captions, mixed presets and
// conditional visibility must preserve drafts and native model ownership.
const apiWidget=nativeHost(new Node('widget-list-menu'));apiWidget.IsActivated=true;apiWidget.DataModel=Object.freeze({entries:Object.freeze([])});
const apiWrapper=apiWidget.appendChild(new Node('div'));apiWrapper.className='list_wrapper';
ctx.echoOnEditorLifecycle(apiWidget,'Event_Activate');
const apiState=apiWidget.EchoMenuState;
const apiMod={id:'api',name:'Provider',name_i18n:{de:'Anbindung',en:'Provider'},description:'Description',enabled:true,can_toggle:false,categories:[{id:'panel',name:'Panel',name_i18n:{de:'Bereich',en:'Panel'},presets:[{label:'Mixed',label_i18n:{de:'Gemischt',en:'Mixed'},values:{flag:true,number:7,mode:'B'}}]}],options:[
 {id:'f',identifier:'flag',name:'Show extra',name_i18n:{de:'Zusatz anzeigen',en:'Show extra'},category:'panel',kind:'boolean',value:false,editable:true},
 {id:'n',identifier:'number',name:'Range',name_i18n:{de:'Abstand',en:'Range'},description:'Original',description_i18n:{en:'English fallback'},category:'panel',kind:'number',value:3,min:0,max:10,step:1,integer:true,editable:true,unit:'cm',visible_when:{id:'flag',equals:true}},
 {id:'c',identifier:'mode',name:'Mode',name_i18n:{de:'Modus',en:'Mode'},category:'panel',kind:'choice',value:'A',choices:['A','B'],choice_labels:{B:{name:'Soft',name_i18n:{de:'Weich',en:'Soft'}}},editable:true}
]};
reply(pending.shift(),{catalog:{mods:[apiMod],errors:[]}});
apiState.preference='de';ctx.echoDraw(apiState);
assert(apiState.root.textContent.includes('Bereich'));
assert(apiState.root.textContent.includes('Zusatz anzeigen'));
assert(!apiState.root.textContent.includes('Abstand'));
const mixed=apiState.root.querySelectorAll('button').find(n=>n.textContent==='Gemischt');assert(mixed&&!mixed.disabled);mixed.click();
assert(apiState.root.textContent.includes('Abstand'));
assert(apiState.root.textContent.includes('English fallback'));
assert(apiState.root.textContent.includes('Weich'));
assert.strictEqual(apiState.visibleOptions.length,3);
const apiDrafts=JSON.stringify(apiState.drafts);
assert.strictEqual(apiState.drafts['value:api:f'].value,true);
assert.strictEqual(apiState.drafts['value:api:n'].value,7);
assert.strictEqual(apiState.drafts['value:api:c'].value,'B');
apiState.preference='en';ctx.echoDraw(apiState);
assert(apiState.root.textContent.includes('Range'));assert(apiState.root.textContent.includes('Soft'));
assert.strictEqual(JSON.stringify(apiState.drafts),apiDrafts);
assert.strictEqual(apiState.category,'panel');assert(Object.isFrozen(apiWidget.DataModel));
console.log('PASS: provider label/description/category/choice localization and English fallback, conditional visibility, mixed boolean/choice/numeric preset, draft-preserving language change, unchanged native model.');
// Use the actual exported native Activate/Deactivate/HideFlags implementations.
const inventory=nativeHost(new Node('widget-inventory'),'def_menu_inventory');
const inventoryContent=inventory.appendChild(new Node('div'));inventoryContent.textContent='NATIVE INVENTORY';
ctx.NativeWidgetBase.prototype.Activate.call(inventory);
ctx.echoOnEditorLifecycle(inventory,'Event_Activate');
assert(!inventory.EchoMenuState);assert.strictEqual(inventoryContent.textContent,'NATIVE INVENTORY');
assert.strictEqual(dormantState.root.style.display,'none');
ctx.NativeWidgetBase.prototype.Activate.call(dormantWidget);
ctx.echoOnEditorLifecycle(dormantWidget,'Event_Activate');
const late=pending.shift();assert(late);assert.strictEqual(dormantState.root.style.display,'flex');
ctx.NativeWidgetBase.prototype.Deactivate.call(dormantWidget);
ctx.echoOnEditorLifecycle(dormantWidget,'Event_Deactivate');
assert.strictEqual(dormantState.root.style.display,'none');assert.strictEqual(dormantState.root.style.pointerEvents,'none');
reply(late,{epoch:'stale',catalog:{mods:[apiMod],errors:[]}});
assert.strictEqual(dormantState.catalog.mods.length,0);assert.strictEqual(dormantState.root.style.display,'none');
ctx.echoOnEditorLifecycle(dormantWidget,'Event_DataUpdated');ctx.echoDraw(dormantState);ctx.echoFetch(dormantState);
assert.strictEqual(pending.length,0);assert.strictEqual(dormantState.root.style.display,'none');
const visibilityCatalog={mods:[{id:'visible',name:'Lifecycle fixture',enabled:true,can_toggle:false,categories:[{id:'numbers',name:'Numbers'}],options:[{id:'distance',identifier:'distance',name:'Distance',category:'numbers',kind:'number',value:3,min:0,max:10,step:1,integer:true,editable:true}]}],errors:[]};
ctx.NativeWidgetBase.prototype.Activate.call(dormantWidget);ctx.echoOnEditorLifecycle(dormantWidget,'Event_Activate');
reply(pending.shift(),{epoch:'visible-session',catalog:visibilityCatalog});
const visibilityInput=dormantState.root.querySelector('input');visibilityInput.focus();
visibilityInput.value='7';visibilityInput.fire('input');visibilityInput.fire('keydown',{key:'Enter'});
const visibilityDrafts=JSON.stringify(dormantState.drafts);assert(dormantWidget.ActiveTextInputs.has(visibilityInput));
dormantWidget.SupportsHideFlags=true;dormantWidget.DataModel=Object.freeze({entries:Object.freeze([]),hideflags:1});
ctx.NativeWidgetBase.prototype.UpdateHideFlags.call(dormantWidget);ctx.echoOnEditorLifecycle(dormantWidget,'Event_DataUpdated');
assert.strictEqual(dormantState.root.style.display,'none');assert.strictEqual(dormantWidget.ActiveTextInputs.size,0);
assert.strictEqual(JSON.stringify(dormantState.drafts),visibilityDrafts);
dormantWidget.DataModel=Object.freeze({entries:Object.freeze([]),hideflags:0});
ctx.NativeWidgetBase.prototype.UpdateHideFlags.call(dormantWidget);ctx.echoOnEditorLifecycle(dormantWidget,'Event_DataUpdated');
reply(pending.shift(),{epoch:'visible-session',catalog:visibilityCatalog});
assert.strictEqual(dormantState.root.style.display,'flex');assert.strictEqual(JSON.stringify(dormantState.drafts),visibilityDrafts);
ctx.NativeWidgetBase.prototype.Deactivate.call(dormantWidget);ctx.echoOnEditorLifecycle(dormantWidget,'Event_Deactivate');
ctx.echoDraw(dormantState);assert.strictEqual(dormantState.root.style.display,'none');
assert.strictEqual(inventory.IsActivated,true);assert.strictEqual(inventoryContent.textContent,'NATIVE INVENTORY');
assert(Object.isFrozen(dormantWidget.DataModel));
console.log('PASS: inactive attachment/data updates cannot paint or fetch; native Activate/Deactivate/HideFlags control only our panel, stale HTTP cannot reshow it, hidden text focus is released and drafts survive, inventory DOM/model are untouched.');
events.pagehide();ctx.echoFetch(state);assert.strictEqual(pending.length,0);
assert.strictEqual(keyState.keyCapture,null);dialog.input.fire('keyup',{keyCode:121});
assert.strictEqual(keyWidget.ActiveTextInputs.size,0);
assert.strictEqual(inputWidget.ActiveTextInputs.size,0);assert.strictEqual(edit.nativeTextInput,null);
assert(foreign.ActiveTextInputs.has(foreignInput));
assert(observers.every(o=>o.disconnected));
assert(!state.root.querySelectorAll('*').some(n=>['SELECT','OPTION'].includes(n.tagName)));
assert(Object.isFrozen(widget.DataModel));assert(!/setTimeout|setInterval|requestAnimationFrame/.test(source));
assert(!records.some(r=>r[0]==='editor_error'));
console.log('PASS: 24 exact 45/Backspace/Numpad0/NumpadEnter/reclick/Backspace cycles; Enter never blurs or releases native focus; caret/Escape baseline retained. Original native focus, keyboard, lifecycle, isolation, validation, draft and scrollbar/preset tests pass. Native input routing is modeled; no BL4-runtime claim.');
