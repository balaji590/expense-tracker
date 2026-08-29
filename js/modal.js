window.Modal = (function(){
  const root = () => document.getElementById('modalRoot');
  let escBound = false;

  function close(){
    const r = root();
    const backdrop = r.querySelector('.modal-backdrop');
    if(!backdrop){ r.innerHTML=''; return; }
    if(Animate.prefersReducedMotion()){
      r.innerHTML = '';
      return;
    }
    backdrop.classList.add('closing');
    setTimeout(()=>{ r.innerHTML = ''; }, 160);
  }

  function focusFirst(box){
    const focusable = box.querySelector('input, select, textarea, button');
    if(focusable) focusable.focus();
  }

  function bindEscOnce(){
    if(escBound) return;
    escBound = true;
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && root().children.length){
        close();
      }
    });
  }

  function confirm({title, body, confirmText, danger, onConfirm}){
    root().innerHTML = `
      <div class="modal-backdrop" id="mConfirmBackdrop">
        <div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="mConfirmTitle">
          <div class="modal-title" id="mConfirmTitle">${Utils.escapeHtml(title)}</div>
          <div class="modal-body">${body}</div>
          <div class="modal-actions">
            <button class="btn" id="mCancelBtn">Cancel</button>
            <button class="btn ${danger?'btn-danger':'btn-primary'}" id="mConfirmBtn">${Utils.escapeHtml(confirmText||'Confirm')}</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('mCancelBtn').onclick = close;
    document.getElementById('mConfirmBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='mConfirmBackdrop') close(); });
    document.getElementById('mConfirmBtn').onclick = ()=>{ close(); onConfirm && onConfirm(); };
    bindEscOnce();
    document.getElementById('mCancelBtn').focus();
  }

  // Pure informational notice — a single "OK" action, no Cancel. Use this
  // instead of confirm() whenever there is nothing to actually confirm/cancel
  // (e.g. "that action isn't possible right now").
  function alert({title, body, okText, onClose}){
    root().innerHTML = `
      <div class="modal-backdrop" id="mAlertBackdrop">
        <div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="mAlertTitle">
          <div class="modal-title" id="mAlertTitle">${Utils.escapeHtml(title)}</div>
          <div class="modal-body">${body}</div>
          <div class="modal-actions">
            <button class="btn btn-primary" id="mAlertOkBtn">${Utils.escapeHtml(okText||'OK')}</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('mAlertBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='mAlertBackdrop') close(); });
    document.getElementById('mAlertOkBtn').onclick = ()=>{ close(); onClose && onClose(); };
    bindEscOnce();
    document.getElementById('mAlertOkBtn').focus();
  }

  function open(innerHtml){
    root().innerHTML = `
      <div class="modal-backdrop" id="mFormBackdrop">
        <div class="modal-box form-modal" role="dialog" aria-modal="true">${innerHtml}</div>
      </div>
    `;
    document.getElementById('mFormBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='mFormBackdrop') close(); });
    bindEscOnce();
    focusFirst(root().querySelector('.modal-box'));
  }

  return { open, close, confirm, alert };
})();
