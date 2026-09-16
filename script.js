// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global variables for PDF state
let currentPdfDocument = null;
let currentPdfTextBlocks = [];
let translatedPdfTextBlocks = [];
let isPdfTranslating = false;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initTextTranslation();
    initPdfTranslation();
    initSpeechRecognition();
});

// --- Speech Synthesis ---
function speakText(text, langCode) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const langMap = {
            'en': 'en-US',
            'hi': 'hi-IN',
            'mr': 'mr-IN',
            'kn': 'kn-IN'
        };
        utterance.lang = langMap[langCode] || 'en-US';
        window.speechSynthesis.speak(utterance);
    }
}

// --- Speech Recognition ---
let recognition = null;
let isRecording = false;

function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        
        const micBtn = document.getElementById('mic-btn');
        const sourceText = document.getElementById('source-text');
        const sourceLang = document.getElementById('source-lang-text');

        if (!micBtn) return;

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add('recording');
            micBtn.innerHTML = '<i class="fa-solid fa-microphone-lines"></i>';
            micBtn.style.color = 'var(--danger-color)';
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                const currentVal = sourceText.value;
                sourceText.value = currentVal ? currentVal + ' ' + finalTranscript : finalTranscript;
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopRecording();
            
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                alert("Microphone access was denied. Please allow microphone permissions in your browser settings to use voice translation.");
            } else if (event.error === 'no-speech') {
                // Optional: handle no speech detected silently or with a non-intrusive notification
                console.log("No speech detected. Please try again.");
            }
        };

        recognition.onend = () => {
             // Only auto-translate if we actually recorded something and weren't stopped manually midway
             const currentTransText = sourceText.value.trim();
             if(isRecording && currentTransText.length > 0) {
                 stopRecording();
                 // Trigger the translation automatically after user finishes speaking
                 const btnTranslate = document.getElementById('btn-translate-text');
                 if(btnTranslate) btnTranslate.click();
             } else {
                 stopRecording();
             }
        };

        micBtn.addEventListener('click', () => {
            if (isRecording) {
                // Manual stop
                isRecording = false; // set to false early so onend doesn't auto translate if user aborted
                recognition.stop();
                stopRecording();
            } else {
                try {
                    recognition.lang = sourceLang.value === 'en' ? 'en-US' : 
                                       sourceLang.value === 'hi' ? 'hi-IN' : 
                                       sourceLang.value === 'mr' ? 'mr-IN' : 
                                       sourceLang.value === 'kn' ? 'kn-IN' : 'en-US';
                    recognition.start();
                } catch(e) {
                    console.error("Could not start recognition:", e);
                }
            }
        });

        function stopRecording() {
            isRecording = false;
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            micBtn.style.color = '';
        }
    } else {
        const micBtn = document.getElementById('mic-btn');
        if (micBtn) micBtn.style.display = 'none';
        console.warn('Speech Recognition API not supported.');
    }
}

// --- Navigation & UI ---
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const tabContents = document.querySelectorAll('.tab-content');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinksContainer = document.querySelector('.nav-links');

    // Tab switching
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = link.getAttribute('data-tab');
            switchTab(targetTab);
            
            // Close mobile menu if open
            if(window.innerWidth <= 768) {
                navLinksContainer.classList.remove('show');
            }
        });
    });

    // Mobile menu toggle
    mobileMenuBtn.addEventListener('click', () => {
        navLinksContainer.classList.toggle('show');
    });
}

function switchTab(tabId) {
    // Update active tab link
    document.querySelectorAll('.nav-links a').forEach(a => {
        if(a.getAttribute('data-tab') === tabId) {
            a.classList.add('active');
        } else {
            a.classList.remove('active');
        }
    });

    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
        if(content.id === tabId) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

// --- Common Translation Function ---
// Using LibreTranslate public API or similar fallback. For reliability in this demo, using MyMemory API.
async function translateText(text, sourceLang, targetLang) {
    if(!text || text.trim() === '') return '';
    
    // Fallback block if source and target are same
    if (sourceLang === targetLang) return text;

    try {
        // MyMemory API (Free tier, 500 words/day, good for demos)
        const langPair = `${sourceLang}|${targetLang}`;
        const encodedText = encodeURIComponent(text);
        const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${langPair}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.responseData && data.responseData.translatedText) {
            return data.responseData.translatedText;
        } else {
            throw new Error("Translation failed");
        }
    } catch (error) {
        console.error("Translation Error:", error);
        return "[Translation Error]";
    }
}

