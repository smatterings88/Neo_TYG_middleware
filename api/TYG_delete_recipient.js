// Import GHL API functions
import { deleteContactByEmail } from './lib/ghl-api.js';

// Helper function to validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
  }

  // Allow POST, GET, and DELETE methods (webhooks can use different methods)
  if (!['POST', 'GET', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST, GET, or DELETE.'
    });
  }

  try {
    // Extract email from query params, body, or both
    // GHL webhooks can send data in different ways
    let email = null;
    
    // Try query parameters first (common for GET requests)
    if (req.query && req.query.email) {
      email = req.query.email;
    }
    
    // Try body parameters (common for POST requests)
    if (!email && req.body) {
      // Handle both JSON and URL-encoded bodies
      if (typeof req.body === 'string') {
        const params = new URLSearchParams(req.body);
        email = params.get('email');
      } else if (req.body.email) {
        email = req.body.email;
      }
    }

    // Validate email is provided
    if (!email || email.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required',
        error: 'Please provide an email address in the query parameter (?email=...) or request body'
      });
    }

    // Validate email format
    const emailTrimmed = email.trim().toLowerCase();
    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
        error: `"${emailTrimmed}" is not a valid email address`
      });
    }

    console.log('[TYG Delete] Delete request received:', {
      email: emailTrimmed,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    // Delete the contact
    const deleted = await deleteContactByEmail(emailTrimmed);

    if (deleted) {
      console.log('[TYG Delete] Contact deleted successfully:', emailTrimmed);
      return res.status(200).json({
        success: true,
        message: 'Contact deleted successfully',
        data: {
          email: emailTrimmed,
          deleted: true
        }
      });
    } else {
      console.log('[TYG Delete] Contact not found:', emailTrimmed);
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
        data: {
          email: emailTrimmed,
          deleted: false
        }
      });
    }

  } catch (error) {
    console.error('[TYG Delete] Error processing delete request:', error);
    
    // Handle specific error types
    if (error.code === 'MISSING_API_KEY') {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
        error: 'GHL_API_KEY is not configured'
      });
    }
    
    if (error.code === 'AUTH_ERROR') {
      return res.status(500).json({
        success: false,
        message: 'Authentication error',
        error: 'Invalid GoHighLevel API key'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while processing the request'
    });
  }
}

