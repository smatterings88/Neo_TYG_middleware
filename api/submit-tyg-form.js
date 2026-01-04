// Helper function to validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Import GHL API functions
import {
  findOrCreateContact,
  updateContactCustomFields,
  addTagsToContact
} from './lib/ghl-api.js';

export default async function handler(req, res) {
  // Set CORS headers FIRST - before any other logic
  // This is critical for CORS to work properly
  const origin = req.headers.origin;
  
  // Allow dailyhug.com and common development origins, or use wildcard
  const allowedOrigins = [
    'https://dailyhug.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000'
  ];
  
  // Use origin if it's in allowed list, otherwise use wildcard
  const corsOrigin = origin && allowedOrigins.some(allowed => origin.includes(allowed))
    ? origin
    : '*';
  
  // Set CORS headers - MUST be set before any response
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    // Parse body - Vercel may pass URL-encoded data as a string
    let bodyData = req.body || {};
    
    // If body is a string (URL-encoded), parse it
    if (typeof bodyData === 'string') {
      const params = new URLSearchParams(bodyData);
      bodyData = {};
      for (const [key, value] of params.entries()) {
        bodyData[key] = value;
      }
    }
    
    // Extract form data
    const {
      recipientName,
      recipientEmail,
      message,
      senderEmail,
      senderName,
      sendAnonymously,
      subscribeDailyHug,
      timestamp
    } = bodyData;

    // Validate required fields
    const errors = [];
    
    if (!recipientName || recipientName.trim() === '') {
      errors.push('recipientName is required');
    }
    
    if (!recipientEmail || recipientEmail.trim() === '') {
      errors.push('recipientEmail is required');
    } else if (!isValidEmail(recipientEmail)) {
      errors.push('recipientEmail must be a valid email address');
    }
    
    if (!message || message.trim() === '') {
      errors.push('message is required');
    }
    
    if (!senderEmail || senderEmail.trim() === '') {
      errors.push('senderEmail is required');
    } else if (!isValidEmail(senderEmail)) {
      errors.push('senderEmail must be a valid email address');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: errors
      });
    }

    // Prepare submission data
    const submissionData = {
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim().toLowerCase(),
      message: message.trim(),
      senderEmail: senderEmail.trim().toLowerCase(),
      senderName: senderName ? senderName.trim() : '',
      sendAnonymously: sendAnonymously === 'true' || sendAnonymously === true,
      subscribeDailyHug: subscribeDailyHug === 'true' || subscribeDailyHug === true,
      timestamp: timestamp || new Date().toISOString()
    };

    console.log('[TYG Form] Form submission received:', {
      recipientEmail: submissionData.recipientEmail,
      senderEmail: submissionData.senderEmail,
      timestamp: submissionData.timestamp
    });

    // Integrate with GoHighLevel API
    try {
      // Step 1: Find or create sender contact
      console.log('[TYG Form] Processing sender contact...');
      const senderContact = await findOrCreateContact(
        submissionData.senderEmail,
        {
          firstName: submissionData.senderName || undefined,
          name: submissionData.senderName || undefined
        }
      );

      // Step 2: Update sender contact with custom fields
      console.log('[TYG Form] Updating sender contact custom fields...');
      await updateContactCustomFields(senderContact.id, {
        tyg_recipientname: submissionData.recipientName,
        tyg_recipientemail: submissionData.recipientEmail,
        tyg_message: submissionData.message,
        tyg_sendername: submissionData.senderName,
        tyg_sendanonymously: submissionData.sendAnonymously ? 'true' : 'false',
        tyg_subscribedailyhug: submissionData.subscribeDailyHug ? 'true' : 'false'
      });

      // Step 3: Add tag to sender contact
      console.log('[TYG Form] Adding tag to sender contact...');
      await addTagsToContact(senderContact.id, 'tyg--> sender');

      // Step 4: Find or create recipient contact
      console.log('[TYG Form] Processing recipient contact...');
      const recipientContact = await findOrCreateContact(
        submissionData.recipientEmail,
        {
          firstName: submissionData.recipientName,
          name: submissionData.recipientName
        }
      );

      console.log('[TYG Form] All GHL operations completed successfully:', {
        senderContactId: senderContact.id,
        recipientContactId: recipientContact.id
      });

      // Return success response
      return res.status(200).json({
        success: true,
        message: 'Form submitted successfully',
        data: {
          recipientEmail: submissionData.recipientEmail,
          senderEmail: submissionData.senderEmail,
          timestamp: submissionData.timestamp,
          ghl: {
            senderContactId: senderContact.id,
            recipientContactId: recipientContact.id
          }
        }
      });

    } catch (ghlError) {
      console.error('[TYG Form] GHL API error:', ghlError);
      // Still return success to user, but log the error
      // You may want to change this behavior based on your requirements
      return res.status(200).json({
        success: true,
        message: 'Form submitted successfully (GHL sync had issues)',
        warning: 'GoHighLevel integration encountered an error',
        data: {
          recipientEmail: submissionData.recipientEmail,
          timestamp: submissionData.timestamp
        },
        error: process.env.NODE_ENV === 'development' ? ghlError.message : undefined
      });
    }

  } catch (error) {
    console.error('Error processing form submission:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