// --- Text Translation ---
function initTextTranslation() {
    const sourceText = document.getElementById('source-text');
    const translatedText = document.getElementById('translated-text');
    const btnTranslate = document.getElementById('btn-translate-text');
    const btnClear = document.getElementById('clear-text');
    const btnCopy = document.getElementById('copy-text');
    const btnSwap = document.getElementById('swap-langs-text');
    const sourceLang = document.getElementById('source-lang-text');
    const targetLang = document.getElementById('target-lang-text');
    const loader = document.getElementById('translation-loader');

    btnTranslate.addEventListener('click', async () => {
        const text = sourceText.value.trim();
        if(!text) return;

        loader.classList.remove('hidden');
        translatedText.value = '';
        
        const result = await translateText(text, sourceLang.value, targetLang.value);
        
        translatedText.value = result;
        loader.classList.add('hidden');
        
        // Auto-reply with voice
        speakText(result, targetLang.value);
    });

    const btnSpeak = document.getElementById('speak-btn');
    if (btnSpeak) {
        btnSpeak.addEventListener('click', () => {
            if (translatedText.value) {
                speakText(translatedText.value, targetLang.value);
            }
        });
    }

    btnClear.addEventListener('click', () => {
        sourceText.value = '';
        translatedText.value = '';
    });

    btnCopy.addEventListener('click', () => {
        if(translatedText.value) {
            navigator.clipboard.writeText(translatedText.value).then(() => {
                const icon = btnCopy.querySelector('i');
                icon.className = 'fa-solid fa-check';
                setTimeout(() => {
                    icon.className = 'fa-regular fa-copy';
                }, 2000);
            });
        }
    });

    btnSwap.addEventListener('click', () => {
        const temp = sourceLang.value;
        sourceLang.value = targetLang.value;
        targetLang.value = temp;
        
        const tempText = sourceText.value;
        sourceText.value = translatedText.value;
        translatedText.value = tempText;
    });
}

// --- PDF Translation ---
function initPdfTranslation() {
    const uploadZone = document.getElementById('pdf-upload-zone');
    const fileInput = document.getElementById('pdf-file-input');
    const workspace = document.getElementById('pdf-workspace');
    const btnClose = document.getElementById('btn-close-pdf');
    const btnTranslatePdf = document.getElementById('btn-translate-pdf');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    
    // Drag & Drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handlePdfFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePdfFile(e.target.files[0]);
        }
    });

    btnClose.addEventListener('click', () => {
        workspace.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        fileInput.value = '';
        document.getElementById('pdf-original-content').innerHTML = '';
        document.getElementById('pdf-translated-content').innerHTML = '<div class="placeholder-msg">Click \'Translate Context\' to process document.</div>';
        btnDownloadPdf.disabled = true;
        btnDownloadPdf.classList.add('disabled');
        currentPdfDocument = null;
        currentPdfTextBlocks = [];
        translatedPdfTextBlocks = [];
    });

    btnTranslatePdf.addEventListener('click', async () => {
        if(isPdfTranslating || currentPdfTextBlocks.length === 0) return;
        
        isPdfTranslating = true;
        btnTranslatePdf.disabled = true;
        btnTranslatePdf.innerText = "Translating...";
        
        const targetLang = document.getElementById('target-lang-pdf').value;
        const translatedContentDiv = document.getElementById('pdf-translated-content');
        translatedContentDiv.innerHTML = '';
        
        translatedPdfTextBlocks = [];
        
        // Setup progress bar
        const loader = document.getElementById('pdf-loader');
        const progressFill = document.getElementById('pdf-progress-fill');
        const progressText = document.getElementById('pdf-progress-text');
        loader.classList.remove('hidden');
        
        // Sync scroll
        const origPane = document.getElementById('pdf-original-content');
        const transPane = document.getElementById('pdf-translated-content');
        
        origPane.addEventListener('scroll', () => {
            if(isPdfTranslating) return; // Ignore during translation rendering
            const percentage = origPane.scrollTop / (origPane.scrollHeight - origPane.clientHeight);
            transPane.scrollTop = percentage * (transPane.scrollHeight - transPane.clientHeight);
        });

        transPane.addEventListener('scroll', () => {
            if(isPdfTranslating) return;
            const percentage = transPane.scrollTop / (transPane.scrollHeight - transPane.clientHeight);
            origPane.scrollTop = percentage * (origPane.scrollHeight - origPane.clientHeight);
        });

        // Translate blocks sequentially to respect API limits (if using free API)
        // Group blocks into larger chunks for fewer API calls in a real prod app.
        // For demo, we translate block by block with slight delay.
        
        for (let i = 0; i < currentPdfTextBlocks.length; i++) {
            const block = currentPdfTextBlocks[i];
            
            // Update progress
            const percent = Math.round((i / currentPdfTextBlocks.length) * 100);
            progressFill.style.width = `${percent}%`;
            progressText.innerText = `Translating document... ${percent}%`;

            let transText = await translateText(block.text, 'en', targetLang); // Assuming English source for PDF for now
            
            translatedPdfTextBlocks.push({
                text: transText,
                id: block.id
            });
            
            // Render translated block
            const p = document.createElement('p');
            p.className = 'pdf-block';
            p.id = `trans-${block.id}`;
            p.innerText = transText;
            translatedContentDiv.appendChild(p);
            
            // Small delay to prevent rate limit on free API
            await new Promise(r => setTimeout(r, 300));
        }

        loader.classList.add('hidden');
        isPdfTranslating = false;
        btnTranslatePdf.innerText = "Translate Context";
        btnTranslatePdf.disabled = false;
        
        btnDownloadPdf.disabled = false;
        btnDownloadPdf.classList.remove('disabled');
    });

    btnDownloadPdf.addEventListener('click', () => {
        downloadTranslatedPdf();
    });
}

