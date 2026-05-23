// Initialize Lucide icons
lucide.createIcons();

const API_BASE_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') ? 'http://127.0.0.1:5000' : '';

// Custom greeting assignment
document.addEventListener('DOMContentLoaded', () => {
    updateGreeting();
});

function updateGreeting() {
    const greetingText = document.getElementById('greeting-text');
    const storedName = localStorage.getItem('username');
    if (greetingText && storedName) {
        const capitalized = storedName.charAt(0).toUpperCase() + storedName.slice(1).toLowerCase();
        greetingText.innerText = `Greetings, ${capitalized}!`;
    }
}

// Elements
const micBtn = document.getElementById('mic-btn');
const micStatus = document.getElementById('mic-status');
const transcriptionPanel = document.getElementById('transcription-panel');
const liveTranscript = document.getElementById('live-transcript');
const hesitationAlert = document.getElementById('hesitation-alert');
const chatMessages = document.getElementById('chat-messages');
const fileUpload = document.getElementById('file-upload');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const historyBtn = document.getElementById('history-toggle-btn');
const closeHistoryBtn = document.getElementById('close-history-btn');
const historySidebar = document.getElementById('history-sidebar');
const historyList = document.getElementById('history-list');
const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
const newChatBtn = document.getElementById('new-chat-btn');

let currentSessionId = null;
let isListening = false;
let recognition = null;
let hesitationCount = 0;
let currentWorkflowState = 'AWAITING_UPLOAD'; // States: AWAITING_UPLOAD, GENERATING, READY_TO_REVISE
let accumulatedTranscript = ''; 

// Dynamic AI Data stores
window.moduleData = [];
window.quizData = [];

if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });
}

if (historyBtn) {
    historyBtn.addEventListener('click', () => {
        historySidebar.classList.remove('sidebar-closed');
        historySidebar.classList.add('sidebar-open');
        loadHistory();
    });
}

if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => {
        historySidebar.classList.remove('sidebar-open');
        historySidebar.classList.add('sidebar-closed');
    });
}

