export const API = process.env.NODE_ENV === 'production' ? `https://${window.location.host}/hub-api` : 'http://10.0.150.180:2000/hub-api';
export const JOURNAL_API = process.env.NODE_ENV === 'production' ? 'http://10.0.128.95:8000/api' : 'http://10.0.150.53:8000/api';
export const APIWebSocket = process.env.NODE_ENV === 'production' ? `wss://${window.location.host}` : 'ws://10.0.150.180:2000';