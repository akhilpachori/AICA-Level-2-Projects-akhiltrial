// 100% Strict ES5 Injected Scanner function.
// NO backticks, NO modern syntax, NO regular expression literals to prevent V8 serialization errors.
function scanPageForFiles() {
  var results = [];
  var elements = document.querySelectorAll('a, button');
  var keywordExtensions = {
    'pdf': '.pdf',
    'receipt': '.pdf',
    'intimation': '.pdf',
    'certificate': '.pdf',
    'statement': '.pdf',
    'form': '.pdf',
    'download': '.pdf',
    'word': '.docx',
    'excel': '.xlsx',
    'csv': '.csv',
    'json': '.json',
    'xml': '.xml'
  };

  var standardExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.json', '.xml', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp'];

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var isLink = el.tagName.toLowerCase() === 'a';
    var href = isLink ? el.getAttribute('href') : null;
    var text = (el.innerText || el.textContent || '').trim();
    
    // Check if standard link
    var matchedExt = null;
    if (href) {
      // Resolve full URL
      var tempA = document.createElement('a');
      tempA.href = href;
      var absoluteUrl = tempA.href;
      var absoluteUrlLower = absoluteUrl.toLowerCase();
      
      for (var j = 0; j < standardExts.length; j++) {
        var ext = standardExts[j];
        if (absoluteUrlLower.indexOf(ext) !== -1) {
          matchedExt = ext;
          break;
        }
      }
      
      if (matchedExt) {
        // Extract filename from URL or fallback to text
        var filename = '';
        var parts = absoluteUrl.split('/');
        var lastPart = parts[parts.length - 1].split('?')[0].split('#')[0];
        if (lastPart && lastPart.indexOf(matchedExt) !== -1) {
          filename = decodeURIComponent(lastPart);
        } else {
          filename = text || ('DownloadedFile' + matchedExt);
        }
        
        results.push({
          isButton: false,
          url: absoluteUrl,
          filename: filename,
          extension: matchedExt
        });
        continue;
      }
    }

    // Check if it's an Action Button (either button or link with no matching file URL but matching text keywords)
    var textLower = text.toLowerCase();
    var isActionButton = false;
    var buttonExt = '.pdf'; // Default fallback
    
    // Keywords to search for
    var keywords = ['download', 'receipt', 'intimation', 'form', 'certificate', 'statement', 'json', 'xml', 'excel', 'csv', 'word'];
    for (var k = 0; k < keywords.length; k++) {
      var keyword = keywords[k];
      if (textLower.indexOf(keyword) !== -1) {
        isActionButton = true;
        // Map keyword to extension
        if (keywordExtensions[keyword]) {
          buttonExt = keywordExtensions[keyword];
        }
        break;
      }
    }

    if (isActionButton) {
      // Assign custom attribute data-bulk-dl-id
      var dlId = el.getAttribute('data-bulk-dl-id');
      if (!dlId) {
        dlId = 'bulk-dl-' + (new Date().getTime()) + '-' + Math.floor(Math.random() * 100000);
        el.setAttribute('data-bulk-dl-id', dlId);
      }
      
      // Clean filename (replace non-alphanumeric/spaces with underscores)
      var cleanRegex = new RegExp('[^a-zA-Z0-9._ ]', 'g');
      var baseName = text.replace(cleanRegex, '_');
      if (!baseName) {
        baseName = 'action_download';
      }
      
      results.push({
        isButton: true,
        id: dlId,
        filename: baseName + buttonExt,
        extension: buttonExt,
        buttonText: text
      });
    }
  }

  return results;
}

// Popup UI Controller
var allFiles = [];
var activeTabId = null;

document.addEventListener('DOMContentLoaded', function() {
  // Query active tab and run initial scan
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs[0]) {
      activeTabId = tabs[0].id;
      performScan();
    }
  });

  // Setup Event Listeners
  document.getElementById('scan-btn').addEventListener('click', performScan);
  document.getElementById('empty-scan-btn').addEventListener('click', performScan);
  document.getElementById('select-all').addEventListener('change', handleSelectAllChange);
  document.getElementById('download-individual').addEventListener('click', startIndividualDownloads);
  document.getElementById('download-zip').addEventListener('click', startZipDownload);

  // Setup filters listener
  var filterCheckboxes = document.querySelectorAll('.filter-pill input');
  for (var i = 0; i < filterCheckboxes.length; i++) {
    filterCheckboxes[i].addEventListener('change', renderList);
  }
});

