let selectedFiles = [];
let currentMode = 'single';
let extractedResults = [];
let searchQuery = '';

function setMode(mode) {
  currentMode = mode;
  const singleTab = document.getElementById('tab-single');
  const multiTab = document.getElementById('tab-multi');
  const active = 'tab-btn px-5 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white';
  const inactive = 'tab-btn px-5 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:text-slate-900';

  if (mode === 'single') {
    singleTab.className = active;
    multiTab.className = inactive;
    document.getElementById('fileInput').removeAttribute('multiple');

    if (selectedFiles.length > 1) {
      selectedFiles = [selectedFiles[0]];
      renderFileList();
    }
  } else {
    multiTab.className = active;
    singleTab.className = inactive;
    document.getElementById('fileInput').setAttribute('multiple', 'multiple');
  }
}

function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('dropZone').classList.add('dragover');
}

function handleDragLeave() {
  document.getElementById('dropZone').classList.remove('dragover');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('dropZone').classList.remove('dragover');
  addFiles(Array.from(event.dataTransfer.files).filter(isValidFile));
}

function handleFileSelect(event) {
  addFiles(Array.from(event.target.files).filter(isValidFile));
  event.target.value = '';
}

function isValidFile(file) {
  return /\.(pdf|png|jpg|jpeg|webp|gif)$/i.test(file.name);
}

function addFiles(files) {
  selectedFiles = currentMode === 'single' ? files.slice(0, 1) : [...selectedFiles, ...files];
  renderFileList();
  document.getElementById('extractBtn').disabled = selectedFiles.length === 0;
}

function clearFiles() {
  selectedFiles = [];
  renderFileList();
  document.getElementById('extractBtn').disabled = true;
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
  document.getElementById('extractBtn').disabled = selectedFiles.length === 0;
}

