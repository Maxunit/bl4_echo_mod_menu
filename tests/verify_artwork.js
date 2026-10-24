'use strict';
/* Production UI sources with modeled DOM, image decode and native boundary. */
const assert=require('assert'),fs=require('fs'),path=require('path');
const sources=require('./frontend_sources');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const asset='a'.repeat(64),data='data:image/png;base64,iVBORw0KGgo=';
function fixture(withArtwork=true) {
 const env=require('./frontend_test_env')(),{ctx,vm,Node,doc}=env;
 vm.runInContext(read('ui/controller.js')+'\n'+sources.languageScript+'\n'+sources.visualsScript+'\n'+read('ui/editor.js').replace('__ECHO_TRANSLATIONS__',sources.translationsText),ctx);
 const widget=doc.body.appendChild(new Node('widget-list-menu'));
 widget.WidgetIdent='def_bl4_empty_page_v40';widget.IsActivated=true;
 widget.DataModel=Object.freeze({entries:Object.freeze([])});
 const state=ctx.echoMountEditor(widget);
 const ref={id:asset,width:2,height:2};
 const mod={id:'m',name:'Artwork fixture',author:'Fixture',version:'1',enabled:true,can_toggle:true,
  description:'Description',persistent:true,categories:[{id:'provider:fixture:camera',name:'Camera'}],
  options:[{id:'flag',identifier:'flag',name:'Flag',category:'provider:fixture:camera',kind:'boolean',value:true,default:true,has_default:true,editable:true}]};
 if(withArtwork)mod.artwork={icon:ref,header:ref,category_icons:{camera:'target'}};
 const other={id:'other',name:'Other',version:'1',enabled:true,categories:[],options:[]};
 const catalog={mods:[mod,other],errors:[]};
 function adopt(epoch='e1') {ctx.echoAdopt(state,{epoch,active:true,catalog,pending:[],queue_revision:0,preferences:{language:'en'}},true);ctx.echoDraw(state);}
 adopt();
 return Object.assign(env,{state,widget,mod,adopt});
}
function reply(request,fields={},status=200) {
 request.status=status;request.responseText=JSON.stringify(Object.assign({ok:true,service:'echo-mod-menu-v1',id:asset,data_url:data},fields));request.onload();
}
let cases=0;
function check(name,run) {run();cases++;}
check('one shared request, cached across redraws, no new targets',()=>{
 const plain=fixture(false),f=fixture(),{state,ctx,pending}=f;
 assert.deepStrictEqual(Array.from(state.controller.targets,t=>t.id),Array.from(plain.state.controller.targets,t=>t.id));
 assert.strictEqual(pending.length,1);assert(pending[0].url.endsWith('/artwork'));
 assert.strictEqual(pending[0].body.epoch,'e1');assert.strictEqual(pending[0].body.id,asset);
 const icons=state.root.querySelectorAll('.echo-icon');
 assert(icons.length>5);for(const icon of icons){assert.strictEqual(icon.tabIndex,-1);assert.strictEqual(icon.getAttribute('aria-hidden'),'true');assert(!icon.echoControllerTarget);}
 const before=JSON.stringify(state.widget.DataModel),targets=Array.from(state.controller.targets,t=>t.id);
 for(let n=0;n<24;n++)ctx.echoDraw(state);
 assert.strictEqual(pending.length,1);assert(state.artworkCache[asset].nodes.length<=2);
 reply(pending.shift());
 assert.strictEqual(state.modCards.m.echoSymbol.src,data);
 assert.strictEqual(state.root.querySelector('.echo-mod-header-image').src,data);
 for(let n=0;n<8;n++)ctx.echoDraw(state);
 assert.strictEqual(pending.length,0);assert.deepStrictEqual(Array.from(state.controller.targets,t=>t.id),targets);
 assert.strictEqual(JSON.stringify(state.widget.DataModel),before);
});
check('image arrival preserves drafts and the active editor',()=>{
 const {state,ctx,pending}=fixture();
 state.drafts.example={kind:'value',mod:'m',option:'flag',expected:true,value:false};
 const edit={kind:'fixture',value:5};state.controller.edit=edit;
 const draft=JSON.stringify(state.drafts),current=state.controller.current;
 reply(pending.shift());
 assert.strictEqual(JSON.stringify(state.drafts),draft);assert.strictEqual(state.controller.edit,edit);
 assert.strictEqual(state.controller.current,current);assert.strictEqual(state.busy,false);assert.strictEqual(state.error,'');
});
check('failed transport falls back without retries or settings errors',()=>{
 const {state,ctx,pending}=fixture();const fallback=state.modCards.m.echoSymbol.src;
 const frame=state.root.querySelector('.echo-mod-artwork');pending.shift().onerror();
 assert.strictEqual(frame.style.display,'none');assert.strictEqual(state.modCards.m.echoSymbol.src,fallback);
 for(let n=0;n<5;n++)ctx.echoDraw(state);
 assert.strictEqual(pending.length,0);assert.strictEqual(state.error,'');
});
check('unexpected or external image data is rejected',()=>{
 for(const bad of [{id:'wrong'},{data_url:'https://external.invalid/image.png'},{data_url:'data:image/svg+xml;base64,abc'},{data_url:'data:image/png;base64,%%%'}]){
  const {state,pending}=fixture();reply(pending.shift(),bad);
  assert.strictEqual(state.artworkCache[asset].source,'');assert.strictEqual(state.error,'');
 }
});
check('renderer decode error omits header and restores built-in icon',()=>{
 const {state,ctx,pending}=fixture();const fallback=state.modCards.m.echoSymbol.src;
 reply(pending.shift());const image=state.root.querySelector('.echo-mod-header-image');
 image.fire('error');state.modCards.m.echoSymbol.fire('error');
 assert.strictEqual(image.echoArtworkHeader.style.display,'none');
 assert.strictEqual(state.modCards.m.echoSymbol.src,fallback);assert.strictEqual(state.error,'');
 for(let n=0;n<5;n++)ctx.echoDraw(state);
 assert.strictEqual(pending.length,0);assert.strictEqual(state.modCards.m.echoSymbol.src,fallback);
 assert.strictEqual(state.root.querySelector('.echo-mod-artwork').style.display,'none');
});
check('replaced inventory epoch discards late responses',()=>{
 const f=fixture(),request=f.pending.shift();let aborted=0;request.abort=()=>{aborted++;};
 f.adopt('e2');assert.strictEqual(aborted,1);assert.strictEqual(f.pending.length,1);
 const current=f.state.modCards.m.echoSymbol.src;reply(request);
 assert.strictEqual(f.state.modCards.m.echoSymbol.src,current);
 reply(f.pending.shift());assert.strictEqual(f.state.modCards.m.echoSymbol.src,data);
});
check('closing cancels requests and reopening can load both slots',()=>{
 const f=fixture(),request=f.pending.shift();let aborted=0;request.abort=()=>{aborted++;};
 f.widget.IsActivated=false;f.ctx.echoOnEditorLifecycle(f.widget,'Event_Deactivate');
 assert.strictEqual(aborted,1);reply(request);assert.strictEqual(f.state.root.style.display,'none');
 f.widget.IsActivated=true;f.state.presented=true;f.ctx.echoDraw(f.state);
 assert.strictEqual(f.pending.length,1);reply(f.pending.shift());
 assert.strictEqual(f.state.modCards.m.echoSymbol.src,data);
 assert.strictEqual(f.state.root.querySelector('.echo-mod-header-image').src,data);
});
check('detached header is never updated after another mod is selected',()=>{
 const f=fixture(),image=f.state.root.querySelector('.echo-mod-header-image');
 f.state.modCards.other.echoInvoke();reply(f.pending.shift());
 assert.strictEqual(image.src,undefined);assert(!f.state.root.querySelector('.echo-mod-header-image'));
 assert.strictEqual(f.state.modCards.m.echoSymbol.src,data);
});
check('category declarations use stable provider identifiers',()=>{
 const {ctx,mod}=fixture();
 assert.strictEqual(ctx.echoCategoryIcon(mod,{id:'provider:fixture:camera'}),'target');
 assert.strictEqual(ctx.echoCategoryIcon(mod,{id:'keybinds'}),'keyboard');
 assert.strictEqual(ctx.echoCategoryIcon(mod,{id:'__info'}),'info-circle');
 assert.strictEqual(ctx.echoCategoryIcon(mod,{id:'unknown'}),'adjustments-horizontal');
});
console.log('PASS: '+cases+' artwork UI scenarios; native/Cohtml boundaries modeled.');
