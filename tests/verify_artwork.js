'use strict';
/* Production UI sources with modeled DOM, image decode and native boundary. */
const assert=require('assert'),fs=require('fs'),path=require('path');
const sources=require('./frontend_sources');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const asset='a'.repeat(64),data='data:image/png;base64,iVBORw0KGgo=';
function fixture(withArtwork=true,dimensions={width:2,height:2},immediateLayout=true) {
 const env=require('./frontend_test_env')(),{ctx,vm,Node,doc}=env;
 if(!immediateLayout)ctx.engine.executeImmediateLayoutSync=undefined;
 vm.runInContext(read('ui/controller.js')+'\n'+sources.languageScript+'\n'+sources.visualsScript+'\n'+read('ui/editor.js').replace('__ECHO_TRANSLATIONS__',sources.translationsText),ctx);
 const widget=doc.body.appendChild(new Node('widget-list-menu'));
 widget.WidgetIdent='def_bl4_empty_page_v40';widget.IsActivated=true;
 widget.DataModel=Object.freeze({entries:Object.freeze([])});
 const state=ctx.echoMountEditor(widget);
 const ref=Object.assign({id:asset},dimensions);
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
function css(node,name) {
 const property=name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
 if(Object.hasOwn(node.style,property))return node.style[property];
 let value='';
 for(const declaration of (node.style.cssText||'').split(';')){
  const at=declaration.indexOf(':');
  if(at>=0&&declaration.slice(0,at).trim()===name)value=declaration.slice(at+1).trim();
 }
 return value;
}
function viewportSize(image,width,height,transform=1) {
 const viewport=image.parentElement;
 viewport.clientWidth=width;viewport._clientHeight=height;
 viewport._rect={left:0,top:0,width:width*transform,height:height*transform};
}
function assertContained(image,reference,width,height) {
 const actualWidth=parseFloat(css(image,'width')),actualHeight=parseFloat(css(image,'height'));
 assert(actualWidth>0&&actualHeight>0);
 assert(actualWidth<=width+1e-8&&actualHeight<=height+1e-8);
 assert(Math.abs(actualWidth/actualHeight-reference.width/reference.height)<1e-8);
 assert(Math.abs(actualWidth-width)<1e-8||Math.abs(actualHeight-height)<1e-8);
 assert(Math.abs(parseFloat(css(image,'left'))-(width-actualWidth)/2)<1e-8);
 assert(Math.abs(parseFloat(css(image,'top'))-(height-actualHeight)/2)<1e-8);
}
check('mod symbols precede names in one row with a separate version and fixed card height',()=>{
 const {state}=fixture();
 for(const card of Object.values(state.modCards)){
  const identity=card.echoName.parentElement;
  assert.strictEqual(identity.className,'echo-mod-identity');
  assert.strictEqual(identity.children[0],card.echoSymbol);
  assert.strictEqual(identity.children[1],card.echoName);
  assert.strictEqual(css(identity,'flex-direction'),'row');
  assert.notStrictEqual(card.echoVersion.parentElement,identity);
  assert(parseFloat(css(card.echoSymbol,'margin-right'))>=0.8);
  assert.strictEqual(css(card,'height'),'12.8rem');
  assert(!card.echoSymbol.echoControllerTarget);assert(!card.echoName.echoControllerTarget);
 }
});
check('category/status/footer icons precede explicit labels and preserve text/corner/targets',()=>{
 const {state,ctx}=fixture();
 const targets=state.controller.targets.filter(target=>['categories','actions','status'].includes(target.region));
 assert(targets.length>=7);
 for(const target of targets){
  const button=target.node,icon=button.querySelector('.echo-icon'),label=button.querySelector('.echo-button-label');
  assert(icon&&label);assert.strictEqual(button.children[0],icon);
  assert.strictEqual(button.children[1],label);
  assert.strictEqual(button.textContent,label.textContent);
  assert(parseFloat(css(icon,'margin-right'))>=0.8);
  assert.strictEqual(css(label,'pointer-events'),'none');
  assert(!label.echoControllerTarget);assert.strictEqual(button.echoControllerTarget.id,target.id);
  const corner=button.querySelector('.echo-button-corner');
  if(corner)assert(button.children.indexOf(corner)>button.children.indexOf(label));
 }
 assert.strictEqual(state.saveButton.textContent,ctx.echoT(state,'save'));
 assert.strictEqual(state.saveButton.querySelector('.echo-icon').style.backgroundColor,'#123544');
});
check('all 14 locales retain a bounded heading and a right-anchored language toolbar/popup',()=>{
 const {state,ctx}=fixture();
 state.drafts.example={kind:'value',mod:'m',option:'flag',value:false};
 const before=JSON.stringify(state.drafts);
 for(const language of sources.languages||JSON.parse(read('src/bl4_echo_mod_menu/languages.json'))){
  state.preference=language.code;ctx.echoDraw(state);
  const heading=state.root.querySelector('.echo-heading'),toolbar=state.root.querySelector('.echo-language-toolbar');
  assert.strictEqual(css(heading,'width'),'30%');assert.strictEqual(css(heading,'overflow'),'hidden');
  assert.strictEqual(css(heading.firstChild.children[1],'width'),'auto');
  assert.strictEqual(css(toolbar,'position'),'absolute');assert.strictEqual(css(toolbar,'right'),'0');
  assert.strictEqual(css(toolbar,'width'),'70%');assert.strictEqual(css(toolbar,'justify-content'),'flex-end');
  assert.strictEqual(css(toolbar,'overflow'),'visible');
  const wrap=toolbar.querySelector('.echo-language-select'),trigger=wrap.querySelector('.echo-language-trigger');
  assert.strictEqual(css(wrap,'width'),'25rem');assert.strictEqual(css(wrap,'overflow'),'visible');
  assert.strictEqual(trigger.querySelector('.echo-language-current').textContent,language.name);
  trigger.echoInvoke();assert(state.languageMenu);
  assert.strictEqual(state.languageMenu.panel.parentElement,wrap);
  assert.strictEqual(css(state.languageMenu.panel,'right'),'0');
  ctx.echoLanguageClose(state,false);
 }
 assert.strictEqual(JSON.stringify(state.drafts),before);
});
check('decorations use no unsupported order/object-fit/object-position properties',()=>{
 const {state}=fixture();
 for(const node of state.root.querySelectorAll('*')){
  assert(!css(node,'order'));assert(!css(node,'object-fit'));assert(!css(node,'object-position'));
 }
});
check('real TPS PNG and wide/tall/square/extreme headers stay proportional through resize',()=>{
 const logo=fs.readFileSync(path.join(__dirname,'../integrations/tps_artwork/sdk_mods/BL4ThirdPersonPOC/assets/BL4_TPS_LOGO_TRANSPARENT.png'));
 const tps={width:logo.readUInt32BE(16),height:logo.readUInt32BE(20)};
 assert.deepStrictEqual(tps,{width:1920,height:1080});
 for(const reference of [tps,{width:4096,height:1024},{width:512,height:2048},{width:1024,height:1024},{width:4096,height:1},{width:1,height:4096}]){
  const {state,ctx,events,pending}=fixture(true,reference);
  const image=state.root.querySelector('.echo-mod-header-image');
  reply(pending.shift());
  for(const [width,height] of [[1448,140],[800,140],[120,140],[640,60]]){
   viewportSize(image,width,height);events.resize();assertContained(image,reference,width,height);
   assert.strictEqual(ctx.echoArtworkFitHeaders(state),false);
   assert.strictEqual(css(image.echoArtworkHeader,'height'),'15rem');
  }
 }
});
check('transformed native parent does not multiply proportional CSS image dimensions',()=>{
 const reference={width:1920,height:1080},{state,ctx}=fixture(true,reference);
 const image=state.root.querySelector('.echo-mod-header-image');
 viewportSize(image,400,140,2);ctx.echoFlushScrollLayout(state);
 assertContained(image,reference,400,140);
});
check('deferred geometry fits on existing ResizeObserver events without immediate layout',()=>{
 const reference={width:1920,height:1080},f=fixture(true,reference,false);
 const image=f.state.root.querySelector('.echo-mod-header-image');
 assert.strictEqual(parseFloat(css(image,'width')),0);
 f.setLayout(false);viewportSize(image,360,140);
 for(const observer of f.observers)observer.deliver();
 assertContained(image,reference,360,140);
});
check('image/resize layout preserves the live setting field, draft and controller edit',()=>{
 const reference={width:1920,height:1080},f=fixture(true,reference),{state,ctx,pending,events}=f;
 const image=state.root.querySelector('.echo-mod-header-image'),field=state.visibleOptions[0];
 const edit={kind:'fixture',value:5};state.controller.edit=edit;
 state.drafts.example={kind:'value',mod:'m',option:'flag',value:false};
 const before=JSON.stringify(state.drafts),current=state.controller.current,settings=state.paneCache['echo-settings'].content;
 const optionRow=state.root.querySelector('.echo-option-row');
 viewportSize(image,400,140);reply(pending.shift());
 viewportSize(image,120,80);events.resize();
 assertContained(image,reference,120,80);
 assert.strictEqual(state.controller.edit,edit);assert.strictEqual(state.controller.current,current);
 assert.strictEqual(JSON.stringify(state.drafts),before);assert.strictEqual(state.visibleOptions[0],field);
 assert.strictEqual(state.paneCache['echo-settings'].content,settings);
 assert.strictEqual(state.root.querySelector('.echo-option-row'),optionRow);
});
check('non-square custom icons keep proportions/slot alignment and restore square fallback',()=>{
 for(const reference of [{width:200,height:100},{width:100,height:400}]){
  const {state,pending}=fixture(true,reference),icon=state.modCards.m.echoSymbol;
  reply(pending.shift());
  const width=parseFloat(css(icon,'width')),height=parseFloat(css(icon,'height'));
  assert.strictEqual(width/height,reference.width/reference.height);
  assert(width<=2&&height<=2);
  assert(Math.abs(width+parseFloat(css(icon,'margin-right'))-2.8)<1e-8);
  icon.fire('error');
  assert.strictEqual(css(icon,'width'),'2rem');assert.strictEqual(css(icon,'height'),'2rem');
  assert.strictEqual(css(icon,'margin-right'),'0.8rem');assert.strictEqual(icon.src,icon.echoArtworkFallback);
 }
});
check('invalid dimensions omit the header instead of producing stretched/invalid geometry',()=>{
 for(const reference of [{width:0,height:2},{width:2,height:-1},{width:Infinity,height:2},{width:2},{width:'1920',height:1080}]){
  const {state,ctx}=fixture(true,reference);
  assert.strictEqual(state.root.querySelector('.echo-mod-header-image'),null);
  assert.strictEqual(ctx.echoArtworkContain(reference,100,100),null);
 }
});
check('mod header precedes tabs outside the scroll pane with settings starting directly',()=>{
 const {state,ctx,mod}=fixture();
 mod.categories[0].presets=[{id:'off',label:'Off',values:{flag:false}}];ctx.echoDraw(state);
 const editor=state.root.querySelector('.echo-editor'),header=state.regions.modHeader;
 const categoryBar=state.regions.categoryBar,settings=state.paneCache['echo-settings'];
 assert.strictEqual(editor.children[0],header);assert.strictEqual(editor.children[1],categoryBar);
 assert.strictEqual(editor.children[2],settings.frame);
 assert.strictEqual(state.root.querySelector('.echo-mod-artwork').parentElement,header);
 assert.strictEqual(state.regions.categories.parentElement,categoryBar);
 assert.strictEqual(state.regions.optionCount.parentElement,categoryBar);
 assert.strictEqual(state.regions.optionCount.textContent,'Options: 1');
 assert.strictEqual(settings.content.firstChild.className,'echo-presets');
 assert.strictEqual(settings.content.children[1].className,'echo-option-row');
 assert(!settings.content.querySelector('.echo-mod-artwork'));
 assert(!ctx.echoControllerContains(settings.view,header));
 assert(!state.root.querySelector('.echo-category-title'));assert(!state.root.querySelector('.echo-section'));
});
check('category switches and scrolling retain the same pending/decoded banner node',()=>{
 const {state,ctx,pending}=fixture(),header=state.regions.modHeader;
 const image=header.querySelector('.echo-mod-header-image'),frame=image.echoArtworkHeader;
 const title=header.echoHeaderTitle,targets=Array.from(state.controller.targets,target=>target.id);
 function switchTo(category){
  state.category=category;ctx.echoDraw(state);
  assert.strictEqual(state.regions.modHeader,header);assert.strictEqual(header.echoHeaderTitle,title);
  assert.strictEqual(header.querySelector('.echo-mod-header-image'),image);
  assert.strictEqual(image.echoArtworkHeader,frame);
  assert.strictEqual(state.regions.optionCount.style.display,category==='__info'?'none':'flex');
  assert(!state.root.querySelector('.echo-category-title'));
  const view=state.paneCache['echo-settings'].view;view.scrollTop=250;view.fire('scroll');
  assert(!ctx.echoControllerContains(view,image));
 }
 for(let i=0;i<5;i++){switchTo('__info');switchTo('provider:fixture:camera');}
 assert.strictEqual(pending.length,1);reply(pending.shift());
 for(let i=0;i<5;i++){switchTo('__info');switchTo('provider:fixture:camera');}
 assert.strictEqual(image.src,data);assert.strictEqual(pending.length,0);
 assert.deepStrictEqual(Array.from(state.controller.targets,target=>target.id),targets);
});
check('absent/rejected/failed artwork uses a compact localized mod-name header',()=>{
 for(const withArtwork of [false,true]){
  const {state,ctx,mod,pending}=fixture(withArtwork),header=state.regions.modHeader,title=header.echoHeaderTitle;
  mod.name_i18n={en:'English mod',de:'Deutsche Mod'};
  if(withArtwork){assert.strictEqual(title.style.display,'none');pending.shift().onerror();}
  ctx.echoDraw(state);
  assert.strictEqual(header.echoHeaderTitle,title);assert.strictEqual(title.textContent,'English mod');
  assert.notStrictEqual(title.style.display,'none');assert.strictEqual(css(title,'height'),'4.8rem');
  state.preference='de';ctx.echoDraw(state);
  assert.strictEqual(header.echoHeaderTitle,title);assert.strictEqual(title.textContent,'Deutsche Mod');
  assert.strictEqual(pending.length,0);
 }
 const invalid=fixture(true,{width:0,height:1});
 assert.notStrictEqual(invalid.state.regions.modHeader.echoHeaderTitle.style.display,'none');
 assert(!invalid.state.regions.modHeader.querySelector('.echo-mod-artwork'));
 const broken=fixture();reply(broken.pending.shift());
 broken.state.root.querySelector('.echo-mod-header-image').fire('error');
 assert.strictEqual(broken.state.regions.modHeader.echoHeaderTitle.style.display,'flex');
});
check('mod selection and empty filters clear stale headers and restore the correct mod',()=>{
 const {state,ctx,pending}=fixture(),oldImage=state.root.querySelector('.echo-mod-header-image');
 state.modCards.other.echoInvoke();
 assert(!state.root.querySelector('.echo-mod-header-image'));
 assert.strictEqual(state.regions.modHeader.echoHeaderTitle.textContent,'Other');
 reply(pending.shift());assert.strictEqual(oldImage.src,undefined);
 state.filter='off';ctx.echoDraw(state);
 assert.strictEqual(state.regions.modHeader.style.display,'none');assert.strictEqual(state.regions.modHeader.children.length,0);
 assert.strictEqual(state.regions.categoryBar.style.display,'none');
 state.filter='all';ctx.echoDraw(state);
 assert.strictEqual(state.regions.modHeader.style.display,'flex');assert.strictEqual(state.regions.categoryBar.style.display,'flex');
 assert.strictEqual(state.regions.modHeader.echoHeaderTitle.textContent,'Artwork fixture');
 assert.strictEqual(state.root.querySelector('.echo-mod-header-image').src,data);
});
console.log('PASS: '+cases+' artwork UI scenarios; native/Cohtml boundaries modeled.');
