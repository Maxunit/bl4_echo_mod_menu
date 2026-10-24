'use strict';
module.exports=function createEnvironment(){
const vm=require('vm');
let layoutPending=false, layoutCalls=0;
const captureFocusPolicy={requireLayout:true,rejectReadOnly:true,defer:false,deny:false,throwFocus:false};
let deferredCaptureFocus=null,captureFocusCalls=0;
const observers=[],removedNodes=[];
class Node {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.className='';this.listeners={};this.allListeners={};this.attributes=new Map();this.dataset=new Proxy(Object.create(null),{set(object,key,value){object[key]=String(value);return true;}});this._text='';this.disabled=false;}
 appendChild(n){this.children.push(n);n.parentElement=this;layoutPending=true;return n;}
 removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentElement=null;removedNodes.push(n);layoutPending=true;}
 get firstChild(){return this.children[0]||null;}
 get parentNode(){return this.parentElement||null;}
 get nodeName(){return this.tagName;}
 get previousElementSibling(){if(!this.parentElement)return null;return this.parentElement.children[this.parentElement.children.indexOf(this)-1]||null;}
 get isConnected(){for(let node=this;node;node=node.parentElement)if(node===doc.body)return true;return false;}
 get classList(){const node=this;return {contains(c){return node.className.split(/\s+/).includes(c);},add(c){if(!this.contains(c))node.className=(node.className+' '+c).trim();},remove(c){node.className=node.className.split(/\s+/).filter(x=>x!==c).join(' ');},toggle(c,force){const on=force===undefined?!this.contains(c):!!force;if(on)this.add(c);else this.remove(c);return on;}};}
 hasAttribute(name){return !!(this.attributes&&this.attributes.has(name));}
 getAttribute(name){if(name.startsWith('data-')){const key=name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase());return Object.hasOwn(this.dataset,key)?this.dataset[key]:null;}if(name==='id')return this.id||null;if(name==='class')return this.className||null;return this.attributes&&typeof this.attributes.get==='function'?this.attributes.get(name)||null:null;}
 setAttribute(name,value){if(!(this.attributes instanceof Map))this.attributes=new Map();this.attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=value;if(name==='id')this.id=String(value);if(name==='class')this.className=String(value);}
 removeAttribute(name){if(this.attributes)this.attributes.delete(name);if(name.startsWith('data-'))delete this.dataset[name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())];}
 get childElementCount(){return this.children.length;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(v){this._text=String(v);for(const child of this.children)child.parentElement=null;this.children=[];}
 get value(){return this._value||'';}
 set value(v){this._value=String(v);this.selectionStart=this.selectionEnd=this._value.length;this.valueWrites=(this.valueWrites||0)+1;}
 focus(){
  if(this.className.split(' ').includes('echo-key-capturing')) {
   captureFocusCalls++;
   if(captureFocusPolicy.throwFocus)throw Error('fixture capture focus refused');
   if(captureFocusPolicy.rejectReadOnly&&this.readOnly||captureFocusPolicy.requireLayout&&layoutPending||captureFocusPolicy.deny)return;
   if(captureFocusPolicy.defer){deferredCaptureFocus=this;return;}
  }
  if(doc.activeElement===this)return;if(doc.activeElement)doc.activeElement.blur();doc.activeElement=this;dispatchElementFocus('focus',this);
 }
 blur(){if(doc.activeElement!==this)return;if(!this.stickyBlur)doc.activeElement=null;this.blurCount=(this.blurCount||0)+1;if(!this.omitBlurEvent)dispatchElementFocus('blur',this);}
 fire(type,fields={}){const event=Object.assign(new FixtureEvent(type,{bubbles:true}),fields);this.dispatchEvent(event);return event;}
 dispatchEvent(event){return dispatchDOM(this,event);}
 addEventListener(n,f,capture){this.listeners[n]=f;(this.allListeners[n]||(this.allListeners[n]=[])).push({fn:f,capture:capture===true});this.captureFlags=this.captureFlags||{};this.captureFlags[n]=capture===true;}
 removeEventListener(n,f){this.allListeners[n]=(this.allListeners[n]||[]).filter(x=>x.fn!==f);if(this.listeners[n]===f)this.listeners[n]=this.allListeners[n].length?this.allListeners[n].at(-1).fn:undefined;}
 querySelectorAll(s){let r=[];const attribute=/^\[([^=]+)=["']([^"']*)["']\]$/.exec(s);for(const c of this.children){if(s==='*'||s.toUpperCase()===c.tagName||s[0]==='.'&&c.className.split(' ').includes(s.slice(1))||s[0]==='#'&&c.id===s.slice(1)||attribute&&c.getAttribute(attribute[1])===attribute[2])r.push(c);r.push(...c.querySelectorAll(s));}return r;}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
 getBoundingClientRect(){const box=this._rect||{left:100,top:0,width:layoutPending?0:140,height:layoutPending?0:32};return Object.assign({x:box.left,y:box.top,right:box.left+box.width,bottom:box.top+box.height},box);}
 get clientHeight(){return layoutPending ? 0 : this._clientHeight===undefined ? (['echo-settings','echo-mod-list'].includes(this.className) ? 100 : 200) : this._clientHeight;}
 get scrollHeight(){return layoutPending ? 0 : this._scrollHeight===undefined ? (['echo-settings','echo-mod-list'].includes(this.className) ? 500 : 200) : this._scrollHeight;}
 click(){if(!this.disabled)this.fire('click');}
}
class FixtureEvent {
 constructor(type,options={}){Object.assign(this,{type,bubbles:false,cancelable:true,stopped:false,defaultPrevented:false,immediate:false},options);}
 preventDefault(){this.defaultPrevented=true;}
 stopPropagation(){this.stopped=true;}
 stopImmediatePropagation(){this.immediate=true;this.stopped=true;}
}
const pending=[],records=[],events={},documentEvents={},nativeEvents=[],windowListeners={},documentListeners={};
function invokeListeners(list,event,capture){for(const listener of list||[]){if(listener.capture===capture&&!event.immediate&&typeof listener.fn==='function')listener.fn(event);}}
function dispatchDOM(target,event){
 event.target=target;
 const ancestors=[];for(let at=target.parentElement;at;at=at.parentElement)ancestors.push(at);
 invokeListeners(windowListeners[event.type],event,true);if(!event.stopped)invokeListeners(documentListeners[event.type],event,true);
 for(const at of ancestors.slice().reverse())if(!event.stopped)invokeListeners(at.allListeners[event.type],event,true);
 if(!event.stopped){invokeListeners(target.allListeners[event.type],event,true);invokeListeners(target.allListeners[event.type],event,false);}
 if(event.bubbles)for(const at of ancestors)if(!event.stopped)invokeListeners(at.allListeners[event.type],event,false);
 if(event.bubbles&&!event.stopped)invokeListeners(documentListeners[event.type],event,false);
 if(event.bubbles&&!event.stopped)invokeListeners(windowListeners[event.type],event,false);
 return !event.defaultPrevented;
}
function dispatchElementFocus(type,target) {
 const event={type,target,stopPropagation(){},preventDefault(){}};
 // focus/blur do not bubble, but capture listeners on Window/ancestors DO see
 // descendant events. A target-only stub concealed the premature cancellation.
 for(const listener of windowListeners[type]||[])if(listener.capture)listener.fn(event);
 const ancestors=[];for(let at=target.parentElement;at;at=at.parentElement)ancestors.push(at);
 for(const at of ancestors.reverse())if(at.captureFlags&&at.captureFlags[type]&&at.listeners[type])at.listeners[type](event);
 if(target.listeners[type])target.listeners[type](event);
}
const doc={documentElement:{lang:'en'},createElement:tag=>new Node(tag),addEventListener(n,f,capture){
 (documentListeners[n]||(documentListeners[n]=[])).push({fn:f,capture:capture===true});
 documentEvents[n]=event=>{event=event||new FixtureEvent(n);invokeListeners(documentListeners[n],event,true);if(!event.stopped)invokeListeners(documentListeners[n],event,false);};
},dispatchEvent(event){event.target=doc;if(documentEvents[event.type])documentEvents[event.type](event);return !event.defaultPrevented;},getElementById(id){return doc.body.querySelectorAll('*').find(node=>node.id===id)||null;}};
doc.body=new Node('body');
const ctx=vm.createContext({CustomEvent:FixtureEvent,MouseEvent:FixtureEvent,InputMgr:null,document:doc,window:{addEventListener(n,f,capture){
 (windowListeners[n]||(windowListeners[n]=[])).push({fn:f,capture:capture===true});
 events[n]=(event)=>{for(const listener of windowListeners[n])listener.fn(event||{type:n,target:ctx.window});};
}},engine:{trigger(...args){nativeEvents.push(args);},registerBindingAttribute(){},executeImmediateLayoutSync(){layoutCalls++;layoutPending=false;}},ResizeObserver:class {
 constructor(callback){this.callback=callback;this.targets=[];this.disconnected=false;observers.push(this);}
 observe(node){this.targets.push(node);}
 disconnect(){this.disconnected=true;}
 deliver(){if(!this.disconnected)this.callback([]);}
},LanguageSettings:{CurrentLangCode:'de-DE'},service:'echo-mod-menu-v1',token:'fixture',short:String,record:(...a)=>records.push(a),XMLHttpRequest:class{open(method,url){this.url=url;}setRequestHeader(){}send(v){this.body=JSON.parse(v);pending.push(this);}}});

const variables={get layoutPending(){return layoutPending;},set layoutPending(v){layoutPending=v;},get layoutCalls(){return layoutCalls;},set layoutCalls(v){layoutCalls=v;},get deferredCaptureFocus(){return deferredCaptureFocus;},set deferredCaptureFocus(v){deferredCaptureFocus=v;},get captureFocusCalls(){return captureFocusCalls;},set captureFocusCalls(v){captureFocusCalls=v;}};
return {variables,vm,Node,ctx,doc,pending,records,events,documentEvents,nativeEvents,windowListeners,observers,removedNodes,captureFocusPolicy,getLayout:()=>layoutPending,setLayout:value=>{layoutPending=value;},getLayoutCalls:()=>layoutCalls,dispatchElementFocus};
};
