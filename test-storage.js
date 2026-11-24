(()=>{
  const prefix="triple20-test:";
  const storage=window.localStorage;
  const namespacedKey=key=>prefix+String(key);
  const keys=()=>Array.from({length:storage.length},(_,index)=>storage.key(index)).filter(key=>key&&key.startsWith(prefix));
  const api={
    getItem:key=>storage.getItem(namespacedKey(key)),
    setItem:(key,value)=>storage.setItem(namespacedKey(key),String(value)),
    removeItem:key=>storage.removeItem(namespacedKey(key)),
    clear:()=>keys().forEach(key=>storage.removeItem(key)),
    key:index=>{const key=keys()[Number(index)];return key?key.slice(prefix.length):null}
  };
  Object.defineProperty(api,'length',{enumerable:true,get:()=>keys().length});
  Object.defineProperty(window,'T20BrowserStorage',{value:api,writable:false,configurable:false});
})();
