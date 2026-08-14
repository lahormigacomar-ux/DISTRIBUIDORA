import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import axios from 'axios'

// Setup global Axios interceptor for Multi-Company Tenant ID header
axios.interceptors.request.use((config) => {
    const company = localStorage.getItem('activeCompany');
    if (company) {
        try {
            const parsed = JSON.parse(company);
            if (parsed && parsed.id) {
                config.headers['x-company-id'] = parsed.id;
            }
        } catch (e) {
            console.error('Error parsing activeCompany session:', e);
        }
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});


// Global error handling for the React app
window.addEventListener('error', (event) => {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.width = '100%';
    errorDiv.style.height = '100%';
    errorDiv.style.backgroundColor = '#fef2f2';
    errorDiv.style.color = '#991b1b';
    errorDiv.style.padding = '40px';
    errorDiv.style.zIndex = '99999';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.style.overflow = 'auto';
    errorDiv.innerHTML = `
        <h1 style="font-size: 24px; margin-bottom: 20px;">⚛️ React Runtime Error</h1>
        <p style="font-weight: bold;">${event.message}</p>
        <pre style="background: #fee2e2; padding: 15px; border-radius: 8px; font-size: 12px; margin-top: 15px;">${event.error ? event.error.stack : 'No stack trace available'}</pre>
        <div style="margin-top: 20px; font-size: 14px; color: #450a0a;">
            Path: ${window.location.href}<br>
            Protocol: ${window.location.protocol}
        </div>
    `;
    document.body.appendChild(errorDiv);
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
