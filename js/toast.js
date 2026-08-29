window.Toast = (function(){
  function show(msg){
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(()=>{ el.classList.add('leaving'); setTimeout(()=>el.remove(), 180); }, 2400);
  }
  return { show };
})();
