export const API = process.env.NODE_ENV === 'production' ? `https://${window.location.host}/hub-api` : 'http://localhost:2000/hub-api';

