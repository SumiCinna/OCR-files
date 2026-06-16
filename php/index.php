<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OCR — Text Extractor</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/app.css" />
</head>
<body class="bg-slate-100 min-h-screen">

  <header class="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
    <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div>
          <h1 class="font-bold text-slate-900 leading-none text-sm">OCR</h1>
          <p class="text-xs text-slate-400">Powered by OCR.space</p>
        </div>
      </div>
      <span class="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 font-medium">
        <span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Free API
      </span>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-6">
    <div class="mb-4 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center gap-2">
        <input id="searchInput" type="search" placeholder="Search extracted text" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" oninput="handleSearch(this.value)" />
        <button type="button" onclick="clearSearch()" class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Clear</button>
      </div>
      <p id="searchMeta" class="mt-2 text-xs text-slate-400 hidden"></p>
    </div>

    <div class="flex gap-1 mb-5 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
      <button onclick="setMode('single')" id="tab-single" class="tab-btn px-5 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white">Single File</button>
      <button onclick="setMode('multi')" id="tab-multi" class="tab-btn px-5 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:text-slate-900">Multiple Files</button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
      <div class="space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 class="font-semibold text-slate-900 mb-4 text-sm">Upload Files</h2>

          <div id="dropZone" class="drop-zone border-2 border-dashed border-slate-200 rounded-xl p-7 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors" onclick="document.getElementById('fileInput').click()" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
            <div class="flex flex-col items-center gap-2">
              <div class="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
              </div>
              <p class="text-sm font-medium text-slate-700">Drop files here or click to browse</p>
              <p class="text-xs text-slate-400">PDF, PNG, JPG, JPEG, WEBP, GIF</p>
            </div>
          </div>

          <input type="file" id="fileInput" class="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif" onchange="handleFileSelect(event)" />

          <div id="fileList" class="mt-3 space-y-2 hidden">
            <div class="flex items-center justify-between">
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Selected</p>
              <button onclick="clearFiles()" class="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
            </div>
            <div id="fileItems"></div>
          </div>

          <button id="extractBtn" onclick="extractText()" class="mt-4 w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm" disabled>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Extract Text 
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col" style="min-height:80vh">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div class="flex items-center gap-3">
            <h2 class="font-semibold text-slate-900">Extracted Text</h2>
            <span id="resultCount" class="hidden text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full"></span>
          </div>
          <div class="flex gap-2">
            <button onclick="copyAll()" id="copyBtn" class="hidden text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              Copy All
            </button>
            <button onclick="downloadAll()" id="downloadBtn" class="hidden text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download .txt
            </button>
          </div>
        </div>

        <div id="emptyState" class="flex-1 flex flex-col items-center justify-center p-10 text-center">
          <div class="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <svg class="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <p class="text-sm font-medium text-slate-400">No results yet</p>
          <p class="text-xs text-slate-300 mt-1">Upload a file and click Extract</p>
        </div>

        <div id="loadingState" class="hidden flex-1 flex flex-col items-center justify-center p-10">
          <div class="w-10 h-10 border-blue-200 border-t-blue-600 rounded-full spinner mb-4" style="border-width:3px;border-style:solid"></div>
          <p class="text-sm font-semibold text-slate-700" id="loadingText">Processing...</p>
          <p class="text-xs text-slate-400 mt-1" id="loadingSubtext">Sending to OCR.space</p>
        </div>

        <div id="resultsContainer" class="hidden flex-1 overflow-y-auto p-5 space-y-5"></div>
      </div>
    </div>
  </main>

  <footer class="text-center py-6 text-xs text-slate-400">AI OCR Tool · Powered by OCR.space · Free to use</footer>

  <script src="../js/app.js"></script>
</body>
</html>
