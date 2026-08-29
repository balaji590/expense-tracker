window.Charts = (function(){
  const registry = {};

  function textColor(){
    return getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim() || '#5b6169';
  }
  function gridColor(){
    return getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#e6e8eb';
  }

  function destroy(id){
    if(registry[id]){ registry[id].destroy(); delete registry[id]; }
  }

  function animConfig(){
    if(window.Animate && Animate.prefersReducedMotion()){
      return { animation: false };
    }
    return { animation: { duration: 550, easing: 'easeOutQuart' } };
  }

  function donut(canvasId, labels, values, colors){
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    registry[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: Object.assign({
        maintainAspectRatio:false,
        plugins: { legend: { position:'bottom', labels:{ color: textColor(), boxWidth:11, font:{size:11.5}, padding:12 } } },
        cutout: '62%'
      }, animConfig())
    });
  }

  function bar(canvasId, labels, datasets, opts){
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    registry[canvasId] = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets },
      options: Object.assign({
        maintainAspectRatio:false,
        plugins:{ legend:{ display: datasets.length>1, position:'bottom', labels:{color:textColor(), boxWidth:11, font:{size:11.5}} } },
        scales:{
          x:{ ticks:{color:textColor(), font:{size:11}}, grid:{display:false} },
          y:{ beginAtZero:true, ticks:{color:textColor(), font:{size:11}, callback:v=>Utils.fmtMoney(v)}, grid:{color:gridColor()} }
        }
      }, animConfig(), opts||{})
    });
  }

  function line(canvasId, labels, values, label){
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    registry[canvasId] = new Chart(ctx, {
      type:'line',
      data:{ labels, datasets:[{ label, data: values, borderColor: accent, backgroundColor: accent+'22', fill:true, tension:0.35, pointRadius:3 }] },
      options: Object.assign({
        maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{
          x:{ ticks:{color:textColor(), font:{size:11}}, grid:{display:false} },
          y:{ beginAtZero:true, ticks:{color:textColor(), font:{size:11}, callback:v=>Utils.fmtMoney(v)}, grid:{color:gridColor()} }
        }
      }, animConfig())
    });
  }

  return { donut, bar, line, destroy };
})();