function renderFileList() {
  const container = document.getElementById('fileList');
  const items = document.getElementById('fileItems');

  if (!selectedFiles.length) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  items.innerHTML = selectedFiles.map((file, index) => `
    <div class="file-card flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
      <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${file.type === 'application/pdf' ? 'bg-red-100' : 'bg-blue-100'}">
        ${file.type === 'application/pdf'
          ? `<svg class="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>`
          : `<svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-slate-700 truncate">${esc(file.name)}</p>
        <p class="text-xs text-slate-400">${formatSize(file.size)}</p>
      </div>
      <button onclick="removeFile(${index})" class="text-slate-300 hover:text-red-500 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function extractText() {
  if (!selectedFiles.length) return;

  showLoading(true);
  extractedResults = [];

  for (let index = 0; index < selectedFiles.length; index++) {
    const file = selectedFiles[index];
    updateLoadingText(`Processing file ${index + 1} of ${selectedFiles.length}...`, file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('ocr.php', { method: 'POST', body: formData });
      const data = await response.json();

      extractedResults.push({
        filename: file.name,
        success: data.success,
        text: data.text || '',
        error: data.error || '',
        pages: data.pages || 1,
      });
    } catch (error) {
      extractedResults.push({
        filename: file.name,
        success: false,
        text: '',
        error: 'Network error: ' + error.message,
        pages: 1,
      });
    }
  }

  showLoading(false);
  renderResults();
}

function showLoading(show) {
  document.getElementById('emptyState').classList.toggle('hidden', show || extractedResults.length > 0);
  document.getElementById('loadingState').classList.toggle('hidden', !show);
  document.getElementById('resultsContainer').classList.toggle('hidden', show || extractedResults.length === 0);
  document.getElementById('extractBtn').disabled = show;
}

function updateLoadingText(mainText, subText) {
  document.getElementById('loadingText').textContent = mainText;
  document.getElementById('loadingSubtext').textContent = subText;
}

function handleSearch(value) {
  searchQuery = value.trim();
  renderResults();
}

function clearSearch() {
  searchQuery = '';
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = '';
  }
  renderResults();
}

function formatOCRText(rawText) {
  const lines = rawText.split('\n').map((line) => line.trimEnd());
  let html = '<div class="ocr-output">';
  let index = 0;

  const tableLines = lines.filter((line) => line.includes('\t') || (line.match(/\s{3,}/g) || []).length > 2);
  const isTableDoc = tableLines.length > lines.length * 0.25;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      html += '<div style="height:6px"></div>';
      index += 1;
      continue;
    }

    if (line.length < 80 && line === line.toUpperCase() && /[A-Z]{3,}/.test(line) && !/^\d/.test(line) && !/:$/.test(line)) {
      html += `<div class="bold-line text-center">${esc(line)}</div>`;
      index += 1;
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z][A-Za-z\s\/\.\(\)#]{1,40}?):\s*(.+)$/);
    if (kvMatch && kvMatch[1].length < 45) {
      const kvRows = [];
      let scanIndex = index;

      while (scanIndex < lines.length) {
        const scanLine = lines[scanIndex].trim();
        const match = scanLine.match(/^([A-Za-z][A-Za-z\s\/\.\(\)#]{1,40}?):\s*(.*)$/);
        if (match) {
          kvRows.push(match);
          scanIndex += 1;
        } else {
          break;
        }
      }

      if (kvRows.length >= 1) {
        html += '<table class="kv-table">';
        kvRows.forEach((match) => {
          html += `<tr><td class="kv-key">${esc(match[1])}</td><td class="kv-val">${esc(match[2])}</td></tr>`;
        });
        html += '</table>';
        index = scanIndex;
        continue;
      }
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      const markdownRows = [];
      let scanIndex = index;

      while (scanIndex < lines.length) {
        const markdownLine = lines[scanIndex].trim();
        if (!markdownLine.startsWith('|') || !markdownLine.endsWith('|')) {
          break;
        }

        if (!/^\|[\s:-]+\|(?:[\s:-]+\|)*$/.test(markdownLine)) {
          const cells = markdownLine
            .slice(1, -1)
            .split('|')
            .map((cell) => cell.trim());
          markdownRows.push(cells);
        }

        scanIndex += 1;
      }

      if (markdownRows.length >= 2) {
        const headers = markdownRows[0];
        const rows = markdownRows.slice(1);
        html += '<table class="data-table">';
        html += '<thead><tr>' + headers.map((header) => `<th>${esc(header)}</th>`).join('') + '</tr></thead>';
        html += '<tbody>';
        rows.forEach((row) => {
          html += '<tr>' + row.map((cell) => `<td>${esc(cell)}</td>`).join('') + '</tr>';
        });
        html += '</tbody></table>';
        index = scanIndex;
        continue;
      }
    }

    if (isTableDoc && (line.includes('\t') || /\s{3,}/.test(line))) {
      const cells = line.split(/\t|\s{3,}/).map((cell) => cell.trim()).filter(Boolean);

      if (cells.length >= 2) {
        const isHeader = cells.every((cell) => cell === cell.toUpperCase() || /^(No\.|Stock|Unit|Desc|Qty|Quant|Amount|Price|Cost|Item)/i.test(cell));

        if (isHeader || (index > 0 && lines[index - 1] && /\s{3,}|\t/.test(lines[index - 1]))) {
          const tableRows = [];
          let headers = [];
          let scanIndex = index;

          if (isHeader) {
            headers = cells;
            scanIndex += 1;
          }

          while (scanIndex < lines.length) {
            const tableLine = lines[scanIndex].trim();
            if (!tableLine) {
              scanIndex += 1;
              break;
            }

            const tableCells = tableLine.split(/\t|\s{3,}/).map((cell) => cell.trim()).filter(Boolean);
            if (tableCells.length >= 2) {
              tableRows.push(tableCells);
              scanIndex += 1;
            } else {
              break;
            }
          }

          if (tableRows.length > 0) {
            html += '<table class="data-table">';
            if (headers.length) {
              html += '<thead><tr>' + headers.map((header) => `<th>${esc(header)}</th>`).join('') + '</tr></thead>';
            }
            html += '<tbody>';
            tableRows.forEach((row) => {
              html += '<tr>' + row.map((cell) => `<td>${esc(cell)}</td>`).join('') + '</tr>';
            });
            html += '</tbody></table>';
            index = scanIndex;
            continue;
          }
        }
      }
    }

    const nextLine = lines[index + 1] ? lines[index + 1].trim() : '';
    const looksLikeBold = line.length < 80 && !line.endsWith('.') && !line.endsWith(',') && (line.endsWith(':') || /^[A-Z][A-Za-z\s]+$/.test(line));

    if (looksLikeBold && nextLine) {
      html += `<div class="bold-line">${esc(line)}</div>`;
      index += 1;
      continue;
    }

    if (/^[-=_]{4,}$/.test(line)) {
      html += '<hr class="divider">';
      index += 1;
      continue;
    }

    html += `<div class="plain-line">${esc(line)}</div>`;
    index += 1;
  }

  html += '</div>';
  return html;
}

function buildCopyText(rawText) {
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  const output = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (/^\|[\s:-]+\|(?:[\s:-]+\|)*$/.test(line)) {
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());

      if (!/^\|[\s:-]+\|(?:[\s:-]+\|)*$/.test(line) && cells.length >= 2) {
        output.push(cells.join('\t'));
        continue;
      }
    }

    if (/^[-=_]{4,}$/.test(line)) {
      output.push('');
      continue;
    }

    const kvMatch = line.match(/^(.{1,60}?):\s*(.+)$/);
    if (kvMatch && /[A-Za-z]/.test(kvMatch[1])) {
      output.push(`${kvMatch[1].trim()}\t${kvMatch[2].trim()}`);
      continue;
    }

    if (line.includes('\t') || /\s{3,}/.test(line)) {
      const cells = line.split(/\t|\s{3,}/).map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 2) {
        output.push(cells.join('\t'));
        continue;
      }
    }

    output.push(line);
  }

  return output.join('\n').trim();
}

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderResults() {
  const container = document.getElementById('resultsContainer');
  container.innerHTML = '';
  const query = searchQuery.toLowerCase();
  let totalMatches = 0;

  extractedResults.forEach((result, index) => {
    const normalizedText = result.text.toLowerCase();
    const matchCount = query ? countMatches(normalizedText, query) : 0;
    if (query) {
      totalMatches += matchCount;
    }

    const div = document.createElement('div');
    const visible = !query || matchCount > 0 || !result.success;
    div.className = `result-card border rounded-2xl overflow-hidden ${result.success ? 'border-slate-200' : 'border-red-200'} ${visible ? '' : 'hidden'}`;

    let bodyHtml = result.success ? formatOCRText(result.text) : `<p class="text-sm text-red-600 font-medium">${esc(result.error)}</p>`;
    if (query && result.success && matchCount > 0) {
      bodyHtml = highlightHtml(bodyHtml, query);
    }

    div.innerHTML = `
      <div class="flex items-center gap-2 px-5 py-3 ${result.success ? 'bg-slate-50 border-b border-slate-200' : 'bg-red-50 border-b border-red-200'}">
        <span class="w-2 h-2 rounded-full flex-shrink-0 ${result.success ? 'bg-green-500' : 'bg-red-500'}"></span>
        <span class="text-sm font-semibold text-slate-800 flex-1 truncate">${esc(result.filename)}</span>
        ${result.success ? `
          <span class="text-xs text-slate-400">${result.pages > 1 ? result.pages + ' pages' : ''}${query ? (matchCount ? ` · ${matchCount} match${matchCount === 1 ? '' : 'es'}` : ' · no match') : ''}</span>
          <button onclick="copyResult(${index})" class="text-xs text-blue-600 hover:text-blue-800 font-semibold bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors ml-1">Copy Table</button>
        ` : ''}
      </div>
      <div class="p-5 overflow-y-auto" style="max-height:70vh">
        ${bodyHtml}
      </div>
    `;
    container.appendChild(div);
  });

  container.classList.remove('hidden');
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('loadingState').classList.add('hidden');

  const successCount = extractedResults.filter((result) => result.success).length;
  const countEl = document.getElementById('resultCount');

  if (successCount > 0) {
    countEl.textContent = successCount + (successCount === 1 ? ' file' : ' files');
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }

  const searchMeta = document.getElementById('searchMeta');
  if (searchMeta) {
    if (query) {
      searchMeta.textContent = totalMatches > 0
        ? `Search results for “${searchQuery}”: ${totalMatches} match${totalMatches === 1 ? '' : 'es'}.`
        : `No matches for “${searchQuery}”.`;
      searchMeta.classList.remove('hidden');
    } else {
      searchMeta.textContent = '';
      searchMeta.classList.add('hidden');
    }
  }

  document.getElementById('copyBtn').classList.toggle('hidden', successCount === 0);
  document.getElementById('downloadBtn').classList.toggle('hidden', successCount === 0);
}

function countMatches(text, query) {
  if (!query) return 0;
  const regex = new RegExp(escapeRegExp(query), 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function highlightHtml(html, query) {
  if (!query) return html;
  const escapedQuery = esc(query);
  const regex = new RegExp(escapeRegExp(escapedQuery), 'gi');
  return html.replace(regex, (match) => `<mark class="rounded bg-yellow-200 px-0.5 text-slate-900">${match}</mark>`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function copyResult(index) {
  await navigator.clipboard.writeText(buildCopyText(extractedResults[index].text));
  alert('Copied!');
}

async function copyAll() {
  const all = extractedResults
    .filter((result) => result.success)
    .map((result) => `=== ${result.filename} ===\n${buildCopyText(result.text)}`)
    .join('\n\n');

  await navigator.clipboard.writeText(all);
  alert('All results copied!');
}

function downloadAll() {
  const all = extractedResults
    .filter((result) => result.success)
    .map((result) => `=== ${result.filename} ===\n${buildCopyText(result.text)}`)
    .join('\n\n');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([all], { type: 'text/plain' }));
  link.download = 'ocr_results.txt';
  link.click();
}