if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
        currentSessionId = null;
        chatMessages.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; flex-direction:column; margin-bottom: 30px; margin-top: 12px; color: rgba(255,255,255,0.7);">
                <div style="background:rgba(255,255,255,0.1); padding:20px; border-radius:50%; margin-bottom:12px; box-shadow:0 0 20px rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">
                    <i data-lucide="layers" style="width: 50px; height: 50px; color:#fff;"></i>
                </div>
            </div>
        
            <div class="message ai-message">
                <div class="content">
                    <p id="greeting-text">Greetings, human!</p>
                </div>
            </div>
            
            <div class="message ai-message">
                <div class="content">
                    <p>I'm ReviseAI, a friendly tutor who can help you study your syllabus, summarize notes, and listen to your recitation.</p>
                </div>
            </div>

            <div class="message ai-message">
                <div class="content">
                    <p>Where should we start?</p>
                    <div class="upload-area" onclick="document.getElementById('file-upload').click()">
                        <i data-lucide="file-up" style="width: 36px; height: 36px; color: #fff; margin-bottom: 12px; display:inline-block;"></i>
                        <p style="color: #fff; font-weight: 600; font-size:16px;">Upload Syllabus</p>
                        <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 6px;">.PDF, .DOCX, .TXT</p>
                    </div>
                </div>
            </div>
            
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:12px; margin-top:20px;">
                <button class="suggestion-bubble survival-trigger" style="border-color: #ff6b6b; color: #ff6b6b; font-weight: 600;">Enter Survival Mode 🔥</button>
                <button class="suggestion-bubble">What can you do, ReviseAI?</button>
                <button class="suggestion-bubble">Help me practice reciting 🗣️</button>
                <button class="suggestion-bubble">Quiz me on my notes 📝</button>
            </div>
        `;
        updateGreeting();
        lucide.createIcons();
        window.moduleData = [];
        window.quizData = [];
        currentWorkflowState = 'AWAITING_UPLOAD';
        disableMic("Upload a syllabus first...");
        
        if(window.innerWidth < 768) {
             historySidebar.classList.remove('sidebar-open');
             historySidebar.classList.add('sidebar-closed');
        }
    });
}

async function loadHistory() {
    historyList.innerHTML = `<div style="text-align:center; padding: 20px;"><span class="loading-spinner"></span></div>`;
    try {
        const response = await fetch(`${API_BASE_URL}/api/history`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        
        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }
        
        if (data.sessions && data.sessions.length > 0) {
            let html = "";
            data.sessions.forEach(item => {
                const icon = item.type === 'upload' ? 'file-text' : 'message-square';
                const date = new Date(item.timestamp).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
                });
                
                const displayContent = item.preview ? (item.preview.length > 80 ? item.preview.substring(0, 80) + '...' : item.preview) : "Empty Session";
                
                html += `
                    <div class="history-card" onclick="loadSession('${item.session_id}')">
                        <div class="history-card-header">
                            <span style="display:flex;align-items:center;gap:4px;color:var(--accent-blue);font-weight:600;"><i data-lucide="${icon}" style="width:13px;height:13px;"></i> Session</span>
                            <span>${date}</span>
                        </div>
                        <div style="font-style: italic; color: rgba(255,255,255,0.8);">${displayContent}</div>
                    </div>
                `;
            });
            historyList.innerHTML = html;
        } else {
            historyList.innerHTML = `<p style="color:var(--text-muted); font-size:13px; text-align:center; margin-top:20px;">No sessions yet.</p>`;
        }
        lucide.createIcons();
    } catch (e) {
        historyList.innerHTML = `<p style="color:var(--danger); font-size:13px; text-align:center; margin-top:20px;">Failed to load history.</p>`;
    }
}

async function loadSession(sessionId) {
    currentSessionId = sessionId;
    
    // UI Feedback
    chatMessages.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height: 100%; flex-direction:column;">
            <span class="loading-spinner" style="width:30px; height:30px; border-width:3px;"></span>
            <p style="margin-top: 16px; color: var(--text-muted);">Loading session...</p>
        </div>
    `;
    
    // Close sidebar on mobile
    if(window.innerWidth < 768) {
         historySidebar.classList.remove('sidebar-open');
         historySidebar.classList.add('sidebar-closed');
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/history/${sessionId}`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        
        chatMessages.innerHTML = ''; // clear loading
        
        // Rebuild chat
        data.history.forEach(item => {
            try {
                const parsedContent = JSON.parse(item.content);
                // User Message
                if(parsedContent.user) {
                     addMessage(parsedContent.user, 'user', false);
                }
                
                // AI Message (Can be text or complex JSON for notes)
                if(parsedContent.ai) {
                     if (typeof parsedContent.ai === 'string') {
                         let formattedReply = parsedContent.ai.replace(/\\n\\n/g, '<br/><br/>').replace(/\\n/g, '<br/>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
                         addMessageHTML(`<p>${formattedReply}</p>`, 'ai');
                     } else if (typeof parsedContent.ai === 'object') {
                         // It's a module/notes result or evaluation result
                         if (parsedContent.ai.roadmap) {
                             let formattedRoadmap = parsedContent.ai.roadmap.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                             const survivalHTML = `
                                 <div class="notes-card" style="border-left: 4px solid #ff6b6b; background: rgba(255,107,107,0.02);">
                                     <h4 style="color: #ff6b6b; margin-bottom: 12px; font-size: 16px; display:flex; align-items:center; gap:6px;"><i data-lucide="flame" style="width:18px;height:18px;"></i> Emergency Roadmap</h4>
                                     <p style="font-size: 14px; color: #444; line-height: 1.6;">${formattedRoadmap}</p>
                                 </div>
                             `;
                             addMessageHTML(survivalHTML, 'ai');
                             currentWorkflowState = 'SURVIVAL_AWAITING_QA_CONFIRM';
                         } else if (parsedContent.ai.modules) {
                             // Reconstruct Notes UI
                             window.moduleData = parsedContent.ai.modules;
                             window.quizData = parsedContent.ai.quiz;
                             let modulesHTML = "";
                             window.moduleData.forEach(mod => {
                                  modulesHTML += `
                                     <div style="margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #eee;">
                                         <h4 style="color: var(--accent-blue); margin-bottom: 6px; font-size:16px;">${mod.module}</h4>
                                         <p style="font-size: 14px; color: #555; line-height: 1.6;">${mod.passage}</p>
                                     </div>
                                  `;
                             });
                             const dynamicNotesHTML = `
                                 <p style="margin-bottom:12px;">I've successfully processed the document! Here are the core topics extracted by the AI:</p>
                                 <div class="notes-card" style="max-height: 400px; overflow-y: auto;">
                                     ${modulesHTML}
                                 </div>
                                 <p style="margin-top:20px;"><strong>Ready for Revision?</strong> Press the microphone when you want to start speaking!</p>
                             `;
                             addMessageHTML(dynamicNotesHTML, 'ai');
                             currentWorkflowState = 'READY_TO_REVISE';
                             enableMic();
                         } else if (parsedContent.ai.message) {
                             // Reconstruct Evaluation
                             addMessageHTML(`<p>${parsedContent.ai.message}</p>`, 'ai');
                         }
                     }
                }
            } catch (err) {
                 // Fallback for old history format
                 addMessageHTML(`<p>${item.content}</p>`, 'ai');
            }
        });
        
    } catch (e) {
        chatMessages.innerHTML = `<div class="message ai-message"><div class="content"><p style="color: var(--danger);">Failed to load session.</p></div></div>`;
    }
}

// A robust regex for filler words
const fillerRegexStr = "\\b(umm|uhh|uhm|uh|hmm|ah|aah|ahhh|like\\s+umm|you\\s+know)\\b";
const fillerRegex = new RegExp(fillerRegexStr, 'g');

// Chat Form Handler
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    
    // Add user msg
    addMessage(text, 'user', true);
    chatInput.value = '';
    
    if (currentWorkflowState === 'SURVIVAL_AWAITING_ANSWERS') {
        currentWorkflowState = 'SURVIVAL_AWAITING_UPLOAD';
        const aiAck = `
            <p>Got it. I've locked in your time constraints.</p>
            <div class="upload-area" onclick="document.getElementById('file-upload').click()" style="margin-top: 16px; border-color: #ff6b6b; background: rgba(255,107,107,0.05);">
                <i data-lucide="file-up" style="width: 36px; height: 36px; color: #ff6b6b; margin-bottom: 12px; display:inline-block;"></i>
                <p style="color: #ff6b6b; font-weight: 600; font-size:16px;">Upload Syllabus for Emergency Scan</p>
                <p style="font-size: 13px; color: rgba(255,107,107,0.7); margin-top: 6px;">I will extract ONLY the most critical information.</p>
            </div>
        `;
        addMessageHTML(aiAck, 'ai');
        lucide.createIcons();
        
        // Also send this constraint to the backend so the AI remembers it in history
        fetch(`${API_BASE_URL}/api/chat`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ message: "Survival mode constraints: " + text, session_id: currentSessionId })
        }).then(r => r.json()).then(data => {
            if (data.session_id) currentSessionId = data.session_id;
        });
        
        return;
    }
    
    // Show loading spinner for AI
    const typingId = 'typing-' + Date.now();
    addMessageHTML(`<div id="${typingId}" style="display:flex; align-items:center; height:20px;"><span class="loading-spinner" style="width:14px; height:14px; border-width:2px; margin:0;"></span></div>`, 'ai');

    fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ message: text, session_id: currentSessionId })
    })
    .then(r => {
        if (r.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
        return r.json();
    })
    .then(data => {
        const tElement = document.getElementById(typingId);
        if(tElement && tElement.closest('.message')) tElement.closest('.message').remove();

        if(data.error) {
            addMessage(`API Error: ${data.error}`, 'ai');
        } else {
            if (data.session_id) currentSessionId = data.session_id;
            // Apply simple bold formatting to markdown text
            let formattedReply = data.reply.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            addMessageHTML(`<p>${formattedReply}</p>`, 'ai');
        }
    })
    .catch(err => {
        console.error(err);
        const tElement = document.getElementById(typingId);
        if(tElement && tElement.closest('.message')) tElement.closest('.message').remove();
        addMessage(`Server Offline: Make sure your Python server is running to chat!`, 'ai');
    });
});

// File Upload Handler
fileUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        handleFileUpload(file);
        e.target.value = '';
    }
});

function handleFileUpload(file) {
    if (currentWorkflowState === 'GENERATING') return;
    
    addMessageHTML(`Uploaded syllabus: <strong>${file.name}</strong>`, 'user', false);
    currentWorkflowState = 'GENERATING';
    disableMic("Analyzing syllabus...");
    
    const loadingId = 'loading-' + Date.now();
    const loadingHTML = `
        <div id="${loadingId}" style="display:flex; align-items:center;">
            <span class="loading-spinner"></span> Extracting and parsing document...
        </div>
    `;
    addMessageHTML(loadingHTML, 'ai');

    const formData = new FormData();
    formData.append("file", file);
    if (currentSessionId) {
        formData.append("session_id", currentSessionId);
    }
    if (currentWorkflowState === 'SURVIVAL_AWAITING_UPLOAD') {
        formData.append("mode", "survival");
    }

    fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    })
    .then(r => {
        if (r.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
        return r.json();
    })
    .then(data => {
        const lElement = document.getElementById(loadingId);
        if(lElement && lElement.closest('.message')) lElement.closest('.message').remove();

        if (data.error) throw new Error(data.error);
        if (data.session_id) currentSessionId = data.session_id;

        if (data.roadmap) {
            // Survival mode response
            let formattedRoadmap = data.roadmap.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            const survivalHTML = `
                <div class="notes-card" style="border-left: 4px solid #ff6b6b; background: rgba(255,107,107,0.02);">
                    <h4 style="color: #ff6b6b; margin-bottom: 12px; font-size: 16px; display:flex; align-items:center; gap:6px;"><i data-lucide="flame" style="width:18px;height:18px;"></i> Emergency Roadmap</h4>
                    <p style="font-size: 14px; color: #444; line-height: 1.6;">${formattedRoadmap}</p>
                </div>
            `;
            addMessageHTML(survivalHTML, 'ai');
            currentWorkflowState = 'SURVIVAL_AWAITING_QA_CONFIRM';
        } else {
            // Normal mode response
            window.moduleData = data.modules;
            window.quizData = data.quiz; 
    
            let modulesHTML = "";
            window.moduleData.forEach(mod => {
                 modulesHTML += `
                    <div style="margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #eee;">
                        <h4 style="color: var(--accent-blue); margin-bottom: 6px; font-size:16px;">${mod.module}</h4>
                        <p style="font-size: 14px; color: #555; line-height: 1.6;">${mod.passage}</p>
                    </div>
                 `;
            });
            
            const dynamicNotesHTML = `
                <p style="margin-bottom:12px;">I've successfully processed the document! Here are the core topics extracted by the AI:</p>
                <div class="notes-card" style="max-height: 400px; overflow-y: auto;">
                    ${modulesHTML}
                </div>
                <p style="margin-top:20px;"><strong>Ready for Revision?</strong> Press the microphone when you want to start speaking, and <strong>press it again to stop</strong> when you are finished summarizing to get your feedback!</p>
            `;
            
            addMessageHTML(dynamicNotesHTML, 'ai');
            currentWorkflowState = 'READY_TO_REVISE';
            enableMic();
        }
    })
    .catch(error => {
        console.error(error);
        const lElement = document.getElementById(loadingId);
        if(lElement && lElement.closest('.message')) lElement.closest('.message').remove();
        
        addMessage(`Server Error: Could not generate notes. Ensure the Python Server is running. Details: ${error.message}`, 'ai');
        currentWorkflowState = 'AWAITING_UPLOAD';
        enableMic();
    });
}

function getHesitationNotesContexts(transcriptText) {
    const identifiedModules = [];
    if (!window.moduleData) return identifiedModules;
    
    const lowerTranscript = transcriptText.toLowerCase();
    
    window.moduleData.forEach(mod => {
        let keywordHit = false;
        mod.keywords.forEach(kw => {
            if (lowerTranscript.includes(kw.toLowerCase())) {
                keywordHit = true;
            }
        });
        
        if (keywordHit) {
            identifiedModules.push(mod);
        }
    });
    
    return identifiedModules;
}

function respondToRevision(userText) {
    const loadingId = 'loading-eval-' + Date.now();
    addMessageHTML(`<div id="${loadingId}" style="display:flex; align-items:center; height:20px;"><span class="loading-spinner" style="width:14px; height:14px; border-width:2px; margin:0;"></span> &nbsp;Evaluating relevance to notes...</div>`, 'ai');

    fetch(`${API_BASE_URL}/api/evaluate`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
            transcript: userText,
            modules: window.moduleData,
            session_id: currentSessionId
        })
    })
    .then(r => {
        if (r.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
        return r.json();
    })
    .then(data => {
        const lElement = document.getElementById(loadingId);
        if(lElement && lElement.closest('.message')) lElement.closest('.message').remove();

        if (data.error) {
            addMessage(`Evaluation Error: ${data.error}`, 'ai');
            return;
        }
        if (data.session_id) currentSessionId = data.session_id;

        if (!data.is_relevant) {
            addMessageHTML(`<strong>Not Related to Notes:</strong> ${data.message}`, 'ai');
            return; 
        }

        const matches = userText.match(new RegExp(fillerRegexStr, 'gi'));
        let aiResponse = "";
        
        if (data.message && data.message.trim().length > 0) {
            aiResponse += `<p>${data.message}</p>`;
        }

        if (matches && matches.length > 0) {
            const uniqueFillers = [...new Set(matches.map(m => m.toLowerCase()))];
            aiResponse += `<p><strong>Good attempt!</strong> However, I noticed you used filler words like '${uniqueFillers.join("', '")}' ${matches.length} time(s).</p>`;
            
            const noteContexts = getHesitationNotesContexts(userText);
            if (noteContexts.length > 0) {
                let contextHTML = '';
                noteContexts.forEach(mod => {
                     contextHTML += `
                     <div style="margin-bottom:15px; background:#fdfdfd; border-left: 3px solid var(--accent-blue); padding:12px; border-radius:4px; border-top:1px solid #eee; border-right:1px solid #eee; border-bottom:1px solid #eee;">
                         <h5 style="color:var(--text-primary); margin-bottom:6px; font-size:14px;">${mod.module}</h5>
                         <p style="font-size:13px; color:#555; font-style:italic; margin-bottom:8px; line-height: 1.5;">"${mod.passage}"</p>
                         <p style="font-size:13px; color:var(--success); font-weight:600;"><i data-lucide="zap" style="width:14px;height:14px; vertical-align:middle; margin-right:4px;"></i>Quick Tip: ${mod.keyPoint}</p>
                     </div>
                     `;
                });
                
                 aiResponse += `<div class="notes-card" style="margin-top: 15px;">
                    <h4 style="color: var(--accent-blue); margin-bottom: 12px; font-size: 15px; display:flex; align-items:center; gap:6px;"><i data-lucide="search" style="width:16px;height:16px;"></i> Notes Focus Areas:</h4>
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Based on your speech context, you struggled recalling these key passages. Use these Quick Tips to remember them easier:</p>
                    ${contextHTML}
                </div>`;
            }
            
        } else {
            aiResponse += `<p><strong>Excellent delivery!</strong> Your speech was completely smooth with zero hesitation words. You clearly understand the material well!</p>`;
        }
        
        addMessageHTML(aiResponse, 'ai');
        lucide.createIcons();
        
        // Deploy dynamic quiz
        setTimeout(() => {
            if(!window.quizData || window.quizData.length === 0) return;
            let qHTML = "";
            window.quizData.forEach(q => {
                 qHTML += `<li style="margin-bottom:8px; color:#555;">${q}</li>`;
            });
            
            const quizHTML = `
                <div class="notes-card" style="margin-top: 5px;">
                    <h4 style="color: var(--accent-blue); margin-bottom: 12px; font-size: 16px; display:flex; align-items:center; gap:6px;"><i data-lucide="help-circle" style="width:18px;height:18px;"></i> Memory Quiz</h4>
                    <p style="font-size: 13.5px; color: #555; margin-bottom: 12px;">Let's solidify those concepts. Practice answering these dynamic questions generated from your uploaded text!</p>
                    <ol style="font-size: 13px; margin-left: 18px; line-height: 1.6;">
                        ${qHTML}
                    </ol>
                </div>
            `;
            addMessageHTML(quizHTML, 'ai');
            lucide.createIcons();
        }, 2500);

    })
    .catch(err => {
        console.error(err);
        const lElement = document.getElementById(loadingId);
        if(lElement && lElement.closest('.message')) lElement.closest('.message').remove();
        addMessage(`Server Offline or Error: Ensure your Python server is running!`, 'ai');
    });
}


/* Speech Recognition and UI Setup */
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = function() {
        isListening = true;
        hesitationCount = 0;
        accumulatedTranscript = '';
        liveTranscript.innerHTML = 'Listening for continuous speech flow...';
        micBtn.classList.add('listening');
        micStatus.innerHTML = 'Recording active (Click again to stop)';
        transcriptionPanel.style.display = 'block';
    };

    recognition.onresult = function(event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
                accumulatedTranscript += event.results[i][0].transcript + " "; // Add to global session memory
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        let displayHtml = '';
        if (finalTranscript) {
            let highlightedFinal = finalTranscript.replace(fillerRegex, '<span class="highlight-hesitation">$&</span>');
            displayHtml += `<span style="color:#333;">${highlightedFinal}</span>&nbsp;`;
        }
        
        if (interimTranscript) {
            let highlightedInterim = interimTranscript.replace(fillerRegex, '<span class="highlight-hesitation">$&</span>');
            displayHtml += `<i style="color:#8e8e93;">${highlightedInterim}</i>`;
        }

        liveTranscript.innerHTML = displayHtml;

        const currentSegmentText = (finalTranscript + " " + interimTranscript).toLowerCase();
        if (currentSegmentText.match(fillerRegex)) {
            flashHesitationAlert();
        }
    };

    recognition.onerror = function(event) {
        console.error('Speech recognition error', event.error);
        if(event.error === 'not-allowed') {
            alert('Microphone access is required for revision.');
        }
        stopListening();
    };

    recognition.onend = function() {
        if (isListening) {
            stopListening();
        }
    };
} else {
    alert("Speech Recognition API is not supported in this browser. Please use Chrome.");
    micStatus.innerHTML = "Browser unsupported";
}

function toggleListening() {
    if (isListening) {
        stopListening();
    } else {
        if (currentWorkflowState === 'READY_TO_REVISE') {
            recognition.start();
        } else {
            alert("Please upload and let the AI generate syllabus notes before starting revision.");
        }
    }
}

function stopListening() {
    isListening = false;
    recognition.stop();
    micBtn.classList.remove('listening');
    micStatus.innerHTML = 'Revision complete. Evaluating...';
    
    // Evaluate the ENTIRE duration of their speech (long-form)
    setTimeout(() => {
        transcriptionPanel.style.display = 'none';
        
        if (accumulatedTranscript.trim() === '') {
            addMessage(`You stopped before speaking anything! Press the mic when you're ready to actually recite.`, 'ai');
        } else {
            addMessageHTML(`<i data-lucide="mic" style="width:14px;height:14px; vertical-align:middle;"></i> <strong>Revision Transcript:</strong> "${accumulatedTranscript.trim()}"`, 'user', false);
            lucide.createIcons();
            
            respondToRevision(accumulatedTranscript);
        }
        
        micStatus.innerHTML = 'Press mic to recount another module';
    }, 1000);
}