function performScan() {
  var statusBar = document.getElementById('status-bar');
  var fileList = document.getElementById('file-list');
  var emptyState = document.getElementById('empty-state');
  
  statusBar.classList.remove('hidden');
  
  chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    func: scanPageForFiles
  }, function(results) {
    statusBar.classList.add('hidden');
    
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      showEmptyState();
      return;
    }

    if (results && results[0] && results[0].result) {
      var rawFiles = results[0].result;
      
      // Map to internal objects with selection & status state
      allFiles = rawFiles.map(function(file, idx) {
        return {
          id: 'file-' + idx,
          isButton: file.isButton,
          buttonId: file.id,
          url: file.url,
          filename: file.filename,
          extension: file.extension,
          category: getCategory(file.extension),
          status: 'pending', // pending, fetching, done, error
          selected: true
        };
      });

      if (allFiles.length > 0) {
        emptyState.classList.add('hidden');
        fileList.classList.remove('hidden');
        updateFilterCounts();
        renderList();
      } else {
        showEmptyState();
      }
    } else {
      showEmptyState();
    }
  });
}

function showEmptyState() {
  allFiles = [];
  document.getElementById('file-list').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  updateFilterCounts();
  updateTotalCounts();
}

function getCategory(ext) {
  ext = ext.toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].indexOf(ext) !== -1) return 'image';
  if (['.doc', '.docx'].indexOf(ext) !== -1) return 'word';
  if (['.xls', '.xlsx', '.csv'].indexOf(ext) !== -1) return 'excel';
  if (['.json', '.xml'].indexOf(ext) !== -1) return 'data';
  return 'doc'; // Docs category fallback
}

function updateFilterCounts() {
  var counts = { pdf: 0, image: 0, word: 0, excel: 0, data: 0, doc: 0 };
  allFiles.forEach(function(file) {
    if (counts[file.category] !== undefined) {
      counts[file.category]++;
    }
  });
  
  document.getElementById('count-pdf').innerText = counts.pdf;
  document.getElementById('count-image').innerText = counts.image;
  document.getElementById('count-word').innerText = counts.word;
  document.getElementById('count-excel').innerText = counts.excel;
  document.getElementById('count-data').innerText = counts.data;
  document.getElementById('count-doc').innerText = counts.doc;
}

function updateTotalCounts() {
  var visibleFiles = getFilteredFiles();
  var selectedCount = visibleFiles.filter(function(f) { return f.selected; }).length;
  
  document.getElementById('selected-count').innerText = selectedCount;
  document.getElementById('total-count').innerText = visibleFiles.length;

  var selectAllBox = document.getElementById('select-all');
  if (visibleFiles.length === 0) {
    selectAllBox.checked = false;
    selectAllBox.disabled = true;
  } else {
    selectAllBox.disabled = false;
    selectAllBox.checked = (selectedCount === visibleFiles.length);
  }

  // Update actions disabled status
  document.getElementById('download-individual').disabled = (selectedCount === 0);
  document.getElementById('download-zip').disabled = (selectedCount === 0);
}

function getFilteredFiles() {
  var enabledCategories = [];
  var categories = ['pdf', 'image', 'word', 'excel', 'data', 'doc'];
  categories.forEach(function(cat) {
    if (document.getElementById('filter-' + cat).checked) {
      enabledCategories.push(cat);
    }
  });

  return allFiles.filter(function(file) {
    return enabledCategories.indexOf(file.category) !== -1;
  });
}

function renderList() {
  var fileList = document.getElementById('file-list');
  fileList.innerHTML = '';
  
  var visibleFiles = getFilteredFiles();
  
  if (visibleFiles.length === 0) {
    fileList.classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    updateTotalCounts();
    return;
  }
  
  document.getElementById('empty-state').classList.add('hidden');
  fileList.classList.remove('hidden');

  visibleFiles.forEach(function(file) {
    var li = document.createElement('li');
    li.className = 'file-item';
    
    // Checkbox
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = file.selected;
    chk.addEventListener('change', function() {
      file.selected = chk.checked;
      updateTotalCounts();
    });
    
    // Meta container
    var meta = document.createElement('div');
    meta.className = 'file-meta';
    
    var nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.innerText = file.filename;
    nameSpan.title = file.filename;
    
    var subDiv = document.createElement('div');
    subDiv.className = 'file-sub';
    
    var catBadge = document.createElement('span');
    catBadge.className = 'category-badge badge-' + file.category;
    catBadge.innerText = file.category;
    
    var originBadge = document.createElement('span');
    originBadge.className = 'origin-badge' + (file.isButton ? ' secure' : '');
    originBadge.innerText = file.isButton ? 'Secure Action' : 'Resource Link';
    
    subDiv.appendChild(catBadge);
    subDiv.appendChild(originBadge);
    meta.appendChild(nameSpan);
    meta.appendChild(subDiv);
    
    // Status Pill
    var statusPill = document.createElement('span');
    statusPill.className = 'status-pill status-' + file.status;
    statusPill.innerText = file.status.toUpperCase();
    
    li.appendChild(chk);
    li.appendChild(meta);
    li.appendChild(statusPill);
    
    fileList.appendChild(li);
  });
  
  updateTotalCounts();
}

