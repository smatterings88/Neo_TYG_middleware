// Import GHL API functions
import { listEmailTemplates } from './lib/ghl-api.js';

export default async function handler(req, res) {
  // Set CORS headers FIRST - before any other logic
  const origin = req.headers.origin;
  
  // Allow common origins
  const allowedOrigins = [
    'https://dailyhug.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000'
  ];
  
  const corsOrigin = origin && allowedOrigins.some(allowed => origin.includes(allowed))
    ? origin
    : '*';
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    console.log('[List Templates] Request received:', {
      method: req.method,
      timestamp: new Date().toISOString()
    });

    // List email templates
    const result = await listEmailTemplates();

    console.log('[List Templates] Templates retrieved successfully:', {
      count: result.count || result.templates?.length || 0
    });

    return res.status(200).json({
      success: true,
      message: 'Templates retrieved successfully',
      data: {
        templates: result.templates || [],
        count: result.count || result.templates?.length || 0
      }
    });

  } catch (error) {
    console.error('[List Templates] Error retrieving templates:', error);
    
    // Handle specific error types
    if (error.code === 'AUTH_ERROR') {
      return res.status(401).json({
        success: false,
        message: 'Authentication error',
        error: 'Invalid or missing OAuth token. Please verify GHL_OAUTH_TOKEN in Vercel environment variables.'
      });
    }
    
    if (error.message && error.message.includes('GHL_OAUTH_TOKEN is required')) {
      return res.status(500).json({
        success: false,
        message: 'Configuration error',
        error: 'GHL_OAUTH_TOKEN environment variable is not set. Please configure it in Vercel.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while retrieving templates'
    });
  }
}