async function handlePdfFile(file) {
    if (file.type !== 'application/pdf') {
        alert("Please upload a valid PDF file.");
        return;
    }

    const uploadZone = document.getElementById('pdf-upload-zone');
    const workspace = document.getElementById('pdf-workspace');
    const fileNameDisplay = document.getElementById('pdf-file-name');
    const originalContent = document.getElementById('pdf-original-content');
    const loader = document.getElementById('pdf-loader');
    const progressFill = document.getElementById('pdf-progress-fill');
    const progressText = document.getElementById('pdf-progress-text');

    uploadZone.classList.add('hidden');
    workspace.classList.remove('hidden');
    fileNameDisplay.innerText = file.name;
    originalContent.innerHTML = '';
    
    loader.classList.remove('hidden');
    progressText.innerText = "Reading PDF file... 0%";
    progressFill.style.width = "10%";

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        currentPdfDocument = pdf;
        currentPdfTextBlocks = [];
        
        let blockIdCounter = 0;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            progressFill.style.width = `${(pageNum / pdf.numPages) * 100}%`;
            progressText.innerText = `Extracting page ${pageNum} of ${pdf.numPages}...`;
            
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Reconstruct lines roughly based on y-coordinates
            let lastY = -1;
            let currentLine = "";
            
            // For simplicity in this demo, we group text items into larger paragraphs
            // based on vertical spacing.
            
            for (let i = 0; i < textContent.items.length; i++) {
                const item = textContent.items[i];
                if (lastY !== item.transform[5] && currentLine.length > 0) {
                    // New line potentially
                    currentLine += " ";
                }
                currentLine += item.str;
                lastY = item.transform[5];
                
                // End of sentence or paragraph rough heuristic
                if (item.str.endsWith('.') || item.str.endsWith('!') || item.str.endsWith('?') || i === textContent.items.length - 1) {
                    if (currentLine.trim().length > 0) {
                        const blockId = `block-${blockIdCounter++}`;
                        currentPdfTextBlocks.push({
                            id: blockId,
                            text: currentLine.trim(),
                            page: pageNum
                        });
                        
                        const p = document.createElement('p');
                        p.className = 'pdf-block';
                        p.id = `orig-${blockId}`;
                        p.innerText = currentLine.trim();
                        
                        // Hover sync
                        p.addEventListener('mouseenter', () => highlightBlock(blockId, true));
                        p.addEventListener('mouseleave', () => highlightBlock(blockId, false));
                        
                        originalContent.appendChild(p);
                        currentLine = "";
                    }
                }
            }
        }
        
    } catch (error) {
        console.error("Error reading PDF:", error);
        originalContent.innerHTML = '<p class="text-danger">Failed to read PDF. Ensure it contains text, not just images.</p>';
    } finally {
        loader.classList.add('hidden');
    }
}

function highlightBlock(id, hover) {
    const orig = document.getElementById(`orig-${id}`);
    const trans = document.getElementById(`trans-${id}`);
    
    if (hover) {
        if(orig) orig.style.backgroundColor = 'var(--secondary-color)';
        if(trans) trans.style.backgroundColor = 'var(--secondary-color)';
    } else {
        if(orig) orig.style.backgroundColor = 'transparent';
        if(trans) trans.style.backgroundColor = 'transparent';
    }
}

function downloadTranslatedPdf() {
    if(translatedPdfTextBlocks.length === 0) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPos = 20;
    const margin = 20;
    const pageHeight = doc.internal.pageSize.height;
    
    // Setup font config. Note: Standard jsPDF fonts don't support custom unicode like Hindi natively well
    // without supplying a custom TTF VFS font. For this scope, we output what we can, but real prod
    // requires a unicode font injection.
    doc.setFont("helvetica"); 
    
    translatedPdfTextBlocks.forEach(block => {
        const textLines = doc.splitTextToSize(block.text, doc.internal.pageSize.width - (margin * 2));
        
        // Page break logic
        if (yPos + (textLines.length * 7) >= pageHeight - margin) {
            doc.addPage();
            yPos = margin;
        }
        
        doc.text(textLines, margin, yPos);
        yPos += (textLines.length * 7) + 5; // advance Y adding gap
    });
    
    const fileName = document.getElementById('pdf-file-name').innerText;
    doc.save(`Translated_${fileName}`);
}
