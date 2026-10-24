'use strict';
/* Test the shipped assembly boundary. Native attachment/C++ remain modeled;
 * the editor/controller are the actual production sources. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const env=require('./frontend_test_env')(),{ctx,Node,doc,pending}=env;
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
let originalAttachCalls=0;
ctx.WidgetManager=function(){this.WidgetMap=new Map();};
ctx.WidgetManager.prototype.AttachInstance=function(request){
 originalAttachCalls++;if(request.fail)throw Error('native attach failure');
 assert(!request.widget.EchoObserved);this.WidgetMap.set(request.WidgetIdent,request.widget);return 42;
};
ctx.WidgetMgr=new ctx.WidgetManager();
vm.runInContext(read('ui/transport.js')+'\n'+read('ui/controller.js')+'\n'+require('./frontend_sources').languageScript+'\n'+read('ui/editor.js').replace('__ECHO_TRANSLATIONS__',require('./frontend_sources').translationsText)+'\n'+read('ui/bootstrap.js'),ctx);
function host(ident){
 const w=doc.body.appendChild(new Node('widget-list-menu'));w.WidgetIdent=ident;w.WidgetDiv=w;w.IsActivated=false;w.IsInitialized=true;
 w.DataModel=Object.freeze({entries:Object.freeze([])});w.transitions=[];
 w.Event_Activate=function(){this.IsActivated=true;return 'activated';};
 w.Event_Deactivate=function(){this.IsActivated=false;return 'deactivated';};
 w.Event_DataUpdated=function(){return 'data';};w.UpdateHintBar=function(){return 'hint';};
 w.PlayMaterialAnimation=function(name,args){this.transitions.push([name,args]);};return w;
}
const foreign=host('native_inventory'),foreignActivate=foreign.Event_Activate;
assert.strictEqual(ctx.WidgetMgr.AttachInstance({WidgetIdent:foreign.WidgetIdent,widget:foreign}),42);
assert.strictEqual(foreign.Event_Activate,foreignActivate);assert(!foreign.EchoMenuState);assert.strictEqual(pending.length,0);
const own=host('def_bl4_empty_page_v40'),before=JSON.stringify(own.DataModel);
const title=own.appendChild(new Node('div'));title.className='list_title';
assert.strictEqual(ctx.WidgetMgr.AttachInstance({WidgetIdent:own.WidgetIdent,widget:own}),42);
assert.strictEqual(title.style.display,'none');assert(own.EchoMenuState);assert.strictEqual(pending.length,0);
assert.strictEqual(own.Event_Activate(),'activated');assert.strictEqual(pending.length,1);
assert.strictEqual(own.transitions.length,1);assert.strictEqual(own.transitions[0][0],'MenuSwitchRight');
function reply(){const request=pending.shift();assert(request.url.endsWith('/echo-mod-menu-v1/catalog'));
 assert.strictEqual(request.body.token,'echo-menu-v1');request.status=200;request.responseText=JSON.stringify({ok:true,service:'echo-mod-menu-v1',epoch:'fixture',active:true,catalog:{mods:[],errors:[]},pending:[],queue_revision:0,preferences:{language:'en'}});request.onload();}
reply();assert.strictEqual(own.Event_Deactivate(),'deactivated');assert.strictEqual(own.EchoMenuState.root.style.display,'none');
assert.strictEqual(own.Event_Activate(),'activated');reply();assert.strictEqual(own.transitions.length,2);
assert.strictEqual(JSON.stringify(own.DataModel),before);
assert.throws(()=>ctx.WidgetMgr.AttachInstance({WidgetIdent:own.WidgetIdent,widget:own,fail:true}),/native attach failure/);
assert.strictEqual(originalAttachCalls,3);assert.strictEqual(pending.length,0);
assert(ctx.window.EchoModMenu.diagnostics().length<=32);
assert.deepStrictEqual(Object.keys(ctx.window).sort(),['EchoModMenu','addEventListener']);
// The caption extension runs after native methods, without intercepting select.
const navEnv=require('./frontend_test_env')(),nc=navEnv.ctx,NN=navEnv.Node;
nc.window.customElements={define(){}};
nc.NativeNode=NN;
vm.runInContext('class Widget_OakMenuBase extends NativeNode { constructor(){super("widget-navigationbar");} Init(){} Event_Activate(){return 17;} Event_DataUpdated(){} TriggerWidgetEvent(...args){engine.trigger(...args);} }\n'+read('native/navigationbar.base.js')+'\nthis.Nav=Widget_NavigationBar;\n'+read('ui/navigation.js'),nc);
function nav(ident){const n=new nc.Nav();n.WidgetIdent=n.id=ident;n.DataModel=Object.freeze({entries:Object.freeze([Object.freeze({ident:'bl4_mods_empty_v39',text:'Empty'})])});n.getElementsByClassName=c=>n.querySelectorAll('.'+c);
 const item=n.appendChild(new NN('div'));item.className='top_nav_item_cntr';const label=item.appendChild(new NN('div'));label.textContent='Empty';return [n,label];}
const [n,label]=nav('def_status_menu_nav_bar');const navModel=JSON.stringify(n.DataModel);n.Init();assert.strictEqual(label.textContent,'Mods');
assert.strictEqual(n.Event_Activate(),17);n.TabSelected(null,8);assert.strictEqual(navEnv.nativeEvents.length,1);assert.strictEqual(navEnv.nativeEvents[0][0],'InputSelectionChanged');assert.strictEqual(navEnv.nativeEvents[0][4],8);assert.strictEqual(JSON.stringify(n.DataModel),navModel);
const [other,otherLabel]=nav('other_nav');other.Init();assert.strictEqual(otherLabel.textContent,'Empty');
console.log('PASS: production attach/caption assembly, preserved originals, own-only lifecycle, transition, protocol, no automatic capture export and unchanged native models.');
