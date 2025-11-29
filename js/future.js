// Demographic projection script (CBR/CDR/migration) using Chart.js
(async function(){
  const dataResp = await fetch('data/population-census.json');
  const census = await dataResp.json();
  census.sort((a,b)=>a.year-b.year);

  // Convert census (multi-year) into annual series by linear interpolation
  function annualize(census){
    const years = [];
    const pops = [];
    for(let i=0;i<census.length-1;i++){
      const a = census[i];
      const b = census[i+1];
      const span = b.year - a.year;
      for(let y=0;y<span;y++){
        years.push(a.year + y);
        const t = y / span;
        pops.push(Math.round(a.population + (b.population - a.population) * t));
      }
    }
    // push last census year
    const last = census[census.length-1];
    years.push(last.year);
    pops.push(last.population);
    return { years, pops };
  }

  const hist = annualize(census);

  // --- ingest optional vital events / migration CSVs (if present) ---
  async function tryLoadCsv(path){
    try{
      const resp = await fetch(path);
      if(!resp.ok) return null;
      const txt = await resp.text();
      return parseSimpleCsv(txt);
    }catch(e){ return null; }
  }

  function parseSimpleCsv(text){
    const lines = text.replace(/\r/g,'').split('\n').map(l=>l.trim()).filter(l=>l.length>0);
    if(lines.length === 0) return [];
    const header = lines[0].split(',').map(h=>h.trim());
    const rows = [];
    for(let i=1;i<lines.length;i++){
      const parts = lines[i].split(',');
      const obj = {};
      for(let j=0;j<header.length;j++){
        obj[header[j]] = (parts[j]||'').trim();
      }
      rows.push(obj);
    }
    return rows;
  }

  function parseYearCell(v){
    if(!v) return null;
    const m = v.match(/(\d{4})/);
    return m ? Number(m[1]) : (isFinite(Number(v)) ? Number(v) : null);
  }

  // load available CSVs (best-effort)
  const birthsCsv = await tryLoadCsv('data/nascuti.csv');
  const deathsCsv = await tryLoadCsv('data/morti.csv');
  const emigrCsv = await tryLoadCsv('data/emigratie_permanenta.csv');
  const immigrCsv = await tryLoadCsv('data/imigratie permantenta.csv');

  const birthsByYear = {};
  const deathsByYear = {};
  const emigrByYear = {};
  const immigrByYear = {};

  if(Array.isArray(birthsCsv)){
    for(const r of birthsCsv){
      const y = parseYearCell(Object.values(r)[0]);
      const val = Number(Object.values(r)[1] || Object.values(r)[0]);
      if(y && isFinite(val)) birthsByYear[y] = Number(val);
    }
  }
  if(Array.isArray(deathsCsv)){
    for(const r of deathsCsv){
      const y = parseYearCell(Object.values(r)[0]);
      const val = Number(Object.values(r)[1] || Object.values(r)[0]);
      if(y && isFinite(val)) deathsByYear[y] = Number(val);
    }
  }
  if(Array.isArray(emigrCsv)){
    for(const r of emigrCsv){
      const y = parseYearCell(Object.values(r)[0]);
      const val = Number(Object.values(r)[1] || Object.values(r)[0]);
      if(y && isFinite(val)) emigrByYear[y] = Number(val);
    }
  }
  if(Array.isArray(immigrCsv)){
    for(const r of immigrCsv){
      const y = parseYearCell(Object.values(r)[0]);
      const val = Number(Object.values(r)[1] || Object.values(r)[0]);
      if(y && isFinite(val)) immigrByYear[y] = Number(val);
    }
  }

  // compute net migration per year (immigrants - emigrants) when both present
  const netMigByYear = {};
  const availableYears = hist.years.slice();
  for(const y of availableYears){
    const im = immigrByYear[y];
    const em = emigrByYear[y];
    if(typeof im === 'number' && typeof em === 'number') netMigByYear[y] = im - em;
  }

  // compute residual migration from census and vital events when direct series absent
  const residualMigByYear = {};
  // hist.pops aligns to hist.years; residual for year y uses pop[y] and pop[y+1]
  for(let i=0;i<hist.years.length-1;i++){
    const y = hist.years[i];
    const pop_t = hist.pops[i];
    const pop_t1 = hist.pops[i+1];
    const births = birthsByYear[y];
    const deaths = deathsByYear[y];
    if(isFinite(pop_t) && isFinite(pop_t1) && isFinite(births) && isFinite(deaths)){
      // residual migration (persons) = change in pop - (births - deaths)
      residualMigByYear[y] = (pop_t1 - pop_t) - (births - deaths);
    }
  }

  // compute status-quo presets (mean over last N years where data exists)
  function computeStatusPresets(N = 5){
    // prepare arrays of CBR (per 1000), CDR (per 1000), and net migration (persons/year)
    const cbrs = [];
    const cdrs = [];
    const migs = [];
    // mid-year population for year y is approximated by (P_y + P_{y+1})/2 when available
    for(let i=0;i<hist.years.length-1;i++){
      const y = hist.years[i];
      const mid = (hist.pops[i] + hist.pops[i+1]) / 2;
      const b = birthsByYear[y];
      const d = deathsByYear[y];
      if(isFinite(mid) && isFinite(b)){
        cbrs.push( (b / mid) * 1000 );
      }
      if(isFinite(mid) && isFinite(d)){
        cdrs.push( (d / mid) * 1000 );
      }
      if(typeof netMigByYear[y] === 'number'){
        migs.push(netMigByYear[y]);
      } else if(typeof residualMigByYear[y] === 'number'){
        migs.push(residualMigByYear[y]);
      }
    }
    // take last N values of each (if available)
    const tail = (arr) => arr.slice(Math.max(0, arr.length - N));
    const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;

    return {
      cbr: avg(tail(cbrs)),
      cdr: avg(tail(cdrs)),
      mig: avg(tail(migs)),
      source: {
        birthsYears: Object.keys(birthsByYear).map(Number).sort(),
        deathsYears: Object.keys(deathsByYear).map(Number).sort(),
        immigrYears: Object.keys(immigrByYear).map(Number).sort(),
        emigrYears: Object.keys(emigrByYear).map(Number).sort()
      }
    };
  }

  const computedPresets = computeStatusPresets(5);

  function formatNum(n){ return Math.round(n).toLocaleString('ro-RO'); }

  function makeProjectionDemographic(opts){
    // opts: { baseYear, basePop, years, cbr, cdr, migNet }
    const years = [];
    const pops = [];
    let year = opts.baseYear;
    let pop = opts.basePop;
    for(let i=0;i<=opts.years;i++){
      years.push(year+i);
      pops.push(Math.max(0, Math.round(pop)));
      // births/deaths per year
      const births = pop * (opts.cbr/1000);
      const deaths = pop * (opts.cdr/1000);
      pop = pop + births - deaths + opts.migNet;
      if(!isFinite(pop) || pop < 0) pop = 0;
    }
    return { years, pops };
  }

  // --- alternative projection methods ---
  function projectFixedIndex(opts){
    // opts: { baseYear, basePop, years, indexPercent }
    const years = [];
    const pops = [];
    let pop = opts.basePop;
    const mult = 1 + (Number(opts.indexPercent) || 0)/100;
    for(let i=0;i<=opts.years;i++){
      years.push(opts.baseYear + i);
      pops.push(Math.max(0, Math.round(pop)));
      pop = pop * mult;
      if(!isFinite(pop) || pop < 0) pop = 0;
    }
    return { years, pops };
  }

  function projectSubtractPerYear(opts){
    // opts: { baseYear, basePop, years, delta }
    const years = [];
    const pops = [];
    let pop = opts.basePop;
    const d = Number(opts.delta) || 0;
    for(let i=0;i<=opts.years;i++){
      years.push(opts.baseYear + i);
      pops.push(Math.max(0, Math.round(pop)));
      pop = pop + d;
      if(!isFinite(pop) || pop < 0) pop = 0;
    }
    return { years, pops };
  }

  function computeAutoRate(yearsBack){
    // compute geometric annual growth rate using last `yearsBack` years from hist
    const n = Math.min(yearsBack, hist.years.length-1);
    if(n < 1) return 0;
    const last = hist.pops[hist.pops.length-1];
    const prev = hist.pops[hist.pops.length-1-n];
    if(!prev || prev <= 0) return 0;
    return Math.pow(last/prev, 1/n) - 1;
  }

  function computeAvgDelta(yearsBack){
    // compute average absolute change (persons per year) over the last `yearsBack` years
    const n = Math.min(yearsBack, hist.years.length-1);
    if(n < 1) return 0;
    let sum = 0;
    let count = 0;
    for(let i = hist.pops.length - n; i < hist.pops.length; i++){
      if(i <= 0) continue;
      const diff = hist.pops[i] - hist.pops[i-1];
      if(isFinite(diff)){
        sum += diff;
        count++;
      }
    }
    if(count === 0) return 0;
    return sum / count;
  }

  function projectRateBased(opts){
    // opts: { baseYear, basePop, years, ratePercent, auto }
    let rate = Number(opts.ratePercent);
    if(opts.auto){
      // use last 5 years by default
      rate = computeAutoRate(5) * 100; // as percent
    }
    const mult = 1 + (Number(rate) || 0)/100;
    const years = [];
    const pops = [];
    let pop = opts.basePop;
    for(let i=0;i<=opts.years;i++){
      years.push(opts.baseYear + i);
      pops.push(Math.max(0, Math.round(pop)));
      pop = pop * mult;
      if(!isFinite(pop) || pop < 0) pop = 0;
    }
    return { years, pops };
  }

  // helper: compute nice y-max
  function computeYMax(values){
    const nums = values.filter(v=>typeof v === 'number' && isFinite(v));
    if(nums.length === 0) return 1;
    const m = Math.max(...nums);
    return Math.ceil(m * 1.03);
  }

  // Plugin to draw a dashed marker/label for the real projection value when the
  // displayed chart is capped for readability.
  const realProjectionMarker = {
    id: 'realProjectionMarker',
    afterDraw(chart) {
      try{
        const meta = chart._realProjectionMeta;
        if(!meta) return;
        const ctx = chart.ctx;
        const yScale = chart.scales.y;
        const xScale = chart.scales.x;
        const canvas = chart.canvas;
        const allowedMax = meta.allowedMax;
        const realFinal = meta.realFinal;
        const isClipped = meta.isClipped;

        // draw only when clipped or when explicitly requested
        if(!isClipped) return;

        // pixel for the allowed max (top of visible area)
        const yPixel = yScale.getPixelForValue(allowedMax);

        ctx.save();
        ctx.setLineDash([6,6]);
        ctx.strokeStyle = 'rgba(220,53,69,0.9)'; // bootstrap danger-ish
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xScale.left, yPixel);
        ctx.lineTo(xScale.right, yPixel);
        ctx.stroke();

        // draw label box at right side
        const label = 'Valoare reală proiectată: ' + Number(realFinal).toLocaleString('ro-RO');
        ctx.font = '12px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
        const padding = 6;
        const textWidth = ctx.measureText(label).width;
        const boxWidth = textWidth + padding*2;
        const boxHeight = 20;
        const boxX = Math.min(xScale.right - boxWidth - 8, xScale.right - boxWidth);
        const boxY = Math.max(8, yPixel - boxHeight - 4);

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = 'rgba(220,53,69,0.9)';
        ctx.lineWidth = 1;
        roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 4, true, true);

        ctx.fillStyle = 'rgba(33,37,41,0.95)';
        ctx.fillText(label, boxX + padding, boxY + 14);

        ctx.restore();
      }catch(e){/* drawing best-effort; ignore errors */}
    }
  };

  // helper: rounded rectangle for label background
  function roundRect(ctx, x, y, width, height, radius, fill, stroke){
    if(typeof radius === 'undefined') radius = 5;
    ctx.beginPath();
    ctx.moveTo(x+radius, y);
    ctx.arcTo(x+width, y, x+width, y+height, radius);
    ctx.arcTo(x+width, y+height, x, y+height, radius);
    ctx.arcTo(x, y+height, x, y, radius);
    ctx.arcTo(x, y, x+width, y, radius);
    ctx.closePath();
    if(fill) ctx.fill();
    if(stroke) ctx.stroke();
  }

  // register plugin globally
  Chart.register(realProjectionMarker);

  // create / update chart helper
  function createLineChart(canvas, labels, datasets, opts){
    const ctx = canvas.getContext('2d');
    const baseOpts = Object.assign({
      responsive: true,
      // default to not preserving aspect ratio unless caller requests it
      maintainAspectRatio: typeof (opts && opts.maintainAspectRatio) !== 'undefined' ? opts.maintainAspectRatio : false,
      plugins: { legend: { display: true } },
      scales: { x: { title: { display: true, text: 'An' } }, y: { title: { display: true, text: 'Populație' }, beginAtZero: true } }
    }, opts || {});

    return new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: baseOpts
    });
  }

  // --- Full page chart ---
  const fullCanvas = document.getElementById('futureChart');
  let fullChart = null;
  if(fullCanvas){
    // initial empty chart (we'll update with data)
    fullChart = createLineChart(fullCanvas, hist.years.slice(), [
      { label: 'Istoric (estimate anuale)', data: hist.pops.slice(), borderColor: '#6f42c1', backgroundColor: 'rgba(111,66,193,0.08)', pointRadius:2, tension:0.2 },
      { label: 'Proiecție (afișată)', data: new Array(hist.years.length).fill(null), borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,0.08)', pointRadius:0, tension:0.3 }
    ], { plugins: { legend: { position: 'top' } }, maintainAspectRatio: true, aspectRatio: 2.4 });

    // UI bindings
    const cbrEl = document.getElementById('cbr');
    const cdrEl = document.getElementById('cdr');
    const migNet = document.getElementById('migNet');
    const horizon = document.getElementById('horizon');
    const scenario = document.getElementById('scenario');
    const applyBtn = document.getElementById('applyBtn');
    const methodEl = document.getElementById('method');
    const methodParamEl = document.getElementById('methodParam');
    const methodParamLabelEl = document.getElementById('methodParamLabel');

    function updateMethodUI(){
      const m = methodEl ? methodEl.value : 'demographic';
      const topMode = (document.getElementById('modeSelect') && document.getElementById('modeSelect').value) || 'params';
      if(!methodParamEl || !methodParamLabelEl) return;
      if(m === 'demographic'){
        methodParamLabelEl.textContent = 'Parametru metodă';
        methodParamEl.placeholder = 'neutilizat pentru modelul demografic';
        methodParamEl.value = '';
      } else if(m === 'fixedIndex'){
        methodParamLabelEl.textContent = 'Indice (% anual)';
        if(topMode === 'indices'){
          methodParamEl.placeholder = 'auto  — calculează rata din ultimii ani (serie timp)';
          if(methodParamEl.value.trim() === '') methodParamEl.value = 'auto';
        } else {
          methodParamEl.placeholder = '-1  (ex: -1 pentru -1% pe an)';
          if(methodParamEl.value.trim() === '') methodParamEl.value = '-1';
        }
      } else if(m === 'subtractPerYear'){
        methodParamLabelEl.textContent = 'Delta (persoane/an)';
        if(topMode === 'indices'){
          methodParamEl.placeholder = 'auto  — calculează delta medie anuală din ultimii ani';
          if(methodParamEl.value.trim() === '') methodParamEl.value = 'auto';
        } else {
          methodParamEl.placeholder = '-50000  (ex: -50000 pentru pierdere netă anuală)';
          if(methodParamEl.value.trim() === '') methodParamEl.value = '-50000';
        }
      } else if(m === 'rateBased'){
        methodParamLabelEl.textContent = 'Rată (%) sau "auto"';
        methodParamEl.placeholder = 'auto  — estimează din istoric (ultimii 5 ani)';
        if(methodParamEl.value.trim() === '') methodParamEl.value = 'auto';
      }
    }
    if(methodEl) methodEl.addEventListener('change', updateMethodUI);
    // initialise
    updateMethodUI();

    // mode select (params vs indices) and indexChoice wiring
    const modeSelect = document.getElementById('modeSelect');
    const indexChoice = document.getElementById('indexChoice');
    const indexChoiceWrap = document.getElementById('indexChoiceWrap');
    const paramsWrap = document.getElementById('paramsWrap');
    const methodWrap = document.getElementById('methodWrap');
    function updateModeUI(){
      const mode = modeSelect ? modeSelect.value : 'params';
      if(mode === 'indices'){
        // show indexChoice, hide demographic parameter inputs and methodWrap (method chosen via indexChoice)
        if(indexChoiceWrap) indexChoiceWrap.style.display = '';
        if(indexChoice && methodEl) methodEl.value = indexChoice.value;
        if(paramsWrap) paramsWrap.style.display = 'none';
        if(methodWrap) methodWrap.style.display = 'none';
        // set methodParam to auto for indices mode unless user overrides
        if(methodParamEl) methodParamEl.value = 'auto';
      } else {
        // params mode: hide indexChoice and force method to demographic; show demographic params and method selector
        if(indexChoiceWrap) indexChoiceWrap.style.display = 'none';
        if(methodEl) methodEl.value = 'demographic';
        if(paramsWrap) paramsWrap.style.display = '';
        if(methodWrap) methodWrap.style.display = '';
      }
      // ensure method UI reflects the (possibly updated) method
      updateMethodUI();
    }
    if(modeSelect) modeSelect.addEventListener('change', updateModeUI);
    if(indexChoice) indexChoice.addEventListener('change', function(){ if(methodEl && indexChoice) { methodEl.value = indexChoice.value; updateMethodUI(); } });
    // initialize mode UI
    updateModeUI();

    function applyScenario(){
      const scen = scenario.value;
      let cbr = parseFloat(cbrEl.value) || 10.6;
      let cdr = parseFloat(cdrEl.value) || 17.6;
      let mig = parseInt(migNet.value) || 0;
      let yrs = parseInt(horizon.value) || 30;

      // presets using demographic intuition (CBR per 1000, CDR per 1000, migration persons/year)
      if(scen === 'status'){
        // use computed presets from user-provided vital/migration series when available
        if(computedPresets && isFinite(computedPresets.cbr) && isFinite(computedPresets.cdr) && isFinite(computedPresets.mig)){
          cbr = Number(computedPresets.cbr.toFixed(3));
          cdr = Number(computedPresets.cdr.toFixed(3));
          mig = Math.round(computedPresets.mig);
        } else {
          // fallbacks if user data not available
          cbr = 10.6; // recent default
          cdr = 17.6;
          mig = -50000;
        }
      } else if(scen === 'pessimistic'){
        cbr = 9.5;
        cdr = 18.0;
        mig = -100000;
      } else if(scen === 'pronatalist'){
        // Pronatalist: start from status-quo presets and increase only CBR by +2‰
        if(computedPresets && isFinite(computedPresets.cbr) && isFinite(computedPresets.cdr) && isFinite(computedPresets.mig)){
          cbr = Number((computedPresets.cbr + 2.0).toFixed(3));
          cdr = Number(computedPresets.cdr.toFixed(3));
          mig = Math.round(computedPresets.mig);
        } else {
          // fallback to previous defaults but still only adjust natality relative to status fallback
          const fallback_status_cbr = 10.6;
          const fallback_status_cdr = 17.6;
          const fallback_status_mig = -50000;
          cbr = Number((fallback_status_cbr + 2.0).toFixed(3));
          cdr = fallback_status_cdr;
          mig = fallback_status_mig;
        }
      }

      // If a preset scenario was selected, update the input fields so the user sees
      // the values. If 'custom' is selected, leave inputs untouched.
      if(scen !== 'custom'){
        cbrEl.value = cbr;
        cdrEl.value = cdr;
        migNet.value = mig;
        horizon.value = yrs;
      }

      // ensure numeric
      cbr = Number(cbr); cdr = Number(cdr); mig = Number(mig);

      const methodEl = document.getElementById('method');
      const methodParam = (document.getElementById('methodParam') && document.getElementById('methodParam').value) || '';

      const lastYear = hist.years[hist.years.length-1];
      const lastPop = hist.pops[hist.pops.length-1];

      // decide which projection method to use
      let proj = null;
      const method = methodEl ? methodEl.value : 'demographic';
      if(method === 'demographic'){
        proj = makeProjectionDemographic({ baseYear: lastYear, basePop: lastPop, years: yrs, cbr, cdr, migNet: mig });
      } else if(method === 'fixedIndex'){
        // methodParam expected as percent (e.g. -1 or 0.5); allow 'auto' to compute from history
        if(methodParam.trim().toLowerCase() === '' || methodParam.trim().toLowerCase() === 'auto'){
          const autoRate = computeAutoRate(5) * 100; // percent
          proj = projectFixedIndex({ baseYear: lastYear, basePop: lastPop, years: yrs, indexPercent: autoRate });
        } else {
          const idx = parseFloat(methodParam);
          proj = projectFixedIndex({ baseYear: lastYear, basePop: lastPop, years: yrs, indexPercent: idx });
        }
      } else if(method === 'subtractPerYear'){
        // methodParam expected as integer persons/year (or 'auto' to compute average annual delta)
        if(methodParam.trim().toLowerCase() === '' || methodParam.trim().toLowerCase() === 'auto'){
          const avg = Math.round(computeAvgDelta(5));
          proj = projectSubtractPerYear({ baseYear: lastYear, basePop: lastPop, years: yrs, delta: avg });
        } else {
          const d = parseInt(methodParam);
          proj = projectSubtractPerYear({ baseYear: lastYear, basePop: lastPop, years: yrs, delta: d });
        }
      } else if(method === 'rateBased'){
        // if user leaves param blank or uses 'auto', compute auto rate from history
        const param = methodParam.trim().toLowerCase();
        if(param === '' || param === 'auto'){
          proj = projectRateBased({ baseYear: lastYear, basePop: lastPop, years: yrs, auto: true });
        } else {
          const r = parseFloat(param);
          proj = projectRateBased({ baseYear: lastYear, basePop: lastPop, years: yrs, ratePercent: r, auto: false });
        }
      } else {
        // fallback to demographic
        proj = makeProjectionDemographic({ baseYear: lastYear, basePop: lastPop, years: yrs, cbr, cdr, migNet: mig });
      }

  // combine annual historic series (up to lastYear) and projected years (skip duplicate lastYear)
  const combinedLabels = hist.years.slice().concat(proj.years.slice(1));
  const histExtended = hist.pops.slice().concat(new Array(proj.years.length-1).fill(null));

  // we'll prepare both the displayed (possibly clamped) projection and the real projection
  // Use hist.years.length nulls so the projection values start after the last historical year
  const projSeriesReal = new Array(hist.years.length).fill(null).concat(proj.pops.slice(1));

      // scale y-axis safely (no negative/inf).
      // Prevent the axis from growing without bound for optimistic scenarios by capping
      // the allowed increase relative to the historical maximum. We will also cap the
      // displayed projection values so the visual doesn't explode; the true numeric
      // projection will be shown in the summary for transparency.
      const histNums = hist.pops.filter(v=>typeof v === 'number' && isFinite(v));
      const histMax = histNums.length ? Math.max(...histNums) : 1;
      const projNums = proj.pops.filter(v=>typeof v === 'number' && isFinite(v));
      const projMax = projNums.length ? Math.max(...projNums) : histMax;
      const allowedMax = histMax * 1.5;


  // Prepare the displayed projection series: clamp values above allowedMax so the
  // chart stays readable. Keep the real projection numbers for the numeric summary and table.
  const realProj = proj.pops.slice();
  const displayProj = proj.pops.map(v => (typeof v === 'number' && isFinite(v)) ? Math.min(v, allowedMax) : null);
  const visibleProjSeries = new Array(hist.years.length).fill(null).concat(displayProj.slice(1));

  fullChart.data.labels = combinedLabels;
  fullChart.data.datasets[0].data = histExtended;
  fullChart.data.datasets[1].data = visibleProjSeries;

      // set y-axis limits: if projection fits under the allowed max, use a small padding;
      // otherwise cap at allowedMax
      let yMax;
      if(projMax <= allowedMax){
        yMax = Math.ceil(Math.max(histMax, projMax) * 1.03);
      } else {
        yMax = Math.ceil(allowedMax);
      }
      // allow a higher baseline for readability if historical population is large
      const desiredYMin = 10000000; // 10 million
      const yMin = histMax >= desiredYMin ? desiredYMin : 0;
      // ensure yMax is above yMin
      if(yMax <= yMin) yMax = Math.ceil(yMin * 1.05) + 1;
      fullChart.options.scales.y.min = yMin;
      fullChart.options.scales.y.max = yMax;

      // attach meta so the drawing plugin can show the real projection marker
      fullChart._realProjectionMeta = {
        allowedMax: allowedMax,
        realFinal: realProj[realProj.length-1],
        isClipped: projMax > allowedMax
      };

      fullChart.update();

      // summary (show the true projected final population even if chart is capped)
      const endPop = realProj[realProj.length-1];
      const expl = document.getElementById('explain');
      const prev = document.getElementById('projSummary');
      if(prev) prev.remove();
      const summary = document.createElement('div');
      summary.className = 'mt-2 alert alert-light';
      summary.id = 'projSummary';
      let note = '';
      if(projMax > allowedMax){
        note = `<div class="small text-muted">Notă: graficul este limitat vizual la ${formatNum(Math.ceil(allowedMax))} (max istoric ×1.5) pentru lizibilitate; valoarea proiectată reală este afișată mai jos.</div>`;
      }
      // include method description in the summary
      const methodName = (function(){
        if(!methodEl) return 'Model demografic';
        const m = methodEl.value;
        if(m === 'demographic') return 'Model demografic (CBR/CDR/mig)';
        if(m === 'fixedIndex') return 'Indice fix (% anual)';
        if(m === 'subtractPerYear') return 'Scădere/creștere fixă (persoane/an)';
        if(m === 'rateBased') return 'Rată anuală (procent)';
        return m;
      })();
      const paramDisplay = (typeof methodParam === 'string' && methodParam.trim() !== '') ? ` Parametru: ${methodParam}` : '';
      summary.innerHTML = `<strong>Rezultat:</strong> Populația estimată în ${proj.years[proj.years.length-1]} este <strong>${formatNum(endPop)}</strong> (de la ${formatNum(lastPop)} în ${lastYear}).<div class="small text-muted">Metodă: ${methodName}.${paramDisplay}</div>${note}`;
      if(expl) expl.appendChild(summary);

      // --- render a table with the real projection series and download button ---
      const existingTable = document.getElementById('projTable');
      if(existingTable) existingTable.remove();
      const tableWrap = document.createElement('div');
      tableWrap.id = 'projTable';
      tableWrap.className = 'mt-3';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn btn-outline-secondary btn-sm mb-2';
      dlBtn.textContent = 'Descarcă proiecția (CSV)';
      dlBtn.type = 'button';
      tableWrap.appendChild(dlBtn);

      const tbl = document.createElement('table');
      tbl.className = 'table table-sm table-striped';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>An</th><th>Populație proiectată (reală)</th></tr>';
      tbl.appendChild(thead);
      const tb = document.createElement('tbody');
      for(let i=0;i<proj.years.length;i++){
        const tr = document.createElement('tr');
        const yr = document.createElement('td'); yr.textContent = proj.years[i];
        const pv = document.createElement('td'); pv.textContent = formatNum(Math.round(realProj[i]));
        tr.appendChild(yr); tr.appendChild(pv);
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      tableWrap.appendChild(tbl);
      if(expl) expl.appendChild(tableWrap);

      // CSV download
      dlBtn.addEventListener('click', function(){
        const rows = [['year','population']];
        for(let i=0;i<proj.years.length;i++) rows.push([proj.years[i], Math.round(realProj[i])]);
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `projection_${lastYear}_${proj.years[proj.years.length-1]}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      });
    }

    if(applyBtn) applyBtn.addEventListener('click', applyScenario);
    // when the scenario selector changes, apply the scenario (and populate inputs
    // when a preset is chosen). If user selects 'custom', inputs are left unchanged.
    if(scenario) scenario.addEventListener('change', applyScenario);
    // initial draw with status quo
    if(applyBtn) applyBtn.click();
  }

  // --- Mini preview on index ---
  const miniCanvas = document.getElementById('futureMini');
  if(miniCanvas){
    // small default projection (15 years) using recent CBR/CDR & migration
    const lastYear = hist.years[hist.years.length-1];
    const lastPop = hist.pops[hist.pops.length-1];
    const proj = makeProjectionDemographic({ baseYear: lastYear, basePop: lastPop, years: 15, cbr:10.6, cdr:17.6, migNet:-50000 });

  const combinedLabels = hist.years.slice().concat(proj.years.slice(1));
  const histExtended = hist.pops.slice().concat(new Array(proj.years.length-1).fill(null));
  const projSeries = new Array(hist.years.length).fill(null).concat(proj.pops.slice(1));

    const ctx2 = miniCanvas.getContext('2d');
    const miniChart = createLineChart(miniCanvas, combinedLabels, [
      { label: 'Istoric', data: histExtended, borderColor: '#6f42c1', pointRadius:1, tension:0.2 },
      { label: 'Proiecție', data: projSeries, borderColor: '#0d6efd', pointRadius:0, tension:0.3 }
    ], { plugins: { legend: { display: false } } });

    // scale (apply same safety cap as the full chart so very-large projections
    // don't blow up the mini preview)
    const combinedNums = histExtended.concat(projSeries).filter(v=>typeof v === 'number' && isFinite(v));
    const histNums = hist.pops.filter(v=>typeof v === 'number' && isFinite(v));
    const histMax = histNums.length ? Math.max(...histNums) : 1;
    const projNums = proj.pops.filter(v=>typeof v === 'number' && isFinite(v));
    const projMax = projNums.length ? Math.max(...projNums) : histMax;
    const allowedMax = histMax * 1.5;
    let miniYMax;
    if(projMax <= allowedMax){
      miniYMax = computeYMax(combinedNums);
    } else {
      miniYMax = Math.ceil(allowedMax);
    }
    // apply same baseline policy as full chart: if history justifies it, start at 10M
    const desiredYMin = 10000000;
    const miniYMin = histMax >= desiredYMin ? desiredYMin : 0;
    if(miniYMax <= miniYMin) miniYMax = Math.ceil(miniYMin * 1.05) + 1;
    miniChart.options.scales.y.min = miniYMin;
    miniChart.options.scales.y.max = miniYMax;
    miniChart.update();
  }

})();
