'use strict';
/* Real exported InputManager/behaviors run unchanged. Only DOM geometry and
 * engine/C++ boundary are modeled; this cannot certify physical pad routing.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const createEnvironment=require('./frontend_test_env');
const source=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
function fixture(managerFile) {
 const env=createEnvironment(),{ctx,doc,Node,pending,nativeEvents,records}=env;
 const globalActions={},escapeStacks=new Map(),widgetEvents=new Map();let rootBack=0;
 ctx.RegisterGlobalEvent=(name,handler)=>{globalActions[name]=handler;};
 ctx.engine.on=(name,handler)=>{widgetEvents.set(name,handler);};
 ctx.DomNode=Node;
 ctx.window.customElements={define(){}};
 ctx.OakUtils={SetupHintBarParams:ident=>({ident}),SetupHintEntry:(action,text)=>({action,text})};
 vm.runInContext(source('fixtures/native_input/'+managerFile)+'\nthis.NativeInputManager=InputManager;',ctx);
 ctx.InputMgr=new ctx.NativeInputManager();
 vm.runInContext(source('fixtures/native_input/input_behaviors.js'),ctx);
 vm.runInContext('class GbxCustomElement extends DomNode { constructor(){super("widget-list-menu");} Init(){} connectedCallback(){} }\n'+source('fixtures/native_input/widget_class_patch2.js')+'\nthis.NativeWidgetBase=WidgetBase;',ctx);
 vm.runInContext(source('fixtures/native_input/menu_base.js')+'\n'+source('fixtures/native_input/oak_menu_base.js')+'\nthis.NativeOakMenuBase=Widget_OakMenuBase;',ctx);
 vm.runInContext(source('fixtures/native_input/list_menu.js')+'\nthis.NativeListMenu=Widget_ListMenu;',ctx);
 vm.runInContext(source('../ui/controller.js')+'\n'+source('../ui/editor.js').replace('__ECHO_TRANSLATIONS__',source('../ui/i18n.json')),ctx);
 ctx.InputMgr.Init();ctx.InputMgr.SimulateMouse=true;ctx.InputMgr.OnInputDeviceChanged(0,1,2,0);
 const actions=vm.runInContext('({up:INPUT_NAV_UP,down:INPUT_NAV_DOWN,left:INPUT_NAV_LEFT,right:INPUT_NAV_RIGHT,select:INPUT_NAV_SELECTED,pressed:InputActionType.PRESSED,released:InputActionType.RELEASED})',ctx);
 const trigger=ctx.engine.trigger;
 ctx.engine.trigger=function(name,...args){
  trigger(name,...args);
  for(const [ident,stack] of escapeStacks){
   if(name==='Event_'+ident+'_0_Event_OnCohEscapeInputHandlerAdded')stack.push(args[0]);
   if(name==='Event_'+ident+'_0_Event_OnCohEscapeInputHandlerRemoved'){
    const at=stack.lastIndexOf(args[0]);if(at>=0)stack.splice(at,1);
   }
  }
 };
 function host(ident='def_bl4_empty_page_v40',priority=0) {
  const widget=doc.body.appendChild(new ctx.NativeListMenu());
  widget.id=widget.WidgetIdent=ident;widget.InstId=0;widget.WidgetInstId=ident+'_0';widget.WidgetDiv=widget;
  widget.DataModel=Object.freeze({entries:Object.freeze([]),entriesrev:7,inputactive:true});
  widget.LastEntryRev=-1;widget.DirectionalInputPriority=priority;escapeStacks.set(ident,[]);widget.Init();
  if(ident==='def_bl4_empty_page_v40') {
   ctx.echoOnEditorLifecycle(widget,'attached');
   // Same after-original lifecycle boundary as the packaged widget observer.
   for(const name of ['Event_Activate','Event_Deactivate','Event_DataUpdated','UpdateHintBar']) {
    const original=widget[name];widget[name]=function(){const result=original.apply(this,arguments);ctx.echoOnEditorLifecycle(this,name);return result;};
   }
  }
  widgetEvents.get(widget.MakeEventName('Activate'))();
  widgetEvents.get(widget.MakeEventName('DataUpdated'))();
  return widget;
 }
 const widget=host(),modelBefore=JSON.stringify(widget.DataModel);
 const state=widget.EchoMenuState;
 const options=[
  {id:'offset',identifier:'offset',name:'Offset',kind:'number',category:'camera',value:3,default:3,has_default:true,min:0,max:10,step:1,integer:true,editable:true},
  {id:'toggle',identifier:'toggle',name:'Enabled',kind:'boolean',category:'camera',value:true,default:true,has_default:true,editable:true},
  {id:'mode',identifier:'mode',name:'Mode',kind:'choice',category:'camera',value:'A',default:'A',has_default:true,editable:true,choices:['A','B','C']},
  {id:'key',identifier:'key',name:'Example key',kind:'keybind',category:'bindings',value:'F5',default:'F5',has_default:true,editable:true},
  {id:'read',identifier:'read',name:'Read only',kind:'number',category:'camera',value:5,editable:false},
  {id:'conditional',identifier:'conditional',name:'Conditional',kind:'number',category:'camera',value:1,min:0,max:5,step:1,editable:true,enabled_when:{id:'toggle',equals:false}},
  {id:'hidden',identifier:'hidden',name:'Hidden',kind:'number',category:'camera',value:1,min:0,max:5,step:1,editable:true,visible_when:{id:'toggle',equals:false}},
 ];
 const mods=[{id:'mod1',name:'Example',enabled:true,author:'Fixture',version:'1',can_toggle:true,persistent:true,
  categories:[{id:'camera',name:'Camera',presets:[{id:'near',label:'Near',values:{offset:4}}]},{id:'bindings',name:'Keybinds'}],options},
  {id:'library',name:'Library',enabled:true,author:'Fixture',version:'1',can_toggle:false,persistent:false,categories:[],options:[]}];
 function reply(xhr,extra={}) {
  xhr.status=200;xhr.responseText=JSON.stringify(Object.assign({ok:true,service:'echo-mod-menu-v1',epoch:'e1',active:true,
   catalog:{mods,errors:[]},pending:[],queue_revision:0,last_result:null,preferences:{language:'en'}},extra));xhr.onload();
 }
 reply(pending.shift());
 assert.strictEqual(state.controller.available,true);
 function phase(name,type){globalActions.Input_OnAction(actions[name],actions[type]);}
 function tap(name){phase(name,'pressed');phase(name,'released');}
 function emitWidget(name){const handler=widgetEvents.get(widget.MakeEventName(name));assert(handler,'Missing native callback '+name);handler();}
 function target(id){return state.controller.targets.find(item=>item.id===id);}
 function focus(id){const node=target(id);assert(node,'Missing focus target '+id);ctx.InputMgr.OnNavigationTypeChanged(false);assert(ctx.echoControllerFocus(state,node));return node;}
 function cancel(){
  const current=ctx.InputMgr.CurrWidget,stack=current&&escapeStacks.get(current.WidgetIdent);
  if(stack&&stack.length)current.Event_TriggerCohEscapeInput(stack.at(-1));else rootBack++;
 }
 return {env,ctx,doc,Node,pending,nativeEvents,records,widget,state,mods,actions,phase,tap,target,focus,cancel,
  escapeStacks,host,reply,modelBefore,emitWidget,get rootBack(){return rootBack;}};
}
let cases=0;
for(const managerFile of ['input_manager_base.js','input_manager_patch2.js']) {
 const f=fixture(managerFile),{ctx,state,widget,tap,focus,target,phase,nativeEvents,pending}=f;
 const key='value:mod1:offset';
 // The first native direction establishes focus; the next moves through the
 // graph. No hidden original list entry or native model selection is used.
 tap('down');assert.strictEqual(state.controller.current,'mod:mod1');
 tap('right');assert.strictEqual(state.controller.region,'categories');
 tap('down');assert.strictEqual(state.controller.region,'presets');
 tap('down');assert.strictEqual(state.controller.current,key);
 assert.strictEqual(state.controller.directional,true);
 for(const id of ['value:mod1:read','value:mod1:conditional','value:mod1:hidden'])assert(!target(id));
 cases++;
 // Slider preview begins on Confirm, steps/clamps, and Cancel restores an
 // earlier draft while preserving another draft and the queued server state.
 state.drafts[key]={kind:'value',mod:'mod1',option:'offset',expected:3,value:5};
 state.drafts['other']={kind:'value',mod:'other',option:'other',expected:0,value:1};
 state.saved={saved:{kind:'value',mod:'saved',option:'saved',expected:0,value:2}};
 const saved=JSON.stringify(state.saved);ctx.echoDraw(state);focus(key);
 tap('select');assert(state.controller.edit);assert.strictEqual(f.escapeStacks.get(widget.WidgetIdent).length,1);
 tap('right');assert.strictEqual(state.drafts[key].value,6);
 for(let i=0;i<20;i++)tap('right');assert.strictEqual(state.drafts[key].value,10);
 f.cancel();assert(!state.controller.edit);assert.strictEqual(state.drafts[key].value,5);
 assert.strictEqual(state.drafts.other.value,1);assert.strictEqual(JSON.stringify(state.saved),saved);
 assert.strictEqual(f.escapeStacks.get(widget.WidgetIdent).length,0);assert.strictEqual(f.rootBack,0);
 cases++;
 // Holding Confirm cannot reenter edit immediately after confirming it.
 tap('select');tap('left');assert.strictEqual(state.drafts[key].value,4);
 phase('select','pressed');assert(!state.controller.edit);
 phase('select','pressed');assert(!state.controller.edit);
 phase('select','released');assert.strictEqual(state.drafts[key].value,4);
 assert.strictEqual(f.escapeStacks.get(widget.WidgetIdent).length,0);
 cases++;
 // Native select would normally emit an indexed model selection and a
 // synthetic mouse click. The ECHO callback runs exactly once instead.
 focus('toggle:value:mod1:toggle');
 const selectedBefore=nativeEvents.filter(e=>/InputSelectionChanged$/.test(e[0])).length;
 phase('select','pressed');assert.strictEqual(state.drafts['value:mod1:toggle'].value,false);
 phase('select','pressed');assert.strictEqual(state.drafts['value:mod1:toggle'].value,false);
 target('toggle:value:mod1:toggle').node.click();assert.strictEqual(state.drafts['value:mod1:toggle'].value,false);
 phase('select','released');
 assert.strictEqual(nativeEvents.filter(e=>/InputSelectionChanged$/.test(e[0])).length,selectedBefore);
 assert.strictEqual(JSON.stringify(widget.DataModel),f.modelBefore);
 cases++;
 // Choice previews use the same edit lifetime as sliders and survive focus
 // restoration after a redraw or translated button captions.
 focus('value:mod1:mode');tap('select');tap('right');assert.strictEqual(state.drafts['value:mod1:mode'].value,'B');
 f.cancel();assert(!state.drafts['value:mod1:mode']);
 tap('select');tap('left');tap('select');assert.strictEqual(state.drafts['value:mod1:mode'].value,'C');
 state.preference='de';ctx.echoDraw(state);assert.strictEqual(state.controller.current,'value:mod1:mode');
 assert.strictEqual(ctx.InputMgr.CurrElement,target('value:mod1:mode').node);
 cases++;
 // The actual native Escape delivery helper handles a text editor. Cancel
 // restores the previous draft and ends native text focus rather than closing.
 focus('category:mod1:bindings');tap('select');tap('down');
 focus('value:mod1:key');tap('select');const input=state.keyEditors['value:mod1:key'].input;
 assert.strictEqual(f.doc.activeElement,input);assert(state.nativeTextInput);
 input.value='F8';input.fire('input');assert.strictEqual(state.drafts['value:mod1:key'].value,'F8');
 f.cancel();assert(!state.drafts['value:mod1:key']);assert(!state.nativeTextInput);
 assert.strictEqual(f.escapeStacks.get(widget.WidgetIdent).length,0);assert.strictEqual(f.rootBack,0);
 cases++;
 // Capture cancellation keeps the previous binding and releases the exact
 // native escape handler used for the existing orange capture field.
 focus('capture:value:mod1:key');tap('select');assert(state.keyCapture);
 assert.strictEqual(f.escapeStacks.get(widget.WidgetIdent).length,1);
 const oldTarget=state.controller.current;tap('down');assert.strictEqual(state.controller.current,oldTarget);
 f.cancel();assert(!state.keyCapture);assert(!state.nativeTextInput);
 assert.strictEqual(f.escapeStacks.get(widget.WidgetIdent).length,0);
 f.cancel();assert.strictEqual(f.rootBack,1);
 cases++;
 // Another widget at higher native focus priority receives the untouched
 // original select implementation and its normal simulated click.
 const foreign=f.host('foreign_widget',10),container=foreign.appendChild(new f.Node('div'));
 container.dataset.inputElem='true';container.dataset.inputBeh='base';container.dataset.inputId='foreign_container';
 const button=container.appendChild(new f.Node('button'));button.dataset.inputElem='true';button.dataset.inputId='foreign_button';
 let foreignClicks=0;button.addEventListener('click',()=>foreignClicks++);
 assert.strictEqual(ctx.InputMgr.CurrWidget,foreign);ctx.InputMgr.OnNavigationTypeChanged(false);ctx.InputMgr.FocusElement(button);
 tap('select');assert.strictEqual(foreignClicks,1);
 assert(nativeEvents.some(e=>e[0]==='Event_foreign_widget_0_InputSelectionChanged'));
 ctx.InputMgr.ClearWidgetFocus(foreign.id,0);
 cases++;
 // Real cursor movement hands control back to the existing pointer path.
 focus('category:mod1:camera');tap('select');focus(key);tap('select');tap('right');
 const prior=state.controller.edit.draft&&state.controller.edit.draft.value;
 ctx.InputMgr.ResetCursorInput({clientX:100,clientY:150});
 assert(!state.controller.directional);assert(!state.controller.edit);
 assert.strictEqual(state.drafts[key]&&state.drafts[key].value,prior);
 const toggle=target('toggle:value:mod1:toggle').node;toggle.click();
 assert(!state.drafts['value:mod1:toggle']);
 cases++;
 // Focus memories are keyed by mod/category, not old DOM node identity.
 focus(key);tap('left');assert.strictEqual(state.controller.current,'decrease:'+key);
 tap('left');assert.strictEqual(state.controller.region,'mods');
 tap('right');tap('down');tap('down');assert.strictEqual(state.controller.current,'decrease:'+key);
 focus(key);
 assert.strictEqual(pending.length,0,'Navigation/editing must not stage or apply anything');
 cases++;
 // Scroll using the existing viewport; the rail stays the same DOM node.
 const pane=state.paneCache['echo-settings'],rail=pane.rail;
 pane.pendingTop=null;pane.view.scrollTop=0;pane.range=400;pane.awaitLayout=false;
 pane.view._rect={left:0,top:0,width:100,height:100};target(key).node._rect={left:0,top:200,width:80,height:40};
 ctx.echoControllerEnsureVisible(state);assert.strictEqual(pane.view.scrollTop,140);assert.strictEqual(pane.rail,rail);
 cases++;
 // Tab close and genuine Window blur cancel previews and release handlers.
 tap('select');tap('right');const expected=state.controller.edit.draft.value;
 widget.Event_Deactivate();ctx.echoOnEditorLifecycle(widget,'Event_Deactivate');
 assert.strictEqual(state.drafts[key].value,expected);assert(!state.controller.edit);
 assert.strictEqual(f.escapeStacks.get(widget.WidgetIdent).length,0);assert(!state.visible);
 assert.strictEqual(JSON.stringify(widget.DataModel),f.modelBefore);
 cases++;
 console.log('PASS: native '+managerFile+' action dispatch, focus graph, slider/choice edit, contextual native Escape, text/capture cancellation, pointer handoff, one-shot Confirm, foreign widgets and unchanged models.');

 // A fresh field enables Save without a redraw; native data-input-disabled
 // must be reconciled before focus so Confirm activates the intended control.
 const g=fixture(managerFile),gkey='value:mod1:offset';
 g.tap('down');g.focus(gkey);
 const number=g.state.numberEditors[gkey];
 const inputNode=g.state.numberEditors[gkey].input;inputNode.focus();
 inputNode.value='7';inputNode.fire('input');
 const save=g.target('action:save');assert.strictEqual(save.node.disabled,false);
 assert.strictEqual(save.node.dataset.inputDisabled,'true');
 g.tap('select');assert(!g.state.nativeTextInput);g.focus('action:save');
 assert.strictEqual(g.ctx.InputMgr.CurrElement,save.node);
 g.tap('select');assert.strictEqual(g.pending.length,1);
 const request=g.pending.shift();assert(request.url.endsWith('/stage'));
 assert.strictEqual(request.body.commands.length,1);assert.strictEqual(request.body.commands[0].value,7);
 g.reply(request,{pending:request.body.commands,queue_revision:1});
 cases++;
 // Cancel through the native handler must preserve a pre-existing numeric
 // draft, and invalid text which already existed before opening the editor.
 g.focus(gkey);const old=JSON.stringify(g.state.drafts[gkey]);
 const numericText=g.state.numberEditors[gkey].input;numericText.focus();numericText.value='9';numericText.fire('input');
 g.cancel();assert.strictEqual(JSON.stringify(g.state.drafts[gkey]),old);
 g.state.invalid[gkey]={raw:'bad input'};g.ctx.echoDraw(g.state);g.focus(gkey);
 g.tap('select');g.tap('right');assert(!g.state.invalid[gkey]);g.cancel();
 assert.strictEqual(g.state.invalid[gkey].raw,'bad input');
 assert.strictEqual(g.state.numberEditors[gkey].input.value,'bad input');
 cases++;
 // Actual hide and Window-focus boundaries release the owned handler and
 // roll back only an unfinished preview. Hidden input never reaches the old
 // placeholder model's native indexed selection.
 delete g.state.invalid[gkey];g.ctx.echoDraw(g.state);g.focus(gkey);g.tap('select');
 const expectedDraft=JSON.stringify(g.state.controller.edit.draft);g.tap('left');
 g.widget.SupportsHideFlags=true;g.widget.HideFlags=1;g.ctx.echoOnEditorLifecycle(g.widget,'Event_DataUpdated');
 assert.strictEqual(JSON.stringify(g.state.drafts[gkey]||null),expectedDraft);assert(!g.state.controller.edit);
 assert.strictEqual(g.escapeStacks.get(g.widget.WidgetIdent).length,0);
 const indices=g.nativeEvents.filter(event=>/InputSelectionChanged$/.test(event[0])).length;
 g.tap('select');assert.strictEqual(g.nativeEvents.filter(event=>/InputSelectionChanged$/.test(event[0])).length,indices);
 g.widget.HideFlags=0;g.ctx.echoOnEditorLifecycle(g.widget,'Event_DataUpdated');
 if(g.pending.length)g.reply(g.pending.shift(),{pending:request.body.commands,queue_revision:1});
 g.focus(gkey);g.tap('select');g.tap('right');g.env.events.blur();
 assert(!g.state.controller.edit);assert.strictEqual(g.escapeStacks.get(g.widget.WidgetIdent).length,0);
 cases++;
 // Escape identifiers owned by somebody else are forwarded unmodified to
 // the real OakMenu helper; only ECHO's registered edit handler is consumed.
 let forwarded=0;g.doc.addEventListener('Event_CohEscapeInput',event=>{if(event.detail.ident==='foreign_escape')forwarded++;});
 g.widget.Event_TriggerCohEscapeInput('foreign_escape');assert.strictEqual(forwarded,1);
 assert.strictEqual(g.pending.length,0);
 cases++;
 // Selecting a different mod, including a locked library, changes the editor
 // without losing the previous mod's active category or its own focus memory.
 g.focus('category:mod1:bindings');g.tap('select');g.focus('mod:library');g.tap('select');
 assert.strictEqual(g.state.selected,'library');assert.strictEqual(g.state.category,'__info');
 assert(!g.state.controller.targets.some(item=>item.region==='status'));
 g.focus('mod:mod1');g.tap('select');assert.strictEqual(g.state.category,'bindings');
 g.focus('category:mod1:camera');g.tap('select');
 g.focus('preset:mod1:camera:near');g.tap('select');assert.strictEqual(g.state.drafts[gkey].value,4);
 cases++;
 // Status buttons stage one change. An empty filter still has reachable
 // actions/language controls, rather than trapping the D-pad in an empty list.
 g.focus('status:mod1');g.tap('select');assert.strictEqual(g.state.drafts['enabled:mod1:'].value,false);
 g.focus('filter:off');g.tap('select');assert.strictEqual(g.state.selected,null);
 g.tap('down');assert.strictEqual(g.state.controller.region,'actions');
 g.focus('filter:all');g.tap('select');assert.strictEqual(g.state.selected,'mod1');
 assert.strictEqual(g.pending.length,0);
 cases++;
 // Cancel must also release the native escape registration when the existing
 // capture field could not acquire keyboard focus at all.
 g.focus('category:mod1:bindings');g.tap('select');g.env.captureFocusPolicy.deny=true;
 g.focus('capture:value:mod1:key');g.tap('select');assert(g.state.keyCapture);
 assert(!g.state.nativeTextInput);assert.strictEqual(g.escapeStacks.get(g.widget.WidgetIdent).length,1);
 g.cancel();assert(!g.state.keyCapture);assert.strictEqual(g.escapeStacks.get(g.widget.WidgetIdent).length,0);
 g.env.captureFocusPolicy.deny=false;
 cases++;
 // Focus must have actual, inset DOM paint even when CSS outline contributes
 // no pixels. A selected mod and the currently browsed mod are distinct.
 const h=fixture(managerFile),hkey='value:mod1:offset';
 const frames=()=>h.state.root.querySelectorAll('.echo-controller-focus').filter(node=>node.style.display==='flex');
 assert.strictEqual(frames().length,0);
 h.tap('down');const first=h.target('mod:mod1').node,firstFrame=first.querySelector('.echo-controller-focus');
 assert(firstFrame,'D-pad needs a visible focus frame, not CSS outline alone');
 assert.strictEqual(firstFrame.style.display,'flex');assert.strictEqual(firstFrame.style.borderColor,'#9ae9ff');
 assert(/position:absolute/.test(firstFrame.style.cssText));assert(/left:0.15rem;right:0.15rem/.test(firstFrame.style.cssText));
 assert(/pointer-events:none/.test(firstFrame.style.cssText));
 assert.strictEqual(firstFrame.querySelector('.echo-controller-focus-bar').style.backgroundColor,'#9ae9ff');
 assert.strictEqual(first.dataset.echoControllerFocus,'browse');
 const nodeCount=h.state.root.querySelectorAll('*').length;
 h.tap('down');assert.strictEqual(h.state.selected,'mod1');assert.strictEqual(h.state.controller.current,'mod:library');
 assert.strictEqual(firstFrame.style.display,'none');assert.strictEqual(frames().length,1);
 h.tap('up');assert.strictEqual(firstFrame.style.display,'flex');
 assert.strictEqual(h.state.root.querySelectorAll('*').length,nodeCount,'Moving focus must reuse existing marker nodes');
 cases++;
 // Option rows and their exact control are marked together; an edit changes
 // both to orange and Cancel restores cyan without rebuilding either marker.
 h.tap('right');h.tap('down');h.tap('down');assert.strictEqual(h.state.controller.current,hkey);
 const numeric=h.target(hkey).node,numericFrame=numeric.querySelector('.echo-controller-focus');
 const row=h.state.optionRows.find(item=>item.option.id==='offset').row,rowFrame=row.echoControllerFrame;
 assert.strictEqual(rowFrame.parentElement,row);
 assert.strictEqual(frames().length,2);assert.strictEqual(rowFrame.style.borderColor,'#9ae9ff');
 const controlStyle=numeric.style.cssText,railBefore=h.state.paneCache['echo-settings'].rail;
 h.tap('select');assert.strictEqual(numericFrame.style.borderColor,'#ffb34f');assert.strictEqual(rowFrame.style.borderColor,'#ffb34f');
 assert.strictEqual(numeric.dataset.echoControllerFocus,'edit');h.tap('right');h.cancel();
 assert.strictEqual(numericFrame.style.borderColor,'#9ae9ff');assert.strictEqual(rowFrame.style.borderColor,'#9ae9ff');
 assert.strictEqual(numeric.querySelector('.echo-controller-focus'),numericFrame);
 assert.strictEqual(numeric.style.cssText,controlStyle);assert.strictEqual(h.state.paneCache['echo-settings'].rail,railBefore);
 h.tap('down');assert.strictEqual(numericFrame.style.display,'none');assert.strictEqual(rowFrame.style.display,'none');
 h.tap('select'); // redraw after toggling; the new focused control still paints
 assert.strictEqual(frames().length,2);assert.strictEqual(h.target(h.state.controller.current).node.dataset.echoControllerFocus,'browse');
 cases++;
 // A text input cannot contain decorative children. Its existing fill and
 // border are used instead, and cursor handoff preserves a validation error.
 h.focus('category:mod1:bindings');h.tap('select');
 const field=h.target('value:mod1:key').node,originalChildren=field.children.length;
 // Real CSSOM serializes hex colors; leaving focus must still release the
 // marker's own colors while preserving a newer validation color.
 field.style=new Proxy(field.style,{set(style,key,value){
  if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))value='rgb('+[1,3,5].map(at=>parseInt(value.slice(at,at+2),16)).join(', ')+')';
  style[key]=value;return true;
 }});
 h.tap('down');
 assert.strictEqual(field.tagName,'INPUT');assert.strictEqual(field.children.length,0);
 assert.strictEqual(field.style.backgroundColor,'rgb(23, 71, 90)');assert.strictEqual(frames().length,1);
 const backgroundBefore=field.echoControllerInk.before.backgroundColor;
 h.tap('select');assert.strictEqual(field.style.backgroundColor,'rgb(88, 56, 22)');
 field.value='!';field.fire('input');assert.strictEqual(field.style.borderColor,'rgb(221, 136, 102)');
 h.ctx.InputMgr.ResetCursorInput({clientX:250,clientY:100});
 assert.strictEqual(frames().length,0);assert.strictEqual(field.style.borderColor,'rgb(221, 136, 102)');
 assert.strictEqual(field.style.backgroundColor,backgroundBefore);assert.strictEqual(field.children.length,originalChildren);
 h.cancel();assert(!h.state.nativeTextInput);
 cases++;
 // Markers are decorative, not focus owners: hide/deactivate removes their
 // paint, and returning to the menu restores focus on the replacement nodes.
 h.focus('category:mod1:camera');h.tap('select');h.focus(hkey);
 assert.strictEqual(frames().length,2);
 h.widget.SupportsHideFlags=true;h.widget.HideFlags=1;h.ctx.echoOnEditorLifecycle(h.widget,'Event_DataUpdated');
 assert.strictEqual(frames().length,0);assert.strictEqual(h.state.controller.paintNodes.length,0);
 h.widget.HideFlags=0;h.ctx.echoOnEditorLifecycle(h.widget,'Event_DataUpdated');
 if(h.pending.length)h.reply(h.pending.shift());
 h.tap('down');assert(frames().length>0);
 h.widget.Event_Deactivate();h.ctx.echoOnEditorLifecycle(h.widget,'Event_Deactivate');
 assert.strictEqual(frames().length,0);assert.strictEqual(JSON.stringify(h.widget.DataModel),h.modelBefore);
 assert.strictEqual(h.pending.length,0);
 cases++;

 // The existing gamepad virtual-cursor path may deliver primary clicks
 // without a NavSelect action. It must select the semantic focus even when
 // the old cursor is outside the panel, not silently block the input.
 const p=fixture(managerFile),pkey='value:mod1:offset';
 const cursor=p.doc.body.appendChild(new p.Node('button'));let cursorClicks=0;
 cursor.addEventListener('click',()=>cursorClicks++);
 function padClick() {for(const name of ['mousedown','mouseup','click'])cursor.fire(name,{button:0});}
 p.tap('down');p.tap('right');p.tap('right');
 assert.strictEqual(p.state.controller.current,'category:mod1:bindings');padClick();
 assert.strictEqual(p.state.category,'bindings');assert.strictEqual(cursorClicks,0);
 assert.strictEqual(p.state.controller.confirmRoute,'click');
 // A delayed logical copy of the same Confirm cannot activate twice.
 p.tap('select');assert.strictEqual(p.state.category,'bindings');
 p.tap('left');padClick();assert.strictEqual(p.state.category,'camera');
 p.tap('down');p.tap('down');assert.strictEqual(p.state.controller.current,pkey);
 padClick();assert(p.state.controller.edit);p.tap('right');
 assert.strictEqual(p.state.controller.current,pkey);assert.strictEqual(p.state.drafts[pkey].value,4);
 padClick();assert(!p.state.controller.edit);assert.strictEqual(p.state.drafts[pkey].value,4);
 cases++;

 // The reverse delivery order must also be one-shot, including a redraw
 // caused by a toggle. Later clicks alone remain usable until a direction
 // starts a new route decision.
 const q=fixture(managerFile);q.tap('down');q.focus('toggle:value:mod1:toggle');
 q.tap('select');assert.strictEqual(q.state.drafts['value:mod1:toggle'].value,false);
 q.target('toggle:value:mod1:toggle').node.fire('click',{button:0});
 assert.strictEqual(q.state.drafts['value:mod1:toggle'].value,false);
 q.tap('up');q.tap('down');
 q.target('toggle:value:mod1:toggle').node.fire('click',{button:0});assert(!q.state.drafts['value:mod1:toggle']);
 q.tap('select');assert(!q.state.drafts['value:mod1:toggle']);
 q.target('toggle:value:mod1:toggle').node.fire('click',{button:0});
 assert.strictEqual(q.state.drafts['value:mod1:toggle'].value,false);
 cases++;

 // Minus, slider and Plus are separate targets, with independent Confirm.
 // In slider edit, directions adjust the value and never leave the control.
 p.focus(pkey);p.tap('left');assert.strictEqual(p.state.controller.current,'decrease:'+pkey);
 padClick();assert(!p.state.drafts[pkey]);assert(!p.state.controller.edit); // restored baseline = 3
 p.tap('right');assert.strictEqual(p.state.controller.current,pkey);
 p.tap('right');assert.strictEqual(p.state.controller.current,'increase:'+pkey);
 padClick();assert.strictEqual(p.state.drafts[pkey].value,4);assert(!p.state.controller.edit);
 p.tap('left');padClick();assert(p.state.controller.edit);p.tap('left');
 assert.strictEqual(p.state.controller.current,pkey);assert(!p.state.drafts[pkey]); // baseline = 3
 p.cancel();assert.strictEqual(p.state.drafts[pkey].value,4);assert.strictEqual(p.state.controller.current,pkey);
 assert.strictEqual(p.pending.length,0);
 cases++;

 // Native select can arrive after its DOM focus cache was cleared. The
 // current semantic target still selects the requested category/slider.
 const r=fixture(managerFile);r.tap('down');r.focus('category:mod1:bindings');
 r.ctx.InputMgr.CurrElement=null;r.tap('select');assert.strictEqual(r.state.category,'bindings');
 r.focus('category:mod1:camera');r.ctx.InputMgr.CurrElement=new r.Node('button');
 r.tap('left');r.focus('category:mod1:camera');r.tap('select');assert.strictEqual(r.state.category,'camera');
 r.focus('value:mod1:offset');r.ctx.InputMgr.CurrElement=null;r.tap('select');assert(r.state.controller.edit);
 r.cancel();assert(!r.state.controller.edit);
 cases++;

 // The real ListMenu early-return leaves input unregistered on reopening
 // without ECHO's reconciliation. Re-enable the bridge, then repeat the exact
 // native callbacks with a frozen, unchanged entriesrev and held Confirm.
 const s=fixture(managerFile),skey='value:mod1:offset',smodel=JSON.stringify(s.widget.DataModel);
 const restore=s.ctx.echoControllerRestoreInput;s.ctx.echoControllerRestoreInput=function(){};
 s.emitWidget('Deactivate');s.emitWidget('ManualDeactivate');s.emitWidget('Activate');s.emitWidget('DataUpdated');
 s.reply(s.pending.shift());assert.strictEqual(s.widget.LastEntryRev,7);
 assert.strictEqual(s.widget.inputActive,false);assert.notStrictEqual(s.ctx.InputMgr.CurrWidget,s.widget);
 s.tap('down');assert.strictEqual(s.state.controller.directional,false);
 s.ctx.echoControllerRestoreInput=restore;
 for(let cycle=0;cycle<8;cycle++) {
  s.emitWidget('Deactivate');s.emitWidget('ManualDeactivate');s.emitWidget('Activate');s.emitWidget('DataUpdated');
  assert.strictEqual(s.pending.length,1);s.reply(s.pending.shift());
  assert.strictEqual(s.widget.inputActive,true);assert.strictEqual(s.ctx.InputMgr.CurrWidget,s.widget);
  assert.strictEqual(s.ctx.InputMgr.NavigationStack.filter(entry=>entry.WidgetId===s.widget.id&&entry.InstId===0).length,1);
  s.tap('down');s.focus(skey);s.phase('select','pressed');assert(s.state.controller.edit);
  s.tap('right');s.cancel();assert(!s.state.controller.edit);
  assert.strictEqual(JSON.stringify(s.widget.DataModel),smodel);assert.strictEqual(s.widget.LastEntryRev,7);
  s.phase('select','pressed');assert(s.state.controller.confirmHeld); // no release before closing
 }
 cases++;

 // Reopening beneath a higher-priority native widget must not steal focus.
 // Once it closes, the registered ECHO widget can resume direction/Confirm.
 s.emitWidget('Deactivate');const overlay=s.host('native_overlay',10);
 s.emitWidget('Activate');s.emitWidget('DataUpdated');
 s.reply(s.pending.shift());assert.strictEqual(s.ctx.InputMgr.CurrWidget,overlay);
 s.ctx.InputMgr.ClearWidgetFocus(overlay.id,0);assert.strictEqual(s.ctx.InputMgr.CurrWidget,s.widget);
 s.tap('down');s.focus(skey);s.tap('select');assert(s.state.controller.edit);s.cancel();
 assert.strictEqual(s.ctx.InputMgr.NavigationStack.filter(entry=>entry.WidgetId===s.widget.id).length,1);
 cases++;

 // The native model can explicitly deny input. Activation cannot register
 // our own widget against that flag, even though its panel is visible.
 const denied=fixture(managerFile);denied.emitWidget('Deactivate');
 denied.widget.DataModel=Object.freeze({entries:Object.freeze([]),entriesrev:7,inputactive:false});
 denied.emitWidget('Activate');denied.emitWidget('DataUpdated');denied.reply(denied.pending.shift());
 assert.notStrictEqual(denied.ctx.InputMgr.CurrWidget,denied.widget);
 assert(!denied.ctx.InputMgr.NavigationStack.some(entry=>entry.WidgetId===denied.widget.id));
 denied.tap('down');assert.strictEqual(denied.state.controller.directional,false);
 cases++;

 // The engine may also destroy/recreate the host rather than reuse it.
 // Global adapters must discover the new instance, not keep the old state.
 const t=fixture(managerFile);t.tap('down');t.focus('value:mod1:offset');t.tap('select');
 const oldState=t.state;t.emitWidget('Deactivate');t.widget.parentElement.removeChild(t.widget);
 const replacement=t.host();t.reply(t.pending.shift());
 const newState=replacement.EchoMenuState;
 assert.notStrictEqual(newState,oldState);assert.strictEqual(t.ctx.InputMgr.CurrWidget,replacement);
 assert.strictEqual(newState.controller.current,'mod:mod1');
 t.tap('down');assert.strictEqual(newState.controller.current,'mod:library');t.tap('up');
 t.tap('right');t.tap('right');t.tap('select');assert.strictEqual(newState.category,'bindings');
 assert.strictEqual(oldState.visible,false);assert(!oldState.controller.edit);
 assert.strictEqual(t.ctx.InputMgr.NavigationStack.filter(entry=>entry.WidgetId===replacement.id).length,1);
 cases++;
}
console.log('PASS: '+cases+' controller scenarios using both exported original InputManager variants; C++ escape dispatch and DOM geometry modeled, no BL4 runtime claim.');
