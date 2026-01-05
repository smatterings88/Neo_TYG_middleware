// Import GHL API functions
import { sendEmailTemplateByEmail } from './lib/ghl-api.js';

// Helper function to validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Email template ID for anonymous TYG
const EMAIL_TEMPLATE_ID = '6957be6d9f487e131420364b';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
  }

  // Allow POST and GET methods (webhooks can use different methods)
  if (!['POST', 'GET'].includes(req.method)) {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST or GET.'
    });
  }

  try {
    // Extract target_email from query params, body, or both
    // GHL webhooks can send data in different ways
    let targetEmail = null;
    
    // Try query parameters first (common for GET requests)
    if (req.query && req.query.target_email) {
      targetEmail = req.query.target_email;
    }
    
    // Try body parameters (common for POST requests)
    if (!targetEmail && req.body) {
      // Handle both JSON and URL-encoded bodies
      if (typeof req.body === 'string') {
        const params = new URLSearchParams(req.body);
        targetEmail = params.get('target_email');
      } else if (req.body.target_email) {
        targetEmail = req.body.target_email;
      }
    }

    // Validate email is provided
    if (!targetEmail || targetEmail.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'target_email parameter is required',
        error: 'Please provide target_email in the query parameter (?target_email=...) or request body'
      });
    }

    // Validate email format
    const emailTrimmed = targetEmail.trim().toLowerCase();
    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
        error: `"${emailTrimmed}" is not a valid email address`
      });
    }

    console.log('[Send Anonymous TYG] Email request received:', {
      targetEmail: emailTrimmed,
      templateId: EMAIL_TEMPLATE_ID,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    // Send email using template
    await sendEmailTemplateByEmail(emailTrimmed, EMAIL_TEMPLATE_ID);

    console.log('[Send Anonymous TYG] Email sent successfully:', emailTrimmed);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      data: {
        targetEmail: emailTrimmed,
        templateId: EMAIL_TEMPLATE_ID,
        sent: true
      }
    });

  } catch (error) {
    console.error('[Send Anonymous TYG] Error processing email request:', error);
    
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

    // Handle contact not found error
    if (error.message && error.message.includes('Contact not found')) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
        error: error.message,
        data: {
          targetEmail: targetEmail?.trim().toLowerCase()
        }
      });
    }
    
    // Handle template error
    if (error.code === 'TEMPLATE_ERROR') {
      return res.status(400).json({
        success: false,
        message: 'Template not found',
        error: error.message,
        data: {
          templateId: EMAIL_TEMPLATE_ID,
          targetEmail: targetEmail?.trim().toLowerCase()
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while sending the email'
    });
  }
}

