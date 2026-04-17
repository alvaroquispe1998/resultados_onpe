const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const fs = require("fs");
const HISTORY_FILE = "history.json";

// Almacén de historial en memoria
let historySnapshots = [];
let lastActasPercent = -1;
let lastTotalVotes = -1;

function updateHistory(currentData, actasPercent, summaryData) {
  const totalVotes = currentData.reduce((acc, item) => acc + (item.totalVotosValidos || 0), 0);
  
  // Si no hay cambios en nada, no hacer nada
  if (actasPercent === lastActasPercent && totalVotes === lastTotalVotes) return;

  const snapshot = {
    timestamp: new Date().toLocaleTimeString("es-PE", { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZone: "America/Lima" 
    }),
    actasPercent: actasPercent,
    totalVotes: totalVotes,
    summary: summaryData, // Guardar también el resumen para sus incrementales
    results: currentData.map(item => ({
      name: item.nombreAgrupacionPolitica,
      votos: item.totalVotosValidos,
      porcValido: item.porcentajeVotosValidos,
      porcEmitido: item.porcentajeVotosEmitidos
    }))
  };

  if (actasPercent === lastActasPercent && totalVotes > lastTotalVotes && historySnapshots.length > 0) {
    historySnapshots[historySnapshots.length - 1] = snapshot;
  } else {
    historySnapshots.push(snapshot);
  }

  lastActasPercent = actasPercent;
  lastTotalVotes = totalVotes;

  
  if (historySnapshots.length > 2000) historySnapshots.shift();

  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historySnapshots), "utf-8");
  } catch (err) {
    console.error("Error guardando historial:", err);
  }
}

// Cargar historial al iniciar
try {
  if (fs.existsSync(HISTORY_FILE)) {
    const data = fs.readFileSync(HISTORY_FILE, "utf-8");
    historySnapshots = JSON.parse(data);
    if (historySnapshots.length > 0) {
      const last = historySnapshots[historySnapshots.length - 1];
      lastActasPercent = last.actasPercent;
      lastTotalVotes = last.totalVotes || -1;
      console.log(`Historial cargado: ${historySnapshots.length} capturas.`);
    }
  }
} catch (err) {
  console.error("Error cargando historial:", err);
}

const ONPE_RESULTS_URL =
  "https://resultadoelectoral.onpe.gob.pe/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre?idEleccion=10&tipoFiltro=eleccion";

const ONPE_SUMMARY_URL =
  "https://resultadoelectoral.onpe.gob.pe/presentacion-backend/resumen-general/totales?idEleccion=10&tipoFiltro=eleccion";