function flashHesitationAlert() {
    hesitationAlert.classList.add('show');
    hesitationCount++;
    setTimeout(() => {
        hesitationAlert.classList.remove('show');
    }, 1200);
}

function enableMic() {
    micBtn.disabled = false;
    micBtn.classList.remove('disabled');
    micStatus.innerHTML = 'Press mic to start long-form revision';
}

function disableMic(reason) {
    micBtn.disabled = true;
    micBtn.classList.add('disabled');
    micStatus.innerHTML = reason;
}

micBtn.addEventListener('click', toggleListening);

function addMessage(text, sender, highlightUser = false) {
    const messageDiv = document.createElement('div');
    let messageClassList = `message ${sender}-message`;
    if (highlightUser && sender === 'user') {
        messageClassList += ' is-suggestion';
    }
    messageDiv.className = messageClassList;
    
    const avatarHtml = sender === 'ai' ? `<div class="avatar"><i data-lucide="bot"></i></div>` : `<div class="avatar"><i data-lucide="user"></i></div>`;
    
    messageDiv.innerHTML = `
        ${avatarHtml}
        <div class="content">
            <p>${text}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    lucide.createIcons();
}

function addMessageHTML(htmlContent, sender, highlightUser = false) {
    const messageDiv = document.createElement('div');
    let messageClassList = `message ${sender}-message`;
     if (highlightUser && sender === 'user') {
        messageClassList += ' is-suggestion';
    }
    messageDiv.className = messageClassList;
    
    const avatarHtml = sender === 'ai' ? `<div class="avatar"><i data-lucide="bot"></i></div>` : `<div class="avatar"><i data-lucide="user"></i></div>`;
    
    messageDiv.innerHTML = `
        ${avatarHtml}
        <div class="content">
            ${htmlContent}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    lucide.createIcons();
}

