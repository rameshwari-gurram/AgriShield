export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export const APP_CONFIG = {
  name: 'AgriShield Parametric',
  version: '1.0.0',
  description: 'AI-assisted crop-risk and parametric insurance platform',
  githubUrl: 'https://github.com/AgriShield/agrishield-parametric',
} as const;

export const POLLING_INTERVAL_MS = 10000; // 10 seconds for health polling
