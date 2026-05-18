import os
import sqlite3
import datetime
import uuid
import time
import json
from functools import wraps

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import google.generativeai as genai

# Try to import document parsers
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import docx
except ImportError:
    docx = None

app = Flask(__name__)
CORS(app)

# Load environment variables
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), 'env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line:
                    key, val = line.strip().split('=', 1)
                    if key == 'GEMINI_API_KEY':
                        return val
    return None

api_key = load_env()
if api_key:
    genai.configure(api_key=api_key)
else:
    print("WARNING: GEMINI_API_KEY not found in 'env' file. AI features will not work.")

# Configure Gemini model
system_instruction = """
You are ReviseAI, an advanced, friendly AI tutor. Your goal is to converse naturally like ChatGPT while retaining your primary focus on helping students study their syllabus, summarize notes, and review their voice recitations.
Always be encouraging, educational, and engaging.
"""
try:
    model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=system_instruction)
except TypeError:
    # Older versions of the SDK might not support system_instruction this way
    model = genai.GenerativeModel('gemini-2.5-flash')
except AttributeError:
    model = None

# Database Initialization
DB_FILE = os.path.join(os.path.dirname(__file__), 'users.db')

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  password TEXT,
                  token TEXT)''')
    
    # Check if history table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='history'")
    exists = c.fetchone()
    
    if not exists:
        c.execute('''CREATE TABLE history
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      username TEXT,
                      session_id TEXT,
                      type TEXT,
                      content TEXT,
                      timestamp DATETIME)''')
    else:
        # Check if session_id column exists
        c.execute("PRAGMA table_info(history)")
        columns = [col[1] for col in c.fetchall()]
        if 'session_id' not in columns:
            c.execute('ALTER TABLE history ADD COLUMN session_id TEXT')
            # Assign dummy session IDs to old records
            c.execute("UPDATE history SET session_id = 'legacy_session' WHERE session_id IS NULL")

    conn.commit()
    conn.close()

init_db()

# Helper for Database
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# Token generation
def generate_token():
    return str(uuid.uuid4())

# Auth Middleware
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token or not token.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401
        
        token = token.split(' ')[1]
        conn = get_db_connection()
        user = conn.execute('SELECT username FROM users WHERE token = ?', (token,)).fetchone()
        conn.close()
        
        if not user:
            return jsonify({'error': 'Unauthorized'}), 401
            
        return f(user['username'], *args, **kwargs)
    return decorated

# Retry decorator for rate limits
def retry_on_429(max_retries=3, base_delay=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            retries = 0
            while retries < max_retries:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if '429' in str(e) or 'Quota' in str(e):
                        retries += 1
                        time.sleep(base_delay * (2 ** (retries - 1)))
                    else:
                        raise e
            raise Exception("Max retries exceeded due to rate limiting")
        return wrapper
    return decorator

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
        
    hashed_password = generate_password_hash(password)
    token = generate_token()
    
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password, token) VALUES (?, ?, ?)',
                     (username, hashed_password, token))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Username already exists'}), 400
    conn.close()
    
    return jsonify({'token': token})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    
    if user and check_password_hash(user['password'], password):
        token = generate_token()
        conn.execute('UPDATE users SET token = ? WHERE id = ?', (token, user['id']))
        conn.commit()
        conn.close()
        return jsonify({'token': token})
        
    conn.close()
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/history', methods=['GET'])
@require_auth
def get_sessions(username):
    # Get distinct sessions for the user, ordered by most recent activity
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT session_id, MAX(timestamp) as last_updated, 
               (SELECT content FROM history h2 WHERE h2.session_id = h1.session_id ORDER BY timestamp ASC LIMIT 1) as first_message,
               (SELECT type FROM history h3 WHERE h3.session_id = h1.session_id ORDER BY timestamp ASC LIMIT 1) as first_type
        FROM history h1
        WHERE username = ?
        GROUP BY session_id
        ORDER BY last_updated DESC
    ''', (username,)).fetchall()
    conn.close()
    
    sessions = []
    for row in rows:
        content_preview = ""
        if row['first_message']:
            try:
                # Try to parse as JSON first (new format)
                content_obj = json.loads(row['first_message'])
                content_preview = content_obj.get('user', '') or content_obj.get('ai', '')
            except json.JSONDecodeError:
                # Fallback for old format
                content_preview = row['first_message']
        
        # Make preview short
        if isinstance(content_preview, str):
             if len(content_preview) > 60:
                 content_preview = content_preview[:60] + "..."
                 
        sessions.append({
            'session_id': row['session_id'],
            'type': row['first_type'],
            'preview': content_preview,
            'timestamp': row['last_updated']
        })
    return jsonify({'sessions': sessions})

