from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'ReviseAI - Software Requirements & Tech Stack', border=0, ln=1, align='C')
        self.ln(5)
        
    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', border=0, ln=0, align='C')

    def add_section(self, title, content):
        self.set_font('Arial', 'B', 12)
        self.set_text_color(0, 102, 204)
        self.cell(0, 10, title, border=0, ln=1, align='L')
        self.set_text_color(0, 0, 0)
        self.set_font('Arial', '', 11)
        self.multi_cell(0, 7, content)
        self.ln(5)

pdf = PDF()
pdf.add_page()
pdf.set_auto_page_break(auto=True, margin=15)

sys_req = "ReviseAI is a lightweight, full-stack Voice Chatbot designed for syllabus-to-revision workflows. It utilizes a visually minimal frontend communicating with a local Python API server, powered by the Google Gemini NLP framework."
pdf.add_section("1. Overview", sys_req)

frontend = "- Languages: HTML5, Vanilla CSS3, Vanilla JavaScript (ES6+).\n- Speech Recognition: WebSpeech API natively captures continuous long-form audio.\n- Icons: Lucide Icons (loaded via CDN).\n- State Management: Native DOM manipulation and window.localStorage logic for authentication.\n- Display: Clean, responsive, minimal interface utilizing transparent flex boxes and slide-out sidebars."
pdf.add_section("2. Frontend Interface", frontend)

backend = "- Operating System Host: Windows 10/11\n- Language Environment: Python 3.13.7\n- Application Framework: Flask (serving custom REST endpoints).\n- Token Cryptography: Werkzeug.security storing cryptographic password hashes.\n- Network Protocols: Flask-CORS handling Cross-Origin Resource connections.\n- File Extraction Parser: PyMuPDF processing and scraping raw text from loaded PDF structures."
pdf.add_section("3. Backend Server Application", backend)

database = "- Engine: SQLite3 (Local, lightweight relational database).\n- Active Data Node: users.db runtime generation.\n- Component Architectures:\n   -> users table: id (INT), username (TEXT), password (TEXT), token (TEXT).\n   -> history table: id (INT), username (TEXT), type (TEXT), content (TEXT), timestamp (DATETIME)."
pdf.add_section("4. Database Implementation", database)

ai = "- Global Provider: Google Generative AI Environment (Python SDK).\n- Language Model: Gemini-2.5-Flash (Optimized for massive context evaluation logic).\n- Instructions Matrix: Structured JSON injection overrides replacing standard Markdown outputs.\n- Defensive Code: Custom exponential back-off interception wrappers counteracting HTTP 429 Quota Exhaustion limits dynamically on the free tier."
pdf.add_section("5. AI NLP Workflow", ai)

pdf.output('ReviseAI_Software_Requirements.pdf')
