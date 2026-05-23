lucide.createIcons();

const API_BASE_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') ? 'http://127.0.0.1:5000' : '';

const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authSwitch = document.getElementById('auth-switch');
const authError = document.getElementById('auth-error');
const authTitle = document.getElementById('auth-title');

let isLoginMode = true;

// If already authenticated, bypass login
if (localStorage.getItem('token')) {
    window.location.href = 'index.html';
}

// Toggle between Login and Registration mode
authSwitch.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        authTitle.innerText = "Welcome Back";
        authSubmit.innerText = "Sign In";
        authSwitch.innerHTML = `New here? <span>Create Account</span>`;
    } else {
        authTitle.innerText = "Create Account";
        authSubmit.innerText = "Sign Up";
        authSwitch.innerHTML = `Already have an account? <span>Sign In</span>`;
    }
    authError.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = authUsername.value.trim();
    const password = authPassword.value;
    
    if (!username || !password) return;
    
    // Choose Python endpoint
    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    
    authSubmit.innerText = "Connecting...";
    authSubmit.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.token) {
            // Save token securely and launch app
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', username);
            window.location.href = 'index.html';
        } else {
            showError(data.error || "Authentication failed.");
        }
    } catch (err) {
        showError("Server error. Please ensure the Python backend is running.");
    } finally {
        authSubmit.innerText = isLoginMode ? "Sign In" : "Sign Up";
        authSubmit.disabled = false;
    }
});

function showError(msg) {
    authError.innerText = msg;
    authError.style.display = 'block';
}
