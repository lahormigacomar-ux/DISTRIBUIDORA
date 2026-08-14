const isElectron = window && window.process && window.process.type === 'renderer';

export const API_URL = (import.meta.env.PROD || isElectron)
    ? 'http://localhost:5000/api'
    : 'http://localhost:5000/api';