@app.route('/api/history/<session_id>', methods=['GET'])
@require_auth
def get_session_history(username, session_id):
    conn = get_db_connection()
    rows = conn.execute('SELECT type, content, timestamp FROM history WHERE username = ? AND session_id = ? ORDER BY timestamp ASC', (username, session_id)).fetchall()
    conn.close()
    
    history = []
    for row in rows:
        history.append({
            'type': row['type'],
            'content': row['content'],
            'timestamp': row['timestamp']
        })
    return jsonify({'history': history})

@app.route('/api/chat', methods=['POST'])
@require_auth
@retry_on_429()
def chat(username):
    data = request.json
    message = data.get('message')
    session_id = data.get('session_id') or str(uuid.uuid4())
    
    if not message:
        return jsonify({'error': 'Message required'}), 400
        
    try:
        # Load chat history for the session
        conn = get_db_connection()
        rows = conn.execute('SELECT content FROM history WHERE username = ? AND session_id = ? ORDER BY timestamp ASC', (username, session_id)).fetchall()
        
        gemini_history = []
        for row in rows:
            try:
                parsed = json.loads(row['content'])
                if 'user' in parsed and parsed['user']:
                    gemini_history.append({'role': 'user', 'parts': [str(parsed['user'])]})
                if 'ai' in parsed and parsed['ai']:
                    ai_text = parsed['ai'] if isinstance(parsed['ai'], str) else json.dumps(parsed['ai'])
                    gemini_history.append({'role': 'model', 'parts': [ai_text]})
            except json.JSONDecodeError:
                pass
                
        # Start chat session with history
        chat_session = model.start_chat(history=gemini_history)
        response = chat_session.send_message(message)
        reply = response.text
        
        # Save to history as JSON to make UI rebuilding easier
        content_data = json.dumps({'user': message, 'ai': reply})
        
        conn.execute('INSERT INTO history (username, session_id, type, content, timestamp) VALUES (?, ?, ?, ?, ?)',
                     (username, session_id, 'chat', content_data, datetime.datetime.now().isoformat()))
        conn.commit()
        conn.close()
        
        return jsonify({'reply': reply, 'session_id': session_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def extract_text(filepath):
    text = ""
    ext = filepath.lower().split('.')[-1]
    if ext == 'pdf':
        if fitz:
            try:
                doc = fitz.open(filepath)
                for page in doc:
                    text += page.get_text()
                doc.close()
            except Exception as e:
                print("Error reading PDF:", e)
        else:
            raise Exception("PyMuPDF (fitz) is not installed. Cannot process PDF.")
    elif ext in ['docx', 'doc']:
        if docx:
            try:
                doc = docx.Document(filepath)
                for para in doc.paragraphs:
                    text += para.text + "\\n"
            except Exception as e:
                print("Error reading DOCX:", e)
        else:
            raise Exception("python-docx is not installed. Cannot process DOCX.")
    else:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
    return text

@app.route('/api/analyze', methods=['POST'])
@require_auth
@retry_on_429()
def analyze(username):
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    session_id = request.form.get('session_id') or str(uuid.uuid4())
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    filename = file.filename
    temp_path = os.path.join(os.path.dirname(__file__), 'temp_' + filename)
    file.save(temp_path)
    
    try:
        text = extract_text(temp_path)
        os.remove(temp_path)
        
        if not text.strip():
            return jsonify({'error': 'Could not extract text from document.'}), 400
            
        mode = request.form.get('mode', 'normal')
        
        if mode == 'survival':
            prompt = f"""
            CRITICAL SURVIVAL MODE EMERGENCY: The user has extremely limited time before their exam.
            Analyze the following educational text for a student in SURVIVAL MODE based on the time constraints they previously provided in the chat.
            
            1. Create a `roadmap` string: A quick, strategic hour-by-hour routine plan to cover the syllabus based on their time constraints. Make it encouraging and urgent. You MUST end the roadmap text by asking the user: "Would you like me to give you the top 10 most important Q&As that cover this entire unit?"
            2. Generate `top10_qa`: An array of exactly 10 highly important Question and Answer pairs based ONLY on the text. These 10 Q&As should be comprehensive enough to cover the entire unit.
            
            Return ONLY a JSON object with this exact structure:
            {{
                "roadmap": "Your hour-by-hour study plan and the exact ending question.",
                "top10_qa": [
                    {{"q": "Question 1", "a": "Answer 1"}},
                    {{"q": "Question 2", "a": "Answer 2"}}
                ]
            }}
            
            Text:
            {text[:15000]}
            """
        else:
            prompt = f"""
            Analyze the following educational text and break it down into core modules.
            For each module, provide:
            - module: The name of the topic
            - passage: A concise summary of the topic
            - keywords: An array of important keywords related to the topic
            - keyPoint: A very brief "Quick Tip" to help remember it.
            
            Also generate an array of 3-5 quiz questions based on the text.
            
            Return ONLY a JSON object with this exact structure:
            {{
                "modules": [
                    {{
                        "module": "Topic Name",
                        "passage": "Summary here",
                        "keywords": ["keyword1", "keyword2"],
                        "keyPoint": "Quick tip here"
                    }}
                ],
                "quiz": ["Question 1", "Question 2"]
            }}
            
            Text:
            {text[:15000]}
            """
        
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        
        result = json.loads(response.text)
        result['session_id'] = session_id
        
        # Save to history
        content_data = json.dumps({'user': f"Uploaded {filename}", 'ai': result})
        
        conn = get_db_connection()
        conn.execute('INSERT INTO history (username, session_id, type, content, timestamp) VALUES (?, ?, ?, ?, ?)',
                     (username, session_id, 'upload', content_data, datetime.datetime.now().isoformat()))
        conn.commit()
        conn.close()
        
        return jsonify(result)
        
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

@app.route('/api/evaluate', methods=['POST'])
@require_auth
@retry_on_429()
def evaluate(username):
    data = request.json
    transcript = data.get('transcript')
    modules = data.get('modules')
    session_id = data.get('session_id') or str(uuid.uuid4())
    
    if not transcript or not modules:
        return jsonify({'error': 'Transcript and modules required'}), 400
        
    try:
        modules_json = json.dumps(modules)
        prompt = f"""
        Evaluate if the following spoken transcript is relevant to the provided study modules.
        
        Transcript: "{transcript}"
        Modules: {modules_json}
        
        Return ONLY a JSON object with this exact structure:
        {{
            "is_relevant": true or false,
            "message": "Feedback message about the relevance and quality of the recitation. Be encouraging."
        }}
        """
        
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        
        result = json.loads(response.text)
        result['session_id'] = session_id
        
        # Save the evaluation to history
        content_data = json.dumps({'user': transcript, 'ai': result})
        
        conn = get_db_connection()
        conn.execute('INSERT INTO history (username, session_id, type, content, timestamp) VALUES (?, ?, ?, ?, ?)',
                     (username, session_id, 'evaluate', content_data, datetime.datetime.now().isoformat()))
        conn.commit()
        conn.close()
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
