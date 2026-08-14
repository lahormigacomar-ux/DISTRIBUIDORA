const isElectron = window && window.process && window.process.type === 'renderer';

export const API_URL = import.meta.env.VITE_API_URL || 
    ((import.meta.env.PROD && !isElectron) ? '/api' : 'http://localhost:5000/api');