// Add delegated click event for suggestion bubbles
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('survival-trigger')) {
        currentWorkflowState = 'SURVIVAL_AWAITING_ANSWERS';
        addMessage("Enter Survival Mode 🔥", 'user', true);
        const survivalIntro = `
            <div style="border: 1px solid #ff6b6b; padding: 16px; border-radius: 12px; background: rgba(255, 107, 107, 0.05);">
                <h4 style="color: #ff6b6b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="alert-triangle" style="width:18px;height:18px;"></i> SURVIVAL MODE ACTIVATED
                </h4>
                <p style="margin-bottom: 12px; color: var(--text-primary);">We have an emergency. To build your high-yield crash course, please answer these 3 questions in one message:</p>
                <ol style="margin-left: 20px; color: var(--text-muted); font-size: 14px; margin-bottom: 12px; line-height: 1.6;">
                    <li>How many days are left for the exam?</li>
                    <li>How many units do you have to cover?</li>
                    <li>How many hours are left to study?</li>
                </ol>
                <p style="color: var(--text-primary); font-size: 13px;">Type your answers below and hit enter.</p>
            </div>
        `;
        addMessageHTML(survivalIntro, 'ai');
        lucide.createIcons();
        return;
    }

    if (e.target.classList.contains('suggestion-bubble')) {
        chatInput.value = e.target.innerText;
        chatForm.dispatchEvent(new Event('submit'));
    }
});
