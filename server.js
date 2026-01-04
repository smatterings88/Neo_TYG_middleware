import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Form handler endpoint
app.post('/api/submit-tyg-form', async (req, res) => {
  try {
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
    } = req.body;

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

    // Here you can add additional processing:
    // - Save to database
    // - Send email notifications
    // - Process subscription requests
    // etc.

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Form submitted successfully',
      data: {
        recipientEmail: submissionData.recipientEmail,
        timestamp: submissionData.timestamp
      }
    });

  } catch (error) {
    console.error('Error processing form submission:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper function to validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Form handler endpoint: http://localhost:${PORT}/api/submit-tyg-form`);
});

