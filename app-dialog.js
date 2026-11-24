(function(global){
'use strict';

let queue=Promise.resolve();

function button(label,className,value){
  const element=document.createElement('button');element.type='button';element.textContent=label;element.className=className;element.dataset.dialogValue=value;return element;
}
function show(options={}){
  return new Promise(resolve=>{
    const kind=options.kind||'alert',previous=document.activeElement,overlay=document.createElement('div'),dialog=document.createElement('section'),title=document.createElement('h2'),message=document.createElement('p'),actions=document.createElement('div');
    overlay.className='app-dialog-overlay';overlay.setAttribute('role','presentation');dialog.className=`app-dialog app-dialog-${kind}`;dialog.setAttribute('role',kind==='alert'?'alertdialog':'dialog');dialog.setAttribute('aria-modal','true');title.id=`appDialogTitle-${Date.now()}`;title.textContent=options.title||(kind==='confirm'?'Bitte bestätigen':kind==='prompt'?'Eingabe':'Hinweis');dialog.setAttribute('aria-labelledby',title.id);message.className='app-dialog-message';message.textContent=String(options.message??'');dialog.append(title,message);
    let input=null;if(kind==='prompt'){input=document.createElement('input');input.type='text';input.className='app-dialog-input';input.value=String(options.defaultValue??'');input.maxLength=Number(options.maxLength)||120;input.setAttribute('aria-label',options.inputLabel||title.textContent);dialog.append(input)}
    actions.className='app-dialog-actions';if(kind!=='alert')actions.append(button(options.cancelLabel||'Abbrechen','secondary','cancel'));actions.append(button(options.confirmLabel||(kind==='alert'?'OK':'Bestätigen'),options.danger?'danger':'primary','confirm'));dialog.append(actions);overlay.append(dialog);document.body.append(overlay);document.body.classList.add('app-dialog-open');
    let finished=false;const finish=value=>{if(finished)return;finished=true;document.removeEventListener('keydown',onKey);overlay.remove();if(!document.querySelector('.app-dialog-overlay'))document.body.classList.remove('app-dialog-open');if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value)},onKey=event=>{if(event.key==='Escape'){event.preventDefault();finish(kind==='alert'?true:kind==='prompt'?null:false)}if(event.key==='Enter'&&kind==='prompt'){event.preventDefault();finish(input.value)}if(event.key==='Tab'){const focusable=[...dialog.querySelectorAll('input,button:not([disabled])')];if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};
    document.addEventListener('keydown',onKey);overlay.addEventListener('click',event=>{const selected=event.target.closest('[data-dialog-value]');if(selected){finish(selected.dataset.dialogValue==='confirm'?(kind==='prompt'?input.value:true):(kind==='prompt'?null:false));return}if(event.target===overlay&&kind!=='alert')finish(kind==='prompt'?null:false)});
    requestAnimationFrame(()=>{(input||actions.querySelector('[data-dialog-value="confirm"]'))?.focus();if(input)input.select()});
  });
}
function enqueue(options){const pending=queue.then(()=>show(options));queue=pending.catch(()=>{});return pending}
function appAlert(message,options={}){return enqueue({...options,kind:'alert',message})}
function appConfirm(message,options={}){const danger=options.danger??/(?:löschen|entfernen|widerrufen|überschreiben|abbrechen|rückgängig)/i.test(String(message));return enqueue({...options,danger,kind:'confirm',message})}
function appPrompt(message,defaultValue='',options={}){return enqueue({...options,kind:'prompt',message,defaultValue})}

global.T20Dialog={alert:appAlert,confirm:appConfirm,prompt:appPrompt};global.appAlert=appAlert;global.appConfirm=appConfirm;global.appPrompt=appPrompt;
})(window);