function fetchFromOnpe(targetUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);

    const options = {
      method: "GET",
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,es-PE;q=0.8,es-ES;q=0.7,es-MX;q=0.6,es;q=0.5",
        "content-type": "application/json",
        "priority": "u=1, i",
        "referer": "https://resultadoelectoral.onpe.gob.pe/main/presidenciales",
        "sec-ch-ua": `"Microsoft Edge";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": `"Windows"`,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (err) {
          reject(new Error("No se pudo parsear la respuesta de ONPE"));
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

function fetchOnpeData() {
  return fetchFromOnpe(ONPE_RESULTS_URL);
}

function fetchOnpeSummary() {
  return fetchFromOnpe(ONPE_SUMMARY_URL);
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-PE").format(value || 0);
}

function htmlPage() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard Electoral - ONPE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --accent: #0ea5e9;
      --emerald: #10b981;
      --gold: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      --silver: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
      --bronze: linear-gradient(135deg, #d97706 0%, #92400e 100%);
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Outfit', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      background-image: 
        radial-gradient(circle at 100% 0%, rgba(14, 165, 233, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 0% 100%, rgba(99, 102, 241, 0.05) 0%, transparent 40%);
    }

    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    header {
      margin-bottom: 40px;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 30px;
    }

    .title-group h1 {
      margin: 0;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.025em;
      color: #1e293b;
    }

    .view-selector {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      padding: 8px 16px;
      border-radius: 12px;
      font-family: inherit;
      font-weight: 600;
      color: #475569;
      outline: none;
      cursor: pointer;
      box-shadow: var(--shadow);
      transition: all 0.2s;
    }
    .view-selector:focus { border-color: var(--accent); ring: 2px solid var(--accent); }

    .progress-container {
      background: #f1f5f9;
      padding: 24px;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-weight: 600;
      color: #475569;
    }

    .progress-bar-bg {
      height: 10px;
      background: #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--accent);
      width: 0%;
      transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 0 15px rgba(14, 165, 233, 0.3);
    }

    .status {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Views */
    .view-content { display: none; margin-top: 40px; }
    .view-content.active { display: block; animation: fadeIn 0.4s ease-out; }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 32px;
      margin-bottom: 60px;
    }

    .card {
      background: var(--card-bg);
      border-radius: 24px;
      padding: 32px;
      border: 1px solid #e2e8f0;
      box-shadow: var(--shadow);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }

    .card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
      border-color: #cbd5e1;
    }

    .rank {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 24px;
      display: inline-block;
      padding: 6px 14px;
      border-radius: 99px;
      color: #fff;
    }

    .rank-1 { background: var(--gold); }
    .rank-2 { background: var(--silver); }
    .rank-3 { background: var(--bronze); }

    .party-name {
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 6px;
      color: #1e293b;
      line-height: 1.3;
    }

    .votos-value {
      font-size: 36px;
      font-weight: 800;
      margin-bottom: 4px;
      color: #0f172a;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .votos-label {
      font-size: 14px;
      color: var(--text-muted);
      font-weight: 400;
    }

    .incremental-tag {
      font-size: 14px;
      font-weight: 700;
      color: var(--emerald);
      background: rgba(16, 185, 129, 0.1);
      padding: 2px 8px;
      border-radius: 6px;
      margin-bottom: 20px;
      display: inline-block;
    }

    .card-footer {
      margin-top: 20px;
      padding-top: 24px;
      border-top: 1px solid #f1f5f9;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .stat-val { font-size: 16px; font-weight: 700; color: #0f172a; }
    .stat-lbl { font-size: 12px; color: var(--text-muted); }

    .diff {
      font-size: 13px;
      margin-top: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
    .diff.minus { color: #e11d48; }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .modal-content {
      background: #ffffff;
      width: 100%;
      max-width: 600px;
      border-radius: 24px;
      position: relative;
      box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
      border: 1px solid #e2e8f0;
    }

    .modal-header {
      padding: 24px 32px;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-title { font-size: 20px; font-weight: 800; color: #0f172a; }
    .close-modal { cursor: pointer; color: #94a3b8; font-size: 28px; transition: color 0.2s; }
    .close-modal:hover { color: #64748b; }

    .modal-body { padding: 32px; max-height: 85vh; overflow-y: auto; }

    .history-table { width: 100%; border-collapse: collapse; }
    .history-table th { text-align: left; color: #64748b; padding: 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f5f9; }
    .history-table td { padding: 16px 12px; border-bottom: 1px solid #f8fafc; color: #334155; }

    .history-btn {
      background: #f8fafc;
      color: #475569;
      border: 1px solid #e2e8f0;
      padding: 10px 16px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;
      width: 100%;
      transition: all 0.2s;
    }
    .history-btn:hover { background: #f1f5f9; color: var(--accent); border-color: var(--accent); }

    /* Section Headers */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .section-header h2 { font-size: 22px; margin: 0; font-weight: 800; color: #1e293b; }

    .list-container {
      background: #ffffff;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      box-shadow: var(--shadow);
    }

    .list-item {
      display: grid;
      grid-template-columns: 40px 60px 2fr 1.5fr 1fr 120px;
      padding: 16px 24px;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
    }
    .list-item:last-child { border-bottom: 0; }
    .list-item:hover { background: #f8fafc; }

    .list-rank { color: #94a3b8; font-weight: 600; font-size: 14px; }
    .list-party { font-weight: 700; color: #334155; font-size: 15px; }
    .list-candidate { color: #64748b; font-size: 14px; }
    .list-votes { 
      font-weight: 700; 
      text-align: right; 
      color: #0f172a; 
      padding-right: 20px; 
    }
    .list-incremental { font-size: 12px; color: var(--emerald); font-weight: 700; text-align: right; padding-right: 20px; }

    /* Resumen View Styles */
    .resumen-grid {
      display: grid; grid-template-columns: 1fr 2fr; gap: 32px;
    }
    .resumen-stats { display: flex; flex-direction: column; gap: 20px; }
    .stat-card {
      background: white; border-radius: 20px; padding: 24px; border: 1px solid #e2e8f0;
    }
    .stat-card .label { font-size: 14px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600; }
    .stat-card .value { font-size: 28px; font-weight: 800; color: #0f172a; }

    .chart-card {
      background: white; border-radius: 24px; padding: 32px; border: 1px solid #e2e8f0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }

    button {
      background: #0f172a; color: white; border: 0; padding: 12px 24px; border-radius: 12px;
      font-weight: 700; cursor: pointer; font-family: inherit; transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .blink { animation: blink 0.8s ease-in-out 3; }
    @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.2; color: var(--accent); } 100% { opacity: 1; } }

    .compare-bar {
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: #0f172a; color: white; padding: 16px 32px; border-radius: 99px;
      display: none; align-items: center; gap: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 900; animation: slideUp 0.3s ease-out;
    }
    @keyframes slideUp { from { bottom: -100px; opacity: 0; } to { bottom: 30px; opacity: 1; } }

    .custom-chk { 
      width: 20px; height: 20px; cursor: pointer; border-radius: 6px; border: 2px solid #e2e8f0; 
      appearance: none; transition: all 0.2s; background: white; 
    }
    .custom-chk:checked { background: var(--accent); border-color: var(--accent); }
    .custom-chk:checked::before { content: '✓'; color: white; display: block; text-align: center; font-size: 14px; font-weight: 800; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="header-top">
        <div class="title-group">
          <h1>Dashboard Electoral ONPE</h1>
          <div style="display: flex; gap: 16px; margin-top: 8px;">
            <button onclick="loadData()">Actualizar</button>
          </div>
          <div style="display: flex; gap: 20px; flex-wrap: wrap;">
            <div id="onpe-update" class="status">OFICIAL ONPE: ...</div>
            <div id="dashboard-update" class="status">VISTA SISTEMA: ...</div>
          </div>
        </div>
      </div>

      <div class="progress-container">
        <div class="progress-header">
          <span>Actas Contabilizadas</span>
          <span id="actas-percent">0%</span>
        </div>
        <div class="progress-bar-bg"><div id="progress-fill" class="progress-bar-fill"></div></div>
      </div>
    </header>    <!-- Presidencial View -->
    <div id="view-presidencial" class="view-content active">
      <div id="cards-container" class="grid"></div>
      <div class="others-section">
        <div class="section-header">
          <h2>Otros Resultados</h2>
        </div>
        <div id="list-container" class="list-container">
          <div class="loading" style="padding: 40px; text-align: center;">Cargando lista...</div>
        </div>
      </div>
    </div>/div>
  </div>

  <div id="compare-bar" class="compare-bar">
    <div id="compare-count" style="font-weight: 800; font-size: 18px;">0 seleccionados</div>
    <div style="display: flex; gap: 12px;">
      <button style="background: var(--accent);" onclick="openComparison()">Comparar</button>
      <button style="background: #334155;" onclick="clearSelection()">Limpiar</button>
    </div>
  </div>

  <!-- Modal -->
  <div id="history-modal" class="modal-overlay">
    <div class="modal-content" style="max-width: 800px;">
      <div class="modal-header">
        <div id="modal-candidate-name" class="modal-title">Evolución</div>
        <div class="close-modal" onclick="closeModal()">&times;</div>
      </div>
      <div class="modal-body">
        <div style="height: 300px; margin-bottom: 30px;">
          <canvas id="historyChart"></canvas>
        </div>
        <table class="history-table">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Actas %</th>
              <th>Votos Totales</th>
              <th>+ Votos</th>
            </tr>
          </thead>
          <tbody id="history-body"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let rawHistory = [];
    let currentDataGlobal = null;
    let selectedCandidates = new Set();
    let myChart = null;
    let resumenChart = null;
    let lastKnownActas = -1;
    let currentView = 'presidencial';

    function formatNumber(v) { return new Intl.NumberFormat("es-PE").format(v || 0); }
    function formatDiff(v) { return (v >= 0 ? "+" : "") + formatNumber(v); }
    
    function formatOnpeDate(ts) {
      if (!ts) return "---";
      const d = new Date(ts);
      return d.toLocaleString("es-PE", { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }

    function escapeHtml(t) { return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

    function switchView(view) {
      currentView = view;
      document.querySelectorAll('.view-content').forEach(el => el.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
      if (currentDataGlobal) renderUI(currentDataGlobal);
    }

    function toggleCandidate(name, checked) {
      if (checked) selectedCandidates.add(name);
      else selectedCandidates.delete(name);
      const bar = document.getElementById("compare-bar");
      const label = document.getElementById("compare-count");
      if (selectedCandidates.size > 0) {
        bar.style.display = "flex";
        label.textContent = \`\${selectedCandidates.size} seleccionados\`;
      } else { bar.style.display = "none"; }
    }

    function clearSelection() {
      selectedCandidates.clear();
      document.querySelectorAll(".custom-chk").forEach(c => c.checked = false);
      document.getElementById("compare-bar").style.display = "none";
    }

    function destroyChart() { if (myChart) { myChart.destroy(); myChart = null; } }

    function openHistory(itemName) {
      destroyChart();
      const modal = document.getElementById("history-modal");
      const title = document.getElementById("modal-candidate-name");
      const body = document.getElementById("history-body");
      title.textContent = "Evolución: " + itemName;
      
      const allResults = [...currentDataGlobal.top3, ...currentDataGlobal.others];
      const allSummary = currentDataGlobal.summary.detalleVotosProcessed || [];
      
      const currentItem = allResults.find(r => r.nombreAgrupacionPolitica === itemName) || 
                        allSummary.find(r => r.nombreAgrupacionPolitica === itemName);
      
      const filtered = rawHistory.map(s => {
        let itemData = s.results.find(r => r.name === itemName);
        if (!itemData && s.summary && s.summary.detalleVotosProcessed) {
           itemData = s.summary.detalleVotosProcessed.find(d => d.nombreAgrupacionPolitica === itemName);
        }
        if (!itemData && s.summary && s.summary.detalleVotos) {
           const d = s.summary.detalleVotos.find(d => d.descDetalle === itemName);
           if (d) itemData = { votos: parseInt(d.totalVotos?.replace(/,/g, '') || 0) };
        }

        return {
          time: s.timestamp,
          actas: s.actasPercent,
          candidate: itemData
        };
      }).filter(s => s.candidate);

      const lastSnapshot = filtered[filtered.length - 1];
      
      // SOLO añadir "Ahora" si hay un cambio REAL respecto al último snapshot
      if (currentItem && lastSnapshot) {
          const currentVotos = currentItem.totalVotosValidos;
          const currentActas = currentDataGlobal.actasContabilizadas;
          
          if (currentVotos !== lastSnapshot.candidate.votos || currentActas !== lastSnapshot.actas) {
              // Extraer solo la hora de la actualización del sistema
              const systemTimeStr = currentDataGlobal.dashboardUpdatedAt.split(', ')[1] || "Recién";
              filtered.push({
                time: systemTimeStr,
                actas: currentActas,
                candidate: { votos: currentVotos }
              });
          }
      } else if (currentItem && filtered.length === 0) {
         const systemTimeStr = currentDataGlobal.dashboardUpdatedAt.split(', ')[1] || "Recién";
         filtered.push({
            time: systemTimeStr,
            actas: currentDataGlobal.actasContabilizadas,
            candidate: { votos: currentItem.totalVotosValidos }
          });
      }

      const labels = filtered.map(s => s.time);
      const datasets = [{
        label: 'Votos Totales',
        data: filtered.map(s => s.candidate.votos),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.2,
        cubicInterpolationMode: 'monotone'
      }];

      initChart(labels, datasets);

      const rows = [];
      for(let i = 0; i < filtered.length; i++) {
        const cur = filtered[i];
        const prev = filtered[i-1];
        const diff = prev ? (cur.candidate.votos - prev.candidate.votos) : 0;
        rows.push(\`<tr>
          <td>\${cur.time}</td>
          <td>\${cur.actas}%</td>
          <td><strong>\${formatNumber(cur.candidate.votos)}</strong></td>
          <td style="color: \${diff > 0 ? '#10b981' : '#64748b'}">\${diff > 0 ? '+' : ''}\${formatNumber(diff)}</td>
        </tr>\`);
      }
      body.innerHTML = rows.reverse().join("");
      modal.style.display = "flex";
    }

    function openComparison() {
      if (selectedCandidates.size === 0) return;
      destroyChart();
      const modal = document.getElementById("history-modal");
      const title = document.getElementById("modal-candidate-name");
      const body = document.getElementById("history-body");
      title.textContent = "Momentum: Votos Ganados por Actualización";
      
      const datasets = Array.from(selectedCandidates).map((name, idx) => {
        // En comparativa, graficamos los INCREMENTOS (+ votos) para que sea útil
        const data = rawHistory.map((s, i) => {
          let c = s.results.find(r => r.name === name);
          if (!c && s.summary && s.summary.detalleVotosProcessed) {
            c = s.summary.detalleVotosProcessed.find(d => d.nombreAgrupacionPolitica === name);
          }
          if (!c && s.summary && s.summary.detalleVotos) {
            const d = s.summary.detalleVotos.find(d => d.descDetalle === name);
            if (d) c = { votos: parseInt(d.totalVotos?.replace(/,/g, '') || 0) };
          }
          
          if (!c) return null;
          const currentVotos = c.votos || c.totalVotosValidos;
          
          // Calcular delta respecto al anterior
          if (i === 0) return 0;
          const prevSnapshot = rawHistory[i-1];
          let prevC = prevSnapshot.results.find(r => r.name === name);
          if (!prevC && prevSnapshot.summary && prevSnapshot.summary.detalleVotosProcessed) {
            prevC = prevSnapshot.summary.detalleVotosProcessed.find(d => d.nombreAgrupacionPolitica === name);
          }
          const prevVotos = prevC ? (prevC.votos || prevC.totalVotosValidos) : currentVotos;
          return currentVotos - prevVotos;
        });

        return { 
          label: name, 
          data, 
          borderColor: getChartColors(idx), 
          backgroundColor: getChartColors(idx) + '22',
          tension: 0.2, 
          cubicInterpolationMode: 'monotone',
          fill: true,
          pointRadius: 4
        };
      });

      initChart(rawHistory.map(s => s.timestamp), datasets, "Nuevos Votos");
      
      // ANÁLISIS DE BRECHAS (INTERESANTE)
      let summaryHtml = "";
      if (selectedCandidates.size >= 2) {
          const sortedSelected = Array.from(selectedCandidates).map(name => {
              const c = allResults.find(r => r.nombreAgrupacionPolitica === name) || 
                        allSummary.find(r => r.nombreAgrupacionPolitica === name);
              return { name, votos: c ? c.totalVotosValidos : 0 };
          }).sort((a,b) => b.votos - a.votos);

          const c1 = sortedSelected[0];
          const c2 = sortedSelected[1];
          const gapActual = c1.votos - c2.votos;

          // Buscar brecha en el snapshot anterior
          const lastSnap = rawHistory[rawHistory.length - 1];
          const prevSnap = rawHistory[rawHistory.length - 2];
          
          if (lastSnap && prevSnap) {
              const getVotos = (snap, name) => {
                  let c = snap.results.find(r => r.name === name);
                  if (!c && snap.summary && snap.summary.detalleVotosProcessed) {
                      c = snap.summary.detalleVotosProcessed.find(d => d.nombreAgrupacionPolitica === name);
                  }
                  return c ? (c.votos || c.totalVotosValidos) : 0;
              };

              const gapSnapshot = getVotos(lastSnap, c1.name) - getVotos(lastSnap, c2.name);
              const gapAnterior = getVotos(prevSnap, c1.name) - getVotos(prevSnap, c2.name);
              const diffBrecha = gapSnapshot - gapAnterior;

              if (diffBrecha > 0) {
                  summaryHtml = `<div style="background: rgba(14, 165, 233, 0.1); padding: 16px; border-radius: 12px; border-left: 4px solid var(--accent); margin-top: 20px;">
                    <strong style="color: var(--accent); display: block; margin-bottom: 4px;">🎯 ANÁLISIS DE BRECHA</strong>
                    <span style="font-size: 15px; color: #334155;">
                        <b>${c1.name}</b> estiró su ventaja sobre <b>${c2.name}</b> por <b>${formatNumber(diffBrecha)}</b> votos en el último tramo. 
                        La distancia actual es de <b>${formatNumber(gapActual)}</b> votos.
                    </span>
                  </div>`;
              } else if (diffBrecha < 0) {
                  summaryHtml = `<div style="background: rgba(16, 185, 129, 0.1); padding: 16px; border-radius: 12px; border-left: 4px solid var(--emerald); margin-top: 20px;">
                    <strong style="color: var(--emerald); display: block; margin-bottom: 4px;">⚡ RECORTE DE DISTANCIA</strong>
                    <span style="font-size: 15px; color: #334155;">
                        <b>${c2.name}</b> acortó la brecha con <b>${c1.name}</b> en <b>${formatNumber(Math.abs(diffBrecha))}</b> votos. 
                        La distancia actual se redujo a <b>${formatNumber(gapActual)}</b> votos.
                    </span>
                  </div>`;
              } else {
                  summaryHtml = `<p style="text-align:center; color:#64748b; margin-top:20px;">La brecha entre los líderes se mantiene estable (diferencia de ${formatNumber(gapActual)} votos).</p>`;
              }
          }
      }

      body.innerHTML = summaryHtml || `<p style="text-align:center; color:#94a3b8; padding:40px;">El gráfico muestra cuántos votos ganó cada candidato en cada tramo de la historia.</p>`;
      modal.style.display = "flex";
    }

    function getChartColors(i) { return ['#0ea5e9', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i % 6]; }

    function initChart(labels, datasets, yLabel = "Votos Totales") {
      const ctx = document.getElementById('historyChart').getContext('2d');
      myChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: { 
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Outfit', size: 11, weight: '600' } } },
            tooltip: {
                backgroundColor: '#0f172a',
                titleFont: { family: 'Outfit', size: 13 },
                bodyFont: { family: 'Outfit', size: 12 },
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: (context) => \` \${context.dataset.label}: \${formatNumber(context.parsed.y)} \${yLabel === "Nuevos Votos" ? 'votos nuevos' : ''}\`
                }
            }
          },
          scales: {
            y: { 
                beginAtZero: yLabel === "Nuevos Votos",
                ticks: { callback: v => formatNumber(v), font: { family: 'Outfit' } },
                title: { display: true, text: yLabel, font: { family: 'Outfit', weight: 'bold' } }
            },
            x: { ticks: { font: { family: 'Outfit' } } }
          }
        }
      });
    }

    function renderResumenChart(summary) {
      const ctx = document.getElementById('resumenChart').getContext('2d');
      if (resumenChart) resumenChart.destroy();
      
      const labels = ['Votos Válidos', 'Votos en Blanco', 'Votos Nulos', 'Votos Impugnados'];
      const data = [summary.votosValidos, summary.votosBlancos, summary.votosNulos, summary.votosImpugnados].map(v => parseInt(v) || 0);
      
      resumenChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: ['#0ea5e9', '#cbd5e1', '#ef4444', '#64748b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { family: 'Outfit', weight: 'bold' } } } },
          cutout: '70%'
        }
      });
    }

    function closeModal() { document.getElementById("history-modal").style.display = "none"; destroyChart(); }

    async function loadData() {
      const refreshBtn = document.querySelector("button[onclick='loadData()']");
      if (refreshBtn) { refreshBtn.textContent = "Cargando..."; refreshBtn.disabled = true; }

      try {
        const res = await fetch("/api/results");
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        currentDataGlobal = json;
        renderUI(json);
      } catch (error) {
        console.error(error);
      } finally {
        if (refreshBtn) { refreshBtn.textContent = "Actualizar"; refreshBtn.disabled = false; }
      }
    }

    function renderUI(json) {
      document.getElementById("onpe-update").innerHTML = \`<strong>OFICIAL ONPE:</strong> \${formatOnpeDate(json.onpeUpdatedAt)}\`;
      document.getElementById("dashboard-update").innerHTML = \`<strong>SISTEMA:</strong> \${json.dashboardUpdatedAt}\`;
      
      const percent = json.actasContabilizadas || 0;
      const progressFill = document.getElementById("progress-fill");
      const actasPercentEl = document.getElementById("actas-percent");
      
      progressFill.style.width = percent + "%";
      if (lastKnownActas !== -1 && lastKnownActas !== percent) {
        actasPercentEl.classList.remove("blink");
        void actasPercentEl.offsetWidth; 
        actasPercentEl.classList.add("blink");
      }
      actasPercentEl.textContent = percent + "%";
      lastKnownActas = percent;
      rawHistory = json.history || [];

      if (currentView === 'presidencial') {
        renderPresidencial(json);
      } else {
        renderResumen(json);
      }
    }

    function renderPresidencial(json) {
      const cardsCont = document.getElementById("cards-container");
      const listCont = document.getElementById("list-container");
      document.getElementById('view-resumen').style.display = 'none';
      document.getElementById('view-presidencial').style.display = 'block';

      cardsCont.innerHTML = json.top3.map((item, index) => {
        const rankLabels = ["PRIMER LUGAR", "SEGUNDO LUGAR", "TERCER LUGAR"];
        const vsLabel = index === 1 ? "1°" : "2°";
        const isSelected = selectedCandidates.has(item.nombreAgrupacionPolitica);
        const incrementalHtml = item.incremental > 0 ? \`<div class="incremental-tag">+\${formatNumber(item.incremental)} nuevos votos</div>\` : '';
        
        return \`
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div class="rank rank-\${index + 1}">\${rankLabels[index]}</div>
              <input type="checkbox" class="custom-chk" \${isSelected ? 'checked' : ''} onchange="toggleCandidate('\${escapeHtml(item.nombreAgrupacionPolitica)}', this.checked)">
            </div>
            <div class="party-name">\${escapeHtml(item.nombreAgrupacionPolitica)}</div>
            <div class="votos-value">\${formatNumber(item.totalVotosValidos)} <span class="votos-label">votos</span></div>
            \${incrementalHtml}
            <div class="card-footer">
              <div class="stat-box"><div class="stat-val">\${item.porcentajeVotosValidos}%</div><div class="stat-lbl">% Válidos</div></div>
              <div class="stat-box"><div class="stat-val">\${item.porcentajeVotosEmitidos}%</div><div class="stat-lbl">% Emitidos</div></div>
            </div>
            <div class="diff \${item.diferenciaConAnterior < 0 ? 'minus' : ''}">
              \${index === 0 ? '🥇 Ganando actualmente' : '📉 ' + formatDiff(item.diferenciaConAnterior) + ' vs ' + vsLabel}
            </div>
            <button class="history-btn" onclick="openHistory('\${escapeHtml(item.nombreAgrupacionPolitica)}')">📈 Evolución Individual</button>
          </div>
        \`;
      }).join("");

      listCont.innerHTML = json.others.map((item, index) => {
        const isSelected = selectedCandidates.has(item.nombreAgrupacionPolitica);
        const incHtml = item.incremental > 0 ? \`<div class="list-incremental">+\${formatNumber(item.incremental)}</div>\` : '';
        return \`
          <div class="list-item">
            <div class="chk-col"><input type="checkbox" class="custom-chk" \${isSelected ? 'checked' : ''} onchange="toggleCandidate('\${escapeHtml(item.nombreAgrupacionPolitica)}', this.checked)"></div>
            <div class="list-rank">#\${index + 4}</div>
            <div class="list-party">\${escapeHtml(item.nombreAgrupacionPolitica)}</div>
            <div class="list-candidate">\${escapeHtml(item.nombreCandidato || "---")}</div>
            <div class="list-votes">
              <div>\${formatNumber(item.totalVotosValidos)}</div>
              \${incHtml}
            </div>
            <div class="list-btn-col"><button class="list-history-btn" onclick="openHistory('\${escapeHtml(item.nombreAgrupacionPolitica)}')">📈</button></div>
          </div>
        \`;
      }).join("");
    }

    function renderResumen(json) {
      const topCont = document.getElementById("resumen-cards-container");
      const listCont = document.getElementById("resumen-list-container");
      document.getElementById('view-presidencial').style.display = 'none';
      document.getElementById('view-resumen').style.display = 'block';
      
      const items = json.summary.detalleVotosProcessed || [];
      const top3 = items.slice(0, 3);
      const others = items.slice(3);

      topCont.innerHTML = top3.map((item, index) => {
        const rankLabels = ["VALOR PRINCIPAL", "VALOR SECUNDARIO", "VALOR TERCIARIO"];
        const isSelected = selectedCandidates.has(item.nombreAgrupacionPolitica);
        const incrementalHtml = item.incremental > 0 ? \`<div class="incremental-tag">+\${formatNumber(item.incremental)} nuevos votos</div>\` : '';
        
        return \`
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div class="rank rank-\${index + 1}">\${rankLabels[index]}</div>
              <input type="checkbox" class="custom-chk" \${isSelected ? 'checked' : ''} onchange="toggleCandidate('\${escapeHtml(item.nombreAgrupacionPolitica)}', this.checked)">
            </div>
            <div class="party-name">\${escapeHtml(item.nombreAgrupacionPolitica)}</div>
            <div class="votos-value">\${formatNumber(item.totalVotosValidos)} <span class="votos-label">votos</span></div>
            \${incrementalHtml}
            <div class="card-footer">
              <div class="stat-box"><div class="stat-val">\${item.porcentajeVotosValidos}%</div><div class="stat-lbl">% Share</div></div>
              <div class="stat-box"><div class="stat-val">---</div><div class="stat-lbl">-</div></div>
            </div>
            <button class="history-btn" onclick="openHistory('\${escapeHtml(item.nombreAgrupacionPolitica)}')">📈 Evolución Individual</button>
          </div>
        \`;
      }).join("");

      listCont.innerHTML = others.map((item, index) => {
        const isSelected = selectedCandidates.has(item.nombreAgrupacionPolitica);
        const incHtml = item.incremental > 0 ? \`<div class="list-incremental">+\${formatNumber(item.incremental)}</div>\` : '';
        return \`
          <div class="list-item">
             <div class="chk-col"><input type="checkbox" class="custom-chk" \${isSelected ? 'checked' : ''} onchange="toggleCandidate('\${escapeHtml(item.nombreAgrupacionPolitica)}', this.checked)"></div>
            <div class="list-rank">#\${index + 4}</div>
            <div class="list-party">\${escapeHtml(item.nombreAgrupacionPolitica)}</div>
            <div class="list-candidate">---</div>
            <div class="list-votes">
              <div>\${formatNumber(item.totalVotosValidos)}</div>
              \${incHtml}
            </div>
            <div class="list-btn-col"><button class="list-history-btn" onclick="openHistory('\${escapeHtml(item.nombreAgrupacionPolitica)}')">📈</button></div>
          </div>
        \`;
      }).join("");

      renderResumenChart(json.summary);
    }

    loadData();
    setInterval(loadData, 60000);
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url.split('?')[0];
    console.log(`[${new Date().toISOString()}] ${req.method} ${urlPath}`);

  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlPage());
    return;
  }

  if (urlPath === "/api/results") {
    try {
      const [resultsJson, summaryJson] = await Promise.all([
        fetchOnpeData(),
        fetchOnpeSummary(),
      ]);

      if (!resultsJson || !resultsJson.success || !Array.isArray(resultsJson.data)) {
        throw new Error("La respuesta del endpoint de resultados no es válida");
      }

      // Separar candidatos reales de votos especiales (Blanco/Nulo)
      const isSpecial = (name) =>
        name === "VOTOS EN BLANCO" || name === "VOTOS NULOS" || name === "VOTOS IMPUGNADOS";

      const allSorted = resultsJson.data
        .filter((x) => typeof x.totalVotosValidos === "number")
        .sort((a, b) => b.totalVotosValidos - a.totalVotosValidos);

      // Obtener el último snapshot para calcular incrementales reales
      const lastSessionSnapshot = historySnapshots[historySnapshots.length - 1];

      const getIncremental = (name, currentVotos) => {
        if (!lastSessionSnapshot) return 0;
        const prev = lastSessionSnapshot.results.find(r => r.name === name);
        return prev ? currentVotos - prev.votos : 0;
      };

      // El top 3 solo de partidos (no Blanco/Nulo) para las tarjetas premium
      const partiesSorted = allSorted.filter(x => !isSpecial(x.nombreAgrupacionPolitica));
      const top3Parties = partiesSorted.slice(0, 3);

      const top3 = top3Parties.map((item, index) => ({
        ...item,
        incremental: getIncremental(item.nombreAgrupacionPolitica, item.totalVotosValidos),
        diferenciaConAnterior:
          index === 0 ? 0 : item.totalVotosValidos - top3Parties[index - 1].totalVotosValidos,
      }));

      // El resto son todos los que no entraron en el top 3
      const top3Ids = new Set(top3.map(x => x.nombreAgrupacionPolitica));

      const remainingOthers = allSorted.filter(x => !top3Ids.has(x.nombreAgrupacionPolitica));

      // Separar los partidos restantes de los votos especiales para mandarlos al final
      const remainingParties = remainingOthers.filter(x => !isSpecial(x.nombreAgrupacionPolitica));
      const specialEntries = remainingOthers.filter(x => isSpecial(x.nombreAgrupacionPolitica));

      const others = [...remainingParties, ...specialEntries].map(item => ({
        ...item,
        incremental: getIncremental(item.nombreAgrupacionPolitica, item.totalVotosValidos)
      }));

      const summaryData = summaryJson?.data || {};
      const detalleVotos = (summaryData.detalleVotos || []).map(item => ({
        nombreAgrupacionPolitica: item.descDetalle,
        totalVotosValidos: parseInt(item.totalVotos?.replace(/,/g, '') || 0),
        porcentajeVotosValidos: item.porcentaje,
        incremental: 0 // Se calculará abajo
      })).sort((a, b) => b.totalVotosValidos - a.totalVotosValidos);

      // Calcular incrementales para resumen
      if (lastSessionSnapshot && lastSessionSnapshot.summary && lastSessionSnapshot.summary.detalleVotos) {
        detalleVotos.forEach(item => {
          const prev = lastSessionSnapshot.summary.detalleVotos.find(d => d.descDetalle === item.nombreAgrupacionPolitica);
          if (prev) {
            const prevVotos = parseInt(prev.totalVotos?.replace(/,/g, '') || 0);
            item.incremental = item.totalVotosValidos - prevVotos;
          }
        });
      }

      const summary = {
        ...summaryData,
        detalleVotosProcessed: detalleVotos
      };

      // Actualizar historial si es necesario
      updateHistory(allSorted, summary.actasContabilizadas, summary);

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          success: true,
          dashboardUpdatedAt: new Date().toLocaleString("es-PE", { timeZone: "America/Lima" }),
          onpeUpdatedAt: summary.fechaActualizacion,
          top3,
          others,
          history: historySnapshots,
          actasContabilizadas: summary.actasContabilizadas,
          summary,
        })
      );
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          success: false,
          message: error.message,
        })
      );
    }
    return;
  }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (err) {
    console.error("Global Error:", err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});