function handleSelectAllChange() {
  var isChecked = document.getElementById('select-all').checked;
  var visibleFiles = getFilteredFiles();
  visibleFiles.forEach(function(file) {
    file.selected = isChecked;
  });
  renderList();
}

function updateFileStatus(fileId, status) {
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].id === fileId) {
      allFiles[i].status = status;
      break;
    }
  }
  renderList();
}

function startIndividualDownloads() {
  var visibleFiles = getFilteredFiles();
  var selectedFiles = visibleFiles.filter(function(f) { return f.selected; });
  if (selectedFiles.length === 0) return;

  var index = 0;
  
  function downloadNext() {
    if (index >= selectedFiles.length) return;
    var file = selectedFiles[index];
    updateFileStatus(file.id, 'fetching');

    if (file.isButton) {
      // Simulate click inside tab
      chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: function(btnId) {
          var btn = document.querySelector('[data-bulk-dl-id="' + btnId + '"]');
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        },
        args: [file.buttonId]
      }, function(res) {
        if (res && res[0] && res[0].result) {
          updateFileStatus(file.id, 'done');
        } else {
          updateFileStatus(file.id, 'error');
        }
        index++;
        setTimeout(downloadNext, 500);
      });
    } else {
      // Standard chrome download
      chrome.downloads.download({
        url: file.url,
        filename: file.filename
      }, function(downloadId) {
        if (chrome.runtime.lastError || !downloadId) {
          updateFileStatus(file.id, 'error');
        } else {
          updateFileStatus(file.id, 'done');
        }
        index++;
        setTimeout(downloadNext, 500);
      });
    }
  }

  downloadNext();
}

function startZipDownload() {
  var visibleFiles = getFilteredFiles();
  var selectedFiles = visibleFiles.filter(function(f) { return f.selected; });
  
  // Filter only standard resource URLs for ZIP compilation
  var urlFiles = selectedFiles.filter(function(f) { return !f.isButton; });
  var buttonFiles = selectedFiles.filter(function(f) { return f.isButton; });

  if (urlFiles.length === 0) {
    alert("ZIP files can only package standard Resource Links. Secure Actions must be clicked/downloaded individually.");
    return;
  }

  if (buttonFiles.length > 0) {
    if (confirm("Action buttons (" + buttonFiles.length + ") cannot be packaged in ZIP directly. Would you like to package the " + urlFiles.length + " resource links and trigger the action buttons separately?")) {
      // Execute click simulation on buttons
      buttonFiles.forEach(function(file, index) {
        setTimeout(function() {
          chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            func: function(btnId) {
              var btn = document.querySelector('[data-bulk-dl-id="' + btnId + '"]');
              if (btn) {
                btn.click();
                return true;
              }
              return false;
            },
            args: [file.buttonId]
          });
          updateFileStatus(file.id, 'done');
        }, index * 500);
      });
    } else {
      return;
    }
  }

  var zip = new JSZip();
  var usedNames = {};
  var index = 0;

  function fetchAndZipNext() {
    if (index >= urlFiles.length) {
      // Generate ZIP and trigger chrome download
      zip.generateAsync({ type: 'blob' }).then(function(content) {
        var zipUrl = URL.createObjectURL(content);
        chrome.downloads.download({
          url: zipUrl,
          filename: 'bulk_downloads.zip'
        }, function() {
          // Clean up blob URL
          setTimeout(function() {
            URL.revokeObjectURL(zipUrl);
          }, 10000);
        });
      });
      return;
    }

    var file = urlFiles[index];
    updateFileStatus(file.id, 'fetching');

    fetch(file.url)
      .then(function(response) {
        if (!response.ok) throw new Error("HTTP error " + response.status);
        return response.blob();
      })
      .then(function(blob) {
        var resolvedName = resolveFilename(file.filename, usedNames);
        zip.file(resolvedName, blob);
        updateFileStatus(file.id, 'done');
        index++;
        fetchAndZipNext();
      })
      .catch(function(err) {
        console.error("ZIP fetch failed for URL: " + file.url, err);
        updateFileStatus(file.id, 'error');
        index++;
        fetchAndZipNext();
      });
  }

  fetchAndZipNext();
}

function resolveFilename(filename, usedNames) {
  if (!usedNames[filename]) {
    usedNames[filename] = 1;
    return filename;
  }
  var lastDot = filename.lastIndexOf('.');
  var name = lastDot !== -1 ? filename.substring(0, lastDot) : filename;
  var ext = lastDot !== -1 ? filename.substring(lastDot) : '';
  
  var count = usedNames[filename];
  var newFilename = name + ' (' + count + ')' + ext;
  while (usedNames[newFilename]) {
    count++;
    newFilename = name + ' (' + count + ')' + ext;
  }
  usedNames[filename] = count + 1;
  usedNames[newFilename] = 1;
  return newFilename;
}
