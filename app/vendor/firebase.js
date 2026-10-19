(()=>{var _o=()=>{};var Io=function(n){let e=[],t=0;for(let r=0;r<n.length;r++){let i=n.charCodeAt(r);i<128?e[t++]=i:i<2048?(e[t++]=i>>6|192,e[t++]=i&63|128):(i&64512)===55296&&r+1<n.length&&(n.charCodeAt(r+1)&64512)===56320?(i=65536+((i&1023)<<10)+(n.charCodeAt(++r)&1023),e[t++]=i>>18|240,e[t++]=i>>12&63|128,e[t++]=i>>6&63|128,e[t++]=i&63|128):(e[t++]=i>>12|224,e[t++]=i>>6&63|128,e[t++]=i&63|128)}return e},zc=function(n){let e=[],t=0,r=0;for(;t<n.length;){let i=n[t++];if(i<128)e[r++]=String.fromCharCode(i);else if(i>191&&i<224){let s=n[t++];e[r++]=String.fromCharCode((i&31)<<6|s&63)}else if(i>239&&i<365){let s=n[t++],o=n[t++],a=n[t++],c=((i&7)<<18|(s&63)<<12|(o&63)<<6|a&63)-65536;e[r++]=String.fromCharCode(55296+(c>>10)),e[r++]=String.fromCharCode(56320+(c&1023))}else{let s=n[t++],o=n[t++];e[r++]=String.fromCharCode((i&15)<<12|(s&63)<<6|o&63)}}return e.join("")},Eo={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(n,e){if(!Array.isArray(n))throw Error("encodeByteArray takes an array as a parameter");this.init_();let t=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,r=[];for(let i=0;i<n.length;i+=3){let s=n[i],o=i+1<n.length,a=o?n[i+1]:0,c=i+2<n.length,l=c?n[i+2]:0,_=s>>2,y=(s&3)<<4|a>>4,I=(a&15)<<2|l>>6,T=l&63;c||(T=64,o||(I=64)),r.push(t[_],t[y],t[I],t[T])}return r.join("")},encodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(n):this.encodeByteArray(Io(n),e)},decodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(n):zc(this.decodeStringToByteArray(n,e))},decodeStringToByteArray(n,e){this.init_();let t=e?this.charToByteMapWebSafe_:this.charToByteMap_,r=[];for(let i=0;i<n.length;){let s=t[n.charAt(i++)],a=i<n.length?t[n.charAt(i)]:0;++i;let l=i<n.length?t[n.charAt(i)]:64;++i;let y=i<n.length?t[n.charAt(i)]:64;if(++i,s==null||a==null||l==null||y==null)throw new Yr;let I=s<<2|a>>4;if(r.push(I),l!==64){let T=a<<4&240|l>>2;if(r.push(T),y!==64){let v=l<<6&192|y;r.push(v)}}}return r},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let n=0;n<this.ENCODED_VALS.length;n++)this.byteToCharMap_[n]=this.ENCODED_VALS.charAt(n),this.charToByteMap_[this.byteToCharMap_[n]]=n,this.byteToCharMapWebSafe_[n]=this.ENCODED_VALS_WEBSAFE.charAt(n),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[n]]=n,n>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(n)]=n,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(n)]=n)}}},Yr=class extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}},Gc=function(n){let e=Io(n);return Eo.encodeByteArray(e,!0)},Ot=function(n){return Gc(n).replace(/\./g,"")},Nn=function(n){try{return Eo.decodeString(n,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};function Kc(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}var Jc=()=>Kc().__FIREBASE_DEFAULTS__,Yc=()=>{if(typeof process>"u"||typeof process.env>"u")return;let n=process.env.__FIREBASE_DEFAULTS__;if(n)return JSON.parse(n)},Qc=()=>{if(typeof document>"u")return;let n;try{n=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}let e=n&&Nn(n[1]);return e&&JSON.parse(e)},Xr=()=>{try{return _o()||Jc()||Yc()||Qc()}catch(n){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${n}`);return}},wo=n=>{var e,t;return(t=(e=Xr())==null?void 0:e.emulatorHosts)==null?void 0:t[n]},Rn=n=>{let e=wo(n);if(!e)return;let t=e.lastIndexOf(":");if(t<=0||t+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);let r=parseInt(e.substring(t+1),10);return e[0]==="["?[e.substring(1,t-1),r]:[e.substring(0,t),r]},Zr=()=>{var n;return(n=Xr())==null?void 0:n.config},To=n=>{var e;return(e=Xr())==null?void 0:e[`_${n}`]};var it=class{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,t)=>{this.resolve=e,this.reject=t})}wrapCallback(e){return(t,r)=>{t?this.reject(t):this.resolve(r),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(t):e(t,r))}}};function bo(n,e){if(n.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');let t={alg:"none",type:"JWT"},r=e||"demo-project",i=n.iat||0,s=n.sub||n.user_id;if(!s)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");let o={iss:`https://securetoken.google.com/${r}`,aud:r,iat:i,exp:i+3600,auth_time:i,sub:s,user_id:s,firebase:{sign_in_provider:"custom",identities:{}},...n};return[Ot(JSON.stringify(t)),Ot(JSON.stringify(o)),""].join(".")}function J(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function vo(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(J())}function Ao(){return typeof navigator<"u"&&navigator.userAgent==="Cloudflare-Workers"}function So(){let n=typeof chrome=="object"?chrome.runtime:typeof browser=="object"?browser.runtime:void 0;return typeof n=="object"&&n.id!==void 0}function No(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function Ro(){let n=J();return n.indexOf("MSIE ")>=0||n.indexOf("Trident/")>=0}function Po(){try{return typeof indexedDB=="object"}catch{return!1}}function ko(){return new Promise((n,e)=>{try{let t=!0,r="validate-browser-context-for-indexeddb-analytics-module",i=self.indexedDB.open(r);i.onsuccess=()=>{i.result.close(),t||self.indexedDB.deleteDatabase(r),n(!0)},i.onupgradeneeded=()=>{t=!1},i.onerror=()=>{var s;e(((s=i.error)==null?void 0:s.message)||"")}}catch(t){e(t)}})}var Xc="FirebaseError",G=class n extends Error{constructor(e,t,r){super(t),this.code=e,this.customData=r,this.name=Xc,Object.setPrototypeOf(this,n.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,me.prototype.create)}},me=class{constructor(e,t,r){this.service=e,this.serviceName=t,this.errors=r}create(e,...t){let r=t[0]||{},i=`${this.service}/${e}`,s=this.errors[e],o=s?Zc(s,r):"Error",a=`${this.serviceName}: ${o} (${i}).`;return new G(i,a,r)}};function Zc(n,e){try{let t=0,r="";for(;t<n.length;){let i=n.indexOf("{$",t);if(i===-1){r+=n.substring(t);break}let s=n.indexOf("}",i+2);if(s===-1){r+=n.substring(t);break}let o=n.substring(i+2,s),a=e[o];r+=n.substring(t,i)+(a!=null?String(a):`<${o}?>`),t=s+1}return r}catch{return n}}function ge(n,e){if(n===e)return!0;let t=Object.keys(n),r=Object.keys(e);for(let i of t){if(!r.includes(i))return!1;let s=n[i],o=e[i];if(yo(s)&&yo(o)){if(!ge(s,o))return!1}else if(s!==o)return!1}for(let i of r)if(!t.includes(i))return!1;return!0}function yo(n){return n!==null&&typeof n=="object"}function Pn(n){let e=[];for(let[t,r]of Object.entries(n))Array.isArray(r)?r.forEach(i=>{e.push(encodeURIComponent(t)+"="+encodeURIComponent(i))}):e.push(encodeURIComponent(t)+"="+encodeURIComponent(r));return e.length?"&"+e.join("&"):""}function st(n){let e={};return n.replace(/^\?/,"").split("&").forEach(r=>{if(r){let[i,s]=r.split("=");e[decodeURIComponent(i)]=decodeURIComponent(s)}}),e}function ot(n){let e=n.indexOf("?");if(!e)return"";let t=n.indexOf("#",e);return n.substring(e,t>0?t:void 0)}function Co(n,e){let t=new Qr(n,e);return t.subscribe.bind(t)}var Qr=class{constructor(e,t){this.observers=[],this.unsubscribes=[],this.observerCount=0,this.task=Promise.resolve(),this.finalized=!1,this.onNoObservers=t,this.task.then(()=>{e(this)}).catch(r=>{this.error(r)})}next(e){this.forEachObserver(t=>{t.next(e)})}error(e){this.forEachObserver(t=>{t.error(e)}),this.close(e)}complete(){this.forEachObserver(e=>{e.complete()}),this.close()}subscribe(e,t,r){let i;if(e===void 0&&t===void 0&&r===void 0)throw new Error("Missing Observer.");eu(e,["next","error","complete"])?i=e:i={next:e,error:t,complete:r},i.next===void 0&&(i.next=Jr),i.error===void 0&&(i.error=Jr),i.complete===void 0&&(i.complete=Jr);let s=this.unsubscribeOne.bind(this,this.observers.length);return this.finalized&&this.task.then(()=>{try{this.finalError?i.error(this.finalError):i.complete()}catch{}}),this.observers.push(i),s}unsubscribeOne(e){this.observers===void 0||this.observers[e]===void 0||(delete this.observers[e],this.observerCount-=1,this.observerCount===0&&this.onNoObservers!==void 0&&this.onNoObservers(this))}forEachObserver(e){if(!this.finalized)for(let t=0;t<this.observers.length;t++)this.sendOne(t,e)}sendOne(e,t){this.task.then(()=>{if(this.observers!==void 0&&this.observers[e]!==void 0)try{t(this.observers[e])}catch(r){typeof console<"u"&&console.error&&console.error(r)}})}close(e){this.finalized||(this.finalized=!0,e!==void 0&&(this.finalError=e),this.task.then(()=>{this.observers=void 0,this.onNoObservers=void 0}))}};function eu(n,e){if(typeof n!="object"||n===null)return!1;for(let t of e)if(t in n&&typeof n[t]=="function")return!0;return!1}function Jr(){}var Id=4*60*60*1e3;function P(n){return n&&n._delegate?n._delegate:n}function _e(n){try{return(n.startsWith("http://")||n.startsWith("https://")?new URL(n).hostname:n).endsWith(".cloudworkstations.dev")}catch{return!1}}async function Vt(n){return(await fetch(n,{credentials:"include"})).ok}var Y=class{constructor(e,t,r){this.name=e,this.instanceFactory=t,this.type=r,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}};var Ue="[DEFAULT]";var ei=class{constructor(e,t){this.name=e,this.container=t,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){let t=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(t)){let r=new it;if(this.instancesDeferred.set(t,r),this.isInitialized(t)||this.shouldAutoInitialize())try{let i=this.getOrInitializeService({instanceIdentifier:t});i&&r.resolve(i)}catch{}}return this.instancesDeferred.get(t).promise}getImmediate(e){var i;let t=this.normalizeInstanceIdentifier(e==null?void 0:e.identifier),r=(i=e==null?void 0:e.optional)!=null?i:!1;if(this.isInitialized(t)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:t})}catch(s){if(r)return null;throw s}else{if(r)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(nu(e))try{this.getOrInitializeService({instanceIdentifier:Ue})}catch{}for(let[t,r]of this.instancesDeferred.entries()){let i=this.normalizeInstanceIdentifier(t);try{let s=this.getOrInitializeService({instanceIdentifier:i});r.resolve(s)}catch{}}}}clearInstance(e=Ue){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){let e=Array.from(this.instances.values());await Promise.all([...e.filter(t=>"INTERNAL"in t).map(t=>t.INTERNAL.delete()),...e.filter(t=>"_delete"in t).map(t=>t._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=Ue){return this.instances.has(e)}getOptions(e=Ue){return this.instancesOptions.get(e)||{}}initialize(e={}){let{options:t={}}=e,r=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(r))throw Error(`${this.name}(${r}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);let i=this.getOrInitializeService({instanceIdentifier:r,options:t});for(let[s,o]of this.instancesDeferred.entries()){let a=this.normalizeInstanceIdentifier(s);r===a&&o.resolve(i)}return i}onInit(e,t){var o;let r=this.normalizeInstanceIdentifier(t),i=(o=this.onInitCallbacks.get(r))!=null?o:new Set;i.add(e),this.onInitCallbacks.set(r,i);let s=this.instances.get(r);return s&&e(s,r),()=>{i.delete(e)}}invokeOnInitCallbacks(e,t){let r=this.onInitCallbacks.get(t);if(r)for(let i of r)try{i(e,t)}catch{}}getOrInitializeService({instanceIdentifier:e,options:t={}}){let r=this.instances.get(e);if(!r&&this.component&&(r=this.component.instanceFactory(this.container,{instanceIdentifier:tu(e),options:t}),this.instances.set(e,r),this.instancesOptions.set(e,t),this.invokeOnInitCallbacks(r,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,r)}catch{}return r||null}normalizeInstanceIdentifier(e=Ue){return this.component?this.component.multipleInstances?e:Ue:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}};function tu(n){return n===Ue?void 0:n}function nu(n){return n.instantiationMode==="EAGER"}var kn=class{constructor(e){this.name=e,this.providers=new Map}addComponent(e){let t=this.getProvider(e.name);if(t.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);t.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);let t=new ei(e,this);return this.providers.set(e,t),t}getProviders(){return Array.from(this.providers.values())}};var ru=[],R;(function(n){n[n.DEBUG=0]="DEBUG",n[n.VERBOSE=1]="VERBOSE",n[n.INFO=2]="INFO",n[n.WARN=3]="WARN",n[n.ERROR=4]="ERROR",n[n.SILENT=5]="SILENT"})(R||(R={}));var iu={debug:R.DEBUG,verbose:R.VERBOSE,info:R.INFO,warn:R.WARN,error:R.ERROR,silent:R.SILENT},su=R.INFO,ou={[R.DEBUG]:"log",[R.VERBOSE]:"log",[R.INFO]:"info",[R.WARN]:"warn",[R.ERROR]:"error"},au=(n,e,...t)=>{if(e<n.logLevel)return;let r=new Date().toISOString(),i=ou[e];if(i)console[i](`[${r}]  ${n.name}:`,...t);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)},ke=class{constructor(e){this.name=e,this._logLevel=su,this._logHandler=au,this._userLogHandler=null,ru.push(this)}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in R))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?iu[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,R.DEBUG,...e),this._logHandler(this,R.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,R.VERBOSE,...e),this._logHandler(this,R.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,R.INFO,...e),this._logHandler(this,R.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,R.WARN,...e),this._logHandler(this,R.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,R.ERROR,...e),this._logHandler(this,R.ERROR,...e)}};var cu=(n,e)=>e.some(t=>n instanceof t),Do,Oo;function uu(){return Do||(Do=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function lu(){return Oo||(Oo=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}var Vo=new WeakMap,ni=new WeakMap,Lo=new WeakMap,ti=new WeakMap,ii=new WeakMap;function hu(n){let e=new Promise((t,r)=>{let i=()=>{n.removeEventListener("success",s),n.removeEventListener("error",o)},s=()=>{t(ue(n.result)),i()},o=()=>{r(n.error),i()};n.addEventListener("success",s),n.addEventListener("error",o)});return e.then(t=>{t instanceof IDBCursor&&Vo.set(t,n)}).catch(()=>{}),ii.set(e,n),e}function du(n){if(ni.has(n))return;let e=new Promise((t,r)=>{let i=()=>{n.removeEventListener("complete",s),n.removeEventListener("error",o),n.removeEventListener("abort",o)},s=()=>{t(),i()},o=()=>{r(n.error||new DOMException("AbortError","AbortError")),i()};n.addEventListener("complete",s),n.addEventListener("error",o),n.addEventListener("abort",o)});ni.set(n,e)}var ri={get(n,e,t){if(n instanceof IDBTransaction){if(e==="done")return ni.get(n);if(e==="objectStoreNames")return n.objectStoreNames||Lo.get(n);if(e==="store")return t.objectStoreNames[1]?void 0:t.objectStore(t.objectStoreNames[0])}return ue(n[e])},set(n,e,t){return n[e]=t,!0},has(n,e){return n instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in n}};function xo(n){ri=n(ri)}function fu(n){return n===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...t){let r=n.call(Cn(this),e,...t);return Lo.set(r,e.sort?e.sort():[e]),ue(r)}:lu().includes(n)?function(...e){return n.apply(Cn(this),e),ue(Vo.get(this))}:function(...e){return ue(n.apply(Cn(this),e))}}function pu(n){return typeof n=="function"?fu(n):(n instanceof IDBTransaction&&du(n),cu(n,uu())?new Proxy(n,ri):n)}function ue(n){if(n instanceof IDBRequest)return hu(n);if(ti.has(n))return ti.get(n);let e=pu(n);return e!==n&&(ti.set(n,e),ii.set(e,n)),e}var Cn=n=>ii.get(n);function Uo(n,e,{blocked:t,upgrade:r,blocking:i,terminated:s}={}){let o=indexedDB.open(n,e),a=ue(o);return r&&o.addEventListener("upgradeneeded",c=>{r(ue(o.result),c.oldVersion,c.newVersion,ue(o.transaction),c)}),t&&o.addEventListener("blocked",c=>t(c.oldVersion,c.newVersion,c)),a.then(c=>{s&&c.addEventListener("close",()=>s()),i&&c.addEventListener("versionchange",l=>i(l.oldVersion,l.newVersion,l))}).catch(()=>{}),a}var mu=["get","getKey","getAll","getAllKeys","count"],gu=["put","add","delete","clear"],si=new Map;function Mo(n,e){if(!(n instanceof IDBDatabase&&!(e in n)&&typeof e=="string"))return;if(si.get(e))return si.get(e);let t=e.replace(/FromIndex$/,""),r=e!==t,i=gu.includes(t);if(!(t in(r?IDBIndex:IDBObjectStore).prototype)||!(i||mu.includes(t)))return;let s=async function(o,...a){let c=this.transaction(o,i?"readwrite":"readonly"),l=c.store;return r&&(l=l.index(a.shift())),(await Promise.all([l[t](...a),i&&c.done]))[0]};return si.set(e,s),s}xo(n=>({...n,get:(e,t,r)=>Mo(e,t)||n.get(e,t,r),has:(e,t)=>!!Mo(e,t)||n.has(e,t)}));var ai=class{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(t=>{if(_u(t)){let r=t.getImmediate();return`${r.library}/${r.version}`}else return null}).filter(t=>t).join(" ")}};function _u(n){let e=n.getComponent();return(e==null?void 0:e.type)==="VERSION"}var ci="@firebase/app",Fo="0.16.3";var Ie=new ke("@firebase/app"),yu="@firebase/app-compat",Iu="@firebase/analytics-compat",Eu="@firebase/analytics",wu="@firebase/app-check-compat",Tu="@firebase/app-check",bu="@firebase/auth",vu="@firebase/auth-compat",Au="@firebase/database",Su="@firebase/data-connect",Nu="@firebase/database-compat",Ru="@firebase/functions",Pu="@firebase/functions-compat",ku="@firebase/installations",Cu="@firebase/installations-compat",Du="@firebase/messaging",Ou="@firebase/messaging-compat",Vu="@firebase/performance",Lu="@firebase/performance-compat",xu="@firebase/remote-config",Mu="@firebase/remote-config-compat",Uu="@firebase/storage",Fu="@firebase/storage-compat",qu="@firebase/firestore",Bu="@firebase/ai",ju="@firebase/firestore-compat",$u="firebase",Wu="13.0.0";var ui="[DEFAULT]",Hu={[ci]:"fire-core",[yu]:"fire-core-compat",[Eu]:"fire-analytics",[Iu]:"fire-analytics-compat",[Tu]:"fire-app-check",[wu]:"fire-app-check-compat",[bu]:"fire-auth",[vu]:"fire-auth-compat",[Au]:"fire-rtdb",[Su]:"fire-data-connect",[Nu]:"fire-rtdb-compat",[Ru]:"fire-fn",[Pu]:"fire-fn-compat",[ku]:"fire-iid",[Cu]:"fire-iid-compat",[Du]:"fire-fcm",[Ou]:"fire-fcm-compat",[Vu]:"fire-perf",[Lu]:"fire-perf-compat",[xu]:"fire-rc",[Mu]:"fire-rc-compat",[Uu]:"fire-gcs",[Fu]:"fire-gcs-compat",[qu]:"fire-fst",[ju]:"fire-fst-compat",[Bu]:"fire-vertex","fire-js":"fire-js",[$u]:"fire-js-all"};var Dn=new Map,zu=new Map,li=new Map;function qo(n,e){try{n.container.addComponent(e)}catch(t){Ie.debug(`Component ${e.name} failed to register with FirebaseApp ${n.name}`,t)}}function le(n){let e=n.name;if(li.has(e))return Ie.debug(`There were multiple attempts to register component ${e}.`),!1;li.set(e,n);for(let t of Dn.values())qo(t,n);for(let t of zu.values())qo(t,n);return!0}function at(n,e){let t=n.container.getProvider("heartbeat").getImmediate({optional:!0});return t&&t.triggerHeartbeat(),n.container.getProvider(e)}function $(n){return n==null?!1:n.settings!==void 0}var Gu={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different {$mismatchedParam}. Existing: '{$oldValue}'. New: '{$newValue}'.","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},ye=new me("app","Firebase",Gu);var hi=class{constructor(e,t,r){this._isDeleted=!1,this._options={...e},this._config={...t},this._name=t.name,this._automaticDataCollectionEnabled=t.automaticDataCollectionEnabled,this._container=r,this.container.addComponent(new Y("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw ye.create("app-deleted",{appName:this._name})}};var ct=Wu;function pi(n,e={}){let t=n;typeof e!="object"&&(e={name:e});let r={name:ui,automaticDataCollectionEnabled:!0,...e},i=r.name;if(typeof i!="string"||!i)throw ye.create("bad-app-name",{appName:String(i)});if(t||(t=Zr()),!t)throw ye.create("no-options");let s=Dn.get(i);if(s)if(ge(t,s.options)){if(ge(r,s.config))return s;throw ye.create("duplicate-app",{appName:i,mismatchedParam:"config",oldValue:JSON.stringify(s.config),newValue:JSON.stringify(r)})}else throw ye.create("duplicate-app",{appName:i,mismatchedParam:"options",oldValue:JSON.stringify(s.options),newValue:JSON.stringify(t)});let o=new kn(i);for(let c of li.values())o.addComponent(c);let a=new hi(t,r,o);return Dn.set(i,a),a}function xt(n=ui){let e=Dn.get(n);if(!e&&n===ui&&Zr())return pi();if(!e)throw ye.create("no-app",{appName:n});return e}function Q(n,e,t){var o;let r=(o=Hu[n])!=null?o:n;t&&(r+=`-${t}`);let i=r.match(/\s|\//),s=e.match(/\s|\//);if(i||s){let a=[`Unable to register library "${r}" with version "${e}":`];i&&a.push(`library name "${r}" contains illegal characters (whitespace or "/")`),i&&s&&a.push("and"),s&&a.push(`version name "${e}" contains illegal characters (whitespace or "/")`),Ie.warn(a.join(" "));return}le(new Y(`${r}-version`,()=>({library:r,version:e}),"VERSION"))}var Ku="firebase-heartbeat-database",Ju=1,Lt="firebase-heartbeat-store",oi=null;function Wo(){return oi||(oi=Uo(Ku,Ju,{upgrade:(n,e)=>{switch(e){case 0:try{n.createObjectStore(Lt)}catch(t){console.warn(t)}}}}).catch(n=>{throw ye.create("idb-open",{originalErrorMessage:n.message})})),oi}async function Yu(n){try{let t=(await Wo()).transaction(Lt),r=await t.objectStore(Lt).get(Ho(n));return await t.done,r}catch(e){if(e instanceof G)Ie.warn(e.message);else{let t=ye.create("idb-get",{originalErrorMessage:e==null?void 0:e.message});Ie.warn(t.message)}}}async function Bo(n,e){try{let r=(await Wo()).transaction(Lt,"readwrite");await r.objectStore(Lt).put(e,Ho(n)),await r.done}catch(t){if(t instanceof G)Ie.warn(t.message);else{let r=ye.create("idb-set",{originalErrorMessage:t==null?void 0:t.message});Ie.warn(r.message)}}}function Ho(n){return`${n.name}!${n.options.appId}`}var Qu=1024,Xu=30,di=class{constructor(e){this.container=e,this._heartbeatsCache=null;let t=this.container.getProvider("app").getImmediate();this._storage=new fi(t),this._heartbeatsCachePromise=this._storage.read().then(r=>(this._heartbeatsCache=r,r))}async triggerHeartbeat(){var e,t;try{let i=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),s=jo();if(((e=this._heartbeatsCache)==null?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((t=this._heartbeatsCache)==null?void 0:t.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===s||this._heartbeatsCache.heartbeats.some(o=>o.date===s))return;if(this._heartbeatsCache.heartbeats.push({date:s,agent:i}),this._heartbeatsCache.heartbeats.length>Xu){let o=el(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(r){Ie.warn(r)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)==null?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";let t=jo(),{heartbeatsToSend:r,unsentEntries:i}=Zu(this._heartbeatsCache.heartbeats),s=Ot(JSON.stringify({version:2,heartbeats:r}));return this._heartbeatsCache.lastSentHeartbeatDate=t,i.length>0?(this._heartbeatsCache.heartbeats=i,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),s}catch(t){return Ie.warn(t),""}}};function jo(){return new Date().toISOString().substring(0,10)}function Zu(n,e=Qu){let t=[],r=n.slice();for(let i of n){let s=t.find(o=>o.agent===i.agent);if(s){if(s.dates.push(i.date),$o(t)>e){s.dates.pop();break}}else if(t.push({agent:i.agent,dates:[i.date]}),$o(t)>e){t.pop();break}r=r.slice(1)}return{heartbeatsToSend:t,unsentEntries:r}}var fi=class{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return Po()?ko().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){let t=await Yu(this.app);return t!=null&&t.heartbeats?t:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var r;if(await this._canUseIndexedDBPromise){let i=await this.read();return Bo(this.app,{lastSentHeartbeatDate:(r=e.lastSentHeartbeatDate)!=null?r:i.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var r;if(await this._canUseIndexedDBPromise){let i=await this.read();return Bo(this.app,{lastSentHeartbeatDate:(r=e.lastSentHeartbeatDate)!=null?r:i.lastSentHeartbeatDate,heartbeats:[...i.heartbeats,...e.heartbeats]})}else return}};function $o(n){return Ot(JSON.stringify({version:2,heartbeats:n})).length}function el(n){if(n.length===0)return-1;let e=0,t=n[0].date;for(let r=1;r<n.length;r++)n[r].date<t&&(t=n[r].date,e=r);return e}function tl(n){le(new Y("platform-logger",e=>new ai(e),"PRIVATE")),le(new Y("heartbeat",e=>new di(e),"PRIVATE")),Q(ci,Fo,n),Q(ci,Fo,"esm2020"),Q("fire-js","")}tl("");var nl="firebase",rl="13.0.0";Q(nl,rl,"app");function aa(){return{"dependent-sdk-initialized-before-auth":"Another Firebase SDK was initialized and is trying to use Auth before Auth is initialized. Please be sure to call `initializeAuth` or `getAuth` before starting any other Firebase SDK."}}var ca=aa,ua=new me("auth","Firebase",aa());var Mn=new ke("@firebase/auth");function Vn(n,...e){Mn.logLevel<=R.WARN&&Mn.warn(`Auth (${ct}): ${n}`,...e)}function Ln(n,...e){Mn.logLevel<=R.ERROR&&Mn.error(`Auth (${ct}): ${n}`,...e)}function we(n,...e){throw Mi(n,...e)}function ut(n,...e){return Mi(n,...e)}function xi(n,e,t){let r={...ca(),[e]:t};return new me("auth","Firebase",r).create(e,{appName:n.name})}function Ee(n){return xi(n,"operation-not-supported-in-this-environment","Operations that alter the current user are not supported in conjunction with FirebaseServerApp")}function Mi(n,...e){if(typeof n!="string"){let t=e[0],r=[...e.slice(1)];return r[0]&&(r[0].appName=n.name),n._errorFactory.create(t,...r)}return ua.create(n,...e)}function b(n,e,...t){if(!n)throw Mi(e,...t)}function he(n){let e="INTERNAL ASSERTION FAILED: "+n;throw Ln(e),new Error(e)}function Be(n,e){n||he(e)}function il(){return zo()==="http:"||zo()==="https:"}function zo(){var n;return typeof self<"u"&&((n=self.location)==null?void 0:n.protocol)||null}function sl(){return typeof navigator<"u"&&navigator&&"onLine"in navigator&&typeof navigator.onLine=="boolean"&&(il()||So()||"connection"in navigator)?navigator.onLine:!0}function ol(){if(typeof navigator>"u")return null;let n=navigator;return n.languages&&n.languages[0]||n.language||null}var je=class{constructor(e,t){this.shortDelay=e,this.longDelay=t,Be(t>e,"Short delay should be less than long delay!"),this.isMobile=vo()||No()}get(){return sl()?this.isMobile?this.longDelay:this.shortDelay:Math.min(5e3,this.shortDelay)}};function al(n,e){Be(n.emulator,"Emulator should always be set here");let{url:t}=n.emulator;return e?`${t}${e.startsWith("/")?e.slice(1):e}`:t}var Un=class{static initialize(e,t,r){this.fetchImpl=e,t&&(this.headersImpl=t),r&&(this.responseImpl=r)}static fetch(){if(this.fetchImpl)return this.fetchImpl;if(typeof self<"u"&&"fetch"in self)return self.fetch;if(typeof globalThis<"u"&&globalThis.fetch)return globalThis.fetch;if(typeof fetch<"u")return fetch;he("Could not find fetch implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static headers(){if(this.headersImpl)return this.headersImpl;if(typeof self<"u"&&"Headers"in self)return self.Headers;if(typeof globalThis<"u"&&globalThis.Headers)return globalThis.Headers;if(typeof Headers<"u")return Headers;he("Could not find Headers implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static response(){if(this.responseImpl)return this.responseImpl;if(typeof self<"u"&&"Response"in self)return self.Response;if(typeof globalThis<"u"&&globalThis.Response)return globalThis.Response;if(typeof Response<"u")return Response;he("Could not find Response implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}};var cl={CREDENTIAL_MISMATCH:"custom-token-mismatch",MISSING_CUSTOM_TOKEN:"internal-error",INVALID_IDENTIFIER:"invalid-email",MISSING_CONTINUE_URI:"internal-error",INVALID_PASSWORD:"wrong-password",MISSING_PASSWORD:"missing-password",INVALID_LOGIN_CREDENTIALS:"invalid-credential",EMAIL_EXISTS:"email-already-in-use",PASSWORD_LOGIN_DISABLED:"operation-not-allowed",INVALID_IDP_RESPONSE:"invalid-credential",INVALID_PENDING_TOKEN:"invalid-credential",FEDERATED_USER_ID_ALREADY_LINKED:"credential-already-in-use",MISSING_REQ_TYPE:"internal-error",EMAIL_NOT_FOUND:"user-not-found",RESET_PASSWORD_EXCEED_LIMIT:"too-many-requests",EXPIRED_OOB_CODE:"expired-action-code",INVALID_OOB_CODE:"invalid-action-code",MISSING_OOB_CODE:"internal-error",CREDENTIAL_TOO_OLD_LOGIN_AGAIN:"requires-recent-login",INVALID_ID_TOKEN:"invalid-user-token",TOKEN_EXPIRED:"user-token-expired",USER_NOT_FOUND:"user-token-expired",TOO_MANY_ATTEMPTS_TRY_LATER:"too-many-requests",PASSWORD_DOES_NOT_MEET_REQUIREMENTS:"password-does-not-meet-requirements",INVALID_CODE:"invalid-verification-code",INVALID_SESSION_INFO:"invalid-verification-id",INVALID_TEMPORARY_PROOF:"invalid-credential",MISSING_SESSION_INFO:"missing-verification-id",SESSION_EXPIRED:"code-expired",MISSING_ANDROID_PACKAGE_NAME:"missing-android-pkg-name",UNAUTHORIZED_DOMAIN:"unauthorized-continue-uri",INVALID_OAUTH_CLIENT_ID:"invalid-oauth-client-id",ADMIN_ONLY_OPERATION:"admin-restricted-operation",INVALID_MFA_PENDING_CREDENTIAL:"invalid-multi-factor-session",MFA_ENROLLMENT_NOT_FOUND:"multi-factor-info-not-found",MISSING_MFA_ENROLLMENT_ID:"missing-multi-factor-info",MISSING_MFA_PENDING_CREDENTIAL:"missing-multi-factor-session",SECOND_FACTOR_EXISTS:"second-factor-already-in-use",SECOND_FACTOR_LIMIT_EXCEEDED:"maximum-second-factor-count-exceeded",BLOCKING_FUNCTION_ERROR_RESPONSE:"internal-error",RECAPTCHA_NOT_ENABLED:"recaptcha-not-enabled",MISSING_RECAPTCHA_TOKEN:"missing-recaptcha-token",INVALID_RECAPTCHA_TOKEN:"invalid-recaptcha-token",INVALID_RECAPTCHA_ACTION:"invalid-recaptcha-action",MISSING_CLIENT_TYPE:"missing-client-type",MISSING_RECAPTCHA_VERSION:"missing-recaptcha-version",INVALID_RECAPTCHA_VERSION:"invalid-recaptcha-version",INVALID_REQ_TYPE:"invalid-req-type"};var ul=["/v1/accounts:signInWithCustomToken","/v1/accounts:signInWithEmailLink","/v1/accounts:signInWithIdp","/v1/accounts:signInWithPassword","/v1/accounts:signInWithPhoneNumber","/v1/token"],ll=new je(3e4,6e4);function V(n,e){return n.tenantId&&!e.tenantId?{...e,tenantId:n.tenantId}:e}async function q(n,e,t,r,i={}){return la(n,i,async()=>{let s={},o={};r&&(e==="GET"?o=r:s={body:JSON.stringify(r)});let a=Pn({...o,key:n.config.apiKey}).slice(1),c=await n._getAdditionalHeaders();c["Content-Type"]="application/json",n.languageCode&&(c["X-Firebase-Locale"]=n.languageCode);let l={method:e,headers:c,...s};return Ao()||(l.referrerPolicy="strict-origin-when-cross-origin"),n.emulatorConfig&&_e(n.emulatorConfig.host)&&(l.credentials="include"),Un.fetch()(await ha(n,n.config.apiHost,t,a),l)})}async function la(n,e,t){n._canInitEmulator=!1;let r={...cl,...e};try{let i=new Ei(n),s=await Promise.race([t(),i.promise]);i.clearNetworkTimeout();let o=await s.json();if("needConfirmation"in o)throw Ut(n,"account-exists-with-different-credential",o);if(s.ok&&!("errorMessage"in o))return o;{let a=s.ok?o.errorMessage:o.error.message,[c,l]=a.split(" : ");if(c==="FEDERATED_USER_ID_ALREADY_LINKED")throw Ut(n,"credential-already-in-use",o);if(c==="EMAIL_EXISTS")throw Ut(n,"email-already-in-use",o);if(c==="USER_DISABLED")throw Ut(n,"user-disabled",o);let _=r[c]||c.toLowerCase().replace(/[_\s]+/g,"-");if(l)throw xi(n,_,l);we(n,_)}}catch(i){if(i instanceof G)throw i;we(n,"network-request-failed",{message:String(i)})}}async function be(n,e,t,r,i={}){let s=await q(n,e,t,r,i);return"mfaPendingCredential"in s&&we(n,"multi-factor-auth-required",{_serverResponse:s}),s}async function ha(n,e,t,r){let i=`${e}${t}?${r}`,s=n,o=s.config.emulator?al(n.config,i):`${n.config.apiScheme}://${i}`;return ul.includes(t)&&(await s._persistenceManagerAvailable,s._getPersistenceType()==="COOKIE")?s._getPersistence()._getFinalTarget(o).toString():o}function hl(n){switch(n){case"ENFORCE":return"ENFORCE";case"AUDIT":return"AUDIT";case"OFF":return"OFF";default:return"ENFORCEMENT_STATE_UNSPECIFIED"}}var Ei=class{clearNetworkTimeout(){clearTimeout(this.timer)}constructor(e){this.auth=e,this.timer=null,this.promise=new Promise((t,r)=>{this.timer=setTimeout(()=>r(ut(this.auth,"network-request-failed")),ll.get())})}};function Ut(n,e,t){let r={appName:n.name};t.email&&(r.email=t.email),t.phoneNumber&&(r.phoneNumber=t.phoneNumber);let i=ut(n,e,r);return i.customData._tokenResponse=t,i}function Go(n){return n!==void 0&&n.enterprise!==void 0}var Fn=class{constructor(e){if(this.siteKey="",this.recaptchaEnforcementState=[],e.recaptchaKey===void 0)throw new Error("recaptchaKey undefined");this.siteKey=e.recaptchaKey.split("/")[3],this.recaptchaEnforcementState=e.recaptchaEnforcementState}getProviderEnforcementState(e){if(!this.recaptchaEnforcementState||this.recaptchaEnforcementState.length===0)return null;for(let t of this.recaptchaEnforcementState)if(t.provider&&t.provider===e)return hl(t.enforcementState);return null}isProviderEnabled(e){return this.getProviderEnforcementState(e)==="ENFORCE"||this.getProviderEnforcementState(e)==="AUDIT"}isAnyProviderEnabled(){return this.isProviderEnabled("EMAIL_PASSWORD_PROVIDER")||this.isProviderEnabled("PHONE_PROVIDER")}};async function da(n,e){return q(n,"GET","/v2/recaptchaConfig",V(n,e))}async function dl(n,e){return q(n,"POST","/v1/accounts:delete",e)}async function qn(n,e){return q(n,"POST","/v1/accounts:lookup",e)}function Ft(n){if(n)try{let e=new Date(Number(n));if(!isNaN(e.getTime()))return e.toUTCString()}catch{}}async function nr(n,e=!1){let t=P(n),r=await t.getIdToken(e),i=Ui(r);b(i&&i.exp&&i.auth_time&&i.iat,t.auth,"internal-error");let s=typeof i.firebase=="object"?i.firebase:void 0,o=s==null?void 0:s.sign_in_provider;return{claims:i,token:r,authTime:Ft(mi(i.auth_time)),issuedAtTime:Ft(mi(i.iat)),expirationTime:Ft(mi(i.exp)),signInProvider:o||null,signInSecondFactor:(s==null?void 0:s.sign_in_second_factor)||null}}function mi(n){return Number(n)*1e3}function Ui(n){let[e,t,r]=n.split(".");if(e===void 0||t===void 0||r===void 0)return Ln("JWT malformed, contained fewer than 3 sections"),null;try{let i=Nn(t);return i?JSON.parse(i):(Ln("Failed to decode base64 JWT payload"),null)}catch(i){return Ln("Caught error parsing JWT payload as JSON",i==null?void 0:i.toString()),null}}function Ko(n){let e=Ui(n);return b(e,"internal-error"),b(typeof e.exp<"u","internal-error"),b(typeof e.iat<"u","internal-error"),Number(e.exp)-Number(e.iat)}async function ht(n,e,t=!1){if(t)return e;try{return await e}catch(r){throw r instanceof G&&fl(r)&&n.auth.currentUser===n&&await n.auth.signOut(),r}}function fl({code:n}){return n==="auth/user-disabled"||n==="auth/user-token-expired"}var wi=class{constructor(e){this.user=e,this.isRunning=!1,this.timerId=null,this.errorBackoff=3e4}_start(){this.isRunning||(this.isRunning=!0,this.schedule())}_stop(){this.isRunning&&(this.isRunning=!1,this.timerId!==null&&clearTimeout(this.timerId))}getInterval(e){var t;if(e){let r=this.errorBackoff;return this.errorBackoff=Math.min(this.errorBackoff*2,96e4),r}else{this.errorBackoff=3e4;let i=((t=this.user.stsTokenManager.expirationTime)!=null?t:0)-Date.now()-3e5;return Math.max(0,i)}}schedule(e=!1){if(!this.isRunning)return;let t=this.getInterval(e);this.timerId=setTimeout(async()=>{await this.iteration()},t)}async iteration(){try{await this.user.getIdToken(!0)}catch(e){(e==null?void 0:e.code)==="auth/network-request-failed"&&this.schedule(!0);return}this.schedule()}};var $t=class{constructor(e,t){this.createdAt=e,this.lastLoginAt=t,this._initializeTime()}_initializeTime(){this.lastSignInTime=Ft(this.lastLoginAt),this.creationTime=Ft(this.createdAt)}_copy(e){this.createdAt=e.createdAt,this.lastLoginAt=e.lastLoginAt,this._initializeTime()}toJSON(){return{createdAt:this.createdAt,lastLoginAt:this.lastLoginAt}}};async function Bn(n){var y;let e=n.auth,t=await n.getIdToken(),r=await ht(n,qn(e,{idToken:t}));b(r==null?void 0:r.users.length,e,"internal-error");let i=r.users[0];n._notifyReloadListener(i);let s=(y=i.providerUserInfo)!=null&&y.length?fa(i.providerUserInfo):[],o=pl(n.providerData,s),a=n.isAnonymous,c=!(n.email&&i.passwordHash)&&!(o!=null&&o.length),l=a?c:!1,_={uid:i.localId,displayName:i.displayName||null,photoURL:i.photoUrl||null,email:i.email||null,emailVerified:i.emailVerified||!1,phoneNumber:i.phoneNumber||null,tenantId:i.tenantId||null,providerData:o,metadata:new $t(i.createdAt,i.lastLoginAt),isAnonymous:l};Object.assign(n,_)}async function rr(n){let e=P(n);await Bn(e),await e.auth._persistUserIfCurrent(e),e.auth._notifyListenersIfCurrent(e)}function pl(n,e){return[...n.filter(r=>!e.some(i=>i.providerId===r.providerId)),...e]}function fa(n){return n.map(({providerId:e,...t})=>({providerId:e,uid:t.rawId||"",displayName:t.displayName||null,email:t.email||null,phoneNumber:t.phoneNumber||null,photoURL:t.photoUrl||null}))}async function ml(n,e){let t=await la(n,{},async()=>{let r=Pn({grant_type:"refresh_token",refresh_token:e}).slice(1),{tokenApiHost:i,apiKey:s}=n.config,o=await ha(n,i,"/v1/token",`key=${s}`),a=await n._getAdditionalHeaders();a["Content-Type"]="application/x-www-form-urlencoded";let c={method:"POST",headers:a,body:r};return n.emulatorConfig&&_e(n.emulatorConfig.host)&&(c.credentials="include"),Un.fetch()(o,c)});return{accessToken:t.access_token,expiresIn:t.expires_in,refreshToken:t.refresh_token}}async function gl(n,e){return q(n,"POST","/v2/accounts:revokeToken",V(n,e))}var qt=class n{constructor(){this.refreshToken=null,this.accessToken=null,this.expirationTime=null}get isExpired(){return!this.expirationTime||Date.now()>this.expirationTime-3e4}updateFromServerResponse(e){b(e.idToken,"internal-error"),b(typeof e.idToken<"u","internal-error"),b(typeof e.refreshToken<"u","internal-error");let t="expiresIn"in e&&typeof e.expiresIn<"u"?Number(e.expiresIn):Ko(e.idToken);this.updateTokensAndExpiration(e.idToken,e.refreshToken,t)}updateFromIdToken(e){b(e.length!==0,"internal-error");let t=Ko(e);this.updateTokensAndExpiration(e,null,t)}async getToken(e,t=!1){return!t&&this.accessToken&&!this.isExpired?this.accessToken:(b(this.refreshToken,e,"user-token-expired"),this.refreshToken?(await this.refresh(e,this.refreshToken),this.accessToken):null)}clearRefreshToken(){this.refreshToken=null}async refresh(e,t){let{accessToken:r,refreshToken:i,expiresIn:s}=await ml(e,t);this.updateTokensAndExpiration(r,i,Number(s))}updateTokensAndExpiration(e,t,r){this.refreshToken=t||null,this.accessToken=e||null,this.expirationTime=Date.now()+r*1e3}static fromJSON(e,t){let{refreshToken:r,accessToken:i,expirationTime:s}=t,o=new n;return r&&(b(typeof r=="string","internal-error",{appName:e}),o.refreshToken=r),i&&(b(typeof i=="string","internal-error",{appName:e}),o.accessToken=i),s&&(b(typeof s=="number","internal-error",{appName:e}),o.expirationTime=s),o}toJSON(){return{refreshToken:this.refreshToken,accessToken:this.accessToken,expirationTime:this.expirationTime}}_assign(e){this.accessToken=e.accessToken,this.refreshToken=e.refreshToken,this.expirationTime=e.expirationTime}_clone(){return Object.assign(new n,this.toJSON())}_performRefresh(){return he("not implemented")}};function Ce(n,e){b(typeof n=="string"||typeof n>"u","internal-error",{appName:e})}var De=class n{constructor({uid:e,auth:t,stsTokenManager:r,...i}){this.providerId="firebase",this.proactiveRefresh=new wi(this),this.reloadUserInfo=null,this.reloadListener=null,this.uid=e,this.auth=t,this.stsTokenManager=r,this.accessToken=r.accessToken,this.displayName=i.displayName||null,this.email=i.email||null,this.emailVerified=i.emailVerified||!1,this.phoneNumber=i.phoneNumber||null,this.photoURL=i.photoURL||null,this.isAnonymous=i.isAnonymous||!1,this.tenantId=i.tenantId||null,this.providerData=i.providerData?[...i.providerData]:[],this.metadata=new $t(i.createdAt||void 0,i.lastLoginAt||void 0)}async getIdToken(e){let t=await ht(this,this.stsTokenManager.getToken(this.auth,e));return b(t,this.auth,"internal-error"),this.accessToken!==t&&(this.accessToken=t,await this.auth._persistUserIfCurrent(this),this.auth._notifyListenersIfCurrent(this)),t}getIdTokenResult(e){return nr(this,e)}reload(){return rr(this)}_assign(e){this!==e&&(b(this.uid===e.uid,this.auth,"internal-error"),this.displayName=e.displayName,this.photoURL=e.photoURL,this.email=e.email,this.emailVerified=e.emailVerified,this.phoneNumber=e.phoneNumber,this.isAnonymous=e.isAnonymous,this.tenantId=e.tenantId,this.providerData=e.providerData.map(t=>({...t})),this.metadata._copy(e.metadata),this.stsTokenManager._assign(e.stsTokenManager))}_clone(e){let t=new n({...this,auth:e,stsTokenManager:this.stsTokenManager._clone()});return t.metadata._copy(this.metadata),t}_onReload(e){b(!this.reloadListener,this.auth,"internal-error"),this.reloadListener=e,this.reloadUserInfo&&(this._notifyReloadListener(this.reloadUserInfo),this.reloadUserInfo=null)}_notifyReloadListener(e){this.reloadListener?this.reloadListener(e):this.reloadUserInfo=e}_startProactiveRefresh(){this.proactiveRefresh._start()}_stopProactiveRefresh(){this.proactiveRefresh._stop()}async _updateTokensIfNecessary(e,t=!1){let r=!1;e.idToken&&e.idToken!==this.stsTokenManager.accessToken&&(this.stsTokenManager.updateFromServerResponse(e),r=!0),t&&await Bn(this),await this.auth._persistUserIfCurrent(this),r&&this.auth._notifyListenersIfCurrent(this)}async delete(){if($(this.auth.app))return Promise.reject(Ee(this.auth));let e=await this.getIdToken();return await ht(this,dl(this.auth,{idToken:e})),this.stsTokenManager.clearRefreshToken(),this.auth.signOut()}toJSON(){return{uid:this.uid,email:this.email||void 0,emailVerified:this.emailVerified,displayName:this.displayName||void 0,isAnonymous:this.isAnonymous,photoURL:this.photoURL||void 0,phoneNumber:this.phoneNumber||void 0,tenantId:this.tenantId||void 0,providerData:this.providerData.map(e=>({...e})),stsTokenManager:this.stsTokenManager.toJSON(),_redirectEventId:this._redirectEventId,...this.metadata.toJSON(),apiKey:this.auth.config.apiKey,appName:this.auth.name}}get refreshToken(){return this.stsTokenManager.refreshToken||""}static _fromJSON(e,t){var Z,se,ce,Pe,re,f,u,h;let r=(Z=t.displayName)!=null?Z:void 0,i=(se=t.email)!=null?se:void 0,s=(ce=t.phoneNumber)!=null?ce:void 0,o=(Pe=t.photoURL)!=null?Pe:void 0,a=(re=t.tenantId)!=null?re:void 0,c=(f=t._redirectEventId)!=null?f:void 0,l=(u=t.createdAt)!=null?u:void 0,_=(h=t.lastLoginAt)!=null?h:void 0,{uid:y,emailVerified:I,isAnonymous:T,providerData:v,stsTokenManager:A}=t;b(y&&A,e,"internal-error");let S=qt.fromJSON(this.name,A);b(typeof y=="string",e,"internal-error"),Ce(r,e.name),Ce(i,e.name),b(typeof I=="boolean",e,"internal-error"),b(typeof T=="boolean",e,"internal-error"),Ce(s,e.name),Ce(o,e.name),Ce(a,e.name),Ce(c,e.name),Ce(l,e.name),Ce(_,e.name);let K=new n({uid:y,auth:e,email:i,emailVerified:I,displayName:r,isAnonymous:T,photoURL:o,phoneNumber:s,tenantId:a,stsTokenManager:S,createdAt:l,lastLoginAt:_});return v&&Array.isArray(v)&&(K.providerData=v.map(m=>({...m}))),c&&(K._redirectEventId=c),K}static async _fromIdTokenResponse(e,t,r=!1){let i=new qt;i.updateFromServerResponse(t);let s=new n({uid:t.localId,auth:e,stsTokenManager:i,isAnonymous:r});return await Bn(s),s}static async _fromGetAccountInfoResponse(e,t,r){let i=t.users[0];b(i.localId!==void 0,"internal-error");let s=i.providerUserInfo!==void 0?fa(i.providerUserInfo):[],o=!(i.email&&i.passwordHash)&&!(s!=null&&s.length),a=new qt;a.updateFromIdToken(r);let c=new n({uid:i.localId,auth:e,stsTokenManager:a,isAnonymous:o}),l={uid:i.localId,displayName:i.displayName||null,photoURL:i.photoUrl||null,email:i.email||null,emailVerified:i.emailVerified||!1,phoneNumber:i.phoneNumber||null,tenantId:i.tenantId||null,providerData:s,metadata:new $t(i.createdAt,i.lastLoginAt),isAnonymous:!(i.email&&i.passwordHash)&&!(s!=null&&s.length)};return Object.assign(c,l),c}};var Jo=new Map;function Fe(n){Be(n instanceof Function,"Expected a class definition");let e=Jo.get(n);return e?(Be(e instanceof n,"Instance stored in cache mismatched with class"),e):(e=new n,Jo.set(n,e),e)}var jn=class{constructor(){this.type="NONE",this.storage={}}async _isAvailable(){return!0}async _set(e,t){this.storage[e]=t}async _get(e){let t=this.storage[e];return t===void 0?null:t}async _remove(e){delete this.storage[e]}_addListener(e,t){}_removeListener(e,t){}};jn.type="NONE";var Wt=jn;function gi(n,e,t){return`firebase:${n}:${e}:${t}`}var Bt=class n{constructor(e,t,r){this.persistence=e,this.auth=t,this.userKey=r;let{config:i,name:s}=this.auth;this.fullUserKey=gi(this.userKey,i.apiKey,s),this.fullPersistenceKey=gi("persistence",i.apiKey,s),this.boundEventHandler=t._onStorageEvent.bind(t);try{this.persistence._addListener(this.fullUserKey,this.boundEventHandler)}catch{}}setCurrentUser(e){return this.persistence._set(this.fullUserKey,e.toJSON())}async getCurrentUser(){let e=await this.persistence._get(this.fullUserKey);if(!e)return null;if(typeof e=="string"){let t=await qn(this.auth,{idToken:e}).catch(()=>{});return t?De._fromGetAccountInfoResponse(this.auth,t,e):null}return De._fromJSON(this.auth,e)}removeCurrentUser(){return this.persistence._remove(this.fullUserKey)}savePersistenceForRedirect(){return this.persistence._set(this.fullPersistenceKey,this.persistence.type)}async setPersistence(e){if(this.persistence===e)return;let t=await this.getCurrentUser();if(await this.removeCurrentUser(),this.persistence=e,t)return this.setCurrentUser(t)}delete(){try{this.persistence._removeListener(this.fullUserKey,this.boundEventHandler)}catch{}}static async create(e,t,r="authUser"){if(!t.length)return new n(Fe(Wt),e,r);let i=(await Promise.all(t.map(async l=>{try{if(await l._isAvailable())return l}catch{return}}))).filter(l=>l),s=i[0]||Fe(Wt),o=gi(r,e.config.apiKey,e.name),a=null;for(let l of t)try{let _=await l._get(o);if(_){let y;if(typeof _=="string"){let I=await qn(e,{idToken:_}).catch(()=>{});if(!I)break;y=await De._fromGetAccountInfoResponse(e,I,_)}else y=De._fromJSON(e,_);l!==s&&(a=y),s=l;break}}catch{}let c=i.filter(l=>l._shouldAllowMigration);return!s._shouldAllowMigration||!c.length?new n(s,e,r):(s=c[0],a&&await s._set(o,a.toJSON()),await Promise.all(t.map(async l=>{if(l!==s)try{await l._remove(o)}catch{}})),new n(s,e,r))}};function Yo(n){let e=n.toLowerCase();if(e.includes("opera/")||e.includes("opr/")||e.includes("opios/"))return"Opera";if(pa(e))return"IEMobile";if(e.includes("msie")||e.includes("trident/"))return"IE";if(e.includes("edge/"))return"Edge";if(_l(e))return"Firefox";if(e.includes("silk/"))return"Silk";if(ga(e))return"Blackberry";if(_a(e))return"Webos";if(yl(e))return"Safari";if((e.includes("chrome/")||Il(e))&&!e.includes("edge/"))return"Chrome";if(ma(e))return"Android";{let t=/([a-zA-Z\d\.]+)\/[a-zA-Z\d\.]*$/,r=n.match(t);if((r==null?void 0:r.length)===2)return r[1]}return"Other"}function _l(n=J()){return/firefox\//i.test(n)}function yl(n=J()){let e=n.toLowerCase();return e.includes("safari/")&&!e.includes("chrome/")&&!e.includes("crios/")&&!e.includes("android")}function Il(n=J()){return/crios\//i.test(n)}function pa(n=J()){return/iemobile/i.test(n)}function ma(n=J()){return/android/i.test(n)}function ga(n=J()){return/blackberry/i.test(n)}function _a(n=J()){return/webos/i.test(n)}function El(n=J()){return/iphone|ipad|ipod/i.test(n)||/macintosh/i.test(n)&&/mobile/i.test(n)}function wl(){return Ro()&&document.documentMode===10}function Tl(n=J()){return El(n)||ma(n)||_a(n)||ga(n)||/windows phone/i.test(n)||pa(n)}function ya(n,e=[]){let t;switch(n){case"Browser":t=Yo(J());break;case"Worker":t=`${Yo(J())}-${n}`;break;default:t=n}let r=e.length?e.join(","):"FirebaseCore-web";return`${t}/JsCore/${ct}/${r}`}var Ti=class{constructor(e){this.auth=e,this.queue=[]}pushCallback(e,t){let r=s=>new Promise((o,a)=>{try{let c=e(s);o(c)}catch(c){a(c)}});r.onAbort=t,this.queue.push(r);let i=this.queue.length-1;return()=>{this.queue[i]=()=>Promise.resolve()}}async runMiddleware(e){if(this.auth.currentUser===e)return;let t=[];try{for(let r of this.queue)await r(e),r.onAbort&&t.push(r.onAbort)}catch(r){t.reverse();for(let i of t)try{i()}catch{}throw this.auth._errorFactory.create("login-blocked",{originalMessage:r==null?void 0:r.message})}}};async function bl(n,e={}){return q(n,"GET","/v2/passwordPolicy",V(n,e))}var vl=6,bi=class{constructor(e){var r,i,s,o;let t=e.customStrengthOptions;this.customStrengthOptions={},this.customStrengthOptions.minPasswordLength=(r=t.minPasswordLength)!=null?r:vl,t.maxPasswordLength&&(this.customStrengthOptions.maxPasswordLength=t.maxPasswordLength),t.containsLowercaseCharacter!==void 0&&(this.customStrengthOptions.containsLowercaseLetter=t.containsLowercaseCharacter),t.containsUppercaseCharacter!==void 0&&(this.customStrengthOptions.containsUppercaseLetter=t.containsUppercaseCharacter),t.containsNumericCharacter!==void 0&&(this.customStrengthOptions.containsNumericCharacter=t.containsNumericCharacter),t.containsNonAlphanumericCharacter!==void 0&&(this.customStrengthOptions.containsNonAlphanumericCharacter=t.containsNonAlphanumericCharacter),this.enforcementState=e.enforcementState,this.enforcementState==="ENFORCEMENT_STATE_UNSPECIFIED"&&(this.enforcementState="OFF"),this.allowedNonAlphanumericCharacters=(s=(i=e.allowedNonAlphanumericCharacters)==null?void 0:i.join(""))!=null?s:"",this.forceUpgradeOnSignin=(o=e.forceUpgradeOnSignin)!=null?o:!1,this.schemaVersion=e.schemaVersion}validatePassword(e){var r,i,s,o,a,c;let t={isValid:!0,passwordPolicy:this};return this.validatePasswordLengthOptions(e,t),this.validatePasswordCharacterOptions(e,t),t.isValid&&(t.isValid=(r=t.meetsMinPasswordLength)!=null?r:!0),t.isValid&&(t.isValid=(i=t.meetsMaxPasswordLength)!=null?i:!0),t.isValid&&(t.isValid=(s=t.containsLowercaseLetter)!=null?s:!0),t.isValid&&(t.isValid=(o=t.containsUppercaseLetter)!=null?o:!0),t.isValid&&(t.isValid=(a=t.containsNumericCharacter)!=null?a:!0),t.isValid&&(t.isValid=(c=t.containsNonAlphanumericCharacter)!=null?c:!0),t}validatePasswordLengthOptions(e,t){let r=this.customStrengthOptions.minPasswordLength,i=this.customStrengthOptions.maxPasswordLength;r&&(t.meetsMinPasswordLength=e.length>=r),i&&(t.meetsMaxPasswordLength=e.length<=i)}validatePasswordCharacterOptions(e,t){this.updatePasswordCharacterOptionsStatuses(t,!1,!1,!1,!1);let r;for(let i=0;i<e.length;i++)r=e.charAt(i),this.updatePasswordCharacterOptionsStatuses(t,r>="a"&&r<="z",r>="A"&&r<="Z",r>="0"&&r<="9",this.allowedNonAlphanumericCharacters.includes(r))}updatePasswordCharacterOptionsStatuses(e,t,r,i,s){this.customStrengthOptions.containsLowercaseLetter&&(e.containsLowercaseLetter||(e.containsLowercaseLetter=t)),this.customStrengthOptions.containsUppercaseLetter&&(e.containsUppercaseLetter||(e.containsUppercaseLetter=r)),this.customStrengthOptions.containsNumericCharacter&&(e.containsNumericCharacter||(e.containsNumericCharacter=i)),this.customStrengthOptions.containsNonAlphanumericCharacter&&(e.containsNonAlphanumericCharacter||(e.containsNonAlphanumericCharacter=s))}};var vi=class{constructor(e,t,r,i){this.app=e,this.heartbeatServiceProvider=t,this.appCheckServiceProvider=r,this.config=i,this.currentUser=null,this.emulatorConfig=null,this.operations=Promise.resolve(),this.authStateSubscription=new $n(this),this.idTokenSubscription=new $n(this),this.beforeStateQueue=new Ti(this),this.redirectUser=null,this.isProactiveRefreshEnabled=!1,this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION=1,this._canInitEmulator=!0,this._isInitialized=!1,this._deleted=!1,this._initializationPromise=null,this._popupRedirectResolver=null,this._errorFactory=ua,this._agentRecaptchaConfig=null,this._tenantRecaptchaConfigs={},this._projectPasswordPolicy=null,this._tenantPasswordPolicies={},this._resolvePersistenceManagerAvailable=void 0,this.lastNotifiedUid=void 0,this.languageCode=null,this.tenantId=null,this.settings={appVerificationDisabledForTesting:!1},this.frameworks=[],this.name=e.name,this.clientVersion=i.sdkClientVersion,this._persistenceManagerAvailable=new Promise(s=>this._resolvePersistenceManagerAvailable=s)}_initializeWithPersistence(e,t){return t&&(this._popupRedirectResolver=Fe(t)),this._initializationPromise=this.queue(async()=>{var r,i,s;if(!this._deleted){try{this.persistenceManager=await Bt.create(this,e)}catch(o){Vn(`Failed to initialize persistence: ${o}`),this.persistenceManager=await Bt.create(this,[])}finally{(r=this._resolvePersistenceManagerAvailable)==null||r.call(this)}if(!this._deleted){if((i=this._popupRedirectResolver)!=null&&i._shouldInitProactively)try{await this._popupRedirectResolver._initialize(this)}catch{}try{await this.initializeCurrentUser(t)}catch(o){Vn(`Failed to initialize current user: ${o}`),await this.directlySetCurrentUser(null).catch(()=>{})}this.lastNotifiedUid=((s=this.currentUser)==null?void 0:s.uid)||null,!this._deleted&&(this._isInitialized=!0)}}}),this._initializationPromise}async _onStorageEvent(){if(this._deleted)return;let e=await this.assertedPersistence.getCurrentUser();if(!(!this.currentUser&&!e)){if(this.currentUser&&e&&this.currentUser.uid===e.uid){this._currentUser._assign(e),await this.currentUser.getIdToken();return}await this._updateCurrentUser(e,!0)}}async initializeCurrentUserFromIdToken(e){try{let t=await qn(this,{idToken:e}),r=await De._fromGetAccountInfoResponse(this,t,e);await this.directlySetCurrentUser(r)}catch(t){console.warn("FirebaseServerApp could not login user with provided authIdToken: ",t),await this.directlySetCurrentUser(null)}}async initializeCurrentUser(e){var s;if($(this.app)){let o=this.app.settings.authIdToken;return o?new Promise(a=>{setTimeout(()=>this.initializeCurrentUserFromIdToken(o).then(a,a))}):this.directlySetCurrentUser(null)}let t=await this.assertedPersistence.getCurrentUser(),r=t,i=!1;if(e&&this.config.authDomain){await this.getOrInitRedirectPersistenceManager();let o=(s=this.redirectUser)==null?void 0:s._redirectEventId,a=r==null?void 0:r._redirectEventId,c=await this.tryRedirectSignIn(e);(!o||o===a)&&(c!=null&&c.user)&&(r=c.user,i=!0)}if(!r)return this.directlySetCurrentUser(null);if(!r._redirectEventId){if(i)try{await this.beforeStateQueue.runMiddleware(r)}catch(o){r=t,this._popupRedirectResolver._overrideRedirectResult(this,()=>Promise.reject(o))}return r?this.reloadAndSetCurrentUserOrClear(r):this.directlySetCurrentUser(null)}return b(this._popupRedirectResolver,this,"argument-error"),await this.getOrInitRedirectPersistenceManager(),this.redirectUser&&this.redirectUser._redirectEventId===r._redirectEventId?this.directlySetCurrentUser(r):this.reloadAndSetCurrentUserOrClear(r)}async tryRedirectSignIn(e){let t=null;try{t=await this._popupRedirectResolver._completeRedirectFn(this,e,!0)}catch{await this._setRedirectUser(null)}return t}async reloadAndSetCurrentUserOrClear(e){try{await Bn(e)}catch(t){let r=t==null?void 0:t.code;if(r!=="auth/network-request-failed"&&r!=="auth/too-many-requests"&&!(r!=null&&r.startsWith("auth/quota-exceeded")))return this.directlySetCurrentUser(null)}return this.directlySetCurrentUser(e)}useDeviceLanguage(){this.languageCode=ol()}async _delete(){this._deleted=!0}async updateCurrentUser(e){if($(this.app))return Promise.reject(Ee(this));let t=e?P(e):null;return t&&b(t.auth.config.apiKey===this.config.apiKey,this,"invalid-user-token"),this._updateCurrentUser(t&&t._clone(this))}async _updateCurrentUser(e,t=!1){if(!this._deleted)return e&&b(this.tenantId===e.tenantId,this,"tenant-id-mismatch"),t||await this.beforeStateQueue.runMiddleware(e),this.queue(async()=>{await this.directlySetCurrentUser(e),this.notifyAuthListeners()})}async signOut(){return $(this.app)?Promise.reject(Ee(this)):(await this.beforeStateQueue.runMiddleware(null),(this.redirectPersistenceManager||this._popupRedirectResolver)&&await this._setRedirectUser(null),this._updateCurrentUser(null,!0))}setPersistence(e){return $(this.app)?Promise.reject(Ee(this)):this.queue(async()=>{await this.assertedPersistence.setPersistence(Fe(e))})}_getRecaptchaConfig(){return this.tenantId==null?this._agentRecaptchaConfig:this._tenantRecaptchaConfigs[this.tenantId]}async validatePassword(e){this._getPasswordPolicyInternal()||await this._updatePasswordPolicy();let t=this._getPasswordPolicyInternal();return t.schemaVersion!==this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION?Promise.reject(this._errorFactory.create("unsupported-password-policy-schema-version",{})):t.validatePassword(e)}_getPasswordPolicyInternal(){return this.tenantId===null?this._projectPasswordPolicy:this._tenantPasswordPolicies[this.tenantId]}async _updatePasswordPolicy(){let e=await bl(this),t=new bi(e);this.tenantId===null?this._projectPasswordPolicy=t:this._tenantPasswordPolicies[this.tenantId]=t}_getPersistenceType(){return this.assertedPersistence.persistence.type}_getPersistence(){return this.assertedPersistence.persistence}_updateErrorMap(e){this._errorFactory=new me("auth","Firebase",e())}onAuthStateChanged(e,t,r){return this.registerStateListener(this.authStateSubscription,e,t,r)}beforeAuthStateChanged(e,t){return this.beforeStateQueue.pushCallback(e,t)}onIdTokenChanged(e,t,r){return this.registerStateListener(this.idTokenSubscription,e,t,r)}authStateReady(){return new Promise((e,t)=>{if(this.currentUser)e();else{let r=this.onAuthStateChanged(()=>{r(),e()},t)}})}async revokeAccessToken(e){if(this.currentUser){let t=await this.currentUser.getIdToken(),r={providerId:"apple.com",tokenType:"ACCESS_TOKEN",token:e,idToken:t};this.tenantId!=null&&(r.tenantId=this.tenantId),await gl(this,r)}}toJSON(){var e;return{apiKey:this.config.apiKey,authDomain:this.config.authDomain,appName:this.name,currentUser:(e=this._currentUser)==null?void 0:e.toJSON()}}async _setRedirectUser(e,t){let r=await this.getOrInitRedirectPersistenceManager(t);return e===null?r.removeCurrentUser():r.setCurrentUser(e)}async getOrInitRedirectPersistenceManager(e){if(!this.redirectPersistenceManager){let t=e&&Fe(e)||this._popupRedirectResolver;b(t,this,"argument-error"),this.redirectPersistenceManager=await Bt.create(this,[Fe(t._redirectPersistence)],"redirectUser"),this.redirectUser=await this.redirectPersistenceManager.getCurrentUser()}return this.redirectPersistenceManager}async _redirectUserForId(e){var t,r;return this._isInitialized&&await this.queue(async()=>{}),((t=this._currentUser)==null?void 0:t._redirectEventId)===e?this._currentUser:((r=this.redirectUser)==null?void 0:r._redirectEventId)===e?this.redirectUser:null}async _persistUserIfCurrent(e){if(e===this.currentUser)return this.queue(async()=>this.directlySetCurrentUser(e))}_notifyListenersIfCurrent(e){e===this.currentUser&&this.notifyAuthListeners()}_key(){return`${this.config.authDomain}:${this.config.apiKey}:${this.name}`}_startProactiveRefresh(){this.isProactiveRefreshEnabled=!0,this.currentUser&&this._currentUser._startProactiveRefresh()}_stopProactiveRefresh(){this.isProactiveRefreshEnabled=!1,this.currentUser&&this._currentUser._stopProactiveRefresh()}get _currentUser(){return this.currentUser}notifyAuthListeners(){var t,r;if(!this._isInitialized)return;this.idTokenSubscription.next(this.currentUser);let e=(r=(t=this.currentUser)==null?void 0:t.uid)!=null?r:null;this.lastNotifiedUid!==e&&(this.lastNotifiedUid=e,this.authStateSubscription.next(this.currentUser))}registerStateListener(e,t,r,i){if(this._deleted)return()=>{};let s=typeof t=="function"?t:t.next.bind(t),o=!1,a=this._isInitialized?Promise.resolve():this._initializationPromise;if(b(a,this,"internal-error"),a.then(()=>{o||s(this.currentUser)}).catch(c=>{if(!o)if(typeof t!="function"&&t.error)t.error(c);else if(r)r(c);else throw c}),typeof t=="function"){let c=e.addObserver(t,r,i);return()=>{o=!0,c()}}else{let c=e.addObserver(t);return()=>{o=!0,c()}}}async directlySetCurrentUser(e){if(this.currentUser&&this.currentUser!==e&&this._currentUser._stopProactiveRefresh(),e&&this.isProactiveRefreshEnabled&&e._startProactiveRefresh(),this.currentUser=e,this.persistenceManager)try{e?await this.persistenceManager.setCurrentUser(e):await this.persistenceManager.removeCurrentUser()}catch(t){let r=(t==null?void 0:t.message)||String(t),i=xi(this,"internal-error",`An internal AuthError has occurred: ${r}`);throw i.customData={originalError:t},i}}queue(e){return this.operations=this.operations.then(e,e),this.operations}get assertedPersistence(){return b(this.persistenceManager,this,"internal-error"),this.persistenceManager}_logFramework(e){!e||this.frameworks.includes(e)||(this.frameworks.push(e),this.frameworks.sort(),this.clientVersion=ya(this.config.clientPlatform,this._getFrameworks()))}_getFrameworks(){return this.frameworks}async _getAdditionalHeaders(){var i;let e={"X-Client-Version":this.clientVersion};this.app.options.appId&&(e["X-Firebase-gmpid"]=this.app.options.appId);let t=await((i=this.heartbeatServiceProvider.getImmediate({optional:!0}))==null?void 0:i.getHeartbeatsHeader());t&&(e["X-Firebase-Client"]=t);let r=await this._getAppCheckToken();return r&&(e["X-Firebase-AppCheck"]=r),e}async _getAppCheckToken(){var t;if($(this.app)&&this.app.settings.appCheckToken)return this.app.settings.appCheckToken;let e=await((t=this.appCheckServiceProvider.getImmediate({optional:!0}))==null?void 0:t.getToken());return e!=null&&e.error&&Vn(`Error while retrieving App Check token: ${e.error}`),e==null?void 0:e.token}};function ve(n){return P(n)}var $n=class{constructor(e){this.auth=e,this.observer=null,this.addObserver=Co(t=>this.observer=t)}get next(){return b(this.observer,this.auth,"internal-error"),this.observer.next.bind(this.observer)}};var Fi={async loadJS(){throw new Error("Unable to load external scripts")},recaptchaV2Script:"",recaptchaEnterpriseScript:"",gapiScript:""};function Al(n){Fi=n}function Sl(n){return Fi.loadJS(n)}function Nl(){return Fi.recaptchaEnterpriseScript}function Rl(n){return`__${n}${Math.floor(Math.random()*1e6)}`}var Ai=class{constructor(){this.enterprise=new Si}ready(e){e()}execute(e,t){return Promise.resolve("token")}render(e,t){return""}},Si=class{ready(e){e()}execute(e,t){return Promise.resolve("token")}render(e,t){return""}};var Pl="recaptcha-enterprise",jt="NO_RECAPTCHA",Qo="onFirebaseAuthREInstanceReady",Ht=class n{constructor(e){this.type=Pl,this.auth=ve(e)}async verify(e="verify",t=!1){async function r(s){if(!t){if(s.tenantId==null&&s._agentRecaptchaConfig!=null)return s._agentRecaptchaConfig.siteKey;if(s.tenantId!=null&&s._tenantRecaptchaConfigs[s.tenantId]!==void 0)return s._tenantRecaptchaConfigs[s.tenantId].siteKey}return new Promise(async(o,a)=>{da(s,{clientType:"CLIENT_TYPE_WEB",version:"RECAPTCHA_ENTERPRISE"}).then(c=>{if(c.recaptchaKey===void 0)a(new Error("recaptcha Enterprise site key undefined"));else{let l=new Fn(c);return s.tenantId==null?s._agentRecaptchaConfig=l:s._tenantRecaptchaConfigs[s.tenantId]=l,o(l.siteKey)}}).catch(c=>{a(c)})})}function i(s,o,a){let c=window.grecaptcha;Go(c)?c.enterprise.ready(()=>{c.enterprise.execute(s,{action:e}).then(l=>{o(l)}).catch(()=>{o(jt)})}):a(Error("No reCAPTCHA enterprise script loaded."))}return this.auth.settings.appVerificationDisabledForTesting?new Ai().execute("siteKey",{action:"verify"}):new Promise((s,o)=>{r(this.auth).then(async a=>{if(!t&&Go(window.grecaptcha)&&n.scriptInjectionDeferred)await n.scriptInjectionDeferred.promise,i(a,s,o);else{if(typeof window>"u"){o(new Error("RecaptchaVerifier is only supported in browser"));return}let c=Nl();c.length!==0&&(c+=a+`&onload=${Qo}`),n.scriptInjectionDeferred=new it,window[Qo]=()=>{var l;(l=n.scriptInjectionDeferred)==null||l.resolve()},Sl(c).then(()=>{var l;return(l=n.scriptInjectionDeferred)==null?void 0:l.promise}).then(()=>{i(a,s,o)}).catch(l=>{o(l)})}}).catch(a=>{o(a)})})}};Ht.scriptInjectionDeferred=null;async function Mt(n,e,t,r=!1,i=!1){let s=new Ht(n),o;if(i)o=jt;else try{o=await s.verify(t)}catch{o=await s.verify(t,!0)}let a={...e};if(t==="mfaSmsEnrollment"||t==="mfaSmsSignIn"){if("phoneEnrollmentInfo"in a){let c=a.phoneEnrollmentInfo.phoneNumber,l=a.phoneEnrollmentInfo.recaptchaToken;Object.assign(a,{phoneEnrollmentInfo:{phoneNumber:c,recaptchaToken:l,captchaResponse:o,clientType:"CLIENT_TYPE_WEB",recaptchaVersion:"RECAPTCHA_ENTERPRISE"}})}else if("phoneSignInInfo"in a){let c=a.phoneSignInInfo.recaptchaToken;Object.assign(a,{phoneSignInInfo:{recaptchaToken:c,captchaResponse:o,clientType:"CLIENT_TYPE_WEB",recaptchaVersion:"RECAPTCHA_ENTERPRISE"}})}return a}return r?Object.assign(a,{captchaResp:o}):Object.assign(a,{captchaResponse:o}),Object.assign(a,{clientType:"CLIENT_TYPE_WEB"}),Object.assign(a,{recaptchaVersion:"RECAPTCHA_ENTERPRISE"}),a}async function qe(n,e,t,r,i){var s,o;if(i==="EMAIL_PASSWORD_PROVIDER")if((s=n._getRecaptchaConfig())!=null&&s.isProviderEnabled("EMAIL_PASSWORD_PROVIDER")){let a=await Mt(n,e,t,t==="getOobCode");return r(n,a)}else return r(n,e).catch(async a=>{if(a.code==="auth/missing-recaptcha-token"){console.log(`${t} is protected by reCAPTCHA Enterprise for this project. Automatically triggering the reCAPTCHA flow and restarting the flow.`);let c=await Mt(n,e,t,t==="getOobCode");return r(n,c)}else return Promise.reject(a)});else if(i==="PHONE_PROVIDER")if((o=n._getRecaptchaConfig())!=null&&o.isProviderEnabled("PHONE_PROVIDER")){let a=await Mt(n,e,t);return r(n,a).catch(async c=>{var l;if(((l=n._getRecaptchaConfig())==null?void 0:l.getProviderEnforcementState("PHONE_PROVIDER"))==="AUDIT"&&(c.code==="auth/missing-recaptcha-token"||c.code==="auth/invalid-app-credential")){console.log(`Failed to verify with reCAPTCHA Enterprise. Automatically triggering the reCAPTCHA v2 flow to complete the ${t} flow.`);let _=await Mt(n,e,t,!1,!0);return r(n,_)}return Promise.reject(c)})}else{let a=await Mt(n,e,t,!1,!0);return r(n,a)}else return Promise.reject(i+" provider is not supported.")}async function kl(n){let e=ve(n),t=await da(e,{clientType:"CLIENT_TYPE_WEB",version:"RECAPTCHA_ENTERPRISE"}),r=new Fn(t);e.tenantId==null?e._agentRecaptchaConfig=r:e._tenantRecaptchaConfigs[e.tenantId]=r,r.isAnyProviderEnabled()&&new Ht(e).verify()}function qi(n,e){let t=at(n,"auth");if(t.isInitialized()){let i=t.getImmediate(),s=t.getOptions();if(ge(s,e!=null?e:{}))return i;we(i,"already-initialized")}return t.initialize({options:e})}function Cl(n,e){let t=(e==null?void 0:e.persistence)||[],r=(Array.isArray(t)?t:[t]).map(Fe);e!=null&&e.errorMap&&n._updateErrorMap(e.errorMap),n._initializeWithPersistence(r,e==null?void 0:e.popupRedirectResolver)}var $e=class{constructor(e,t){this.providerId=e,this.signInMethod=t}toJSON(){return he("not implemented")}_getIdTokenResponse(e){return he("not implemented")}_linkToIdToken(e,t){return he("not implemented")}_getReauthenticationResolver(e){return he("not implemented")}};async function Dl(n,e){return q(n,"POST","/v1/accounts:signUp",e)}async function Ol(n,e){return be(n,"POST","/v1/accounts:signInWithPassword",V(n,e))}async function Ia(n,e){return q(n,"POST","/v1/accounts:sendOobCode",V(n,e))}async function Vl(n,e){return Ia(n,e)}async function Ll(n,e){return Ia(n,e)}async function xl(n,e){return be(n,"POST","/v1/accounts:signInWithEmailLink",V(n,e))}async function Ml(n,e){return be(n,"POST","/v1/accounts:signInWithEmailLink",V(n,e))}var zt=class n extends $e{constructor(e,t,r,i=null){super("password",r),this._email=e,this._password=t,this._tenantId=i}static _fromEmailAndPassword(e,t){return new n(e,t,"password")}static _fromEmailAndCode(e,t,r=null){return new n(e,t,"emailLink",r)}toJSON(){return{email:this._email,password:this._password,signInMethod:this.signInMethod,tenantId:this._tenantId}}static fromJSON(e){let t=typeof e=="string"?JSON.parse(e):e;if(t!=null&&t.email&&(t!=null&&t.password)){if(t.signInMethod==="password")return this._fromEmailAndPassword(t.email,t.password);if(t.signInMethod==="emailLink")return this._fromEmailAndCode(t.email,t.password,t.tenantId)}return null}async _getIdTokenResponse(e){switch(this.signInMethod){case"password":let t={returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return qe(e,t,"signInWithPassword",Ol,"EMAIL_PASSWORD_PROVIDER");case"emailLink":return xl(e,{email:this._email,oobCode:this._password});default:we(e,"internal-error")}}async _linkToIdToken(e,t){switch(this.signInMethod){case"password":let r={idToken:t,returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return qe(e,r,"signUpPassword",Dl,"EMAIL_PASSWORD_PROVIDER");case"emailLink":return Ml(e,{idToken:t,email:this._email,oobCode:this._password});default:we(e,"internal-error")}}_getReauthenticationResolver(e){return this._getIdTokenResponse(e)}};async function lt(n,e){return be(n,"POST","/v1/accounts:signInWithIdp",V(n,e))}var Ul="http://localhost",We=class n extends $e{constructor(){super(...arguments),this.pendingToken=null}static _fromParams(e){let t=new n(e.providerId,e.signInMethod);return e.idToken||e.accessToken?(e.idToken&&(t.idToken=e.idToken),e.accessToken&&(t.accessToken=e.accessToken),e.nonce&&!e.pendingToken&&(t.nonce=e.nonce),e.pendingToken&&(t.pendingToken=e.pendingToken)):e.oauthToken&&e.oauthTokenSecret?(t.accessToken=e.oauthToken,t.secret=e.oauthTokenSecret):we("argument-error"),t}toJSON(){return{idToken:this.idToken,accessToken:this.accessToken,secret:this.secret,nonce:this.nonce,pendingToken:this.pendingToken,providerId:this.providerId,signInMethod:this.signInMethod}}static fromJSON(e){let t=typeof e=="string"?JSON.parse(e):e,{providerId:r,signInMethod:i,...s}=t;if(!r||!i)return null;let o=new n(r,i);return o.idToken=s.idToken||void 0,o.accessToken=s.accessToken||void 0,o.secret=s.secret,o.nonce=s.nonce,o.pendingToken=s.pendingToken||null,o}_getIdTokenResponse(e){let t=this.buildRequest();return lt(e,t)}_linkToIdToken(e,t){let r=this.buildRequest();return r.idToken=t,lt(e,r)}_getReauthenticationResolver(e){let t=this.buildRequest();return t.autoCreate=!1,lt(e,t)}buildRequest(){let e={requestUri:Ul,returnSecureToken:!0};if(this.pendingToken)e.pendingToken=this.pendingToken;else{let t={};this.idToken&&(t.id_token=this.idToken),this.accessToken&&(t.access_token=this.accessToken),this.secret&&(t.oauth_token_secret=this.secret),t.providerId=this.providerId,this.nonce&&!this.pendingToken&&(t.nonce=this.nonce),e.postBody=Pn(t)}return e}};async function Xo(n,e){return q(n,"POST","/v1/accounts:sendVerificationCode",V(n,e))}async function Fl(n,e){return be(n,"POST","/v1/accounts:signInWithPhoneNumber",V(n,e))}async function ql(n,e){let t=await be(n,"POST","/v1/accounts:signInWithPhoneNumber",V(n,e));if(t.temporaryProof)throw Ut(n,"account-exists-with-different-credential",t);return t}var Bl={USER_NOT_FOUND:"user-not-found"};async function jl(n,e){let t={...e,operation:"REAUTH"};return be(n,"POST","/v1/accounts:signInWithPhoneNumber",V(n,t),Bl)}var Gt=class n extends $e{constructor(e){super("phone","phone"),this.params=e}static _fromVerification(e,t){return new n({verificationId:e,verificationCode:t})}static _fromTokenResponse(e,t){return new n({phoneNumber:e,temporaryProof:t})}_getIdTokenResponse(e){return Fl(e,this._makeVerificationRequest())}_linkToIdToken(e,t){return ql(e,{idToken:t,...this._makeVerificationRequest()})}_getReauthenticationResolver(e){return jl(e,this._makeVerificationRequest())}_makeVerificationRequest(){let{temporaryProof:e,phoneNumber:t,verificationId:r,verificationCode:i}=this.params;return e&&t?{temporaryProof:e,phoneNumber:t}:{sessionInfo:r,code:i}}toJSON(){let e={providerId:this.providerId};return this.params.phoneNumber&&(e.phoneNumber=this.params.phoneNumber),this.params.temporaryProof&&(e.temporaryProof=this.params.temporaryProof),this.params.verificationCode&&(e.verificationCode=this.params.verificationCode),this.params.verificationId&&(e.verificationId=this.params.verificationId),e}static fromJSON(e){typeof e=="string"&&(e=JSON.parse(e));let{verificationId:t,verificationCode:r,phoneNumber:i,temporaryProof:s}=e;return!r&&!t&&!i&&!s?null:new n({verificationId:t,verificationCode:r,phoneNumber:i,temporaryProof:s})}};function $l(n){switch(n){case"recoverEmail":return"RECOVER_EMAIL";case"resetPassword":return"PASSWORD_RESET";case"signIn":return"EMAIL_SIGNIN";case"verifyEmail":return"VERIFY_EMAIL";case"verifyAndChangeEmail":return"VERIFY_AND_CHANGE_EMAIL";case"revertSecondFactorAddition":return"REVERT_SECOND_FACTOR_ADDITION";default:return null}}function Wl(n){let e=st(ot(n)).link,t=e?st(ot(e)).deep_link_id:null,r=st(ot(n)).deep_link_id;return(r?st(ot(r)).link:null)||r||t||e||n}var Wn=class n{constructor(e){var o,a,c,l,_,y;let t=st(ot(e)),r=(o=t.apiKey)!=null?o:null,i=(a=t.oobCode)!=null?a:null,s=$l((c=t.mode)!=null?c:null);b(r&&i&&s,"argument-error"),this.apiKey=r,this.operation=s,this.code=i,this.continueUrl=(l=t.continueUrl)!=null?l:null,this.languageCode=(_=t.lang)!=null?_:null,this.tenantId=(y=t.tenantId)!=null?y:null}static parseLink(e){let t=Wl(e);try{return new n(t)}catch{return null}}};var Te=class n{constructor(){this.providerId=n.PROVIDER_ID}static credential(e,t){return zt._fromEmailAndPassword(e,t)}static credentialWithLink(e,t){let r=Wn.parseLink(t);return b(r,"argument-error"),zt._fromEmailAndCode(e,r.code,r.tenantId)}};Te.PROVIDER_ID="password";Te.EMAIL_PASSWORD_SIGN_IN_METHOD="password";Te.EMAIL_LINK_SIGN_IN_METHOD="emailLink";var Ni=class{constructor(e){this.providerId=e,this.defaultLanguageCode=null,this.customParameters={}}setDefaultLanguage(e){this.defaultLanguageCode=e}setCustomParameters(e){return this.customParameters=e,this}getCustomParameters(){return this.customParameters}};var dt=class extends Ni{constructor(){super(...arguments),this.scopes=[]}addScope(e){return this.scopes.includes(e)||this.scopes.push(e),this}getScopes(){return[...this.scopes]}};var Kt=class n extends dt{constructor(){super("facebook.com")}static credential(e){return We._fromParams({providerId:n.PROVIDER_ID,signInMethod:n.FACEBOOK_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return n.credentialFromTaggedObject(e)}static credentialFromError(e){return n.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return n.credential(e.oauthAccessToken)}catch{return null}}};Kt.FACEBOOK_SIGN_IN_METHOD="facebook.com";Kt.PROVIDER_ID="facebook.com";var He=class n extends dt{constructor(){super("google.com"),this.addScope("profile")}static credential(e,t){return We._fromParams({providerId:n.PROVIDER_ID,signInMethod:n.GOOGLE_SIGN_IN_METHOD,idToken:e,accessToken:t})}static credentialFromResult(e){return n.credentialFromTaggedObject(e)}static credentialFromError(e){return n.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;let{oauthIdToken:t,oauthAccessToken:r}=e;if(!t&&!r)return null;try{return n.credential(t,r)}catch{return null}}};He.GOOGLE_SIGN_IN_METHOD="google.com";He.PROVIDER_ID="google.com";var Jt=class n extends dt{constructor(){super("github.com")}static credential(e){return We._fromParams({providerId:n.PROVIDER_ID,signInMethod:n.GITHUB_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return n.credentialFromTaggedObject(e)}static credentialFromError(e){return n.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return n.credential(e.oauthAccessToken)}catch{return null}}};Jt.GITHUB_SIGN_IN_METHOD="github.com";Jt.PROVIDER_ID="github.com";var Yt=class n extends dt{constructor(){super("twitter.com")}static credential(e,t){return We._fromParams({providerId:n.PROVIDER_ID,signInMethod:n.TWITTER_SIGN_IN_METHOD,oauthToken:e,oauthTokenSecret:t})}static credentialFromResult(e){return n.credentialFromTaggedObject(e)}static credentialFromError(e){return n.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;let{oauthAccessToken:t,oauthTokenSecret:r}=e;if(!t||!r)return null;try{return n.credential(t,r)}catch{return null}}};Yt.TWITTER_SIGN_IN_METHOD="twitter.com";Yt.PROVIDER_ID="twitter.com";async function Hl(n,e){return be(n,"POST","/v1/accounts:signUp",V(n,e))}var ze=class n{constructor(e){this.user=e.user,this.providerId=e.providerId,this._tokenResponse=e._tokenResponse,this.operationType=e.operationType}static async _fromIdTokenResponse(e,t,r,i=!1){let s=await De._fromIdTokenResponse(e,r,i),o=Zo(r);return new n({user:s,providerId:o,_tokenResponse:r,operationType:t})}static async _forOperation(e,t,r){await e._updateTokensIfNecessary(r,!0);let i=Zo(r);return new n({user:e,providerId:i,_tokenResponse:r,operationType:t})}};function Zo(n){return n.providerId?n.providerId:"phoneNumber"in n?"phone":null}var Ri=class n extends G{constructor(e,t,r,i){var s;super(t.code,t.message),this.operationType=r,this.user=i,Object.setPrototypeOf(this,n.prototype),this.customData={appName:e.name,tenantId:(s=e.tenantId)!=null?s:void 0,_serverResponse:t.customData._serverResponse,operationType:r}}static _fromErrorAndOperation(e,t,r,i){return new n(e,t,r,i)}};function Ea(n,e,t,r){return(e==="reauthenticate"?t._getReauthenticationResolver(n):t._getIdTokenResponse(n)).catch(s=>{throw s.code==="auth/multi-factor-auth-required"?Ri._fromErrorAndOperation(n,s,e,r):s})}async function zl(n,e,t=!1){let r=await ht(n,e._linkToIdToken(n.auth,await n.getIdToken()),t);return ze._forOperation(n,"link",r)}async function wa(n,e,t=!1){let{auth:r}=n;if($(r.app))return Promise.reject(Ee(r));let i="reauthenticate";try{let s=await ht(n,Ea(r,i,e,n),t);b(s.idToken,r,"internal-error");let o=Ui(s.idToken);b(o,r,"internal-error");let{sub:a}=o;return b(n.uid===a,r,"user-mismatch"),ze._forOperation(n,i,s)}catch(s){throw(s==null?void 0:s.code)==="auth/user-not-found"&&we(r,"user-mismatch"),s}}async function Ta(n,e,t=!1){if($(n.app))return Promise.reject(Ee(n));let r="signIn",i=await Ea(n,r,e),s=await ze._fromIdTokenResponse(n,r,i);return t||await n._updateCurrentUser(s.user),s}async function ir(n,e){return Ta(ve(n),e)}async function Bi(n,e){return wa(P(n),e)}async function Gl(n,e){return be(n,"POST","/v1/accounts:signInWithCustomToken",V(n,e))}async function ji(n,e){if($(n.app))return Promise.reject(Ee(n));let t=ve(n),r=await Gl(t,{token:e,returnSecureToken:!0}),i=await ze._fromIdTokenResponse(t,"signIn",r);return await t._updateCurrentUser(i.user),i}function ba(n,e,t){var r;b(((r=t.url)==null?void 0:r.length)>0,n,"invalid-continue-uri"),b(typeof t.dynamicLinkDomain>"u"||t.dynamicLinkDomain.length>0,n,"invalid-dynamic-link-domain"),b(typeof t.linkDomain>"u"||t.linkDomain.length>0,n,"invalid-hosting-link-domain"),e.continueUrl=t.url,e.dynamicLinkDomain=t.dynamicLinkDomain,e.linkDomain=t.linkDomain,e.canHandleCodeInApp=t.handleCodeInApp,t.iOS&&(b(t.iOS.bundleId.length>0,n,"missing-ios-bundle-id"),e.iOSBundleId=t.iOS.bundleId),t.android&&(b(t.android.packageName.length>0,n,"missing-android-pkg-name"),e.androidInstallApp=t.android.installApp,e.androidMinimumVersionCode=t.android.minimumVersion,e.androidPackageName=t.android.packageName)}async function va(n){let e=ve(n);e._getPasswordPolicyInternal()&&await e._updatePasswordPolicy()}async function $i(n,e,t){let r=ve(n),i={requestType:"PASSWORD_RESET",email:e,clientType:"CLIENT_TYPE_WEB"};t&&ba(r,i,t),await qe(r,i,"getOobCode",Ll,"EMAIL_PASSWORD_PROVIDER")}async function Wi(n,e,t){if($(n.app))return Promise.reject(Ee(n));let r=ve(n),o=await qe(r,{returnSecureToken:!0,email:e,password:t,clientType:"CLIENT_TYPE_WEB"},"signUpPassword",Hl,"EMAIL_PASSWORD_PROVIDER").catch(c=>{throw c.code==="auth/password-does-not-meet-requirements"&&va(n),c}),a=await ze._fromIdTokenResponse(r,"signIn",o);return await r._updateCurrentUser(a.user),a}function Hi(n,e,t){return $(n.app)?Promise.reject(Ee(n)):ir(P(n),Te.credential(e,t)).catch(async r=>{throw r.code==="auth/password-does-not-meet-requirements"&&va(n),r})}async function zi(n,e){let t=P(n),i={requestType:"VERIFY_EMAIL",idToken:await n.getIdToken()};e&&ba(t.auth,i,e);let{email:s}=await Vl(t.auth,i);s!==n.email&&await n.reload()}async function Kl(n,e){return q(n,"POST","/v1/accounts:update",e)}async function Gi(n,e){let{displayName:t,photoURL:r}=e;if(t===void 0&&r===void 0)return;let i=P(n),o={idToken:await i.getIdToken(),displayName:t,photoUrl:r,returnSecureToken:!0},a=await ht(i,Kl(i.auth,o));i.displayName=a.displayName||null,i.photoURL=a.photoUrl||null;let c=i.providerData.find(({providerId:l})=>l==="password");c&&(c.displayName=i.displayName,c.photoURL=i.photoURL),await i._updateTokensIfNecessary(a)}function Ki(n,e,t,r){return P(n).onAuthStateChanged(e,t,r)}function Ji(n){return P(n).signOut()}async function Yi(n){return P(n).delete()}function ea(n,e){return q(n,"POST","/v2/accounts/mfaEnrollment:start",V(n,e))}function Jl(n,e){return q(n,"POST","/v2/accounts/mfaEnrollment:finalize",V(n,e))}function Yl(n,e){return q(n,"POST","/v2/accounts/mfaEnrollment:start",V(n,e))}function Ql(n,e){return q(n,"POST","/v2/accounts/mfaEnrollment:finalize",V(n,e))}var Hn="__sak";var zn=class{constructor(e,t){this.storageRetriever=e,this.type=t}_isAvailable(){try{return this.storage?(this.storage.setItem(Hn,"1"),this.storage.removeItem(Hn),Promise.resolve(!0)):Promise.resolve(!1)}catch{return Promise.resolve(!1)}}_set(e,t){return this.storage.setItem(e,JSON.stringify(t)),Promise.resolve()}_get(e){let t=this.storage.getItem(e);return Promise.resolve(t?JSON.parse(t):null)}_remove(e){return this.storage.removeItem(e),Promise.resolve()}get storage(){return this.storageRetriever()}};var Xl=1e3,Zl=10,Gn=class extends zn{constructor(){super(()=>window.localStorage,"LOCAL"),this.boundEventHandler=(e,t)=>this.onStorageEvent(e,t),this.listeners={},this.localCache={},this.pollTimer=null,this.fallbackToPolling=Tl(),this._shouldAllowMigration=!0}forAllChangedKeys(e){for(let t of Object.keys(this.listeners)){let r=this.storage.getItem(t),i=this.localCache[t];r!==i&&e(t,i,r)}}onStorageEvent(e,t=!1){if(!e.key){this.forAllChangedKeys((o,a,c)=>{this.notifyListeners(o,c)});return}let r=e.key;t?this.detachListener():this.stopPolling();let i=()=>{let o=this.storage.getItem(r);!t&&this.localCache[r]===o||this.notifyListeners(r,o)},s=this.storage.getItem(r);wl()&&s!==e.newValue&&e.newValue!==e.oldValue?setTimeout(i,Zl):i()}notifyListeners(e,t){this.localCache[e]=t;let r=this.listeners[e];if(r)for(let i of Array.from(r))i(t&&JSON.parse(t))}startPolling(){this.stopPolling(),this.pollTimer=setInterval(()=>{this.forAllChangedKeys((e,t,r)=>{this.onStorageEvent(new StorageEvent("storage",{key:e,oldValue:t,newValue:r}),!0)})},Xl)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}attachListener(){window.addEventListener("storage",this.boundEventHandler)}detachListener(){window.removeEventListener("storage",this.boundEventHandler)}_addListener(e,t){Object.keys(this.listeners).length===0&&(this.fallbackToPolling?this.startPolling():this.attachListener()),this.listeners[e]||(this.listeners[e]=new Set,this.localCache[e]=this.storage.getItem(e)),this.listeners[e].add(t)}_removeListener(e,t){this.listeners[e]&&(this.listeners[e].delete(t),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&(this.detachListener(),this.stopPolling())}async _set(e,t){await super._set(e,t),this.localCache[e]=JSON.stringify(t)}async _get(e){let t=await super._get(e);return this.localCache[e]=JSON.stringify(t),t}async _remove(e){await super._remove(e),delete this.localCache[e]}};Gn.type="LOCAL";var Qi=Gn;var eh=1e3;function _i(n){var r,i;let e=n.replace(/[\\^$.*+?()[\]{}|]/g,"\\$&"),t=RegExp(`${e}=([^;]+)`);return(i=(r=document.cookie.match(t))==null?void 0:r[1])!=null?i:null}function yi(n){return`${window.location.protocol==="http:"?"__dev_":"__HOST-"}FIREBASE_${n.split(":")[3]}`}var Pi=class{constructor(){this.type="COOKIE",this.listenerUnsubscribes=new Map}_getFinalTarget(e){if(typeof window===void 0)return e;let t=new URL(`${window.location.origin}/__cookies__`);return t.searchParams.set("finalTarget",e),t}async _isAvailable(){var e;return typeof isSecureContext=="boolean"&&!isSecureContext||typeof navigator>"u"||typeof document>"u"?!1:(e=navigator.cookieEnabled)!=null?e:!0}async _set(e,t){}async _get(e){if(!this._isAvailable())return null;let t=yi(e);if(window.cookieStore){let r=await window.cookieStore.get(t);return r==null?void 0:r.value}return _i(t)}async _remove(e){if(!this._isAvailable()||!await this._get(e))return;let r=yi(e);document.cookie=`${r}=;Max-Age=34560000;Partitioned;Secure;SameSite=Strict;Path=/;Priority=High`,await fetch("/__cookies__",{method:"DELETE"}).catch(()=>{})}_addListener(e,t){if(!this._isAvailable())return;let r=yi(e);if(window.cookieStore){let a=l=>{let _=l.changed.find(I=>I.name===r);_&&t(_.value),l.deleted.find(I=>I.name===r)&&t(null)},c=()=>window.cookieStore.removeEventListener("change",a);return this.listenerUnsubscribes.set(t,c),window.cookieStore.addEventListener("change",a)}let i=_i(r),s=setInterval(()=>{let a=_i(r);a!==i&&(t(a),i=a)},eh),o=()=>clearInterval(s);this.listenerUnsubscribes.set(t,o)}_removeListener(e,t){let r=this.listenerUnsubscribes.get(t);r&&(r(),this.listenerUnsubscribes.delete(t))}};Pi.type="COOKIE";var ki=class extends zn{constructor(){super(()=>window.sessionStorage,"SESSION")}_addListener(e,t){}_removeListener(e,t){}};ki.type="SESSION";function th(n){return Promise.all(n.map(async e=>{try{return{fulfilled:!0,value:await e}}catch(t){return{fulfilled:!1,reason:t}}}))}var Kn=class n{constructor(e){this.eventTarget=e,this.handlersMap={},this.boundEventHandler=this.handleEvent.bind(this)}static _getInstance(e){let t=this.receivers.find(i=>i.isListeningto(e));if(t)return t;let r=new n(e);return this.receivers.push(r),r}isListeningto(e){return this.eventTarget===e}async handleEvent(e){let t=e,{eventId:r,eventType:i,data:s}=t.data,o=this.handlersMap[i];if(!(o!=null&&o.size))return;t.ports[0].postMessage({status:"ack",eventId:r,eventType:i});let a=Array.from(o).map(async l=>l(t.origin,s)),c=await th(a);t.ports[0].postMessage({status:"done",eventId:r,eventType:i,response:c})}_subscribe(e,t){Object.keys(this.handlersMap).length===0&&this.eventTarget.addEventListener("message",this.boundEventHandler),this.handlersMap[e]||(this.handlersMap[e]=new Set),this.handlersMap[e].add(t)}_unsubscribe(e,t){this.handlersMap[e]&&t&&this.handlersMap[e].delete(t),(!t||this.handlersMap[e].size===0)&&delete this.handlersMap[e],Object.keys(this.handlersMap).length===0&&this.eventTarget.removeEventListener("message",this.boundEventHandler)}};Kn.receivers=[];function Aa(n="",e=10){let t="";for(let r=0;r<e;r++)t+=Math.floor(Math.random()*10);return n+t}var Ci=class{constructor(e){this.target=e,this.handlers=new Set}removeMessageHandler(e){e.messageChannel&&(e.messageChannel.port1.removeEventListener("message",e.onMessage),e.messageChannel.port1.close()),this.handlers.delete(e)}async _send(e,t,r=50){let i=typeof MessageChannel<"u"?new MessageChannel:null;if(!i)throw new Error("connection_unavailable");let s,o;return new Promise((a,c)=>{let l=Aa("",20);i.port1.start();let _=setTimeout(()=>{c(new Error("unsupported_event"))},r);o={messageChannel:i,onMessage(y){let I=y;if(I.data.eventId===l)switch(I.data.status){case"ack":clearTimeout(_),s=setTimeout(()=>{c(new Error("timeout"))},3e3);break;case"done":clearTimeout(s),a(I.data.response);break;default:clearTimeout(_),clearTimeout(s),c(new Error("invalid_response"));break}}},this.handlers.add(o),i.port1.addEventListener("message",o.onMessage),this.target.postMessage({eventType:e,eventId:l,data:t},[i.port2])}).finally(()=>{o&&this.removeMessageHandler(o)})}};function ta(){return window}function Sa(){return typeof ta().WorkerGlobalScope<"u"&&typeof ta().importScripts=="function"}async function nh(){if(!(navigator!=null&&navigator.serviceWorker))return null;try{return(await navigator.serviceWorker.ready).active}catch{return null}}function rh(){var n;return((n=navigator==null?void 0:navigator.serviceWorker)==null?void 0:n.controller)||null}function ih(){return Sa()?self:null}var Na="firebaseLocalStorageDb",sh=1,Jn="firebaseLocalStorage",Ra="fbase_key",Ge=class{constructor(e){this.request=e}toPromise(){return new Promise((e,t)=>{this.request.addEventListener("success",()=>{e(this.request.result)}),this.request.addEventListener("error",()=>{t(this.request.error)})})}};function sr(n,e){return n.transaction([Jn],e?"readwrite":"readonly").objectStore(Jn)}function oh(){let n=indexedDB.deleteDatabase(Na);return new Ge(n).toPromise()}function Pa(){let n=indexedDB.open(Na,sh);return new Promise((e,t)=>{n.addEventListener("error",()=>{t(n.error)}),n.addEventListener("upgradeneeded",()=>{let r=n.result;try{r.createObjectStore(Jn,{keyPath:Ra})}catch(i){t(i)}}),n.addEventListener("success",async()=>{let r=n.result;r.objectStoreNames.contains(Jn)?e(r):(r.close(),await oh(),e(await Pa()))})})}async function na(n,e,t){let r=sr(n,!0).put({[Ra]:e,value:t});return new Ge(r).toPromise()}async function ah(n,e){let t=sr(n,!1).get(e),r=await new Ge(t).toPromise();return r===void 0?null:r.value}function ra(n,e){let t=sr(n,!0).delete(e);return new Ge(t).toPromise()}var ch=800,uh=3,Yn=class{registerLifecycleListeners(){typeof window<"u"&&typeof window.addEventListener=="function"&&(window.addEventListener("pagehide",this.onPageHide),window.addEventListener("pageshow",this.onPageShow))}unregisterLifecycleListeners(){typeof window<"u"&&typeof window.removeEventListener=="function"&&(window.removeEventListener("pagehide",this.onPageHide),window.removeEventListener("pageshow",this.onPageShow))}constructor(){this.type="LOCAL",this.dbPromise=null,this._shouldAllowMigration=!0,this.listeners={},this.localCache={},this.pollTimer=null,this.isClosing=!1,this.pendingWrites=0,this.receiver=null,this.sender=null,this.serviceWorkerReceiverAvailable=!1,this.activeServiceWorker=null,this.onPageHide=()=>{this.isClosing=!0,this.stopPolling(),this.dbPromise&&(this.dbPromise.then(e=>e.close()).catch(()=>{}),this.dbPromise=null)},this.onPageShow=()=>{this.isClosing&&(this.isClosing=!1,Object.keys(this.listeners).length>0&&this.startPolling())},this._workerInitializationPromise=this.initializeServiceWorkerMessaging().then(()=>{},()=>{})}async _openDb(){return this.dbPromise?this.dbPromise:(this.dbPromise=Pa(),this.dbPromise.catch(()=>{this.dbPromise=null}),this.dbPromise)}async _withRetries(e){let t=0;for(;;)try{let r=await this._openDb();return await e(r)}catch(r){if(t++>uh)throw r;if(this.dbPromise){let i=this.dbPromise;this.dbPromise=null;try{(await i).close()}catch{}}}}async initializeServiceWorkerMessaging(){return Sa()?this.initializeReceiver():this.initializeSender()}async initializeReceiver(){this.receiver=Kn._getInstance(ih()),this.receiver._subscribe("keyChanged",async(e,t)=>({keyProcessed:(await this._poll()).includes(t.key)})),this.receiver._subscribe("ping",async(e,t)=>["keyChanged"])}async initializeSender(){var t,r;if(this.activeServiceWorker=await nh(),!this.activeServiceWorker)return;this.sender=new Ci(this.activeServiceWorker);let e=await this.sender._send("ping",{},800);e&&(t=e[0])!=null&&t.fulfilled&&(r=e[0])!=null&&r.value.includes("keyChanged")&&(this.serviceWorkerReceiverAvailable=!0)}async notifyServiceWorker(e){if(!(!this.sender||!this.activeServiceWorker||rh()!==this.activeServiceWorker))try{await this.sender._send("keyChanged",{key:e},this.serviceWorkerReceiverAvailable?800:50)}catch{}}async _isAvailable(){try{return indexedDB?(await this._withRetries(async e=>{await na(e,Hn,"1"),await ra(e,Hn)}),!0):!1}catch{}return!1}async _withPendingWrite(e){this.pendingWrites++;try{await e()}finally{this.pendingWrites--}}async _set(e,t){return this._withPendingWrite(async()=>(await this._withRetries(r=>na(r,e,t)),this.localCache[e]=t,this.notifyServiceWorker(e)))}async _get(e){let t=await this._withRetries(r=>ah(r,e));return this.localCache[e]=t,t}async _remove(e){return this._withPendingWrite(async()=>(await this._withRetries(t=>ra(t,e)),delete this.localCache[e],this.notifyServiceWorker(e)))}async _poll(){if(this.isClosing)return[];try{let e=await this._withRetries(i=>{let s=sr(i,!1).getAll();return new Ge(s).toPromise()});if(this.isClosing)return[];if(!e)return[];if(this.pendingWrites!==0)return[];let t=[],r=new Set;if(e.length!==0)for(let{fbase_key:i,value:s}of e)r.add(i),JSON.stringify(this.localCache[i])!==JSON.stringify(s)&&(this.notifyListeners(i,s),t.push(i));for(let i of Object.keys(this.localCache))this.localCache[i]&&!r.has(i)&&(this.notifyListeners(i,null),t.push(i));return t}catch(e){return this.isClosing||Vn(`Firebase Auth cross-tab polling failed with error: ${e}`),[]}}notifyListeners(e,t){this.localCache[e]=t;let r=this.listeners[e];if(r)for(let i of Array.from(r))i(t)}startPolling(){this.stopPolling(),this.pollTimer=setInterval(async()=>this._poll(),ch)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}_addListener(e,t){Object.keys(this.listeners).length===0&&(this.startPolling(),this.registerLifecycleListeners()),this.listeners[e]||(this.listeners[e]=new Set,this._get(e)),this.listeners[e].add(t)}_removeListener(e,t){this.listeners[e]&&(this.listeners[e].delete(t),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&(this.stopPolling(),this.unregisterLifecycleListeners())}};Yn.type="LOCAL";var Xi=Yn;function ia(n,e){return q(n,"POST","/v2/accounts/mfaSignIn:start",V(n,e))}function lh(n,e){return q(n,"POST","/v2/accounts/mfaSignIn:finalize",V(n,e))}function hh(n,e){return q(n,"POST","/v2/accounts/mfaSignIn:finalize",V(n,e))}var zd=Rl("rcb"),Gd=new je(3e4,6e4);var xn="recaptcha";async function dh(n,e,t){var r;if(!n._getRecaptchaConfig())try{await kl(n)}catch{console.log("Failed to initialize reCAPTCHA Enterprise config. Triggering the reCAPTCHA v2 verification.")}try{let i;if(typeof e=="string"?i={phoneNumber:e}:i=e,"session"in i){let s=i.session;if("phoneNumber"in i){b(s.type==="enroll",n,"internal-error");let o={idToken:s.credential,phoneEnrollmentInfo:{phoneNumber:i.phoneNumber,clientType:"CLIENT_TYPE_WEB"}};return(await qe(n,o,"mfaSmsEnrollment",async(_,y)=>{if(y.phoneEnrollmentInfo.captchaResponse===jt){b((t==null?void 0:t.type)===xn,_,"argument-error");let I=await Ii(_,y,t);return ea(_,I)}return ea(_,y)},"PHONE_PROVIDER").catch(_=>Promise.reject(_))).phoneSessionInfo.sessionInfo}else{b(s.type==="signin",n,"internal-error");let o=((r=i.multiFactorHint)==null?void 0:r.uid)||i.multiFactorUid;b(o,n,"missing-multi-factor-info");let a={mfaPendingCredential:s.credential,mfaEnrollmentId:o,phoneSignInInfo:{clientType:"CLIENT_TYPE_WEB"}};return(await qe(n,a,"mfaSmsSignIn",async(y,I)=>{if(I.phoneSignInInfo.captchaResponse===jt){b((t==null?void 0:t.type)===xn,y,"argument-error");let T=await Ii(y,I,t);return ia(y,T)}return ia(y,I)},"PHONE_PROVIDER").catch(y=>Promise.reject(y))).phoneResponseInfo.sessionInfo}}else{let s={phoneNumber:i.phoneNumber,clientType:"CLIENT_TYPE_WEB"};return(await qe(n,s,"sendVerificationCode",async(l,_)=>{if(_.captchaResponse===jt){b((t==null?void 0:t.type)===xn,l,"argument-error");let y=await Ii(l,_,t);return Xo(l,y)}return Xo(l,_)},"PHONE_PROVIDER").catch(l=>Promise.reject(l))).sessionInfo}}finally{t==null||t._reset()}}async function Ii(n,e,t){b(t.type===xn,n,"argument-error");let r=await t.verify();b(typeof r=="string",n,"argument-error");let i={...e};if("phoneEnrollmentInfo"in i){let s=i.phoneEnrollmentInfo.phoneNumber,o=i.phoneEnrollmentInfo.captchaResponse,a=i.phoneEnrollmentInfo.clientType,c=i.phoneEnrollmentInfo.recaptchaVersion;return Object.assign(i,{phoneEnrollmentInfo:{phoneNumber:s,recaptchaToken:r,captchaResponse:o,clientType:a,recaptchaVersion:c}}),i}else if("phoneSignInInfo"in i){let s=i.phoneSignInInfo.captchaResponse,o=i.phoneSignInInfo.clientType,a=i.phoneSignInInfo.recaptchaVersion;return Object.assign(i,{phoneSignInInfo:{recaptchaToken:r,captchaResponse:s,clientType:o,recaptchaVersion:a}}),i}else return Object.assign(i,{recaptchaToken:r}),i}var Qt=class n{constructor(e){this.providerId=n.PROVIDER_ID,this.auth=ve(e)}verifyPhoneNumber(e,t){return dh(this.auth,e,P(t))}static credential(e,t){return Gt._fromVerification(e,t)}static credentialFromResult(e){let t=e;return n.credentialFromTaggedObject(t)}static credentialFromError(e){return n.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;let{phoneNumber:t,temporaryProof:r}=e;return t&&r?Gt._fromTokenResponse(t,r):null}};Qt.PROVIDER_ID="phone";Qt.PHONE_SIGN_IN_METHOD="phone";var Xt=class extends $e{constructor(e){super("custom","custom"),this.params=e}_getIdTokenResponse(e){return lt(e,this._buildIdpRequest())}_linkToIdToken(e,t){return lt(e,this._buildIdpRequest(t))}_getReauthenticationResolver(e){return lt(e,this._buildIdpRequest())}_buildIdpRequest(e){let t={requestUri:this.params.requestUri,sessionId:this.params.sessionId,postBody:this.params.postBody,tenantId:this.params.tenantId,pendingToken:this.params.pendingToken,returnSecureToken:!0,returnIdpCredential:!0};return e&&(t.idToken=e),t}};function fh(n){return Ta(n.auth,new Xt(n),n.bypassAuthState)}function ph(n){let{auth:e,user:t}=n;return b(t,e,"internal-error"),wa(t,new Xt(n),n.bypassAuthState)}async function mh(n){let{auth:e,user:t}=n;return b(t,e,"internal-error"),zl(t,new Xt(n),n.bypassAuthState)}var Di=class{constructor(e,t,r,i,s=!1){this.auth=e,this.resolver=r,this.user=i,this.bypassAuthState=s,this.pendingPromise=null,this.eventManager=null,this.filter=Array.isArray(t)?t:[t]}execute(){return new Promise(async(e,t)=>{this.pendingPromise={resolve:e,reject:t};try{this.eventManager=await this.resolver._initialize(this.auth),await this.onExecution(),this.eventManager.registerConsumer(this)}catch(r){this.reject(r)}})}async onAuthEvent(e){let{urlResponse:t,sessionId:r,postBody:i,tenantId:s,error:o,type:a}=e;if(o){this.reject(o);return}let c={auth:this.auth,requestUri:t,sessionId:r,tenantId:s||void 0,postBody:i||void 0,user:this.user,bypassAuthState:this.bypassAuthState};try{this.resolve(await this.getIdpTask(a)(c))}catch(l){this.reject(l)}}onError(e){this.reject(e)}getIdpTask(e){switch(e){case"signInViaPopup":case"signInViaRedirect":return fh;case"linkViaPopup":case"linkViaRedirect":return mh;case"reauthViaPopup":case"reauthViaRedirect":return ph;default:we(this.auth,"internal-error")}}resolve(e){Be(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.resolve(e),this.unregisterAndCleanUp()}reject(e){Be(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.reject(e),this.unregisterAndCleanUp()}unregisterAndCleanUp(){this.eventManager&&this.eventManager.unregisterConsumer(this),this.pendingPromise=null,this.cleanUp()}};var gh=new je(2e3,1e4);var Oi=class n extends Di{constructor(e,t,r,i,s){super(e,t,i,s),this.provider=r,this.authWindow=null,this.pollId=null,n.currentPopupAction&&n.currentPopupAction.cancel(),n.currentPopupAction=this}async executeNotNull(){let e=await this.execute();return b(e,this.auth,"internal-error"),e}async onExecution(){Be(this.filter.length===1,"Popup operations only handle one event");let e=Aa();this.authWindow=await this.resolver._openPopup(this.auth,this.provider,this.filter[0],e),this.authWindow.associatedEvent=e,this.resolver._originValidation(this.auth).catch(t=>{this.reject(t)}),this.resolver._isIframeWebStorageSupported(this.auth,t=>{t||this.reject(ut(this.auth,"web-storage-unsupported"))}),this.pollUserCancellation()}get eventId(){var e;return((e=this.authWindow)==null?void 0:e.associatedEvent)||null}cancel(){this.reject(ut(this.auth,"cancelled-popup-request"))}cleanUp(){this.authWindow&&this.authWindow.close(),this.pollId&&window.clearTimeout(this.pollId),this.authWindow=null,this.pollId=null,n.currentPopupAction=null}pollUserCancellation(){let e=()=>{var t,r;if((r=(t=this.authWindow)==null?void 0:t.window)!=null&&r.closed){this.pollId=window.setTimeout(()=>{this.pollId=null,this.reject(ut(this.auth,"popup-closed-by-user"))},8e3);return}this.pollId=window.setTimeout(e,gh.get())};e()}};Oi.currentPopupAction=null;var Kd=10*60*1e3;var Jd=new je(3e4,6e4);var Yd=new je(5e3,15e3);var Qd=encodeURIComponent("fac");var Qn=class{constructor(e){this.factorId=e}_process(e,t,r){switch(t.type){case"enroll":return this._finalizeEnroll(e,t.credential,r);case"signin":return this._finalizeSignIn(e,t.credential);default:return he("unexpected MultiFactorSessionType")}}},Vi=class n extends Qn{constructor(e){super("phone"),this.credential=e}static _fromCredential(e){return new n(e)}_finalizeEnroll(e,t,r){return Jl(e,{idToken:t,displayName:r,phoneVerificationInfo:this.credential._makeVerificationRequest()})}_finalizeSignIn(e,t){return lh(e,{mfaPendingCredential:t,phoneVerificationInfo:this.credential._makeVerificationRequest()})}},Xn=class{constructor(){}static assertion(e){return Vi._fromCredential(e)}};Xn.FACTOR_ID="phone";var Zn=class{static assertionForEnrollment(e,t){return er._fromSecret(e,t)}static assertionForSignIn(e,t){return er._fromEnrollmentId(e,t)}static async generateSecret(e){var i;let t=e;b(typeof((i=t.user)==null?void 0:i.auth)<"u","internal-error");let r=await Yl(t.user.auth,{idToken:t.credential,totpEnrollmentInfo:{}});return tr._fromStartTotpMfaEnrollmentResponse(r,t.user.auth)}};Zn.FACTOR_ID="totp";var er=class n extends Qn{constructor(e,t,r){super("totp"),this.otp=e,this.enrollmentId=t,this.secret=r}static _fromSecret(e,t){return new n(t,void 0,e)}static _fromEnrollmentId(e,t){return new n(t,e)}async _finalizeEnroll(e,t,r){return b(typeof this.secret<"u",e,"argument-error"),Ql(e,{idToken:t,displayName:r,totpVerificationInfo:this.secret._makeTotpVerificationInfo(this.otp)})}async _finalizeSignIn(e,t){b(this.enrollmentId!==void 0&&this.otp!==void 0,e,"argument-error");let r={verificationCode:this.otp};return hh(e,{mfaPendingCredential:t,mfaEnrollmentId:this.enrollmentId,totpVerificationInfo:r})}},tr=class n{constructor(e,t,r,i,s,o,a){this.sessionInfo=o,this.auth=a,this.secretKey=e,this.hashingAlgorithm=t,this.codeLength=r,this.codeIntervalSeconds=i,this.enrollmentCompletionDeadline=s}static _fromStartTotpMfaEnrollmentResponse(e,t){return new n(e.totpSessionInfo.sharedSecretKey,e.totpSessionInfo.hashingAlgorithm,e.totpSessionInfo.verificationCodeLength,e.totpSessionInfo.periodSec,new Date(e.totpSessionInfo.finalizeEnrollmentTime).toUTCString(),e.totpSessionInfo.sessionInfo,t)}_makeTotpVerificationInfo(e){return{sessionInfo:this.sessionInfo,verificationCode:e}}generateQrCodeUrl(e,t){var i;let r=!1;return(On(e)||On(t))&&(r=!0),r&&(On(e)&&(e=((i=this.auth.currentUser)==null?void 0:i.email)||"unknownuser"),On(t)&&(t=this.auth.name)),`otpauth://totp/${t}:${e}?secret=${this.secretKey}&issuer=${t}&algorithm=${this.hashingAlgorithm}&digits=${this.codeLength}`}};function On(n){return typeof n>"u"||(n==null?void 0:n.length)===0}var sa="@firebase/auth",oa="1.13.7";var Li=class{constructor(e){this.auth=e,this.internalListeners=new Map}getUid(){var e;return this.assertAuthConfigured(),((e=this.auth.currentUser)==null?void 0:e.uid)||null}async getToken(e){return this.assertAuthConfigured(),await this.auth._initializationPromise,this.auth.currentUser?{accessToken:await this.auth.currentUser.getIdToken(e)}:null}addAuthTokenListener(e){if(this.assertAuthConfigured(),this.internalListeners.has(e))return;let t=this.auth.onIdTokenChanged(r=>{e((r==null?void 0:r.stsTokenManager.accessToken)||null)});this.internalListeners.set(e,t),this.updateProactiveRefresh()}removeAuthTokenListener(e){this.assertAuthConfigured();let t=this.internalListeners.get(e);t&&(this.internalListeners.delete(e),t(),this.updateProactiveRefresh())}assertAuthConfigured(){b(this.auth._initializationPromise,"dependent-sdk-initialized-before-auth")}updateProactiveRefresh(){this.internalListeners.size>0?this.auth._startProactiveRefresh():this.auth._stopProactiveRefresh()}};function _h(n){switch(n){case"Node":return"node";case"ReactNative":return"rn";case"Worker":return"webworker";case"Cordova":return"cordova";case"WebExtension":return"web-extension";default:return}}function yh(n){le(new Y("auth",(e,{options:t})=>{let r=e.getProvider("app").getImmediate(),i=e.getProvider("heartbeat"),s=e.getProvider("app-check-internal"),{apiKey:o,authDomain:a}=r.options;b(o&&!o.includes(":"),"invalid-api-key",{appName:r.name});let c={apiKey:o,authDomain:a,clientPlatform:n,apiHost:"identitytoolkit.googleapis.com",tokenApiHost:"securetoken.googleapis.com",apiScheme:"https",sdkClientVersion:ya(n)},l=new vi(r,i,s,c);return Cl(l,t),l},"PUBLIC").setInstantiationMode("EXPLICIT").setInstanceCreatedCallback((e,t,r)=>{e.getProvider("auth-internal").initialize()})),le(new Y("auth-internal",e=>{let t=ve(e.getProvider("auth").getImmediate());return(r=>new Li(r))(t)},"PRIVATE").setInstantiationMode("EXPLICIT")),Q(sa,oa,_h(n)),Q(sa,oa,"esm2020")}var Ih=5*60,Xd=To("authIdTokenMaxAge")||Ih;function Eh(){var n,e;return(e=(n=document.getElementsByTagName("head"))==null?void 0:n[0])!=null?e:document}Al({loadJS(n){return new Promise((e,t)=>{let r=document.createElement("script");r.setAttribute("src",n),r.onload=e,r.onerror=i=>{let s=ut("internal-error");s.customData=i,t(s)},r.type="text/javascript",r.charset="UTF-8",Eh().appendChild(r)})},gapiScript:"https://apis.google.com/js/api.js",recaptchaV2Script:"https://www.google.com/recaptcha/api.js",recaptchaEnterpriseScript:"https://www.google.com/recaptcha/enterprise.js?render="});yh("Browser");var wh="type.googleapis.com/google.protobuf.Int64Value",Th="type.googleapis.com/google.protobuf.UInt64Value";function Oa(n,e){let t={};for(let r in n)n.hasOwnProperty(r)&&(t[r]=e(n[r]));return t}function or(n){if(n==null)return null;if(n instanceof Number&&(n=n.valueOf()),typeof n=="number"&&isFinite(n)||n===!0||n===!1||Object.prototype.toString.call(n)==="[object String]")return n;if(n instanceof Date)return n.toISOString();if(Array.isArray(n))return n.map(e=>or(e));if(typeof n=="function"||typeof n=="object")return Oa(n,e=>or(e));throw new Error("Data cannot be encoded in JSON: "+n)}function ft(n){if(n==null)return n;if(n["@type"])switch(n["@type"]){case wh:case Th:{let e=Number(n.value);if(isNaN(e))throw new Error("Data cannot be decoded from JSON: "+n);return e}default:throw new Error("Data cannot be decoded from JSON: "+n)}return Array.isArray(n)?n.map(e=>ft(e)):typeof n=="function"||typeof n=="object"?Oa(n,e=>ft(e)):n}var ns="functions";var ka={OK:"ok",CANCELLED:"cancelled",UNKNOWN:"unknown",INVALID_ARGUMENT:"invalid-argument",DEADLINE_EXCEEDED:"deadline-exceeded",NOT_FOUND:"not-found",ALREADY_EXISTS:"already-exists",PERMISSION_DENIED:"permission-denied",UNAUTHENTICATED:"unauthenticated",RESOURCE_EXHAUSTED:"resource-exhausted",FAILED_PRECONDITION:"failed-precondition",ABORTED:"aborted",OUT_OF_RANGE:"out-of-range",UNIMPLEMENTED:"unimplemented",INTERNAL:"internal",UNAVAILABLE:"unavailable",DATA_LOSS:"data-loss"},X=class n extends G{constructor(e,t,r,i){super(`${ns}/${e}`,t||"",i!=null?{url:i}:void 0),this.details=r,Object.setPrototypeOf(this,n.prototype)}};function bh(n){if(n>=200&&n<300)return"ok";switch(n){case 0:return"internal";case 400:return"invalid-argument";case 401:return"unauthenticated";case 403:return"permission-denied";case 404:return"not-found";case 409:return"aborted";case 429:return"resource-exhausted";case 499:return"cancelled";case 500:return"internal";case 501:return"unimplemented";case 503:return"unavailable";case 504:return"deadline-exceeded"}return"unknown"}function ar(n,e,t){let r=bh(n),i=r,s;try{let o=e&&e.error;if(o){let a=o.status;if(typeof a=="string"){if(!ka[a])return new X("internal",`Unknown backend error status: ${a} [${n}]`,void 0,t);r=ka[a],i=`Backend error status: ${a}`}let c=o.message;typeof c=="string"&&(i=c),s=o.details,s!==void 0&&(s=ft(s))}}catch{}return r==="ok"?null:new X(r,`${i} [${n}]`,s,t)}var Zi=class{constructor(e,t,r,i){this.app=e,this.auth=null,this.messaging=null,this.appCheck=null,this.serverAppAppCheckToken=null,$(e)&&e.settings.appCheckToken&&(this.serverAppAppCheckToken=e.settings.appCheckToken),this.auth=t.getImmediate({optional:!0}),this.messaging=r.getImmediate({optional:!0}),this.auth||t.get().then(s=>this.auth=s,()=>{}),this.messaging||r.get().then(s=>this.messaging=s,()=>{}),this.appCheck||i==null||i.get().then(s=>this.appCheck=s,()=>{})}async getAuthToken(){if(this.auth)try{let e=await this.auth.getToken();return e==null?void 0:e.accessToken}catch{return}}async getMessagingToken(){if(!(!this.messaging||!("Notification"in self)||Notification.permission!=="granted"))try{return await this.messaging.getToken()}catch{return}}async getAppCheckToken(e){if(this.serverAppAppCheckToken)return this.serverAppAppCheckToken;if(this.appCheck){let t=e?await this.appCheck.getLimitedUseToken():await this.appCheck.getToken();return t.error?null:t.token}return null}async getContext(e){let t=await this.getAuthToken(),r=await this.getMessagingToken(),i=await this.getAppCheckToken(e);return{authToken:t,messagingToken:r,appCheckToken:i}}};var es="us-central1",vh=/^data: (.*?)(?:\n|$)/;function Ah(n){let e=null;return{promise:new Promise((t,r)=>{e=setTimeout(()=>{r(new X("deadline-exceeded","deadline-exceeded"))},n)}),cancel:()=>{e&&clearTimeout(e)}}}var ts=class{constructor(e,t,r,i,s=es,o=(...a)=>fetch(...a)){this.app=e,this.fetchImpl=o,this.emulatorOrigin=null,this.contextProvider=new Zi(e,t,r,i),this.cancelAllRequests=new Promise(a=>{this.deleteService=()=>Promise.resolve(a())});try{let a=new URL(s);this.customDomain=a.origin+(a.pathname==="/"?"":a.pathname),this.region=es}catch{this.customDomain=null,this.region=s}}_delete(){return this.deleteService()}_url(e){let t=this.app.options.projectId;return this.emulatorOrigin!==null?`${this.emulatorOrigin}/${t}/${this.region}/${e}`:this.customDomain!==null?`${this.customDomain}/${e}`:`https://${this.region}-${t}.cloudfunctions.net/${e}`}};function Sh(n,e,t){let r=_e(e);n.emulatorOrigin=`http${r?"s":""}://${e}:${t}`,r&&Vt(n.emulatorOrigin+"/backends")}function Nh(n,e,t){let r=i=>Ph(n,e,i,t||{});return r.stream=(i,s)=>Ch(n,e,i,s),r}function Va(n){return n.emulatorOrigin&&_e(n.emulatorOrigin)?"include":void 0}async function Rh(n,e,t,r,i){t["Content-Type"]="application/json";let s;try{s=await r(n,{method:"POST",body:JSON.stringify(e),headers:t,credentials:Va(i)})}catch{return{status:0,json:null}}let o=null;try{o=await s.json()}catch{}return{status:s.status,json:o}}async function La(n,e){let t={},r=await n.contextProvider.getContext(e.limitedUseAppCheckTokens);return r.authToken&&(t.Authorization="Bearer "+r.authToken),r.messagingToken&&(t["Firebase-Instance-ID-Token"]=r.messagingToken),r.appCheckToken!==null&&(t["X-Firebase-AppCheck"]=r.appCheckToken),t}function Ph(n,e,t,r){let i=n._url(e);return kh(n,i,t,r)}async function kh(n,e,t,r){t=or(t);let i={data:t},s=await La(n,r),o=r.timeout||7e4,a=Ah(o),c=await Promise.race([Rh(e,i,s,n.fetchImpl,n),a.promise,n.cancelAllRequests]);if(a.cancel(),!c)throw new X("cancelled","Firebase Functions instance was deleted.");let l=ar(c.status,c.json,e);if(l)throw l;if(!c.json)throw new X("internal","Response is not valid JSON object.",void 0,e);let _=c.json.data;if(typeof _>"u"&&(_=c.json.result),typeof _>"u")throw new X("internal","Response is missing data field.",void 0,e);return{data:ft(_)}}function Ch(n,e,t,r){let i=n._url(e);return Dh(n,i,t,r||{})}async function Dh(n,e,t,r){var I;t=or(t);let i={data:t},s=await La(n,r);s["Content-Type"]="application/json",s.Accept="text/event-stream";let o;try{o=await n.fetchImpl(e,{method:"POST",body:JSON.stringify(i),headers:s,signal:r==null?void 0:r.signal,credentials:Va(n)})}catch(T){if(T instanceof Error&&T.name==="AbortError"){let A=new X("cancelled","Request was cancelled.");return{data:Promise.reject(A),stream:{[Symbol.asyncIterator](){return{next(){return Promise.reject(A)}}}}}}let v=ar(0,null,e);return{data:Promise.reject(v),stream:{[Symbol.asyncIterator](){return{next(){return Promise.reject(v)}}}}}}let a,c,l=new Promise((T,v)=>{a=T,c=v});(I=r==null?void 0:r.signal)==null||I.addEventListener("abort",()=>{let T=new X("cancelled","Request was cancelled.");c(T)});let _=o.body.getReader(),y=Oh(_,a,c,r==null?void 0:r.signal,e);return{stream:{[Symbol.asyncIterator](){let T=y.getReader();return{async next(){let{value:v,done:A}=await T.read();return{value:v,done:A}},async return(){return await T.cancel(),{done:!0,value:void 0}}}}},data:l}}function Oh(n,e,t,r,i){let s=(a,c)=>{let l=a.match(vh);if(!l)return;let _=l[1];try{let y=JSON.parse(_);if("result"in y){e(ft(y.result));return}if("message"in y){c.enqueue(ft(y.message));return}if("error"in y){let I=ar(0,y,i);c.error(I),t(I);return}}catch(y){if(y instanceof X){c.error(y),t(y);return}}},o=new TextDecoder;return new ReadableStream({start(a){let c="";return l();async function l(){if(r!=null&&r.aborted){let _=new X("cancelled","Request was cancelled");return a.error(_),t(_),Promise.resolve()}try{let{value:_,done:y}=await n.read();if(y){c.trim()&&s(c.trim(),a),a.close();return}if(r!=null&&r.aborted){let T=new X("cancelled","Request was cancelled");a.error(T),t(T),await n.cancel();return}c+=o.decode(_,{stream:!0});let I=c.split(`
`);c=I.pop()||"";for(let T of I)T.trim()&&s(T.trim(),a);return l()}catch(_){let y=_ instanceof X?_:ar(0,null,i);a.error(y),t(y)}}},cancel(){return n.cancel()}})}var Ca="@firebase/functions",Da="0.14.0";var Vh="auth-internal",Lh="app-check-internal",xh="messaging-internal";function Mh(n){let e=(t,{instanceIdentifier:r})=>{let i=t.getProvider("app").getImmediate(),s=t.getProvider(Vh),o=t.getProvider(xh),a=t.getProvider(Lh);return new ts(i,s,o,a,r)};le(new Y(ns,e,"PUBLIC").setMultipleInstances(!0)),Q(Ca,Da,n),Q(Ca,Da,"esm2020")}function xa(n=xt(),e=es){let r=at(P(n),ns).getImmediate({identifier:e}),i=Rn("functions");return i&&Uh(r,...i),r}function Uh(n,e,t){Sh(P(n),e,t)}function Ma(n,e,t){return Nh(P(n),e,t)}Mh();var Ua=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{},Fa={};var rs,Fh;(function(){var n;function e(f,u){function h(){}h.prototype=u.prototype,f.F=u.prototype,f.prototype=new h,f.prototype.constructor=f,f.D=function(m,p,g){for(var d=Array(arguments.length-2),Me=2;Me<arguments.length;Me++)d[Me-2]=arguments[Me];return u.prototype[p].apply(m,d)}}function t(){this.blockSize=-1}function r(){this.blockSize=-1,this.blockSize=64,this.g=Array(4),this.C=Array(this.blockSize),this.o=this.h=0,this.u()}e(r,t),r.prototype.u=function(){this.g[0]=1732584193,this.g[1]=4023233417,this.g[2]=2562383102,this.g[3]=271733878,this.o=this.h=0};function i(f,u,h){h||(h=0);let m=Array(16);if(typeof u=="string")for(var p=0;p<16;++p)m[p]=u.charCodeAt(h++)|u.charCodeAt(h++)<<8|u.charCodeAt(h++)<<16|u.charCodeAt(h++)<<24;else for(p=0;p<16;++p)m[p]=u[h++]|u[h++]<<8|u[h++]<<16|u[h++]<<24;u=f.g[0],h=f.g[1],p=f.g[2];let g=f.g[3],d;d=u+(g^h&(p^g))+m[0]+3614090360&4294967295,u=h+(d<<7&4294967295|d>>>25),d=g+(p^u&(h^p))+m[1]+3905402710&4294967295,g=u+(d<<12&4294967295|d>>>20),d=p+(h^g&(u^h))+m[2]+606105819&4294967295,p=g+(d<<17&4294967295|d>>>15),d=h+(u^p&(g^u))+m[3]+3250441966&4294967295,h=p+(d<<22&4294967295|d>>>10),d=u+(g^h&(p^g))+m[4]+4118548399&4294967295,u=h+(d<<7&4294967295|d>>>25),d=g+(p^u&(h^p))+m[5]+1200080426&4294967295,g=u+(d<<12&4294967295|d>>>20),d=p+(h^g&(u^h))+m[6]+2821735955&4294967295,p=g+(d<<17&4294967295|d>>>15),d=h+(u^p&(g^u))+m[7]+4249261313&4294967295,h=p+(d<<22&4294967295|d>>>10),d=u+(g^h&(p^g))+m[8]+1770035416&4294967295,u=h+(d<<7&4294967295|d>>>25),d=g+(p^u&(h^p))+m[9]+2336552879&4294967295,g=u+(d<<12&4294967295|d>>>20),d=p+(h^g&(u^h))+m[10]+4294925233&4294967295,p=g+(d<<17&4294967295|d>>>15),d=h+(u^p&(g^u))+m[11]+2304563134&4294967295,h=p+(d<<22&4294967295|d>>>10),d=u+(g^h&(p^g))+m[12]+1804603682&4294967295,u=h+(d<<7&4294967295|d>>>25),d=g+(p^u&(h^p))+m[13]+4254626195&4294967295,g=u+(d<<12&4294967295|d>>>20),d=p+(h^g&(u^h))+m[14]+2792965006&4294967295,p=g+(d<<17&4294967295|d>>>15),d=h+(u^p&(g^u))+m[15]+1236535329&4294967295,h=p+(d<<22&4294967295|d>>>10),d=u+(p^g&(h^p))+m[1]+4129170786&4294967295,u=h+(d<<5&4294967295|d>>>27),d=g+(h^p&(u^h))+m[6]+3225465664&4294967295,g=u+(d<<9&4294967295|d>>>23),d=p+(u^h&(g^u))+m[11]+643717713&4294967295,p=g+(d<<14&4294967295|d>>>18),d=h+(g^u&(p^g))+m[0]+3921069994&4294967295,h=p+(d<<20&4294967295|d>>>12),d=u+(p^g&(h^p))+m[5]+3593408605&4294967295,u=h+(d<<5&4294967295|d>>>27),d=g+(h^p&(u^h))+m[10]+38016083&4294967295,g=u+(d<<9&4294967295|d>>>23),d=p+(u^h&(g^u))+m[15]+3634488961&4294967295,p=g+(d<<14&4294967295|d>>>18),d=h+(g^u&(p^g))+m[4]+3889429448&4294967295,h=p+(d<<20&4294967295|d>>>12),d=u+(p^g&(h^p))+m[9]+568446438&4294967295,u=h+(d<<5&4294967295|d>>>27),d=g+(h^p&(u^h))+m[14]+3275163606&4294967295,g=u+(d<<9&4294967295|d>>>23),d=p+(u^h&(g^u))+m[3]+4107603335&4294967295,p=g+(d<<14&4294967295|d>>>18),d=h+(g^u&(p^g))+m[8]+1163531501&4294967295,h=p+(d<<20&4294967295|d>>>12),d=u+(p^g&(h^p))+m[13]+2850285829&4294967295,u=h+(d<<5&4294967295|d>>>27),d=g+(h^p&(u^h))+m[2]+4243563512&4294967295,g=u+(d<<9&4294967295|d>>>23),d=p+(u^h&(g^u))+m[7]+1735328473&4294967295,p=g+(d<<14&4294967295|d>>>18),d=h+(g^u&(p^g))+m[12]+2368359562&4294967295,h=p+(d<<20&4294967295|d>>>12),d=u+(h^p^g)+m[5]+4294588738&4294967295,u=h+(d<<4&4294967295|d>>>28),d=g+(u^h^p)+m[8]+2272392833&4294967295,g=u+(d<<11&4294967295|d>>>21),d=p+(g^u^h)+m[11]+1839030562&4294967295,p=g+(d<<16&4294967295|d>>>16),d=h+(p^g^u)+m[14]+4259657740&4294967295,h=p+(d<<23&4294967295|d>>>9),d=u+(h^p^g)+m[1]+2763975236&4294967295,u=h+(d<<4&4294967295|d>>>28),d=g+(u^h^p)+m[4]+1272893353&4294967295,g=u+(d<<11&4294967295|d>>>21),d=p+(g^u^h)+m[7]+4139469664&4294967295,p=g+(d<<16&4294967295|d>>>16),d=h+(p^g^u)+m[10]+3200236656&4294967295,h=p+(d<<23&4294967295|d>>>9),d=u+(h^p^g)+m[13]+681279174&4294967295,u=h+(d<<4&4294967295|d>>>28),d=g+(u^h^p)+m[0]+3936430074&4294967295,g=u+(d<<11&4294967295|d>>>21),d=p+(g^u^h)+m[3]+3572445317&4294967295,p=g+(d<<16&4294967295|d>>>16),d=h+(p^g^u)+m[6]+76029189&4294967295,h=p+(d<<23&4294967295|d>>>9),d=u+(h^p^g)+m[9]+3654602809&4294967295,u=h+(d<<4&4294967295|d>>>28),d=g+(u^h^p)+m[12]+3873151461&4294967295,g=u+(d<<11&4294967295|d>>>21),d=p+(g^u^h)+m[15]+530742520&4294967295,p=g+(d<<16&4294967295|d>>>16),d=h+(p^g^u)+m[2]+3299628645&4294967295,h=p+(d<<23&4294967295|d>>>9),d=u+(p^(h|~g))+m[0]+4096336452&4294967295,u=h+(d<<6&4294967295|d>>>26),d=g+(h^(u|~p))+m[7]+1126891415&4294967295,g=u+(d<<10&4294967295|d>>>22),d=p+(u^(g|~h))+m[14]+2878612391&4294967295,p=g+(d<<15&4294967295|d>>>17),d=h+(g^(p|~u))+m[5]+4237533241&4294967295,h=p+(d<<21&4294967295|d>>>11),d=u+(p^(h|~g))+m[12]+1700485571&4294967295,u=h+(d<<6&4294967295|d>>>26),d=g+(h^(u|~p))+m[3]+2399980690&4294967295,g=u+(d<<10&4294967295|d>>>22),d=p+(u^(g|~h))+m[10]+4293915773&4294967295,p=g+(d<<15&4294967295|d>>>17),d=h+(g^(p|~u))+m[1]+2240044497&4294967295,h=p+(d<<21&4294967295|d>>>11),d=u+(p^(h|~g))+m[8]+1873313359&4294967295,u=h+(d<<6&4294967295|d>>>26),d=g+(h^(u|~p))+m[15]+4264355552&4294967295,g=u+(d<<10&4294967295|d>>>22),d=p+(u^(g|~h))+m[6]+2734768916&4294967295,p=g+(d<<15&4294967295|d>>>17),d=h+(g^(p|~u))+m[13]+1309151649&4294967295,h=p+(d<<21&4294967295|d>>>11),d=u+(p^(h|~g))+m[4]+4149444226&4294967295,u=h+(d<<6&4294967295|d>>>26),d=g+(h^(u|~p))+m[11]+3174756917&4294967295,g=u+(d<<10&4294967295|d>>>22),d=p+(u^(g|~h))+m[2]+718787259&4294967295,p=g+(d<<15&4294967295|d>>>17),d=h+(g^(p|~u))+m[9]+3951481745&4294967295,f.g[0]=f.g[0]+u&4294967295,f.g[1]=f.g[1]+(p+(d<<21&4294967295|d>>>11))&4294967295,f.g[2]=f.g[2]+p&4294967295,f.g[3]=f.g[3]+g&4294967295}r.prototype.v=function(f,u){u===void 0&&(u=f.length);let h=u-this.blockSize,m=this.C,p=this.h,g=0;for(;g<u;){if(p==0)for(;g<=h;)i(this,f,g),g+=this.blockSize;if(typeof f=="string"){for(;g<u;)if(m[p++]=f.charCodeAt(g++),p==this.blockSize){i(this,m),p=0;break}}else for(;g<u;)if(m[p++]=f[g++],p==this.blockSize){i(this,m),p=0;break}}this.h=p,this.o+=u},r.prototype.A=function(){var f=Array((this.h<56?this.blockSize:this.blockSize*2)-this.h);f[0]=128;for(var u=1;u<f.length-8;++u)f[u]=0;u=this.o*8;for(var h=f.length-8;h<f.length;++h)f[h]=u&255,u/=256;for(this.v(f),f=Array(16),u=0,h=0;h<4;++h)for(let m=0;m<32;m+=8)f[u++]=this.g[h]>>>m&255;return f};function s(f,u){var h=a;return Object.prototype.hasOwnProperty.call(h,f)?h[f]:h[f]=u(f)}function o(f,u){this.h=u;let h=[],m=!0;for(let p=f.length-1;p>=0;p--){let g=f[p]|0;m&&g==u||(h[p]=g,m=!1)}this.g=h}var a={};function c(f){return-128<=f&&f<128?s(f,function(u){return new o([u|0],u<0?-1:0)}):new o([f|0],f<0?-1:0)}function l(f){if(isNaN(f)||!isFinite(f))return y;if(f<0)return S(l(-f));let u=[],h=1;for(let m=0;f>=h;m++)u[m]=f/h|0,h*=4294967296;return new o(u,0)}function _(f,u){if(f.length==0)throw Error("number format error: empty string");if(u=u||10,u<2||36<u)throw Error("radix out of range: "+u);if(f.charAt(0)=="-")return S(_(f.substring(1),u));if(f.indexOf("-")>=0)throw Error('number format error: interior "-" character');let h=l(Math.pow(u,8)),m=y;for(let g=0;g<f.length;g+=8){var p=Math.min(8,f.length-g);let d=parseInt(f.substring(g,g+p),u);p<8?(p=l(Math.pow(u,p)),m=m.j(p).add(l(d))):(m=m.j(h),m=m.add(l(d)))}return m}var y=c(0),I=c(1),T=c(16777216);n=o.prototype,n.m=function(){if(A(this))return-S(this).m();let f=0,u=1;for(let h=0;h<this.g.length;h++){let m=this.i(h);f+=(m>=0?m:4294967296+m)*u,u*=4294967296}return f},n.toString=function(f){if(f=f||10,f<2||36<f)throw Error("radix out of range: "+f);if(v(this))return"0";if(A(this))return"-"+S(this).toString(f);let u=l(Math.pow(f,6));var h=this;let m="";for(;;){let p=ce(h,u).g;h=K(h,p.j(u));let g=((h.g.length>0?h.g[0]:h.h)>>>0).toString(f);if(h=p,v(h))return g+m;for(;g.length<6;)g="0"+g;m=g+m}},n.i=function(f){return f<0?0:f<this.g.length?this.g[f]:this.h};function v(f){if(f.h!=0)return!1;for(let u=0;u<f.g.length;u++)if(f.g[u]!=0)return!1;return!0}function A(f){return f.h==-1}n.l=function(f){return f=K(this,f),A(f)?-1:v(f)?0:1};function S(f){let u=f.g.length,h=[];for(let m=0;m<u;m++)h[m]=~f.g[m];return new o(h,~f.h).add(I)}n.abs=function(){return A(this)?S(this):this},n.add=function(f){let u=Math.max(this.g.length,f.g.length),h=[],m=0;for(let p=0;p<=u;p++){let g=m+(this.i(p)&65535)+(f.i(p)&65535),d=(g>>>16)+(this.i(p)>>>16)+(f.i(p)>>>16);m=d>>>16,g&=65535,d&=65535,h[p]=d<<16|g}return new o(h,h[h.length-1]&-2147483648?-1:0)};function K(f,u){return f.add(S(u))}n.j=function(f){if(v(this)||v(f))return y;if(A(this))return A(f)?S(this).j(S(f)):S(S(this).j(f));if(A(f))return S(this.j(S(f)));if(this.l(T)<0&&f.l(T)<0)return l(this.m()*f.m());let u=this.g.length+f.g.length,h=[];for(var m=0;m<2*u;m++)h[m]=0;for(m=0;m<this.g.length;m++)for(let p=0;p<f.g.length;p++){let g=this.i(m)>>>16,d=this.i(m)&65535,Me=f.i(p)>>>16,go=f.i(p)&65535;h[2*m+2*p]+=d*go,Z(h,2*m+2*p),h[2*m+2*p+1]+=g*go,Z(h,2*m+2*p+1),h[2*m+2*p+1]+=d*Me,Z(h,2*m+2*p+1),h[2*m+2*p+2]+=g*Me,Z(h,2*m+2*p+2)}for(f=0;f<u;f++)h[f]=h[2*f+1]<<16|h[2*f];for(f=u;f<2*u;f++)h[f]=0;return new o(h,0)};function Z(f,u){for(;(f[u]&65535)!=f[u];)f[u+1]+=f[u]>>>16,f[u]&=65535,u++}function se(f,u){this.g=f,this.h=u}function ce(f,u){if(v(u))throw Error("division by zero");if(v(f))return new se(y,y);if(A(f))return u=ce(S(f),u),new se(S(u.g),S(u.h));if(A(u))return u=ce(f,S(u)),new se(S(u.g),u.h);if(f.g.length>30){if(A(f)||A(u))throw Error("slowDivide_ only works with positive integers.");for(var h=I,m=u;m.l(f)<=0;)h=Pe(h),m=Pe(m);var p=re(h,1),g=re(m,1);for(m=re(m,2),h=re(h,2);!v(m);){var d=g.add(m);d.l(f)<=0&&(p=p.add(h),g=d),m=re(m,1),h=re(h,1)}return u=K(f,p.j(u)),new se(p,u)}for(p=y;f.l(u)>=0;){for(h=Math.max(1,Math.floor(f.m()/u.m())),m=Math.ceil(Math.log(h)/Math.LN2),m=m<=48?1:Math.pow(2,m-48),g=l(h),d=g.j(u);A(d)||d.l(f)>0;)h-=m,g=l(h),d=g.j(u);v(g)&&(g=I),p=p.add(g),f=K(f,d)}return new se(p,f)}n.B=function(f){return ce(this,f).h},n.and=function(f){let u=Math.max(this.g.length,f.g.length),h=[];for(let m=0;m<u;m++)h[m]=this.i(m)&f.i(m);return new o(h,this.h&f.h)},n.or=function(f){let u=Math.max(this.g.length,f.g.length),h=[];for(let m=0;m<u;m++)h[m]=this.i(m)|f.i(m);return new o(h,this.h|f.h)},n.xor=function(f){let u=Math.max(this.g.length,f.g.length),h=[];for(let m=0;m<u;m++)h[m]=this.i(m)^f.i(m);return new o(h,this.h^f.h)};function Pe(f){let u=f.g.length+1,h=[];for(let m=0;m<u;m++)h[m]=f.i(m)<<1|f.i(m-1)>>>31;return new o(h,f.h)}function re(f,u){let h=u>>5;u%=32;let m=f.g.length-h,p=[];for(let g=0;g<m;g++)p[g]=u>0?f.i(g+h)>>>u|f.i(g+h+1)<<32-u:f.i(g+h);return new o(p,f.h)}r.prototype.digest=r.prototype.A,r.prototype.reset=r.prototype.u,r.prototype.update=r.prototype.v,Fh=Fa.Md5=r,o.prototype.add=o.prototype.add,o.prototype.multiply=o.prototype.j,o.prototype.modulo=o.prototype.B,o.prototype.compare=o.prototype.l,o.prototype.toNumber=o.prototype.m,o.prototype.toString=o.prototype.toString,o.prototype.getBits=o.prototype.i,o.fromNumber=l,o.fromString=_,rs=Fa.Integer=o}).apply(typeof Ua<"u"?Ua:typeof self<"u"?self:typeof window<"u"?window:{});function U(n,e,t,r){if(t==="a"&&!r)throw new TypeError("Private accessor was defined without a getter");if(typeof e=="function"?n!==e||!r:!e.has(n))throw new TypeError("Cannot read private member from an object whose class did not declare it");return t==="m"?r:t==="a"?r.call(n):r?r.value:e.get(n)}var H=class{constructor(e){this.uid=e}isAuthenticated(){return this.uid!=null}toKey(){return this.isAuthenticated()?"uid:"+this.uid:"anonymous-user"}isEqual(e){return e.uid===this.uid}};H.UNAUTHENTICATED=new H(null),H.GOOGLE_CREDENTIALS=new H("google-credentials-uid"),H.FIRST_PARTY=new H("first-party-uid"),H.MOCK_USER=new H("mock-user");var Dt="13.0.0";function ac(n){Dt=n}var yt=new ke("@firebase/firestore");function rn(n,...e){if(yt.logLevel<=R.DEBUG){let t=e.map(Hs);yt.debug(`Firestore (${Dt}): ${n}`,...t)}}function zr(n,...e){if(yt.logLevel<=R.ERROR){let t=e.map(Hs);yt.error(`Firestore (${Dt}): ${n}`,...t)}}function cc(n,...e){if(yt.logLevel<=R.WARN){let t=e.map(Hs);yt.warn(`Firestore (${Dt}): ${n}`,...t)}}function Hs(n){if(typeof n=="string")return n;try{return function(t){return JSON.stringify(t)}(n)}catch{return n}}function D(n,e,t){let r="Unexpected state";typeof e=="string"?r=e:t=e,uc(n,r,t)}function uc(n,e,t){let r=`FIRESTORE (${Dt}) INTERNAL ASSERTION FAILED: ${e} (ID: ${n.toString(16)})`;if(t!==void 0)try{r+=" CONTEXT: "+JSON.stringify(t)}catch{r+=" CONTEXT: "+t}throw zr(r),new Error(r)}function te(n,e,t,r){let i="Unexpected state";typeof t=="string"?i=t:r=t,n||uc(e,i,r)}function En(n,e){return n}var E={OK:"ok",CANCELLED:"cancelled",UNKNOWN:"unknown",INVALID_ARGUMENT:"invalid-argument",DEADLINE_EXCEEDED:"deadline-exceeded",NOT_FOUND:"not-found",ALREADY_EXISTS:"already-exists",PERMISSION_DENIED:"permission-denied",UNAUTHENTICATED:"unauthenticated",RESOURCE_EXHAUSTED:"resource-exhausted",FAILED_PRECONDITION:"failed-precondition",ABORTED:"aborted",OUT_OF_RANGE:"out-of-range",UNIMPLEMENTED:"unimplemented",INTERNAL:"internal",UNAVAILABLE:"unavailable",DATA_LOSS:"data-loss"},w=class extends G{constructor(e,t){super(e,t),this.code=e,this.message=t,this.toString=()=>`${this.name}: [code=${this.code}]: ${this.message}`}};var pr=class{constructor(e,t){this.user=t,this.type="OAuth",this.headers=new Map,this.headers.set("Authorization",`Bearer ${e}`)}},as=class{getToken(){return Promise.resolve(null)}invalidateToken(){}start(e,t){e.enqueueRetryable(()=>t(H.UNAUTHENTICATED))}shutdown(){}},cs=class{constructor(e){this.token=e,this.changeListener=null}getToken(){return Promise.resolve(this.token)}invalidateToken(){}start(e,t){this.changeListener=t,e.enqueueRetryable(()=>t(this.token.user))}shutdown(){this.changeListener=null}},mr=class{constructor(e){this.auth=null,e.onInit(t=>{this.auth=t})}getToken(){return this.auth?this.auth.getToken().then(e=>e?(te(typeof e.accessToken=="string",42297,{Z:e}),new pr(e.accessToken,new H(this.auth.getUid()))):null):Promise.resolve(null)}invalidateToken(){}start(e,t){}shutdown(){}},us=class{constructor(e,t,r){this.ee=e,this.te=t,this.re=r,this.type="FirstParty",this.user=H.FIRST_PARTY,this.ne=new Map}ie(){return this.re?this.re():null}get headers(){this.ne.set("X-Goog-AuthUser",this.ee);let e=this.ie();return e&&this.ne.set("Authorization",e),this.te&&this.ne.set("X-Goog-Iam-Authorization-Token",this.te),this.ne}},ls=class{constructor(e,t,r){this.ee=e,this.te=t,this.re=r}getToken(){return Promise.resolve(new us(this.ee,this.te,this.re))}start(e,t){e.enqueueRetryable(()=>t(H.FIRST_PARTY))}shutdown(){}invalidateToken(){}},gr=class{constructor(e){this.value=e,this.type="AppCheck",this.headers=new Map,e&&e.length>0&&this.headers.set("x-firebase-appcheck",this.value)}},_r=class{constructor(e,t){this.se=t,this.appCheck=null,this.oe=null,$(e)&&e.settings.appCheckToken&&(this.oe=e.settings.appCheckToken),t.onInit(r=>{this.appCheck=r})}getToken(){return this.oe?Promise.resolve(new gr(this.oe)):this.appCheck?this.appCheck.getToken().then(e=>e?(te(typeof e.token=="string",3470,{tokenResult:e}),new gr(e.token)):null):Promise.resolve(null)}invalidateToken(){}start(e,t){}shutdown(){}};var hs=class{constructor(e,t,r,i,s,o,a,c,l,_,y,I,T){this.databaseId=e,this.appId=t,this.persistenceKey=r,this.host=i,this.ssl=s,this.forceLongPolling=o,this.autoDetectLongPolling=a,this.longPollingOptions=c,this.useFetchStreams=l,this.isUsingEmulator=_,this.apiKey=y,this._customHeaders=I,this.grpcFlowControlWindow=T}},ds="(default)",yr=class n{constructor(e,t){this.projectId=e,this.database=t||ds}static empty(){return new n("","")}get isDefaultDatabase(){return this.database===ds}isEqual(e){return e instanceof n&&e.projectId===this.projectId&&e.database===this.database}};function lc(n,e){if(!Object.prototype.hasOwnProperty.apply(n.options,["projectId"]))throw new w(E.INVALID_ARGUMENT,'"projectId" not provided in firebase.initializeApp.');return new yr(n.options.projectId,e)}function qh(n){let e=typeof self<"u"&&(self.crypto||self.msCrypto),t=new Uint8Array(n);if(e&&typeof e.getRandomValues=="function")e.getRandomValues(t);else for(let r=0;r<n;r++)t[r]=Math.floor(256*Math.random());return t}var fs=class{static newId(){let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",t=62*Math.floor(4.129032258064516),r="";for(;r.length<20;){let i=qh(40);for(let s=0;s<i.length;++s)r.length<20&&i[s]<t&&(r+=e.charAt(i[s]%62))}return r}};function O(n,e){return n<e?-1:n>e?1:0}function sn(n,e){let t=Math.min(n.length,e.length);for(let r=0;r<t;r++){let i=n.charAt(r),s=e.charAt(r);if(i!==s)return is(i)===is(s)?O(i,s):is(i)?1:-1}return O(n.length,e.length)}var Bh=55296,jh=57343;function is(n){let e=n.charCodeAt(0);return e>=Bh&&e<=jh}function hc(n,e,t){return n.length===e.length&&n.every((r,i)=>t(r,e[i]))}var qa="__name__",Ir=class n{constructor(e,t,r){t===void 0?t=0:t>e.length&&D(637,{offset:t,range:e.length}),r===void 0?r=e.length-t:r>e.length-t&&D(1746,{length:r,range:e.length-t}),this.segments=e,this.offset=t,this.len=r}get length(){return this.len}isEqual(e){return n.comparator(this,e)===0}child(e){let t=this.segments.slice(this.offset,this.limit());return e instanceof n?e.forEach(r=>{t.push(r)}):t.push(e),this.construct(t)}limit(){return this.offset+this.length}popFirst(e){return e=e===void 0?1:e,this.construct(this.segments,this.offset+e,this.length-e)}popLast(){return this.construct(this.segments,this.offset,this.length-1)}firstSegment(){return this.segments[this.offset]}lastSegment(){return this.get(this.length-1)}get(e){return this.segments[this.offset+e]}isEmpty(){return this.length===0}isPrefixOf(e){if(e.length<this.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}isImmediateParentOf(e){if(this.length+1!==e.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}forEach(e){for(let t=this.offset,r=this.limit();t<r;t++)e(this.segments[t])}toArray(){return this.segments.slice(this.offset,this.limit())}static comparator(e,t){let r=Math.min(e.length,t.length);for(let i=0;i<r;i++){let s=n.compareSegments(e.get(i),t.get(i));if(s!==0)return s}return O(e.length,t.length)}static compareSegments(e,t){let r=n.isNumericId(e),i=n.isNumericId(t);return r&&!i?-1:!r&&i?1:r&&i?n.extractNumericId(e).compare(n.extractNumericId(t)):sn(e,t)}static isNumericId(e){return e.startsWith("__id")&&e.endsWith("__")}static extractNumericId(e){return rs.fromString(e.substring(4,e.length-2))}},M=class n extends Ir{construct(e,t,r){return new n(e,t,r)}canonicalString(){return this.toArray().join("/")}toString(){return this.canonicalString()}toStringWithLeadingSlash(){return`/${this.canonicalString()}`}toUriEncodedString(){return this.toArray().map(encodeURIComponent).join("/")}static fromString(...e){let t=[];for(let r of e){if(r.indexOf("//")>=0)throw new w(E.INVALID_ARGUMENT,`Invalid segment (${r}). Paths must not contain // in them.`);t.push(...r.split("/").filter(i=>i.length>0))}return new n(t)}static emptyPath(){return new n([])}},$h=/^[_a-zA-Z][_a-zA-Z0-9]*$/,Ve=class pt extends Ir{construct(e,t,r){return new pt(e,t,r)}static isValidIdentifier(e){return $h.test(e)}canonicalString(){return this.toArray().map(e=>(e=e.replace(/\\/g,"\\\\").replace(/`/g,"\\`"),pt.isValidIdentifier(e)||(e="`"+e+"`"),e)).join(".")}toString(){return this.canonicalString()}isKeyField(){return this.length===1&&this.get(0)===qa}static keyField(){return new pt([qa])}static fromServerFormat(e){let t=[],r="",i=0,s=()=>{if(r.length===0)throw new w(E.INVALID_ARGUMENT,`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`);t.push(r),r=""},o=!1;for(;i<e.length;){let a=e[i];if(a==="\\"){if(i+1===e.length)throw new w(E.INVALID_ARGUMENT,"Path has trailing escape character: "+e);let c=e[i+1];if(c!=="\\"&&c!=="."&&c!=="`")throw new w(E.INVALID_ARGUMENT,"Path has invalid escape sequence: "+e);r+=c,i+=2}else a==="`"?(o=!o,i++):a!=="."||o?(r+=a,i++):(s(),i++)}if(s(),o)throw new w(E.INVALID_ARGUMENT,"Unterminated ` in path: "+e);return new pt(t)}static emptyPath(){return new pt([])}};var z=class n{constructor(e){this.path=e}static fromPath(e){return new n(M.fromString(e))}static fromName(e){return new n(M.fromString(e).popFirst(5))}static empty(){return new n(M.emptyPath())}get collectionGroup(){return this.path.popLast().lastSegment()}hasCollectionId(e){return this.path.length>=2&&this.path.get(this.path.length-2)===e}getCollectionGroup(){return this.path.get(this.path.length-2)}getCollectionPath(){return this.path.popLast()}isEqual(e){return e!==null&&M.comparator(this.path,e.path)===0}toString(){return this.path.toString()}static comparator(e,t){return M.comparator(e.path,t.path)}static isDocumentKey(e){return e.length%2==0}static fromSegments(e){return new n(new M(e.slice()))}};function dc(n,e,t){if(!t)throw new w(E.INVALID_ARGUMENT,`Function ${n}() cannot be called with an empty ${e}.`)}function Ba(n){if(!z.isDocumentKey(n))throw new w(E.INVALID_ARGUMENT,`Invalid document reference. Document references must have an even number of segments, but ${n} has ${n.length}.`)}function ja(n){if(z.isDocumentKey(n))throw new w(E.INVALID_ARGUMENT,`Invalid collection reference. Collection references must have an odd number of segments, but ${n} has ${n.length}.`)}function fc(n){return typeof n=="object"&&n!==null&&(Object.getPrototypeOf(n)===Object.prototype||Object.getPrototypeOf(n)===null)}function Gr(n){if(n===void 0)return"undefined";if(n===null)return"null";if(typeof n=="string")return n.length>20&&(n=`${n.substring(0,20)}...`),JSON.stringify(n);if(typeof n=="number"||typeof n=="boolean")return""+n;if(typeof n=="object"){if(n instanceof Array)return"an array";{let e=function(r){return r.constructor?r.constructor.name:null}(n);return e?`a custom ${e} object`:"an object"}}return typeof n=="function"?"a function":D(12329,{type:typeof n})}function xe(n,e){if("_delegate"in n&&(n=n._delegate),!(n instanceof e)){if(e.name===n.constructor.name)throw new w(E.INVALID_ARGUMENT,"Type does not match the expected instance. Did you pass a reference from a different Firestore SDK?");{let t=Gr(n);throw new w(E.INVALID_ARGUMENT,`Expected type '${e.name}', but it was: ${t}`)}}return n}function Wh(n,e){if(e<=0)throw new w(E.INVALID_ARGUMENT,`Function ${n}() requires a positive number, but it was: ${e}.`)}function pc(n){let e={};return n.timeoutSeconds!==void 0&&(e.timeoutSeconds=n.timeoutSeconds),e}var cr=null;function Hh(){return cr===null?cr=function(){return 268435456+Math.round(2147483648*Math.random())}():cr++,"0x"+cr.toString(16)}function mc(n){return n==null}function Er(n){return n===0&&1/n==-1/0}var ss="RestConnection",zh={BatchGetDocuments:"batchGet",Commit:"commit",RunQuery:"runQuery",RunAggregationQuery:"runAggregationQuery",ExecutePipeline:"executePipeline"},ps=class{get ae(){return!1}constructor(e){this.databaseInfo=e,this.databaseId=e.databaseId;let t=e.ssl?"https":"http",r=encodeURIComponent(this.databaseId.projectId),i=encodeURIComponent(this.databaseId.database);this.ue=t+"://"+e.host,this._e=`projects/${r}/databases/${i}`,this.ce=this.databaseId.database===ds?`project_id=${r}`:`project_id=${r}&database_id=${i}`}le(e,t,r,i,s){let o=Hh(),a=this.fe(e,t.toUriEncodedString());rn(ss,`Sending RPC '${e}' ${o}:`,a,r);let c={"google-cloud-resource-prefix":this._e,"x-goog-request-params":this.ce};this.he(c,i,s);let{host:l}=new URL(a),_=_e(l);return this.de(e,a,c,r,_).then(y=>(rn(ss,`Received RPC '${e}' ${o}: `,y),y),y=>{throw cc(ss,`RPC '${e}' ${o} failed with error: `,y,"url: ",a,"request:",r),y})}me(e,t,r,i,s,o){return this.le(e,t,r,i,s)}he(e,t,r){if(e["X-Goog-Api-Client"]=function(){return"gl-js/ fire/"+Dt}(),e["Content-Type"]="text/plain",this.databaseInfo.appId&&(e["X-Firebase-GMPID"]=this.databaseInfo.appId),t&&t.headers.forEach((i,s)=>e[s]=i),r&&r.headers.forEach((i,s)=>e[s]=i),this.databaseInfo._customHeaders)for(let i of Object.keys(this.databaseInfo._customHeaders))e[i]=this.databaseInfo._customHeaders[i]}fe(e,t){let r=zh[e],i=`${this.ue}/v1/${t}:${r}`;return this.databaseInfo.apiKey&&(i=`${i}?key=${encodeURIComponent(this.databaseInfo.apiKey)}`),i}terminate(){}};var $a,N,F,gt,ms,lr,hr,Zt;function Wa(n){if(n===void 0)return zr("RPC_ERROR","HTTP error has no status"),E.UNKNOWN;switch(n){case 200:return E.OK;case 400:return E.FAILED_PRECONDITION;case 401:return E.UNAUTHENTICATED;case 403:return E.PERMISSION_DENIED;case 404:return E.NOT_FOUND;case 409:return E.ABORTED;case 416:return E.OUT_OF_RANGE;case 429:return E.RESOURCE_EXHAUSTED;case 499:return E.CANCELLED;case 500:return E.UNKNOWN;case 501:return E.UNIMPLEMENTED;case 503:return E.UNAVAILABLE;case 504:return E.DEADLINE_EXCEEDED;default:return n>=200&&n<300?E.OK:n>=400&&n<500?E.FAILED_PRECONDITION:n>=500&&n<600?E.INTERNAL:E.UNKNOWN}}(N=$a||($a={}))[N.OK=0]="OK",N[N.CANCELLED=1]="CANCELLED",N[N.UNKNOWN=2]="UNKNOWN",N[N.INVALID_ARGUMENT=3]="INVALID_ARGUMENT",N[N.DEADLINE_EXCEEDED=4]="DEADLINE_EXCEEDED",N[N.NOT_FOUND=5]="NOT_FOUND",N[N.ALREADY_EXISTS=6]="ALREADY_EXISTS",N[N.PERMISSION_DENIED=7]="PERMISSION_DENIED",N[N.UNAUTHENTICATED=16]="UNAUTHENTICATED",N[N.RESOURCE_EXHAUSTED=8]="RESOURCE_EXHAUSTED",N[N.FAILED_PRECONDITION=9]="FAILED_PRECONDITION",N[N.ABORTED=10]="ABORTED",N[N.OUT_OF_RANGE=11]="OUT_OF_RANGE",N[N.UNIMPLEMENTED=12]="UNIMPLEMENTED",N[N.INTERNAL=13]="INTERNAL",N[N.UNAVAILABLE=14]="UNAVAILABLE",N[N.DATA_LOSS=15]="DATA_LOSS";var gs=class extends ps{Ee(e,t){throw new Error("Not supported by FetchConnection")}async de(e,t,r,i,s){var c,l,_;let o=JSON.stringify(i),a;try{let y={method:"POST",headers:r,body:o};s&&(y.credentials="include"),a=await fetch(t,y)}catch(y){let I=y,T=I==null?void 0:I.message,v=I!=null&&I.cause?String(I.cause):void 0,A=(l=(c=T&&v?`${T} (${v})`:T!=null?T:v)!=null?c:I==null?void 0:I.statusText)!=null?l:String(y);throw new w(Wa(I==null?void 0:I.status),`Request failed with error: ${A}`)}if(!a.ok){let y=await a.json();Array.isArray(y)&&(y=y[0]);let I=(_=y==null?void 0:y.error)==null?void 0:_.message;throw new w(Wa(a.status),`Request failed with error: ${I!=null?I:a.statusText}`)}return a.json()}};var _s=class extends Error{constructor(){super(...arguments),this.name="Base64DecodeError"}};var oe=class n{constructor(e){this.binaryString=e}static fromBase64String(e){let t=function(i){try{return atob(i)}catch(s){throw typeof DOMException<"u"&&s instanceof DOMException?new _s("Invalid base64 string: "+s):s}}(e);return new n(t)}static fromUint8Array(e){let t=function(i){let s="";for(let o=0;o<i.length;++o)s+=String.fromCharCode(i[o]);return s}(e);return new n(t)}[Symbol.iterator](){let e=0;return{next:()=>e<this.binaryString.length?{value:this.binaryString.charCodeAt(e++),done:!1}:{value:void 0,done:!0}}}toBase64(){return function(t){return btoa(t)}(this.binaryString)}toUint8Array(){return function(t){let r=new Uint8Array(t.length);for(let i=0;i<t.length;i++)r[i]=t.charCodeAt(i);return r}(this.binaryString)}approximateByteSize(){return 2*this.binaryString.length}compareTo(e){return O(this.binaryString,e.binaryString)}isEqual(e){return this.binaryString===e.binaryString}};function on(n){let e=0;for(let t in n)Object.prototype.hasOwnProperty.call(n,t)&&e++;return e}function wn(n,e){for(let t in n)Object.prototype.hasOwnProperty.call(n,t)&&e(t,n[t])}oe.EMPTY_BYTE_STRING=new oe("");var L=class n{constructor(){this.exponent=0,this.Ve=0n,this.Te=0n,this.Ie=new Array(4).fill(0n),this.Re=new Array(6).fill(0n),this.Ae=new Array(6).fill(0n),this.Pe=new Array(6).fill(0n),this.pe=new Array(12).fill(0n)}static ye(e,t){let r=new n;return r.parse(e,t),r}parse(e,t){t+=e.length-1,this.exponent=0,this.Ve=0n,this.Te=0n;let r=this.Pe,i=this.be(e,r);if(i==0&&this.isEmpty(r)||(t+=i)<n.we)return;if(t>n.ge)return void(this.exponent=Number(n.Fe));let s=this.ve(t,r);this.xe(t,s,r)}be(e,t){for(let s=0;s<6;s++)t[s]=0n;let r=0;for(;r<e.length&&e[r]==0;)r+=1;if(r==e.length)return 0;let i=-r;if(e.length-r>n.De){let s=e[n.De]>=5,o=new Array(n.De).fill(0);for(let a=0;a<n.De;a++)o[a]=e[a+r];s&&(i+=this.Ne(o)),e=o,r=0}for(let s=e.length-1;s>=r;s--)t[0]|=BigInt(e[s])<<32n,this.Se(t);return i}Se(e){let t=e.length;for(let r=0;r<t;r++){let i=e[r]%10n;e[r]=e[r]/10n,r+1<t&&(e[r+1]+=i<<32n)}}isEmpty(e){for(let t=0;t<e.length;t++)if(e[t]!=0n)return!1;return!0}Ne(e){for(let t=e.length-1;t>=0;t--){if(e[t]!=9)return e[t]=e[t]+1,0;e[t]=0}return e[0]=1,1}ve(e,t){let r=t[0]<<31n|t[1]>>1n,i=Number(r)/n.Ce;return Math.floor(Number(e)*n.Be+this.log2(i))}log2(e){return n.Qe*Math.log(e)}xe(e,t,r){let i=this.Ie;this.Oe(-t,i);let s=this.pe;this.Me(r,i,s),this.qe(s),BigInt(i[0])!=BigInt(-e)&&this.qe(s),t+=this.Le(s),(t+=n.Ue)<=0||(t+=this.$e(s),BigInt(t)>=n.Fe?this.exponent=Number(n.Fe):(this.exponent=Number(t),this.Ve=(s[0]<<32n)+s[1]&0xffffffffffffffffn,this.Te=(s[2]<<32n)+s[3]&0xffffffffffffffffn))}Oe(e,t){if(e==0)return void this.ke(n.je[0],t);let r=n.je;e<0&&(e=-e,r=n.Ke);let i=n.ze,s=32,o=!0;for(;e>0;)e>=i&&(o?(this.ke(r[s],t),o=!1):this.Ge(t,r[s],t),e-=i),s-=1,i*=.5}ke(e,t){for(let r=0;r<t.length;r++)t[r]=e[r]}Ge(e,t,r){this.We(e,t,this.pe);let i=this.Je(this.pe);this.He(this.pe,r),r[0]=e[0]+t[0]+BigInt(i)}We(e,t,r){for(let i=0;i<r.length;i++)r[i]=0n;this.Ye(e,this.Re),this.Ye(t,this.Ae);for(let i=5;i>=0;i--)for(let s=5;s>=0;s--){let o=this.Re[i]*this.Ae[s];r[s+i+1]=r[s+i+1]+(o&n.Ze)&0xffffffffffffffffn,r[s+i]=r[s+i]+(o>>32n)&0xffffffffffffffffn}for(let i=11;i>=1;i--)r[i-1]=r[i-1]+(r[i]>>32n)&0xffffffffffffffffn,r[i]&=n.Ze}Je(e){let t=0;for(;this.Xe(e);)this.qe(e),t-=1;return t}Xe(e){if(e[0]<0x19999999n)return!0;if(e[0]>0x19999999n)return!1;for(let t=1;t<e.length;t++){if(e[t]<0x99999999n)return!0;if(e[t]>0x99999999n)return!1}return!1}Me(e,t,r){for(let o=0;o<r.length;o++)r[o]=0n;let i=this.Ae;this.Ye(t,i);let s=e.length;for(let o=s-1;o>=0;o--)for(let a=s-1;a>=0;a--){let c=e[o]*i[a];r[a+o+1]=r[a+o+1]+(c&n.Ze)&0xffffffffffffffffn,r[a+o]=r[a+o]+(c>>32n)&0xffffffffffffffffn}for(let o=11;o>=1;o--)r[o-1]=r[o-1]+(r[o]>>32n)&0xffffffffffffffffn,r[o]&=n.Ze}qe(e){let t=e.length-1;e[0]&=n.Ze,e[t]*=10n;for(let r=t-1;r>=0;r--)e[r]=10n*e[r]+(e[r+1]>>32n)&0xffffffffffffffffn,e[r+1]&=n.Ze}Le(e){let t=31-n.et(e[0]);return t!=0&&this.tt(e,t),t}$e(e){return this.rt(e,5,100n),this.rt(e,4,0x80000000n),(e[0]&n.nt<<1n)!=0n?(this.tt(e,1),1):0}He(e,t){t[1]=(e[0]<<32n)+e[1],t[2]=(e[2]<<32n)+e[3],t[3]=(e[4]<<32n)+e[5]}Ye(e,t){t[0]=e[1]>>32n,t[1]=e[1]&n.Ze,t[2]=e[2]>>32n,t[3]=e[2]&n.Ze,t[4]=e[3]>>32n,t[5]=e[3]&n.Ze}tt(e,t){let r=e.length-1,i=BigInt(32-Math.abs(t));if(t>0){let s=BigInt(t);for(let o=r+1-1;o>=1;o--)e[o]=e[o]>>s|e[o-1]<<i&n.Ze;e[0]=e[0]>>s}else if(t<0){let s=BigInt(-t);e[0]=0xffffffffffffffffn&(e[0]<<s|e[1]>>i);for(let o=1;o<r;o++)e[o]=0xffffffffffffffffn&(e[o]<<s&n.Ze|e[o+1]>>i);e[r]=e[r]<<s&n.Ze}}rt(e,t,r){let i=t;e[i]=e[i]+r&0xffffffffffffffffn;for(let s=i+1-1;s>=1&&(e[s]&n.nt)!=0n;s--)e[s]&=n.Ze,e[s-1]+=1n}static et(e){let t=Number(e>>32n);return t==0?32+Math.clz32(Number(BigInt.asUintN(32,e))):Math.clz32(t)}};L.De=59,L.ge=646456993,L.we=-646457032,L.Ce=0xccccccccccccd00,L.it=0x8000000000000000n,L.ze=2147483648,L.Ze=0x00000000ffffffffn,L.nt=0xffffffff00000000n,L.Be=Math.log(10)/Math.log(2),L.Qe=1/Math.log(2),L.Ue=2147483647,L.Fe=0xffffffffn,L.je=[[1n,0x1999999999999999n,0x9999999999999999n,0x999999999999999an],[1n,0x3333333333333333n,0x3333333333333333n,0x3333333333333334n],[1n,0x6666666666666666n,0x6666666666666666n,0x6666666666666667n],[2n,0x28f5c28f5c28f5c2n,0x8f5c28f5c28f5c28n,0xf5c28f5c28f5c290n],[3n,0x4189374bc6a7ef9dn,0xb22d0e5604189374n,0xbc6a7ef9db22d0e6n],[5n,0xa7c5ac471b478423n,0x0fcf80dc33721d53n,0xcddd6e04c0592104n],[10n,0x6df37f675ef6eadfn,0x5ab9a2072d44268dn,0x97df837e6748956en],[20n,0x2f394219248446ban,0xa23d2ec729af3d61n,0x0607aa0167dd94cbn],[39n,0x571cbec554b60dbbn,0xd5f64baf0506840dn,0x451db70d5904029bn],[78n,0x1da48ce468e7c702n,0x6520247d3556476dn,0x1469caf6db224cfan],[155n,0x2252f0e5b39769dcn,0x9ae2eea30ca3ade0n,0xeeaa3c08dfe84e30n],[309n,0x2e055c9a3f6ba793n,0x16583a816eb60a59n,0x22c4b0826cf1ebf7n],[617n,0x52bb45e9cf23f17fn,0x7688c07606e50364n,0xb34479aa9d449a57n],[1234n,0x1abc81c8ff5f846cn,0x8f5e3c9853e38c97n,0x45060097f3bf9296n],[2467n,0x1bec53b510daa7b4n,0x48369ed77dbb0eb1n,0x3b05587b2187b41en],[4933n,0x1e75063a5ba91326n,0x8abfb8e460016ae3n,0x28008702d29e8a3cn],[9865n,0x243c5d8bb5c5fa55n,0x40c6d248c5881915n,0x4c0fd99fd5befc22n],[19729n,0x334a5570c3f4ef3cn,0xa13c36c43f979c90n,0xda7ac473555fb7a8n],[39457n,0x66c304445dd98f3bn,0xa8c293a20e47a41bn,0x4c5b03dc12604964n],[78914n,0x293ffbf5fb028cc4n,0x89d3e5ff44238406n,0x369a339e1bfe8c9bn],[157827n,0x427792fbb68e5d20n,0x7b297cd9fc154b62n,0xf09142114aa9a20cn],[315653n,0xac92bc65ad5c08fcn,0x00beeb115a566c19n,0x4ba882d8a4622437n],[631306n,0x745581440f92e80en,0x4da822cf7f896f41n,0x509d598678164ecdn],[1262612n,0x34dd99b4c69523a5n,0x64bc2e8f0d8b1044n,0xb03b1c96da5dd349n],[2525223n,0x6d2bbea9d6d25a08n,0xa0a4606a88e96b70n,0x182063bbc2fe8520n],[5050446n,0x2e8e47d63bfdd6e3n,0x2b55fa8976eaa3e9n,0x1a6b9d3086412a73n],[10100891n,0x54aa68efa1d719dfn,0xd8505806612c5c8fn,0xad068837fee8b43an],[20201782n,0x1c00464ccb7bae77n,0x9e3877784c77982cn,0xd94af3b61717404fn],[40403563n,0x1ea099c8be2b6cd0n,0x8bfb6d539fa50466n,0x6d3bc37e69a84218n],[80807125n,0x24a457f466ce8d18n,0xf2c8f3b81bc6bb59n,0xa78c757692e02d49n],[161614249n,0x347256677aba6b53n,0x3fbf90d30611a67cn,0x1e039d87e0bdb32bn],[323228497n,0x6b727daf0fd3432an,0x71f71121f9e4200fn,0x8fcd9942d486c10cn],[646456994n,0x2d18e84484d91f78n,0x4079bfe7829dec6fn,0x21551643e365abc6n]],L.Ke=[[1n,0x1999999999999999n,0x9999999999999999n,0x999999999999999an],[0n,0x8000000000000000n,0x0000000000000000n,0x0000000000000000n],[0n,0x4000000000000000n,0x0000000000000000n,0x0000000000000001n],[-1n,0xa000000000000000n,0x0000000000000000n,0x0000000000000000n],[-2n,0x6400000000000000n,0x0000000000000000n,0x0000000000000000n],[-4n,0x2710000000000000n,0x0000000000000000n,0x0000000000000001n],[-9n,0x3b9aca0000000000n,0x0000000000000000n,0x0000000000000001n],[-19n,0x8ac7230489e80000n,0x0000000000000000n,0x0000000000000000n],[-38n,0x4b3b4ca85a86c47an,0x098a224000000000n,0x0000000000000001n],[-77n,0xdd15fe86affad912n,0x49ef0eb713f39eben,0xaa987b6e6fd2a002n],[-154n,0xbeeefb584aff8603n,0xaafb550ffacfd8fan,0x5ca47e4f88d45371n],[-308n,0x8e679c2f5e44ff8fn,0x570f09eaa7ea7648n,0x5961db50c6d2b888n],[-616n,0x4f371b3399fc2ab0n,0x8170041c9feb05aan,0xc7c343447c75bcf6n],[-1233n,0xf51e928179013fd3n,0xde4bd12cde4d985cn,0x4a573ca6f94bff14n],[-2466n,0xeab388127bccaff7n,0x1667639142b9fbaen,0x775ec9995e1039fbn],[-4932n,0xd72cb2a95c7ef6ccn,0xe81bf1e825ba7515n,0xc2feb521d6cb5dcdn],[-9864n,0xb4dc1be6604502dcn,0xd491079b8eef6535n,0x578d3965d24de84dn],[-19728n,0x7fc6447bee60ea43n,0x2548da5c8b125b27n,0x5f42d1142f41d349n],[-39456n,0x3fc65180f88af8fbn,0x6a6915f383349413n,0x063c3708b6ceb291n],[-78913n,0x9ee0197c8dcd55bfn,0x2b2b9b942c38f4a2n,0x0f8ba634e9c706aen],[-157826n,0x629963a25b8b2d79n,0xd00b9d2286f70876n,0xe97004700c3644fcn],[-315652n,0x25f9cc308ceef4f3n,0x40f19543911a4546n,0xa2cd389452cfc366n],[-631305n,0x385597b0d47e76b8n,0x1b9f67e103bf2329n,0xc3119848595985f7n],[-1262611n,0x7bf795d276c12f66n,0x66a61d62a446659an,0xa1a4d73bebf093d5n],[-2525222n,0x3c07d96ab1ed7799n,0xcb7355c22cc05ac0n,0x4ffc0ab73b1f6a49n],[-5050445n,0x8cc4cd8c3edefb9an,0x6c8ff86a90a97e0cn,0x166cfddbf98b71bfn],[-10100890n,0x4d67d81cc88e1228n,0x1d7cfb06666b79b3n,0x7b916728aaa4e70dn],[-20201781n,0xea0c55494e7a552dn,0xb88cb9484bb86c61n,0x8d44893c610bb7dfn],[-40403562n,0xd5fa8c821ec0c24an,0xa80e46e764e0f8b0n,0xa7276bfa432fac7en],[-80807124n,0xb2dae307426f6791n,0xc970b82f58b12918n,0x0472592f7f39190en],[-161614248n,0x7cf51edd8a15f1c9n,0x656dab3498f8e697n,0x12daa2a80e53c807n],[-323228496n,0x3cfe609ab5883c50n,0xbec8b5d22b198871n,0xe18477703b4622b4n],[-646456993n,0x9152447b9d7cda9an,0x3b4d3f6110d77aadn,0xfa81bad1c394adb4n]];var k=class n{constructor(e,t,r,i){this.negative=e,this.st=t,this.Ve=r,this.Te=i}exponent(){return this.st-L.Ue}ot(){return this.st===0&&this.Ve===0n&&this.Te===0n}ut(){return this.st===U(n,F,"f",gt)&&this.Ve===0n&&this.Te===0n}isNaN(){return this.st===U(n,F,"f",gt)&&!(this.Ve===0n&&this.Te===0n)}compareTo(e){if(this.isNaN())return e.isNaN()?0:1;if(e.isNaN())return-1;let t,r;if(this.negative){if(!e.negative)return-1;t=1,r=-1}else{if(e.negative)return 1;t=-1,r=1}return this.st<e.st?t:this.st>e.st?r:this.Ve<e.Ve?t:this.Ve>e.Ve?r:this.Te<e.Te?t:this.Te>e.Te?r:0}debug(){return(this.negative?"+":"-")+U(n,F,"m",ms).call(n,this.Ve)+U(n,F,"m",ms).call(n,this.Te)+"*2^"+this.exponent()}static fromNumber(e){if(isNaN(e))return n.NaN;if(!isFinite(e))return e<0?n._t:n.ct;if(e===0)return Math.sign(1/e)>0?n.lt:n.ft;let t=new DataView(new ArrayBuffer(8));t.setFloat64(0,e);let r=t.getBigUint64(0),i=BigInt.asUintN(64,r<<12n),s=2047&Number(r>>52n);if(s===0){let o=L.et(i);i=o<63?i<<BigInt(o+1):0n,s=-o}return new n(e<0,U(n,F,"m",Zt).call(n,s-1023),i,0n)}static fromString(e){if(e==="NaN")return n.NaN;if(e==="-Infinity")return n._t;if(e==="Infinity"||e==="+Infinity")return n.ct;let t=new Array(e.length).fill(0),r=0,i=0,s=0,o=!1;for(e[r]==="-"?(o=!0,r++):e[r]==="+"&&r++;U(n,F,"m",lr).call(n,e,r);)t[i++]=U(n,F,"m",hr).call(n,e,r++);if(e[r]==="."){let c=++r;for(;U(n,F,"m",lr).call(n,e,r);)t[i++]=U(n,F,"m",hr).call(n,e,r++);s=c-r}if(e[r]==="e"||e[r]==="E"){let c=0;r++;let l=1;e[r]==="-"?(l=-1,r++):e[r]==="+"&&r++;let _=r;for(;U(n,F,"m",lr).call(n,e,r);)if(c=10*c+U(n,F,"m",hr).call(n,e,r++),r-_>9)throw new Error("Exponent too large "+e);if(r===_)throw new Error("Invalid number "+e);s+=c*l}if(i===0||r!==e.length)throw new Error("Invalid number "+e);let a=L.ye(t.slice(0,i),s);return new n(o,a.exponent,a.Ve,a.Te)}};F=k,ms=function(e){return e.toString(16).padStart(16,"0")},lr=function(e,t){let r=e.codePointAt(t);return r!==void 0&&r>=48&&r<=57},hr=function(e,t){return e.codePointAt(t)-48},Zt=function(e){return e+L.Ue},gt={value:Number(L.Fe)},k.lt=new k(!1,0,0n,0n),k.ft=new k(!0,0,0n,0n),k.NaN=new k(!1,U(k,F,"f",gt),1n<<63n,0n),k._t=new k(!0,U(k,F,"f",gt),0n,0n),k.ct=new k(!1,U(k,F,"f",gt),0n,0n),new k(!0,U(k,F,"m",Zt).call(k,63),0n,0n),new k(!1,U(k,F,"m",Zt).call(k,0),0n,0n),new k(!0,U(k,F,"m",Zt).call(k,0),0n,0n);var Gh=new RegExp(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d+))?Z$/);function Je(n){if(te(!!n,39018),typeof n=="string"){let e=0,t=Gh.exec(n);if(te(!!t,46558,{timestamp:n}),t[1]){let i=t[1];i=(i+"000000000").substr(0,9),e=Number(i)}let r=new Date(n);return{seconds:Math.floor(r.getTime()/1e3),nanos:e}}return{seconds:B(n.seconds),nanos:B(n.nanos)}}function B(n){return typeof n=="number"?n:typeof n=="string"?Number(n):0}function wr(n){return typeof n=="string"?oe.fromBase64String(n):oe.fromUint8Array(n)}function ne(n,e){let t={typeString:n};return e&&(t.value=e),t}function Tn(n,e){if(!fc(n))throw new w(E.INVALID_ARGUMENT,"JSON must be an object");let t;for(let r in e)if(e[r]){let i=e[r].typeString,s="value"in e[r]?{value:e[r].value}:void 0,o=e[r].optional;if(!(r in n)){if(o)continue;t=`JSON missing required field: '${r}'`;break}let a=n[r];if(i&&typeof a!==i){t=`JSON field '${r}' must be a ${i}.`;break}if(s!==void 0&&a!==s.value){t=`Expected '${r}' field to equal '${s.value}'`;break}}if(t)throw new w(E.INVALID_ARGUMENT,t);return!0}var Ha=-62135596800,za=1e6,j=class n{static now(){return n.fromMillis(Date.now())}static fromDate(e){return n.fromMillis(e.getTime())}static fromMillis(e){let t=Math.floor(e/1e3),r=Math.floor((e-1e3*t)*za);return new n(t,r)}static fromInstant(e){if(!e||typeof e.ht!="bigint")throw new w(E.INVALID_ARGUMENT,"Invalid Temporal.Instant object provided.");return n._fromEpochNanoseconds(e.ht)}static _fromEpochNanoseconds(e){let t,r;if(e>=0n)t=Number(e/1000000000n),r=Number(e%1000000000n);else{let i=e%1000000000n;i===0n?(t=Number(e/1000000000n),r=0):(t=Number(e/1000000000n-1n),r=Number(i+1000000000n))}return new n(t,r)}constructor(e,t){if(this.seconds=e,this.nanoseconds=t,t<0)throw new w(E.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(t>=1e9)throw new w(E.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(e<Ha)throw new w(E.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e);if(e>=253402300800)throw new w(E.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e)}toDate(){return new Date(this.toMillis())}toMillis(){return 1e3*this.seconds+this.nanoseconds/za}toInstant(){if(typeof Temporal>"u"||!Temporal.Instant)throw new w(E.FAILED_PRECONDITION,"The Temporal object is not available in the current environment.");let e=1000000000n*BigInt(this.seconds)+BigInt(this.nanoseconds);return Temporal.Instant.__PRIVATE_fromEpochNanoseconds(e)}_compareTo(e){return this.seconds===e.seconds?O(this.nanoseconds,e.nanoseconds):O(this.seconds,e.seconds)}isEqual(e){return e.seconds===this.seconds&&e.nanoseconds===this.nanoseconds}toString(){return"Timestamp(seconds="+this.seconds+", nanoseconds="+this.nanoseconds+")"}toJSON(){return{type:n._jsonSchemaVersion,seconds:this.seconds,nanoseconds:this.nanoseconds}}static fromJSON(e){if(Tn(e,n._jsonSchema))return new n(e.seconds,e.nanoseconds)}valueOf(){let e=this.seconds-Ha;return String(e).padStart(12,"0")+"."+String(this.nanoseconds).padStart(9,"0")}};j._jsonSchemaVersion="firestore/timestamp/1.0",j._jsonSchema={type:ne("string",j._jsonSchemaVersion),seconds:ne("number"),nanoseconds:ne("number")};function Kh(n){var t,r;return((r=(((t=n==null?void 0:n.mapValue)==null?void 0:t.fields)||{}).__type__)==null?void 0:r.stringValue)==="server_timestamp"}function gc(n){let e=n.mapValue.fields.__previous_value__;return Kh(e)?gc(e):e}function an(n){let e=Je(n.mapValue.fields.__local_write_time__.timestampValue);return new j(e.seconds,e.nanos)}var _c="__type__",yc="__vector__",Tr="value",Jh="server_timestamp",Ic="__min__",zs="__max__",Oe="__regex__",br="pattern",vr="options",cn="__oid__",bn="__int__",It="__decimal128__",Ke="__request_timestamp__",Ar="seconds",Sr="increment",Kr="__binary__",ur={},C,ie;(ie=C||(C={})).dt="regexValue",ie.Et="bsonObjectIdValue",ie.Vt="int32Value",ie.Tt="decimal128Value",ie.It="bsonTimestampValue",ie.Rt="bsonBinaryValue",ie.At="minKeyValue",ie.Pt="maxKeyValue",ie.yt="maxValue",ie.bt="vectorValue",ie.wt="serverTimestampValue",ie.gt="regularMapValue";var Ga={[yc]:C.bt,[zs]:C.yt,[Jh]:C.wt},Ec={[Oe]:C.dt,[cn]:C.Et,[bn]:C.Vt,[It]:C.Tt,[Ke]:C.It,[Kr]:C.Rt,[Ic]:C.At,[zs]:C.Pt};function Ye(n){if("nullValue"in n)return 0;if("booleanValue"in n)return 2;if("integerValue"in n||"doubleValue"in n)return 3;if("timestampValue"in n)return 4;if("stringValue"in n)return 7;if("bytesValue"in n)return 8;if("referenceValue"in n)return 9;if("geoPointValue"in n)return 11;if("arrayValue"in n)return 13;if(!("mapValue"in n))return D(28295,{value:n});switch(function(r){var o,a,c;if(!((o=r.mapValue)!=null&&o.fields))return C.gt;let i=r.mapValue.fields,s=(a=i[_c])==null?void 0:a.stringValue;if(s&&Ga[s])return Ga[s];if(on(i)===1){let l=Object.keys(i);return(c=Ec[l[0]])!=null?c:C.gt}return C.gt}(n)){case C.wt:return 6;case C.yt:return 9007199254740991;case C.bt:return 14;case C.dt:return 12;case C.Et:return 10;case C.Vt:case C.Tt:return 3;case C.It:return 5;case C.Rt:return 8;case C.At:return 1;case C.Pt:return 16;default:return 15}}function Nr(n,e,t){if(n===e)return!0;let r=Ye(n);if(r!==Ye(e))return!1;switch(r){case 0:case 9007199254740991:case 16:case 1:return!0;case 2:return n.booleanValue===e.booleanValue;case 6:return an(n).isEqual(an(e));case 4:return function(s,o){if(typeof s.timestampValue=="string"&&typeof o.timestampValue=="string"&&s.timestampValue.length===o.timestampValue.length)return s.timestampValue===o.timestampValue;let a=Je(s.timestampValue),c=Je(o.timestampValue);return a.seconds===c.seconds&&a.nanos===c.nanos}(n,e);case 7:return n.stringValue===e.stringValue;case 8:return function(s,o){return vc(s,o)===0}(n,e);case 9:return n.referenceValue===e.referenceValue;case 11:return function(s,o){return B(s.geoPointValue.latitude)===B(o.geoPointValue.latitude)&&B(s.geoPointValue.longitude)===B(o.geoPointValue.longitude)}(n,e);case 3:return function(s,o,a){if(Qe(s)&&Qe(o))return Tc(s,o)===0;if("integerValue"in s&&"integerValue"in o||Pr(s)&&Pr(o))return ln(s)===ln(o);let c,l;return!("doubleValue"in s)||!("doubleValue"in o)?!1:(c=B(s.doubleValue),l=B(o.doubleValue),c===l?Er(c)===Er(l):!!(a===void 0||a.vt)&&isNaN(c)&&isNaN(l))}(n,e,t);case 13:return hc(n.arrayValue.values||[],e.arrayValue.values||[],(i,s)=>Nr(i,s,t));case 14:case 15:return function(s,o,a){let c=s.mapValue.fields||{},l=o.mapValue.fields||{};if(on(c)!==on(l))return!1;for(let _ in c)if(c.hasOwnProperty(_)&&(l[_]===void 0||!Nr(c[_],l[_],a)))return!1;return!0}(n,e,t);case 5:return bc(n,e)===0;case 12:return Ac(n,e)===0;case 10:return Sc(n,e)===0;default:return D(52216,{left:n})}}function un(n,e){return(n.values||[]).find(t=>Nr(t,e))!==void 0}function Rr(n,e){if(n===e)return 0;let t=Ye(n),r=Ye(e);if(t!==r)return O(t,r);switch(t){case 0:case 1:case 16:case 9007199254740991:return 0;case 2:return O(n.booleanValue,e.booleanValue);case 3:return ys(n,e);case 4:return Ja(n.timestampValue,e.timestampValue);case 6:return Ja(an(n),an(e));case 7:return sn(n.stringValue,e.stringValue);case 8:return vc(n,e);case 9:return function(s,o){let a=s.split("/"),c=o.split("/");for(let l=0;l<a.length&&l<c.length;l++){let _=O(a[l],c[l]);if(_!==0)return _}return O(a.length,c.length)}(n.referenceValue,e.referenceValue);case 11:return function(s,o){let a=O(B(s.latitude),B(o.latitude));return a!==0?a:O(B(s.longitude),B(o.longitude))}(n.geoPointValue,e.geoPointValue);case 13:return Ya(n.arrayValue,e.arrayValue);case 14:return function(s,o){var I,T,v,A;let a=s.fields||{},c=o.fields||{},l=(I=a[Tr])==null?void 0:I.arrayValue,_=(T=c[Tr])==null?void 0:T.arrayValue,y=O(((v=l==null?void 0:l.values)==null?void 0:v.length)||0,((A=_==null?void 0:_.values)==null?void 0:A.length)||0);return y!==0?y:Ya(l,_)}(n.mapValue,e.mapValue);case 15:return function(s,o){if(s===ur&&o===ur)return 0;if(s===ur)return 1;if(o===ur)return-1;let a=s.fields||{},c=Object.keys(a),l=o.fields||{},_=Object.keys(l);c.sort(),_.sort();for(let y=0;y<c.length&&y<_.length;++y){let I=sn(c[y],_[y]);if(I!==0)return I;let T=Rr(a[c[y]],l[_[y]]);if(T!==0)return T}return O(c.length,_.length)}(n.mapValue,e.mapValue);case 5:return bc(n,e);case 12:return Ac(n,e);case 10:return Sc(n,e);default:throw D(23264,{xt:t})}}function ln(n){let e;return e=Pr(n)?n.mapValue.fields[bn].integerValue:n.integerValue||n.doubleValue,B(e)}function wc(n){return n.mapValue.fields[It].stringValue}function ys(n,e){if(Qe(n)||Qe(e))return Tc(n,e);let t=ln(n),r=ln(e);return isNaN(t)?isNaN(r)?0:-1:isNaN(r)?1:O(t,r)}function Tc(n,e){let t=Ka(n),r=Ka(e);return t.ot()&&r.ot()?0:t.isNaN()?r.isNaN()?0:-1:r.isNaN()?1:t.compareTo(r)}function Ka(n){return Qe(n)?k.fromString(wc(n)):k.fromNumber(ln(n))}function Ja(n,e){if(typeof n=="string"&&typeof e=="string"&&n.length===e.length)return O(n,e);let t=Je(n),r=Je(e),i=O(t.seconds,r.seconds);return i!==0?i:O(t.nanos,r.nanos)}function Ya(n,e){let t=n.values||[],r=e.values||[];for(let i=0;i<t.length&&i<r.length;++i){let s=Rr(t[i],r[i]);if(s!==void 0&&s!==0)return s}return O(t.length,r.length)}function bc(n,e){var a,c,l,_,y,I,T,v,A,S,K,Z;let t=(l=(c=(a=n.mapValue.fields)==null?void 0:a[Ke].mapValue)==null?void 0:c.fields)==null?void 0:l[Ar],r=(I=(y=(_=e.mapValue.fields)==null?void 0:_[Ke].mapValue)==null?void 0:y.fields)==null?void 0:I[Ar],i=(A=(v=(T=n.mapValue.fields)==null?void 0:T[Ke].mapValue)==null?void 0:v.fields)==null?void 0:A[Sr],s=(Z=(K=(S=e.mapValue.fields)==null?void 0:S[Ke].mapValue)==null?void 0:K.fields)==null?void 0:Z[Sr],o=ys(t,r);return o!==0?o:ys(i,s)}function Qa(n){var a;if("bytesValue"in n)return{subtype:0,bytes:wr(n.bytesValue)};let e=(a=n.mapValue)==null?void 0:a.fields,t=e==null?void 0:e[Kr],r=t==null?void 0:t.bytesValue;if(!r)throw new Error("Received incorrect value for BsonBinaryData");let i=wr(r).toUint8Array();if(i.length===0)throw new Error("Received empty bytesValue for BsonBinaryData");let s=i[0],o=i.slice(1);return{subtype:s,bytes:oe.fromUint8Array(o)}}function vc(n,e){let t=Qa(n),r=Qa(e);return t.subtype!==r.subtype?t.subtype<r.subtype?-1:1:t.bytes.compareTo(r.bytes)}function Ac(n,e){var l,_,y,I,T,v,A,S,K,Z,se,ce,Pe,re,f,u,h,m,p,g;let t=n.mapValue.fields,r=(T=(I=(y=(_=(l=t==null?void 0:t[Oe])==null?void 0:l.mapValue)==null?void 0:_.fields)==null?void 0:y[br])==null?void 0:I.stringValue)!=null?T:"",i=(Z=(K=(S=(A=(v=t==null?void 0:t[Oe])==null?void 0:v.mapValue)==null?void 0:A.fields)==null?void 0:S[vr])==null?void 0:K.stringValue)!=null?Z:"",s=e.mapValue.fields,o=(f=(re=(Pe=(ce=(se=s==null?void 0:s[Oe])==null?void 0:se.mapValue)==null?void 0:ce.fields)==null?void 0:Pe[br])==null?void 0:re.stringValue)!=null?f:"",a=(g=(p=(m=(h=(u=s==null?void 0:s[Oe])==null?void 0:u.mapValue)==null?void 0:h.fields)==null?void 0:m[vr])==null?void 0:p.stringValue)!=null?g:"",c=sn(r,o);return c!==0?c:O(i,a)}function Sc(n,e){var t,r,i,s,o,a;return sn((i=(r=(t=n.mapValue.fields)==null?void 0:t[cn])==null?void 0:r.stringValue)!=null?i:"",(a=(o=(s=e.mapValue.fields)==null?void 0:s[cn])==null?void 0:o.stringValue)!=null?a:"")}function Xa(n,e){return{referenceValue:`projects/${n.projectId}/databases/${n.database}/documents/${e.path.canonicalString()}`}}function Qe(n){var t;if(!((t=n.mapValue)!=null&&t.fields))return!1;let e=n.mapValue.fields;return on(e)===1&&e[It]&&!!e[It].stringValue}function Pr(n){var t,r;if(!((t=n.mapValue)!=null&&t.fields))return!1;let e=n.mapValue.fields;return on(e)===1&&((r=e[bn])==null?void 0:r.integerValue)!==void 0}function Nc(n){return!!n&&"arrayValue"in n}function Za(n){return!!n&&"nullValue"in n}function ec(n){return!(!function(t){return!!t&&"doubleValue"in t}(n)||!isNaN(Number(n.doubleValue)))||!(!Qe(n)||wc(n)!=="NaN")}function os(n){return!!n&&"mapValue"in n}function en(n){if(n.geoPointValue)return{geoPointValue:{...n.geoPointValue}};if(n.timestampValue&&typeof n.timestampValue=="object")return{timestampValue:{...n.timestampValue}};if(n.mapValue){let e={mapValue:{fields:{}}};return wn(n.mapValue.fields,(t,r)=>e.mapValue.fields[t]=en(r)),e}if(n.arrayValue){let e={arrayValue:{values:[]}};for(let t=0;t<(n.arrayValue.values||[]).length;++t)e.arrayValue.values[t]=en(n.arrayValue.values[t]);return e}return{...n}}new Set(Object.values(Ec));var kr=class{constructor(e,t){this.position=e,this.inclusive=t}};var Cr=class{},ae=class n extends Cr{constructor(e,t,r){super(),this.field=e,this.op=t,this.value=r}static create(e,t,r){return e.isKeyField()?t==="in"||t==="not-in"?this.createKeyFieldInFilter(e,t,r):new Is(e,t,r):t==="array-contains"?new Ts(e,r):t==="in"?new bs(e,r):t==="not-in"?new vs(e,r):t==="array-contains-any"?new As(e,r):new n(e,t,r)}static createKeyFieldInFilter(e,t,r){return t==="in"?new Es(e,r):new ws(e,r)}matches(e){let t=e.data.field(this.field);return this.op==="!="?t!==null&&t.nullValue===void 0&&this.matchesComparison(Rr(t,this.value)):t!==null&&Ye(this.value)===Ye(t)&&this.matchesComparison(Rr(t,this.value))}matchesComparison(e){switch(this.op){case"<":return e<0;case"<=":return e<=0;case"==":return e===0;case"!=":return e!==0;case">":return e>0;case">=":return e>=0;default:return D(47266,{operator:this.op})}}isInequality(){return["<","<=",">",">=","!=","not-in"].indexOf(this.op)>=0}getFlattenedFilters(){return[this]}getFilters(){return[this]}},hn=class n extends Cr{constructor(e,t){super(),this.filters=e,this.op=t,this.Dt=null}static create(e,t){return new n(e,t)}matches(e){return function(r){return r.op==="and"}(this)?this.filters.find(t=>!t.matches(e))===void 0:this.filters.find(t=>t.matches(e))!==void 0}getFlattenedFilters(){return this.Dt!==null||(this.Dt=this.filters.reduce((e,t)=>e.concat(t.getFlattenedFilters()),[])),this.Dt}getFilters(){return Object.assign([],this.filters)}};var Is=class extends ae{constructor(e,t,r){super(e,t,r),this.key=z.fromName(r.referenceValue)}matches(e){let t=z.comparator(e.key,this.key);return this.matchesComparison(t)}},Es=class extends ae{constructor(e,t){super(e,"in",t),this.keys=Rc("in",t)}matches(e){return this.keys.some(t=>t.isEqual(e.key))}},ws=class extends ae{constructor(e,t){super(e,"not-in",t),this.keys=Rc("not-in",t)}matches(e){return!this.keys.some(t=>t.isEqual(e.key))}};function Rc(n,e){var t;return(((t=e.arrayValue)==null?void 0:t.values)||[]).map(r=>z.fromName(r.referenceValue))}var Ts=class extends ae{constructor(e,t){super(e,"array-contains",t)}matches(e){let t=e.data.field(this.field);return Nc(t)&&un(t.arrayValue,this.value)}},bs=class extends ae{constructor(e,t){super(e,"in",t)}matches(e){let t=e.data.field(this.field);return t!==null&&un(this.value.arrayValue,t)}},vs=class extends ae{constructor(e,t){super(e,"not-in",t)}matches(e){if(un(this.value.arrayValue,{nullValue:"NULL_VALUE"}))return!1;let t=e.data.field(this.field);return t!==null&&t.nullValue===void 0&&!un(this.value.arrayValue,t)}},As=class extends ae{constructor(e,t){super(e,"array-contains-any",t)}matches(e){let t=e.data.field(this.field);return!(!Nc(t)||!t.arrayValue.values)&&t.arrayValue.values.some(r=>un(this.value.arrayValue,r))}};var Et=class{constructor(e,t="asc"){this.field=e,this.dir=t}};var W=class n{static fromTimestamp(e){return new n(e)}static min(){return new n(new j(0,0))}static max(){return new n(new j(253402300799,999999999))}constructor(e){this.timestamp=e}compareTo(e){return this.timestamp._compareTo(e.timestamp)}isEqual(e){return this.timestamp.isEqual(e.timestamp)}toMicroseconds(){return 1e6*this.timestamp.seconds+this.timestamp.nanoseconds/1e3}toString(){return"SnapshotVersion("+this.timestamp.toString()+")"}toTimestamp(){return this.timestamp}};var Ss=class n{constructor(e,t){this.comparator=e,this.root=t||de.EMPTY}insert(e,t){return new n(this.comparator,this.root.insert(e,t,this.comparator).copy(null,null,de.BLACK,null,null))}remove(e){return new n(this.comparator,this.root.remove(e,this.comparator).copy(null,null,de.BLACK,null,null))}get(e){let t=this.root;for(;!t.isEmpty();){let r=this.comparator(e,t.key);if(r===0)return t.value;r<0?t=t.left:r>0&&(t=t.right)}return null}indexOf(e){let t=0,r=this.root;for(;!r.isEmpty();){let i=this.comparator(e,r.key);if(i===0)return t+r.left.size;i<0?r=r.left:(t+=r.left.size+1,r=r.right)}return-1}isEmpty(){return this.root.isEmpty()}get size(){return this.root.size}minKey(){return this.root.minKey()}maxKey(){return this.root.maxKey()}inorderTraversal(e){return this.root.inorderTraversal(e)}forEach(e){this.inorderTraversal((t,r)=>(e(t,r),!1))}toString(){let e=[];return this.inorderTraversal((t,r)=>(e.push(`${t}:${r}`),!1)),`{${e.join(", ")}}`}reverseTraversal(e){return this.root.reverseTraversal(e)}getIterator(){return new _t(this.root,null,this.comparator,!1)}getIteratorFrom(e){return new _t(this.root,e,this.comparator,!1)}getReverseIterator(){return new _t(this.root,null,this.comparator,!0)}getReverseIteratorFrom(e){return new _t(this.root,e,this.comparator,!0)}},_t=class{constructor(e,t,r,i){this.isReverse=i,this.nodeStack=[];let s=1;for(;!e.isEmpty();)if(s=t?r(e.key,t):1,t&&i&&(s*=-1),s<0)e=this.isReverse?e.left:e.right;else{if(s===0){this.nodeStack.push(e);break}this.nodeStack.push(e),e=this.isReverse?e.right:e.left}}getNext(){let e=this.nodeStack.pop(),t={key:e.key,value:e.value};if(this.isReverse)for(e=e.left;!e.isEmpty();)this.nodeStack.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack.push(e),e=e.left;return t}hasNext(){return this.nodeStack.length>0}peek(){if(this.nodeStack.length===0)return null;let e=this.nodeStack[this.nodeStack.length-1];return{key:e.key,value:e.value}}},de=class n{constructor(e,t,r,i,s){this.key=e,this.value=t,this.color=r!=null?r:n.RED,this.left=i!=null?i:n.EMPTY,this.right=s!=null?s:n.EMPTY,this.size=this.left.size+1+this.right.size}copy(e,t,r,i,s){return new n(e!=null?e:this.key,t!=null?t:this.value,r!=null?r:this.color,i!=null?i:this.left,s!=null?s:this.right)}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min(){return this.left.isEmpty()?this:this.left.min()}minKey(){return this.min().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,r){let i=this,s=r(e,i.key);return i=s<0?i.copy(null,null,null,i.left.insert(e,t,r),null):s===0?i.copy(null,t,null,null,null):i.copy(null,null,null,null,i.right.insert(e,t,r)),i.fixUp()}removeMin(){if(this.left.isEmpty())return n.EMPTY;let e=this;return e.left.isRed()||e.left.left.isRed()||(e=e.moveRedLeft()),e=e.copy(null,null,null,e.left.removeMin(),null),e.fixUp()}remove(e,t){let r,i=this;if(t(e,i.key)<0)i.left.isEmpty()||i.left.isRed()||i.left.left.isRed()||(i=i.moveRedLeft()),i=i.copy(null,null,null,i.left.remove(e,t),null);else{if(i.left.isRed()&&(i=i.rotateRight()),i.right.isEmpty()||i.right.isRed()||i.right.left.isRed()||(i=i.moveRedRight()),t(e,i.key)===0){if(i.right.isEmpty())return n.EMPTY;r=i.right.min(),i=i.copy(r.key,r.value,null,null,i.right.removeMin())}i=i.copy(null,null,null,null,i.right.remove(e,t))}return i.fixUp()}isRed(){return this.color}fixUp(){let e=this;return e.right.isRed()&&!e.left.isRed()&&(e=e.rotateLeft()),e.left.isRed()&&e.left.left.isRed()&&(e=e.rotateRight()),e.left.isRed()&&e.right.isRed()&&(e=e.colorFlip()),e}moveRedLeft(){let e=this.colorFlip();return e.right.left.isRed()&&(e=e.copy(null,null,null,null,e.right.rotateRight()),e=e.rotateLeft(),e=e.colorFlip()),e}moveRedRight(){let e=this.colorFlip();return e.left.left.isRed()&&(e=e.rotateRight(),e=e.colorFlip()),e}rotateLeft(){let e=this.copy(null,null,n.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight(){let e=this.copy(null,null,n.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip(){let e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth(){let e=this.check();return Math.pow(2,e)<=this.size+1}check(){if(this.isRed()&&this.left.isRed())throw D(43730,{key:this.key,value:this.value});if(this.right.isRed())throw D(14113,{key:this.key,value:this.value});let e=this.left.check();if(e!==this.right.check())throw D(27949);return e+(this.isRed()?0:1)}};de.EMPTY=null,de.RED=!0,de.BLACK=!1;de.EMPTY=new class{constructor(){this.size=0}get key(){throw D(57766)}get value(){throw D(16141)}get color(){throw D(16727)}get left(){throw D(29726)}get right(){throw D(36894)}copy(e,t,r,i,s){return this}insert(e,t,r){return new de(e,t)}remove(e,t){return this}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}isRed(){return!1}checkMaxDepth(){return!0}check(){return 0}};var Dr=class n{constructor(e){this.comparator=e,this.data=new Ss(this.comparator)}has(e){return this.data.get(e)!==null}first(){return this.data.minKey()}last(){return this.data.maxKey()}get size(){return this.data.size}indexOf(e){return this.data.indexOf(e)}forEach(e){this.data.inorderTraversal((t,r)=>(e(t),!1))}forEachInRange(e,t){let r=this.data.getIteratorFrom(e[0]);for(;r.hasNext();){let i=r.getNext();if(this.comparator(i.key,e[1])>=0)return;t(i.key)}}forEachWhile(e,t){let r;for(r=t!==void 0?this.data.getIteratorFrom(t):this.data.getIterator();r.hasNext();)if(!e(r.getNext().key))return}firstAfterOrEqual(e){let t=this.data.getIteratorFrom(e);return t.hasNext()?t.getNext().key:null}getIterator(){return new Or(this.data.getIterator())}getIteratorFrom(e){return new Or(this.data.getIteratorFrom(e))}add(e){return this.copy(this.data.remove(e).insert(e,!0))}delete(e){return this.has(e)?this.copy(this.data.remove(e)):this}isEmpty(){return this.data.isEmpty()}unionWith(e){let t=this;return t.size<e.size&&(t=e,e=this),e.forEach(r=>{t=t.add(r)}),t}isEqual(e){if(!(e instanceof n)||this.size!==e.size)return!1;let t=this.data.getIterator(),r=e.data.getIterator();for(;t.hasNext();){let i=t.getNext().key,s=r.getNext().key;if(this.comparator(i,s)!==0)return!1}return!0}toArray(){let e=[];return this.forEach(t=>{e.push(t)}),e}toString(){let e=[];return this.forEach(t=>e.push(t)),"SortedSet("+e.toString()+")"}copy(e){let t=new n(this.comparator);return t.data=e,t}},Or=class{constructor(e){this.iter=e}getNext(){return this.iter.getNext().key}hasNext(){return this.iter.hasNext()}};var wt=class n{constructor(e){this.fields=e,e.sort(Ve.comparator)}static empty(){return new n([])}unionWith(e){let t=new Dr(Ve.comparator);for(let r of this.fields)t=t.add(r);for(let r of e)t=t.add(r);return new n(t.toArray())}covers(e){for(let t of this.fields)if(t.isPrefixOf(e))return!0;return!1}isEqual(e){return hc(this.fields,e.fields,(t,r)=>t.isEqual(r))}};var ee=class n{constructor(e){this.value=e}static empty(){return new n({mapValue:{}})}field(e){if(e.isEmpty())return this.value;{let t=this.value;for(let r=0;r<e.length-1;++r)if(t=(t.mapValue.fields||{})[e.get(r)],!os(t))return null;return t=(t.mapValue.fields||{})[e.lastSegment()],t||null}}set(e,t){this.getFieldsMap(e.popLast())[e.lastSegment()]=en(t)}setAll(e){let t=Ve.emptyPath(),r={},i=[];e.forEach((o,a)=>{if(!t.isImmediateParentOf(a)){let c=this.getFieldsMap(t);this.applyChanges(c,r,i),r={},i=[],t=a.popLast()}o?r[a.lastSegment()]=en(o):i.push(a.lastSegment())});let s=this.getFieldsMap(t);this.applyChanges(s,r,i)}delete(e){let t=this.field(e.popLast());os(t)&&t.mapValue.fields&&delete t.mapValue.fields[e.lastSegment()]}isEqual(e){return Nr(this.value,e.value)}getFieldsMap(e){let t=this.value;t.mapValue.fields||(t.mapValue={fields:{}});for(let r=0;r<e.length;++r){let i=t.mapValue.fields[e.get(r)];os(i)&&i.mapValue.fields||(i={mapValue:{fields:{}}},t.mapValue.fields[e.get(r)]=i),t=i}return t.mapValue.fields}applyChanges(e,t,r){wn(t,(i,s)=>e[i]=s);for(let i of r)delete e[i]}clone(){return new n(en(this.value))}};var dn=class n{constructor(e,t,r,i,s,o,a){this.key=e,this.documentType=t,this.version=r,this.readTime=i,this.createTime=s,this.data=o,this.documentState=a}static newInvalidDocument(e){return new n(e,0,W.min(),W.min(),W.min(),ee.empty(),0)}static newFoundDocument(e,t,r,i){return new n(e,1,t,W.min(),r,i,0)}static newNoDocument(e,t){return new n(e,2,t,W.min(),W.min(),ee.empty(),0)}static newUnknownDocument(e,t){return new n(e,3,t,W.min(),W.min(),ee.empty(),2)}convertToFoundDocument(e,t){return!this.createTime.isEqual(W.min())||this.documentType!==2&&this.documentType!==0||(this.createTime=e),this.version=e,this.documentType=1,this.data=t,this.documentState=0,this}convertToNoDocument(e){return this.version=e,this.documentType=2,this.data=ee.empty(),this.documentState=0,this}convertToUnknownDocument(e){return this.version=e,this.documentType=3,this.data=ee.empty(),this.documentState=2,this}setHasCommittedMutations(){return this.documentState=2,this}setHasLocalMutations(){return this.documentState=1,this.version=W.min(),this}setReadTime(e){return this.readTime=e,this}get hasLocalMutations(){return this.documentState===1}get hasCommittedMutations(){return this.documentState===2}get hasPendingWrites(){return this.hasLocalMutations||this.hasCommittedMutations}isValidDocument(){return this.documentType!==0}isFoundDocument(){return this.documentType===1}isNoDocument(){return this.documentType===2}isUnknownDocument(){return this.documentType===3}isEqual(e){return e instanceof n&&this.key.isEqual(e.key)&&this.version.isEqual(e.version)&&this.documentType===e.documentType&&this.documentState===e.documentState&&this.data.isEqual(e.data)}mutableCopy(){return new n(this.key,this.documentType,this.version,this.readTime,this.createTime,this.data.clone(),this.documentState)}toString(){return`Document(${this.key}, ${this.version}, ${JSON.stringify(this.data.value)}, {createTime: ${this.createTime}}), {documentType: ${this.documentType}}), {documentState: ${this.documentState}})`}};var Ns=class{constructor(e,t=null,r=[],i=[],s=null,o=null,a=null){this.path=e,this.collectionGroup=t,this.orderBy=r,this.filters=i,this.limit=s,this.startAt=o,this.endAt=a,this.Nt=null}};function tc(n,e=null,t=[],r=[],i=null,s=null,o=null){return new Ns(n,e,t,r,i,s,o)}var Tt=class{constructor(e,t=null,r=[],i=[],s=null,o="F",a=null,c=null){this.path=e,this.collectionGroup=t,this.explicitOrderBy=r,this.filters=i,this.limit=s,this.limitType=o,this.startAt=a,this.endAt=c,this.St=null,this.Ct=null,this.Bt=null,this.startAt,this.endAt}};function Yh(n){return n.collectionGroup!==null}function Qh(n){let e=En(n);if(e.St===null){e.St=[];let t=new Set;for(let s of e.explicitOrderBy)e.St.push(s),t.add(s.field.canonicalString());let r=e.explicitOrderBy.length>0?e.explicitOrderBy[e.explicitOrderBy.length-1].dir:"asc";(function(o){let a=new Dr(Ve.comparator);return o.filters.forEach(c=>{c.getFlattenedFilters().forEach(l=>{l.isInequality()&&(a=a.add(l.field))})}),a})(e).forEach(s=>{t.has(s.canonicalString())||s.isKeyField()||e.St.push(new Et(s,r))}),t.has(Ve.keyField().canonicalString())||e.St.push(new Et(Ve.keyField(),r))}return e.St}function Xh(n){let e=En(n);return e.Ct||(e.Ct=Zh(e,Qh(n))),e.Ct}function Zh(n,e){if(n.limitType==="F")return tc(n.path,n.collectionGroup,e,n.filters,n.limit,n.startAt,n.endAt);{e=e.map(i=>{let s=i.dir==="desc"?"asc":"desc";return new Et(i.field,s)});let t=n.endAt?new kr(n.endAt.position,n.endAt.inclusive):null,r=n.startAt?new kr(n.startAt.position,n.startAt.inclusive):null;return tc(n.path,n.collectionGroup,e,n.filters,n.limit,t,r)}}function Rs(n,e){let t=n.filters.concat([e]);return new Tt(n.path,n.collectionGroup,n.explicitOrderBy.slice(),t,n.limit,n.limitType,n.startAt,n.endAt)}function Pc(n,e){if(n.useProto3Json){if(isNaN(e))return{doubleValue:"NaN"};if(e===1/0)return{doubleValue:"Infinity"};if(e===-1/0)return{doubleValue:"-Infinity"}}return{doubleValue:Er(e)?"-0":e}}function dr(n){return{integerValue:""+n}}function ed(n,e,t){return function(i){return typeof i=="number"&&Number.isInteger(i)&&!Er(i)&&i<=Number.MAX_SAFE_INTEGER&&i>=Number.MIN_SAFE_INTEGER}(e)?dr(e):Pc(n,e)}var bt=class{constructor(){this._=void 0}},Vr=class extends bt{},Ps=class extends bt{constructor(e){super(),this.elements=e}},ks=class extends bt{constructor(e){super(),this.elements=e}},fn=class extends bt{constructor(e,t){super(),this.serializer=e,this.Qt=t}},Cs=class extends fn{},Ds=class extends fn{},Os=class extends fn{};var Vs=class{constructor(e,t){this.field=e,this.transform=t}},Ne=class n{constructor(e,t){this.updateTime=e,this.exists=t}static none(){return new n}static exists(e){return new n(void 0,e)}static updateTime(e){return new n(e)}get isNone(){return this.updateTime===void 0&&this.exists===void 0}isEqual(e){return this.exists===e.exists&&(this.updateTime?!!e.updateTime&&this.updateTime.isEqual(e.updateTime):!e.updateTime)}},vt=class{},Lr=class extends vt{constructor(e,t,r,i=[]){super(),this.key=e,this.value=t,this.precondition=r,this.fieldTransforms=i,this.type=0}getFieldMask(){return null}},pn=class extends vt{constructor(e,t,r,i,s=[]){super(),this.key=e,this.data=t,this.fieldMask=r,this.precondition=i,this.fieldTransforms=s,this.type=1}getFieldMask(){return this.fieldMask}},At=class extends vt{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=2,this.fieldTransforms=[]}getFieldMask(){return null}},xr=class extends vt{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=3,this.fieldTransforms=[]}getFieldMask(){return null}};var td={asc:"ASCENDING",desc:"DESCENDING"},nd={"<":"LESS_THAN","<=":"LESS_THAN_OR_EQUAL",">":"GREATER_THAN",">=":"GREATER_THAN_OR_EQUAL","==":"EQUAL","!=":"NOT_EQUAL","array-contains":"ARRAY_CONTAINS",in:"IN","not-in":"NOT_IN","array-contains-any":"ARRAY_CONTAINS_ANY"},rd={and:"AND",or:"OR"},Ls=class{constructor(e,t){this.databaseId=e,this.useProto3Json=t}};function fr(n,e){return n.useProto3Json?`${new Date(1e3*e.seconds).toISOString().replace(/\.\d*/,"").replace("Z","")}.${("000000000"+e.nanoseconds).slice(-9)}Z`:{seconds:""+e.seconds,nanos:e.nanoseconds}}function nc(n,e){return n.useProto3Json?e.toBase64():e.toUint8Array()}function id(n,e){return fr(n,e.toTimestamp())}function tn(n){return te(!!n,49232),W.fromTimestamp(function(t){let r=Je(t);return new j(r.seconds,r.nanos)}(n))}function Gs(n,e){return xs(n,e).canonicalString()}function xs(n,e){let t=function(i){return new M(["projects",i.projectId,"databases",i.database])}(n).child("documents");return e===void 0?t:t.child(e)}function Mr(n,e){return Gs(n.databaseId,e.path)}function Ms(n,e){let t=function(i){let s=M.fromString(i);return te(Cc(s),10190,{key:s.toString()}),s}(e);if(t.get(1)!==n.databaseId.projectId)throw new w(E.INVALID_ARGUMENT,"Tried to deserialize key from different project: "+t.get(1)+" vs "+n.databaseId.projectId);if(t.get(3)!==n.databaseId.database)throw new w(E.INVALID_ARGUMENT,"Tried to deserialize key from different database: "+t.get(3)+" vs "+n.databaseId.database);return new z(function(i){return te(i.length>4&&i.get(4)==="documents",29091,{key:i.toString()}),i.popFirst(5)}(t))}function rc(n,e,t){return{name:Mr(n,e),fields:t.value.mapValue.fields}}function sd(n,e){return"found"in e?function(r,i){te(!!i.found,43571),i.found.name,i.found.updateTime;let s=Ms(r,i.found.name),o=tn(i.found.updateTime),a=i.found.createTime?tn(i.found.createTime):W.min(),c=new ee({mapValue:{fields:i.found.fields}});return dn.newFoundDocument(s,o,a,c)}(n,e):"missing"in e?function(r,i){te(!!i.missing,3894),te(!!i.readTime,22933);let s=Ms(r,i.missing),o=tn(i.readTime);return dn.newNoDocument(s,o)}(n,e):D(7234,{result:e})}function od(n,e){let t;if(e instanceof Lr)t={update:rc(n,e.key,e.value)};else if(e instanceof At)t={delete:Mr(n,e.key)};else if(e instanceof pn)t={update:rc(n,e.key,e.data),updateMask:hd(e.fieldMask)};else{if(!(e instanceof xr))return D(16599,{Ot:e.type});t={verify:Mr(n,e.key)}}return e.fieldTransforms.length>0&&(t.updateTransforms=e.fieldTransforms.map(r=>function(s,o){let a=o.transform;if(a instanceof Vr)return{fieldPath:o.field.canonicalString(),setToServerValue:"REQUEST_TIME"};if(a instanceof Ps)return{fieldPath:o.field.canonicalString(),appendMissingElements:{values:a.elements}};if(a instanceof ks)return{fieldPath:o.field.canonicalString(),removeAllFromArray:{values:a.elements}};if(a instanceof Cs)return{fieldPath:o.field.canonicalString(),increment:a.Qt};if(a instanceof Ds)return{fieldPath:o.field.canonicalString(),minimum:a.Qt};if(a instanceof Os)return{fieldPath:o.field.canonicalString(),maximum:a.Qt};throw D(20930,{transform:o.transform})}(0,r))),e.precondition.isNone||(t.currentDocument=function(i,s){return s.updateTime!==void 0?{updateTime:id(i,s.updateTime)}:s.exists!==void 0?{exists:s.exists}:D(27497)}(n,e.precondition)),t}function ad(n,e){let t={structuredQuery:{}},r=e.path,i;e.collectionGroup!==null?(i=r,t.structuredQuery.from=[{collectionId:e.collectionGroup,allDescendants:!0}]):(i=r.popLast(),t.structuredQuery.from=[{collectionId:r.lastSegment()}]),t.parent=function(l,_){return Gs(l.databaseId,_)}(n,i);let s=function(l){if(l.length!==0)return kc(hn.create(l,"and"))}(e.filters);s&&(t.structuredQuery.where=s);let o=function(l){if(l.length!==0)return l.map(_=>function(I){return{field:mt(I.field),direction:cd(I.dir)}}(_))}(e.orderBy);o&&(t.structuredQuery.orderBy=o);let a=function(l,_){return l.useProto3Json||mc(_)?_:{value:_}}(n,e.limit);return a!==null&&(t.structuredQuery.limit=a),e.startAt&&(t.structuredQuery.startAt=function(l){return{before:l.inclusive,values:l.position}}(e.startAt)),e.endAt&&(t.structuredQuery.endAt=function(l){return{before:!l.inclusive,values:l.position}}(e.endAt)),{Mt:t,parent:i}}function cd(n){return td[n]}function ud(n){return nd[n]}function ld(n){return rd[n]}function mt(n){return{fieldPath:n.canonicalString()}}function kc(n){return n instanceof ae?function(t){if(t.op==="=="){if(ec(t.value))return{unaryFilter:{field:mt(t.field),op:"IS_NAN"}};if(Za(t.value))return{unaryFilter:{field:mt(t.field),op:"IS_NULL"}}}else if(t.op==="!="){if(ec(t.value))return{unaryFilter:{field:mt(t.field),op:"IS_NOT_NAN"}};if(Za(t.value))return{unaryFilter:{field:mt(t.field),op:"IS_NOT_NULL"}}}return{fieldFilter:{field:mt(t.field),op:ud(t.op),value:t.value}}}(n):n instanceof hn?function(t){let r=t.getFilters().map(i=>kc(i));return r.length===1?r[0]:{compositeFilter:{op:ld(t.op),filters:r}}}(n):D(54877,{filter:n})}function hd(n){let e=[];return n.fields.forEach(t=>e.push(t.canonicalString())),{fieldPaths:e}}function Cc(n){return n.length>=4&&n.get(0)==="projects"&&n.get(2)==="databases"}function Dc(n){return!!n&&typeof n._toProto=="function"&&n._protoValueType==="ProtoValue"}function Ks(n){return new Ls(n,!0)}var Us=class{},Fs=class extends Us{constructor(e,t,r,i){super(),this.authCredentials=e,this.appCheckCredentials=t,this.connection=r,this.serializer=i,this.qt=!1}Lt(){if(this.qt)throw new w(E.FAILED_PRECONDITION,"The client has already been terminated.")}le(e,t,r,i){return this.Lt(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then(([s,o])=>this.connection.le(e,xs(t,r),i,s,o)).catch(s=>{throw s.name==="FirebaseError"?(s.code===E.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),s):new w(E.UNKNOWN,s.toString())})}me(e,t,r,i,s){return this.Lt(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then(([o,a])=>this.connection.me(e,xs(t,r),i,o,a,s)).catch(o=>{throw o.name==="FirebaseError"?(o.code===E.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),o):new w(E.UNKNOWN,o.toString())})}terminate(){this.qt=!0,this.connection.terminate()}};async function vn(n,e){let t=En(n),r={writes:e.map(i=>od(t.serializer,i))};await t.le("Commit",t.serializer.databaseId,M.emptyPath(),r)}async function Oc(n,e){let t=En(n),r={documents:e.map(a=>Mr(t.serializer,a))},i=await t.me("BatchGetDocuments",t.serializer.databaseId,M.emptyPath(),r,e.length),s=new Map;i.forEach(a=>{let c=sd(t.serializer,a);s.set(c.key.toString(),c)});let o=[];return e.forEach(a=>{let c=s.get(a.toString());te(!!c,55234,{key:a}),o.push(c)}),o}async function dd(n,e){let t=En(n),{Mt:r,parent:i}=ad(t.serializer,Xh(e));return(await t.me("RunQuery",t.serializer.databaseId,i,{structuredQuery:r.structuredQuery})).filter(s=>!!s.document).map(s=>function(a,c,l){let _=Ms(a,c.name),y=tn(c.updateTime),I=c.createTime?tn(c.createTime):W.min(),T=new ee({mapValue:{fields:c.fields}}),v=dn.newFoundDocument(_,y,I,T);return l?v.setHasCommittedMutations():v}(t.serializer,s.document,void 0))}var Vc="ComponentProvider",nn=new Map;function rt(n){if(n._terminated)throw new w(E.FAILED_PRECONDITION,"The client has already been terminated.");if(!nn.has(n)){rn(Vc,"Initializing Datastore");let e=function(s){return new gs(s)}(function(s,o,a,c,l){return new hs(s,o,a,l.host,l.ssl,l.experimentalForceLongPolling,l.experimentalAutoDetectLongPolling,pc(l.experimentalLongPollingOptions),l.useFetchStreams,l.isUsingEmulator,c,l._customHeaders,l.grpcFlowControlWindow)}(n._databaseId,n.app.options.appId||"",n._persistenceKey,n.app.options.apiKey,n._freezeSettings())),t=Ks(n._databaseId),r=function(s,o,a,c){return new Fs(s,o,a,c)}(n._authCredentials,n._appCheckCredentials,e,t);nn.set(n,r)}return nn.get(n)}var fd=1048576,Lc="firestore.googleapis.com",ic=!0,Ur=class{constructor(e){var t,r;if(e.host===void 0){if(e.ssl!==void 0)throw new w(E.INVALID_ARGUMENT,"Can't provide ssl option if host option is not set");this.host=Lc,this.ssl=ic}else this.host=e.host,this.ssl=(t=e.ssl)!=null?t:ic;if(this.isUsingEmulator=e.emulatorOptions!==void 0,this.credentials=e.credentials,this.ignoreUndefinedProperties=!!e.ignoreUndefinedProperties,this.localCache=e.localCache,e._customHeaders&&(this._customHeaders={...e._customHeaders}),e.cacheSizeBytes===void 0)this.cacheSizeBytes=41943040;else{if(e.cacheSizeBytes!==-1&&e.cacheSizeBytes<fd)throw new w(E.INVALID_ARGUMENT,"cacheSizeBytes must be at least 1048576");this.cacheSizeBytes=e.cacheSizeBytes}if(function(s,o,a,c){if(o===!0&&c===!0)throw new w(E.INVALID_ARGUMENT,`${s} and ${a} cannot be used together.`)}("experimentalForceLongPolling",e.experimentalForceLongPolling,"experimentalAutoDetectLongPolling",e.experimentalAutoDetectLongPolling),this.experimentalForceLongPolling=!!e.experimentalForceLongPolling,this.experimentalForceLongPolling?this.experimentalAutoDetectLongPolling=!1:e.experimentalAutoDetectLongPolling===void 0?this.experimentalAutoDetectLongPolling=!0:this.experimentalAutoDetectLongPolling=!!e.experimentalAutoDetectLongPolling,this.experimentalLongPollingOptions=pc((r=e.experimentalLongPollingOptions)!=null?r:{}),function(s){if(s.timeoutSeconds!==void 0){if(isNaN(s.timeoutSeconds))throw new w(E.INVALID_ARGUMENT,`invalid long polling timeout: ${s.timeoutSeconds} (must not be NaN)`);if(s.timeoutSeconds<5)throw new w(E.INVALID_ARGUMENT,`invalid long polling timeout: ${s.timeoutSeconds} (minimum allowed value is 5)`);if(s.timeoutSeconds>30)throw new w(E.INVALID_ARGUMENT,`invalid long polling timeout: ${s.timeoutSeconds} (maximum allowed value is 30)`)}}(this.experimentalLongPollingOptions),this.useFetchStreams=!!e.useFetchStreams,e.grpcFlowControlWindow!==void 0){if(typeof e.grpcFlowControlWindow!="number"||e.grpcFlowControlWindow<=0||e.grpcFlowControlWindow>2147483647||!Number.isInteger(e.grpcFlowControlWindow))throw new w(E.INVALID_ARGUMENT,"grpcFlowControlWindow must be a positive integer and cannot exceed 2147483647");this.grpcFlowControlWindow=e.grpcFlowControlWindow}}isEqual(e){return this.host===e.host&&this.ssl===e.ssl&&this.credentials===e.credentials&&this.cacheSizeBytes===e.cacheSizeBytes&&this.experimentalForceLongPolling===e.experimentalForceLongPolling&&this.experimentalAutoDetectLongPolling===e.experimentalAutoDetectLongPolling&&function(r,i){return r.timeoutSeconds===i.timeoutSeconds}(this.experimentalLongPollingOptions,e.experimentalLongPollingOptions)&&this.ignoreUndefinedProperties===e.ignoreUndefinedProperties&&this.useFetchStreams===e.useFetchStreams&&this.grpcFlowControlWindow===e.grpcFlowControlWindow&&function(r,i){if(r===i)return!0;if(!r||!i)return!1;let s=Object.keys(r),o=Object.keys(i);if(s.length!==o.length)return!1;for(let a of s)if(r[a]!==i[a])return!1;return!0}(this._customHeaders,e._customHeaders)}},Le=class{constructor(e,t,r,i){this._authCredentials=e,this._appCheckCredentials=t,this._databaseId=r,this._app=i,this.type="firestore-lite",this._persistenceKey="(lite)",this._settings=new Ur({}),this._settingsFrozen=!1,this._emulatorOptions={},this._terminateTask="notTerminated"}get app(){if(!this._app)throw new w(E.FAILED_PRECONDITION,"Firestore was not initialized using the Firebase SDK. 'app' is not available");return this._app}get _initialized(){return this._settingsFrozen}get _terminated(){return this._terminateTask!=="notTerminated"}_setSettings(e){if(this._settingsFrozen)throw new w(E.FAILED_PRECONDITION,"Firestore has already been started and its settings can no longer be changed. You can only modify settings before calling any other methods on a Firestore object.");this._settings=new Ur(e),this._emulatorOptions=e.emulatorOptions||{},e.credentials!==void 0&&(this._authCredentials=function(r){if(!r)return new as;switch(r.type){case"firstParty":return new ls(r.sessionIndex||"0",r.iamToken||null,r.authTokenFactory||null);case"provider":return r.client;default:throw new w(E.INVALID_ARGUMENT,"makeAuthCredentialsProvider failed due to invalid credential type")}}(e.credentials))}_getSettings(){return this._settings}_getEmulatorOptions(){return this._emulatorOptions}_freezeSettings(){return this._settingsFrozen=!0,this._settings}_delete(){return this._terminateTask==="notTerminated"&&(this._terminateTask=this._terminate()),this._terminateTask}async _restart(){this._terminateTask==="notTerminated"?await this._terminate():this._terminateTask="notTerminated"}toJSON(){return{app:this._app,databaseId:this._databaseId,settings:this._settings}}_terminate(){return function(t){let r=nn.get(t);r&&(rn(Vc,"Removing Datastore"),nn.delete(t),r.terminate())}(this),Promise.resolve()}};function Js(n,e){let t=typeof n=="object"?n:xt(),r=typeof n=="string"?n:e||"(default)",i=at(t,"firestore/lite").getImmediate({identifier:r});if(!i._initialized){let s=Rn("firestore");s&&xc(i,...s)}return i}function xc(n,e,t,r={}){var l;n=xe(n,Le);let i=_e(e),s=n._getSettings(),o={...s,emulatorOptions:n._getEmulatorOptions()},a=`${e}:${t}`;i&&Vt(`https://${a}`),s.host!==Lc&&s.host!==a&&cc("Host has been set in both settings() and connectFirestoreEmulator(), emulator host will be used.");let c={...s,host:a,ssl:i,emulatorOptions:r};if(!ge(c,o)&&(n._setSettings(c),r.mockUserToken)){let _,y;if(typeof r.mockUserToken=="string")_=r.mockUserToken,y=H.MOCK_USER;else{_=bo(r.mockUserToken,(l=n._app)==null?void 0:l.options.projectId);let I=r.mockUserToken.sub||r.mockUserToken.user_id;if(!I)throw new w(E.INVALID_ARGUMENT,"mockUserToken must contain 'sub' or 'user_id' field!");y=new H(I)}n._authCredentials=new cs(new pr(_,y))}}var Re=class n{constructor(e,t,r){this.converter=t,this._query=r,this.type="query",this.firestore=e}withConverter(e){return new n(this.firestore,e,this._query)}},x=class n{constructor(e,t,r){this.converter=t,this._key=r,this.type="document",this.firestore=e}get _path(){return this._key.path}get id(){return this._key.path.lastSegment()}get path(){return this._key.path.canonicalString()}get parent(){return new Ae(this.firestore,this.converter,this._key.path.popLast())}withConverter(e){return new n(this.firestore,e,this._key)}toJSON(){return{type:n._jsonSchemaVersion,referencePath:this._key.toString()}}static fromJSON(e,t,r){if(Tn(t,n._jsonSchema))return new n(e,r||null,new z(M.fromString(t.referencePath)))}};x._jsonSchemaVersion="firestore/documentReference/1.0",x._jsonSchema={type:ne("string",x._jsonSchemaVersion),referencePath:ne("string")};var Ae=class n extends Re{constructor(e,t,r){super(e,t,function(s){return new Tt(s)}(r)),this._path=r,this.type="collection"}get id(){return this._query.path.lastSegment()}get path(){return this._query.path.canonicalString()}get parent(){let e=this._path.popLast();return e.isEmpty()?null:new x(this.firestore,null,new z(e))}withConverter(e){return new n(this.firestore,e,this._path)}};function Ys(n,e,...t){if(n=P(n),dc("collection","path",e),n instanceof Le){let r=M.fromString(e,...t);return ja(r),new Ae(n,null,r)}{if(!(n instanceof x||n instanceof Ae))throw new w(E.INVALID_ARGUMENT,"Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");let r=n._path.child(M.fromString(e,...t));return ja(r),new Ae(n.firestore,null,r)}}function Qs(n,e,...t){if(n=P(n),arguments.length===1&&(e=fs.newId()),dc("doc","path",e),n instanceof Le){let r=M.fromString(e,...t);return Ba(r),new x(n,null,new z(r))}{if(!(n instanceof x||n instanceof Ae))throw new w(E.INVALID_ARGUMENT,"Expected first argument to doc() to be a CollectionReference, a DocumentReference or FirebaseFirestore");let r=n._path.child(M.fromString(e,...t));return Ba(r),new x(n.firestore,n instanceof Ae?n.converter:null,new z(r))}}var fe=class n{constructor(e,t=0){if(this.subtype=t,!Number.isInteger(t)||t<0||t>255)throw new w(E.INVALID_ARGUMENT,"The subtype for Bytes must be a value in the inclusive [0, 255] range.");this._byteString=e}static fromBase64String(e,t=0){try{return new n(oe.fromBase64String(e),t)}catch(r){throw new w(E.INVALID_ARGUMENT,"Failed to construct data from Base64 string: "+r)}}static fromUint8Array(e,t=0){return new n(oe.fromUint8Array(e),t)}toBase64(){return this._byteString.toBase64()}toUint8Array(){return this._byteString.toUint8Array()}get data(){return this.toUint8Array()}toString(){return"Bytes(base64: "+this.toBase64()+", subtype: "+this.subtype+")"}isEqual(e){return this.subtype===e.subtype&&this._byteString.isEqual(e._byteString)}toJSON(){let e={type:n._jsonSchemaVersion,bytes:this.toBase64()};return this.subtype!==0&&(e.subtype=this.subtype),e}static fromJSON(e){var t;if(Tn(e,n._jsonSchema)){let r=(t=e.subtype)!=null?t:0;return n.fromBase64String(e.bytes,r)}}};fe._jsonSchemaVersion="firestore/bytes/1.0",fe._jsonSchema={type:ne("string",fe._jsonSchemaVersion),bytes:ne("string"),subtype:{...ne("number"),optional:!0}};var Xe=class{constructor(...e){for(let t=0;t<e.length;++t)if(e[t].length===0)throw new w(E.INVALID_ARGUMENT,"Invalid field name at argument $(i + 1). Field names must not be empty.");this._internalPath=new Ve(e)}isEqual(e){return this._internalPath.isEqual(e._internalPath)}};var St=class{constructor(e){this.value=e}isEqual(e){return this.value===e.value}};var Nt=class{constructor(e,t){if(this.seconds=e,this.increment=t,!Number.isInteger(e)||e<0||e>4294967295)throw new Error("BsonTimestamp 'seconds' must be in the range of a 32-bit unsigned integer (0-4294967295).");if(!Number.isInteger(t)||t<0||t>4294967295)throw new Error("BsonTimestamp 'increment' must be in the range of a 32-bit unsigned integer (0-4294967295).")}isEqual(e){return this.seconds===e.seconds&&this.increment===e.increment}};var Rt=class{constructor(e){this.stringValue=e,this.value=k.fromString(e)}isEqual(e){return!(!this.value.ot()||!e.value.ot())||this.value.compareTo(e.value)===0}toJSON(){return{$t:{stringValue:this.stringValue}}}};var Ze=class{constructor(e){this._methodName=e}};var Se=class n{constructor(e,t){if(!isFinite(e)||e<-90||e>90)throw new w(E.INVALID_ARGUMENT,"Latitude must be a number between -90 and 90, but was: "+e);if(!isFinite(t)||t<-180||t>180)throw new w(E.INVALID_ARGUMENT,"Longitude must be a number between -180 and 180, but was: "+t);this._lat=e,this._long=t}get latitude(){return this._lat}get longitude(){return this._long}isEqual(e){return this._lat===e._lat&&this._long===e._long}_compareTo(e){return O(this._lat,e._lat)||O(this._long,e._long)}toJSON(){return{latitude:this._lat,longitude:this._long,type:n._jsonSchemaVersion}}static fromJSON(e){if(Tn(e,n._jsonSchema))return new n(e.latitude,e.longitude)}};Se._jsonSchemaVersion="firestore/geoPoint/1.0",Se._jsonSchema={type:ne("string",Se._jsonSchemaVersion),latitude:ne("number"),longitude:ne("number")};var Pt=class{constructor(e){this.value=e}isEqual(e){return this.value===e.value}};var et=class n{constructor(){this.type="MaxKey"}static instance(){return n.MAX_KEY_VALUE_INSTANCE||(n.MAX_KEY_VALUE_INSTANCE=new n),n.MAX_KEY_VALUE_INSTANCE}};et.MAX_KEY_VALUE_INSTANCE=null;var tt=class n{constructor(){this.type="MinKey"}static instance(){return n.MIN_KEY_VALUE_INSTANCE||(n.MIN_KEY_VALUE_INSTANCE=new n),n.MIN_KEY_VALUE_INSTANCE}};tt.MIN_KEY_VALUE_INSTANCE=null;var kt=class{constructor(e,t){this.pattern=e,this.options=t}isEqual(e){return this.pattern===e.pattern&&this.options===e.options}};var pe=class n{constructor(e){this._values=(e||[]).map(t=>t)}toArray(){return this._values.map(e=>e)}isEqual(e){return function(r,i){if(r.length!==i.length)return!1;for(let s=0;s<r.length;++s)if(r[s]!==i[s])return!1;return!0}(this._values,e._values)}toJSON(){return{type:n._jsonSchemaVersion,vectorValues:this._values}}static fromJSON(e){if(Tn(e,n._jsonSchema)){if(Array.isArray(e.vectorValues)&&e.vectorValues.every(t=>typeof t=="number"))return new n(e.vectorValues);throw new w(E.INVALID_ARGUMENT,"Expected 'vectorValues' field to be a number array")}}};pe._jsonSchemaVersion="firestore/vectorValue/1.0",pe._jsonSchema={type:ne("string",pe._jsonSchemaVersion),vectorValues:ne("object")};var pd=/^__.*__$/,qs=class{constructor(e,t,r){this.data=e,this.fieldMask=t,this.fieldTransforms=r}toMutation(e,t){return this.fieldMask!==null?new pn(e,this.data,this.fieldMask,t,this.fieldTransforms):new Lr(e,this.data,t,this.fieldTransforms)}},Fr=class{constructor(e,t,r){this.data=e,this.fieldMask=t,this.fieldTransforms=r}toMutation(e,t){return new pn(e,this.data,this.fieldMask,t,this.fieldTransforms)}};function Mc(n){switch(n){case 0:case 2:case 1:return!0;case 3:case 4:return!1;default:throw D(40011,{dataSource:n})}}var Bs=class n{constructor(e,t,r,i,s,o){this.settings=e,this.databaseId=t,this.serializer=r,this.ignoreUndefinedProperties=i,s===void 0&&this.validatePath(),this.fieldTransforms=s||[],this.fieldMask=o||[]}get path(){return this.settings.path}get dataSource(){return this.settings.dataSource}contextWith(e){return new n({...this.settings,...e},this.databaseId,this.serializer,this.ignoreUndefinedProperties,this.fieldTransforms,this.fieldMask)}childContextForField(e){var i;let t=(i=this.path)==null?void 0:i.child(e),r=this.contextWith({path:t,arrayElement:!1});return r.validatePathSegment(e),r}childContextForFieldPath(e){var i;let t=(i=this.path)==null?void 0:i.child(e),r=this.contextWith({path:t,arrayElement:!1});return r.validatePath(),r}childContextForArray(e){return this.contextWith({path:void 0,arrayElement:!0})}createError(e){return Br(e,this.settings.methodName,this.settings.hasConverter||!1,this.path,this.settings.targetDoc)}contains(e){return this.fieldMask.find(t=>e.isPrefixOf(t))!==void 0||this.fieldTransforms.find(t=>e.isPrefixOf(t.field))!==void 0}validatePath(){if(this.path)for(let e=0;e<this.path.length;e++)this.validatePathSegment(this.path.get(e))}validatePathSegment(e){if(e.length===0)throw this.createError("Document fields must not be empty");if(Mc(this.dataSource)&&pd.test(e))throw this.createError('Document fields cannot begin and end with "__"')}},js=class{constructor(e,t,r){this.databaseId=e,this.ignoreUndefinedProperties=t,this.serializer=r||Ks(e)}createContext(e,t,r,i=!1){return new Bs({dataSource:e,methodName:t,targetDoc:r,path:Ve.emptyPath(),arrayElement:!1,hasConverter:i},this.databaseId,this.serializer,this.ignoreUndefinedProperties)}};function An(n){let e=n._freezeSettings(),t=Ks(n._databaseId);return new js(n._databaseId,!!e.ignoreUndefinedProperties,t)}function Xs(n,e,t,r,i,s={}){let o=n.createContext(s.merge||s.mergeFields?2:0,e,t,i);to("Data must be an object, but it was:",o,r);let a=Uc(r,o),c,l;if(s.merge)c=new wt(o.fieldMask),l=o.fieldTransforms;else if(s.mergeFields){let _=[];for(let y of s.mergeFields){let I=nt(e,y,t);if(!o.contains(I))throw new w(E.INVALID_ARGUMENT,`Field '${I}' is specified in your field mask but missing from your input data.`);jc(_,I)||_.push(I)}c=new wt(_),l=o.fieldTransforms.filter(y=>c.covers(y.field))}else c=null,l=o.fieldTransforms;return new qs(new ee(a),c,l)}var qr=class n extends Ze{_toFieldTransform(e){if(e.dataSource!==2)throw e.dataSource===1?e.createError(`${this._methodName}() can only appear at the top level of your update data`):e.createError(`${this._methodName}() cannot be used with set() unless you pass {merge:true}`);return e.fieldMask.push(e.path),null}isEqual(e){return e instanceof n}};var $s=class n extends Ze{_toFieldTransform(e){return new Vs(e.path,new Vr)}isEqual(e){return e instanceof n}};function Zs(n,e,t,r){let i=n.createContext(1,e,t);to("Data must be an object, but it was:",i,r);let s=[],o=ee.empty();wn(r,(c,l)=>{let _=Bc(e,c,t);l=P(l);let y=i.childContextForFieldPath(_);if(l instanceof qr)s.push(_);else{let I=Sn(l,y);I!=null&&(s.push(_),o.set(_,I))}});let a=new wt(s);return new Fr(o,a,i.fieldTransforms)}function eo(n,e,t,r,i,s){let o=n.createContext(1,e,t),a=[nt(e,r,t)],c=[i];if(s.length%2!=0)throw new w(E.INVALID_ARGUMENT,`Function ${e}() needs to be called with an even number of arguments that alternate between field names and values.`);for(let I=0;I<s.length;I+=2)a.push(nt(e,s[I])),c.push(s[I+1]);let l=[],_=ee.empty();for(let I=a.length-1;I>=0;--I)if(!jc(l,a[I])){let T=a[I],v=c[I];v=P(v);let A=o.childContextForFieldPath(T);if(v instanceof qr)l.push(T);else{let S=Sn(v,A);S!=null&&(l.push(T),_.set(T,S))}}let y=new wt(l);return new Fr(_,y,o.fieldTransforms)}function md(n,e,t,r=!1){return Sn(t,n.createContext(r?4:3,e))}function Sn(n,e,t){if(qc(n=P(n)))return to("Unsupported field value:",e,n),Uc(n,e);if(n instanceof Ze)return function(i,s){if(!Mc(s.dataSource))throw s.createError(`${i._methodName}() can only be used with update() and set()`);if(!s.path)throw s.createError(`${i._methodName}() is not currently supported inside arrays`);let o=i._toFieldTransform(s);o&&s.fieldTransforms.push(o)}(n,e),null;if(n===void 0&&e.ignoreUndefinedProperties)return null;if(e.path&&e.fieldMask.push(e.path),n instanceof Array){if(e.settings.arrayElement&&e.dataSource!==4)throw e.createError("Nested arrays are not supported");return function(i,s){let o=[],a=0;for(let c of i){let l=Sn(c,s.childContextForArray(a));l==null&&(l={nullValue:"NULL_VALUE"}),o.push(l),a++}return{arrayValue:{values:o}}}(n,e)}return function(i,s,o){if((i=P(i))===null)return{nullValue:"NULL_VALUE"};if(typeof i=="number")return ed(s.serializer,i);if(typeof i=="boolean")return{booleanValue:i};if(typeof i=="string")return{stringValue:i};if(i instanceof Date){let a=j.fromDate(i);return{timestampValue:fr(s.serializer,a)}}if(i instanceof j){let a=new j(i.seconds,1e3*Math.floor(i.nanoseconds/1e3));return{timestampValue:fr(s.serializer,a)}}if(Fc(i)){let a=j.fromInstant(i),c=new j(a.seconds,1e3*Math.floor(a.nanoseconds/1e3));return{timestampValue:fr(s.serializer,c)}}if(i instanceof Se)return{geoPointValue:{latitude:i.latitude,longitude:i.longitude}};if(i instanceof fe)return i.subtype===0?{bytesValue:nc(s.serializer,i._byteString)}:function(c,l){let _=l.toUint8Array(),y=new Uint8Array(_.length+1);return y[0]=l.subtype,y.set(_,1),{mapValue:{fields:{[Kr]:{bytesValue:nc(c,oe.fromUint8Array(y))}}}}}(s.serializer,i);if(i instanceof x){let a=s.databaseId,c=i.firestore._databaseId;if(!c.isEqual(a))throw s.createError(`Document reference is for database ${c.projectId}/${c.database} but should be for database ${a.projectId}/${a.database}`);return{referenceValue:Gs(i.firestore._databaseId||s.databaseId,i._key.path)}}if(i instanceof pe)return function(c,l){let _=c instanceof pe?c.toArray():c;return{mapValue:{fields:{[_c]:{stringValue:yc},[Tr]:{arrayValue:{values:_.map(I=>{if(typeof I!="number")throw l.createError("VectorValues must only contain numeric values.");return Pc(l.serializer,I)})}}}}}}(i,s);if(i instanceof kt)return function(c){return{mapValue:{fields:{[Oe]:{mapValue:{fields:{[br]:{stringValue:c.pattern},[vr]:{stringValue:c.options}}}}}}}}(i);if(i instanceof St)return function(c){return{mapValue:{fields:{[cn]:{stringValue:c.value}}}}}(i);if(i instanceof Pt)return function(c){return{mapValue:{fields:{[bn]:dr(c.value)}}}}(i);if(i instanceof Rt)return function(c){return{mapValue:{fields:{[It]:{stringValue:c.stringValue}}}}}(i);if(i instanceof Nt)return function(c){return{mapValue:{fields:{[Ke]:{mapValue:{fields:{[Ar]:dr(c.seconds),[Sr]:dr(c.increment)}}}}}}}(i);if(i instanceof tt)return function(){return{mapValue:{fields:{[Ic]:{nullValue:"NULL_VALUE"}}}}}();if(i instanceof et)return function(){return{mapValue:{fields:{[zs]:{nullValue:"NULL_VALUE"}}}}}();if(Dc(i))return i._toProto(s.serializer);throw s.createError(`Unsupported field value: ${Gr(i)}`)}(n,e)}function Uc(n,e){let t={};return function(i){for(let s in i)if(Object.prototype.hasOwnProperty.call(i,s))return!1;return!0}(n)?e.path&&e.path.length>0&&e.fieldMask.push(e.path):wn(n,(r,i)=>{let s=Sn(i,e.childContextForField(r));s!=null&&(t[r]=s)}),{mapValue:{fields:t}}}function Fc(n){if(typeof n!="object"||n===null)return!1;if(typeof Temporal<"u"&&typeof Temporal.Instant=="function"&&n instanceof Temporal.Instant)return!0;let e=n;return e[Symbol.toStringTag]==="Temporal.Instant"&&typeof e.ht=="bigint"}function qc(n){return!(typeof n!="object"||n===null||n instanceof Array||n instanceof Date||n instanceof j||n instanceof Se||n instanceof fe||n instanceof x||n instanceof Ze||n instanceof pe||n instanceof tt||n instanceof et||n instanceof Pt||n instanceof Rt||n instanceof kt||n instanceof St||n instanceof Nt||Fc(n)||Dc(n))}function to(n,e,t){if(!qc(t)||!fc(t)){let r=Gr(t);throw r==="an object"?e.createError(n+" a custom object"):e.createError(n+" "+r)}}function nt(n,e,t){if((e=P(e))instanceof Xe)return e._internalPath;if(typeof e=="string")return Bc(n,e);throw Br("Field path arguments must be of type string or ",n,!1,void 0,t)}var gd=new RegExp("[~\\*/\\[\\]]");function Bc(n,e,t){if(e.search(gd)>=0)throw Br(`Invalid field path (${e}). Paths must not contain '~', '*', '/', '[', or ']'`,n,!1,void 0,t);try{return new Xe(...e.split("."))._internalPath}catch{throw Br(`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`,n,!1,void 0,t)}}function Br(n,e,t,r,i){let s=r&&!r.isEmpty(),o=i!==void 0,a=`Function ${e}() called with invalid data`;t&&(a+=" (via `toFirestore()`)"),a+=". ";let c="";return(s||o)&&(c+=" (found",s&&(c+=` in field ${r}`),o&&(c+=` in document ${i}`),c+=")"),new w(E.INVALID_ARGUMENT,a+n+c)}function jc(n,e){return n.some(t=>t.isEqual(e))}var mn=class{constructor(e,t,r,i,s){this._firestore=e,this._userDataWriter=t,this._key=r,this._document=i,this._converter=s}get id(){return this._key.path.lastSegment()}get ref(){return new x(this._firestore,this._converter,this._key)}exists(){return this._document!==null}data(){if(this._document){if(this._converter){let e=new gn(this._firestore,this._userDataWriter,this._key,this._document,null);return this._converter.fromFirestore(e)}return this._userDataWriter.convertValue(this._document.data.value)}}_fieldsProto(){var e,t;return(t=(e=this._document)==null?void 0:e.data.clone().value.mapValue.fields)!=null?t:void 0}get(e){if(this._document){let t=this._document.data.field(nt("DocumentSnapshot.get",e));if(t!==null)return this._userDataWriter.convertValue(t)}}},gn=class extends mn{data(){return super.data()}},jr=class{constructor(e,t){this._docs=t,this.query=e}get docs(){return[...this._docs]}get size(){return this.docs.length}get empty(){return this.docs.length===0}forEach(e,t){this._docs.forEach(e,t)}};var _n=class{},Ct=class extends _n{};function no(n,e,...t){let r=[];e instanceof _n&&r.push(e),r=r.concat(t),function(s){let o=s.filter(c=>c instanceof $r).length,a=s.filter(c=>c instanceof yn).length;if(o>1||o>0&&a>0)throw new w(E.INVALID_ARGUMENT,"InvalidQuery. When using composite filters, you cannot use more than one filter at the top level. Consider nesting the multiple filters within an `and(...)` statement. For example: change `query(query, where(...), or(...))` to `query(query, and(where(...), or(...)))`.")}(r);for(let i of r)n=i._apply(n);return n}var yn=class n extends Ct{constructor(e,t,r){super(),this._field=e,this._op=t,this._value=r,this.type="where"}static _create(e,t,r){return new n(e,t,r)}_apply(e){let t=this._parse(e);return $c(e._query,t),new Re(e.firestore,e.converter,Rs(e._query,t))}_parse(e){let t=An(e.firestore);return function(s,o,a,c,l,_,y){let I;if(function(A,S){if(typeof A=="number"&&isNaN(A)&&S!=="=="&&S!=="!="&&S!=="array-contains")throw new Error("Invalid query. You can only perform '==' and '!=' comparisons on NaN.");if(A===null&&S!=="=="&&S!=="!="&&S!=="array-contains")throw new Error("Invalid query. You can only perform '==' and '!=' comparisons on Null.")}(y,_),l.isKeyField()){if(_==="array-contains"||_==="array-contains-any")throw new w(E.INVALID_ARGUMENT,`Invalid Query. You can't perform '${_}' queries on documentId().`);if(_==="in"||_==="not-in"){oc(y,_);let v=[];for(let A of y)v.push(sc(c,s,A));I={arrayValue:{values:v}}}else I=sc(c,s,y)}else _!=="in"&&_!=="not-in"&&_!=="array-contains-any"||oc(y,_),I=md(a,o,y,_==="in"||_==="not-in");return ae.create(l,_,I)}(e._query,"where",t,e.firestore._databaseId,this._field,this._op,this._value)}};function ro(n,e,t){let r=e,i=nt("where",n);return yn._create(i,r,t)}var $r=class n extends _n{constructor(e,t){super(),this.type=e,this._queryConstraints=t}static _create(e,t){return new n(e,t)}_parse(e){let t=this._queryConstraints.map(r=>r._parse(e)).filter(r=>r.getFilters().length>0);return t.length===1?t[0]:hn.create(t,this._getOperator())}_apply(e){let t=this._parse(e);return t.getFilters().length===0?e:(function(i,s){let o=i,a=s.getFlattenedFilters();for(let c of a)$c(o,c),o=Rs(o,c)}(e._query,t),new Re(e.firestore,e.converter,Rs(e._query,t)))}_getQueryConstraints(){return this._queryConstraints}_getOperator(){return this.type==="and"?"and":"or"}};var Wr=class n extends Ct{constructor(e,t){super(),this._field=e,this._direction=t,this.type="orderBy"}static _create(e,t){return new n(e,t)}_apply(e){let t=function(i,s,o){if(i.startAt!==null)throw new w(E.INVALID_ARGUMENT,"Invalid query. You must not call startAt() or startAfter() before calling orderBy().");if(i.endAt!==null)throw new w(E.INVALID_ARGUMENT,"Invalid query. You must not call endAt() or endBefore() before calling orderBy().");return new Et(s,o)}(e._query,this._field,this._direction);return new Re(e.firestore,e.converter,function(i,s){let o=i.explicitOrderBy.concat([s]);return new Tt(i.path,i.collectionGroup,o,i.filters.slice(),i.limit,i.limitType,i.startAt,i.endAt)}(e._query,t))}};function io(n,e="asc"){let t=e,r=nt("orderBy",n);return Wr._create(r,t)}var Hr=class n extends Ct{constructor(e,t,r){super(),this.type=e,this._limit=t,this._limitType=r}static _create(e,t,r){return new n(e,t,r)}_apply(e){return new Re(e.firestore,e.converter,function(r,i,s){return new Tt(r.path,r.collectionGroup,r.explicitOrderBy.slice(),r.filters.slice(),i,s,r.startAt,r.endAt)}(e._query,this._limit,this._limitType))}};function so(n){return Wh("limit",n),Hr._create("limit",n,"F")}function sc(n,e,t){if(typeof(t=P(t))=="string"){if(t==="")throw new w(E.INVALID_ARGUMENT,"Invalid query. When querying with documentId(), you must provide a valid document ID, but it was an empty string.");if(!Yh(e)&&t.indexOf("/")!==-1)throw new w(E.INVALID_ARGUMENT,`Invalid query. When querying a collection by documentId(), you must provide a plain document ID, but '${t}' contains a '/' character.`);let r=e.path.child(M.fromString(t));if(!z.isDocumentKey(r))throw new w(E.INVALID_ARGUMENT,`Invalid query. When querying a collection group by documentId(), the value provided must result in a valid document path, but '${r}' is not because it has an odd number of segments (${r.length}).`);return Xa(n,new z(r))}if(t instanceof x)return Xa(n,t._key);throw new w(E.INVALID_ARGUMENT,`Invalid query. When querying with documentId(), you must provide a valid string or a DocumentReference, but it was: ${Gr(t)}.`)}function oc(n,e){if(!Array.isArray(n)||n.length===0)throw new w(E.INVALID_ARGUMENT,`Invalid Query. A non-empty array is required for '${e.toString()}' filters.`)}function $c(n,e){let t=function(i,s){for(let o of i)for(let a of o.getFlattenedFilters())if(s.indexOf(a.op)>=0)return a.op;return null}(n.filters,function(i){switch(i){case"!=":return["!=","not-in"];case"array-contains-any":case"in":return["not-in"];case"not-in":return["array-contains-any","in","not-in","!="];default:return[]}}(e.op));if(t!==null)throw t===e.op?new w(E.INVALID_ARGUMENT,`Invalid query. You cannot use more than one '${e.op.toString()}' filter.`):new w(E.INVALID_ARGUMENT,`Invalid query. You cannot use '${e.op.toString()}' filters with '${t.toString()}' filters.`)}var Ws=class{convertValue(e,t="none"){switch(Ye(e)){case 0:return null;case 2:return e.booleanValue;case 3:if("mapValue"in e){if(Pr(e))return this.convertToInt32Value(e.mapValue);if(Qe(e))return this.convertToDecimal128Value(e.mapValue)}return B(e.integerValue||e.doubleValue);case 4:return this.convertTimestamp(e.timestampValue);case 6:return this.convertServerTimestamp(e,t);case 7:return e.stringValue;case 8:return"bytesValue"in e?this.convertBytes(wr(e.bytesValue)):this.convertToBytesWithSubtype(e.mapValue);case 9:return this.convertReference(e.referenceValue);case 11:return this.convertGeoPoint(e.geoPointValue);case 13:return this.convertArray(e.arrayValue,t);case 15:return this.convertObject(e.mapValue,t);case 14:return this.convertVectorValue(e.mapValue);case 12:return this.convertToRegexValue(e.mapValue);case 10:return this.convertToBsonObjectId(e.mapValue);case 5:return this.convertToBsonTimestamp(e.mapValue);case 16:return et.instance();case 1:return tt.instance();default:throw D(62114,{value:e})}}convertObject(e,t){return this.convertObjectMap(e.fields,t)}convertObjectMap(e,t="none"){let r={};return wn(e,(i,s)=>{r[i]=this.convertValue(s,t)}),r}convertVectorValue(e){var r,i,s;let t=(s=(i=(r=e.fields)==null?void 0:r[Tr].arrayValue)==null?void 0:i.values)==null?void 0:s.map(o=>B(o.doubleValue));return new pe(t)}convertToBsonObjectId(e){var r,i,s;let t=(s=(i=(r=e.fields)==null?void 0:r[cn])==null?void 0:i.stringValue)!=null?s:"";return new St(t)}convertToBytesWithSubtype(e){var a;let t=(a=e.fields)==null?void 0:a[Kr],r=t==null?void 0:t.bytesValue;if(!r)throw new Error("Received incorrect bytesValue for Bytes with subtype");let i=wr(r).toUint8Array();if(i.length===0)throw new Error("Received empty bytesValue for Bytes with subtype");let s=i[0],o=i.slice(1);return new fe(oe.fromUint8Array(o),s)}convertToBsonTimestamp(e){var s,o,a,c,l,_,y;let t=(s=e.fields)==null?void 0:s[Ke],r=Number((c=(a=(o=t==null?void 0:t.mapValue)==null?void 0:o.fields)==null?void 0:a[Ar])==null?void 0:c.integerValue),i=Number((y=(_=(l=t==null?void 0:t.mapValue)==null?void 0:l.fields)==null?void 0:_[Sr])==null?void 0:y.integerValue);return new Nt(r,i)}convertToRegexValue(e){var i,s,o,a,c,l,_,y,I,T,v,A;let t=(l=(c=(a=(o=(s=(i=e.fields)==null?void 0:i[Oe])==null?void 0:s.mapValue)==null?void 0:o.fields)==null?void 0:a[br])==null?void 0:c.stringValue)!=null?l:"",r=(A=(v=(T=(I=(y=(_=e.fields)==null?void 0:_[Oe])==null?void 0:y.mapValue)==null?void 0:I.fields)==null?void 0:T[vr])==null?void 0:v.stringValue)!=null?A:"";return new kt(t,r)}convertToInt32Value(e){var r,i;let t=Number((i=(r=e.fields)==null?void 0:r[bn])==null?void 0:i.integerValue);return new Pt(t)}convertToDecimal128Value(e){var r,i,s;let t=(s=(i=(r=e.fields)==null?void 0:r[It])==null?void 0:i.stringValue)!=null?s:"";return new Rt(t)}convertGeoPoint(e){return new Se(B(e.latitude),B(e.longitude))}convertArray(e,t){return(e.values||[]).map(r=>this.convertValue(r,t))}convertServerTimestamp(e,t){switch(t){case"previous":let r=gc(e);return r==null?null:this.convertValue(r,t);case"estimate":return this.convertTimestamp(an(e));default:return null}}convertTimestamp(e){let t=Je(e);return new j(t.seconds,t.nanos)}convertDocumentKey(e,t){let r=M.fromString(e);te(Cc(r),9688,{name:e});let i=new yr(r.get(1),r.get(3)),s=new z(r.popFirst(5));return i.isEqual(t)||zr(`A document reference to ${s} refers to a different database (${i.projectId}/${i.database}), which is not supported. It will be treated as a reference in the current database (${t.projectId}/${t.database}) instead.`),s}};function oo(n,e,t){let r;return r=n?t&&(t.merge||t.mergeFields)?n.toFirestore(e,t):n.toFirestore(e):e,r}var In=class extends Ws{constructor(e){super(),this.firestore=e}convertBytes(e){return new fe(e)}convertReference(e){let t=this.convertDocumentKey(e,this.firestore._databaseId);return new x(this.firestore,null,t)}};function ao(n){let e=rt((n=xe(n,x)).firestore),t=new In(n.firestore);return Oc(e,[n._key]).then(r=>{te(r.length===1,15618);let i=r[0];return new mn(n.firestore,t,n._key,i.isFoundDocument()?i:null,n.converter)})}function co(n){(function(i){if(i.limitType==="L"&&i.explicitOrderBy.length===0)throw new w(E.UNIMPLEMENTED,"limitToLast() queries require specifying at least one orderBy() clause")})((n=xe(n,Re))._query);let e=rt(n.firestore),t=new In(n.firestore);return dd(e,n._query).then(r=>{let i=r.map(s=>new gn(n.firestore,t,s.key,s,n.converter));return n._query.limitType==="L"&&i.reverse(),new jr(n,i)})}function uo(n,e,t){let r=oo((n=xe(n,x)).converter,e,t),i=Xs(An(n.firestore),"setDoc",n._key,r,n.converter!==null,t);return vn(rt(n.firestore),[i.toMutation(n._key,Ne.none())])}function lo(n,e,t,...r){let i=An((n=xe(n,x)).firestore),s;return s=typeof(e=P(e))=="string"||e instanceof Xe?eo(i,"updateDoc",n._key,e,t,r):Zs(i,"updateDoc",n._key,e),vn(rt(n.firestore),[s.toMutation(n._key,Ne.exists(!0))])}function ho(n){return vn(rt((n=xe(n,x)).firestore),[new At(n._key,Ne.none())])}function fo(){return new $s("serverTimestamp")}var Wc="4.18.0";var mo=class{constructor(e,t){this._firestore=e,this._commitHandler=t,this._mutations=[],this._committed=!1,this._dataReader=An(e)}set(e,t,r){this._verifyNotCommitted();let i=po(e,this._firestore),s=oo(i.converter,t,r),o=Xs(this._dataReader,"WriteBatch.set",i._key,s,i.converter!==null,r);return this._mutations.push(o.toMutation(i._key,Ne.none())),this}update(e,t,r,...i){this._verifyNotCommitted();let s=po(e,this._firestore),o;return o=typeof(t=P(t))=="string"||t instanceof Xe?eo(this._dataReader,"WriteBatch.update",s._key,t,r,i):Zs(this._dataReader,"WriteBatch.update",s._key,t),this._mutations.push(o.toMutation(s._key,Ne.exists(!0))),this}delete(e){this._verifyNotCommitted();let t=po(e,this._firestore);return this._mutations=this._mutations.concat(new At(t._key,Ne.none())),this}commit(){return this._verifyNotCommitted(),this._committed=!0,this._mutations.length>0?this._commitHandler(this._mutations):Promise.resolve()}_verifyNotCommitted(){if(this._committed)throw new w(E.FAILED_PRECONDITION,"A write batch can no longer be used after commit() has been called.")}};function po(n,e){if((n=P(n)).firestore!==e)throw new w(E.INVALID_ARGUMENT,"Provided document reference is from a different Firestore instance.");return n}function Hc(n){n=xe(n,Le);let e=rt(n);return new mo(n,t=>vn(e,t))}(function(){ac(`${ct}_lite`),le(new Y("firestore/lite",(e,{instanceIdentifier:t,options:r})=>{let i=e.getProvider("app").getImmediate(),s=new Le(new mr(e.getProvider("auth-internal")),new _r(i,e.getProvider("app-check-internal")),lc(i,t),i);return r&&s._setSettings(r),s},"PUBLIC").setMultipleInstances(!0)),Q("firestore-lite",Wc,""),Q("firestore-lite",Wc,"esm2020")})();window.__lib=window.__lib||{};window.__lib.firebase={initializeApp:pi,auth:{initializeAuth:qi,indexedDBLocalPersistence:Xi,browserLocalPersistence:Qi,inMemoryPersistence:Wt,createUserWithEmailAndPassword:Wi,signInWithEmailAndPassword:Hi,sendEmailVerification:zi,sendPasswordResetEmail:$i,updateProfile:Gi,signOut:Ji,onAuthStateChanged:Ki,reload:rr,deleteUser:Yi,reauthenticateWithCredential:Bi,EmailAuthProvider:Te,GoogleAuthProvider:He,signInWithCredential:ir,signInWithCustomToken:ji,getIdTokenResult:nr},functions:{getFunctions:xa,httpsCallable:Ma},firestore:{getFirestore:Js,doc:Qs,getDoc:ao,setDoc:uo,deleteDoc:ho,collection:Ys,query:no,where:ro,limit:so,getDocs:co,serverTimestamp:fo,writeBatch:Hc,orderBy:io,updateDoc:lo}};})();
/*! Bundled license information:

@firebase/util/dist/postinstall.mjs:
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/component/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/logger/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC.
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC.
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC.
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC.
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/auth/dist/esm/index-LY22yodV.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/functions/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/functions/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/functions/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/webchannel-wrapper/dist/bloom-blob/esm/bloom_blob_es2018.js:
  (** @license
  Copyright The Closure Library Authors.
  SPDX-License-Identifier: Apache-2.0
  *)
  (** @license
  
   Copyright The Closure Library Authors.
   SPDX-License-Identifier: Apache-2.0
  *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * Copyright 2021 M.Vokhmentsev
   *
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2018 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2024 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/common-cp9aWj68.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/firestore/dist/lite/index.browser.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
*/
