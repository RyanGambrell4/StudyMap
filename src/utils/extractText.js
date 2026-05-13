function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

async function extractFromPDF(file) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
  const pdfjsLib = window['pdfjs-dist/build/pdf']
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // Use hasEOL to preserve line breaks — critical for date/table structure in syllabi
    const pageText = content.items
      .map(item => item.str + (item.hasEOL ? '\n' : ' '))
      .join('')
    text += pageText + '\n'
  }
  return text
}

async function extractFromDOCX(file) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js')
  const arrayBuffer = await file.arrayBuffer()
  const result = await window.mammoth.extractRawText({ arrayBuffer })
  return result.value
}

async function extractFromPPTX(file) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
  const arrayBuffer = await file.arrayBuffer()
  const zip = await window.JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0')
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0')
      return numA - numB
    })
  let text = ''
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string')
    const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) ?? []
    text += matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ') + '\n'
  }
  return text
}

export async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'pdf') return extractFromPDF(file)
  if (ext === 'docx') return extractFromDOCX(file)
  if (ext === 'pptx') return extractFromPPTX(file)
  throw new Error(`Unsupported file type: .${ext}. Please upload a PDF, .docx, or .pptx file.`)
}
