// GoHighLevel API Helper Functions

const GHL_API_BASE = 'https://rest.gohighlevel.com/v1';
const GHL_SERVICES_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

// Helper function to make API requests
async function ghlRequest(endpoint, options = {}) {
  if (!GHL_API_KEY) {
    const error = new Error('GHL_API_KEY environment variable is not set. Please configure it in Vercel project settings → Environment Variables.');
    error.code = 'MISSING_API_KEY';
    throw error;
  }

  const url = `${GHL_API_BASE}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    ...options.headers
  };

  console.log(`[GHL API] ${options.method || 'GET'} ${endpoint}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      console.error(`[GHL API] Error ${response.status}:`, errorData);
      
      // Provide more helpful error messages
      if (response.status === 401) {
        const error = new Error(`GHL API Authentication Failed (401): ${errorData.msg || errorData.message || 'Invalid API key'}. Please verify your GHL_API_KEY in Vercel environment variables.`);
        error.code = 'AUTH_ERROR';
        error.status = 401;
        throw error;
      }
      
      throw new Error(`GHL API Error: ${response.status} - ${errorData.msg || errorData.message || response.statusText}`);
    }

    // Check if response has content and try to parse as JSON
    // Some endpoints (like DELETE) return plain text like "OK"
    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();
    
    // If no content, return success indicator
    if (!responseText || responseText.trim() === '') {
      return { success: true };
    }
    
    // If content-type indicates JSON, parse it
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        // If JSON parse fails but we expected JSON, throw error
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
      }
    }
    
    // For non-JSON responses (like "OK" for DELETE), return as text
    // This handles DELETE operations that return plain text
    return { 
      success: true, 
      message: responseText,
      raw: responseText 
    };
  } catch (error) {
    console.error(`[GHL API] Request failed:`, error.message);
    throw error;
  }
}

// Search for contact by email
async function searchContactByEmail(email) {
  console.log(`[GHL] Searching for contact with email: ${email}`);
  
  const url = `/contacts/?query=${encodeURIComponent(email)}`;
  const data = await ghlRequest(url);
  
  // Handle different response structures
  let contacts = [];
  if (data.contacts && Array.isArray(data.contacts)) {
    contacts = data.contacts;
  } else if (data.contact) {
    contacts = [data.contact];
  } else if (Array.isArray(data)) {
    contacts = data;
  }
  
  // Filter for exact email matches
  const exactMatches = contacts.filter(contact => 
    contact.email && contact.email.toLowerCase() === email.toLowerCase()
  );
  
  const result = exactMatches.length > 0 ? exactMatches[0] : null;
  
  if (result) {
    console.log(`[GHL] Found contact: ${result.id} (${result.name || result.email})`);
  } else {
    console.log(`[GHL] No contact found with email: ${email}`);
  }
  
  return result;
}

// Get custom field definitions
async function getCustomFieldDefinitions() {
  console.log(`[GHL] Fetching custom field definitions...`);
  
  const endpoint = GHL_LOCATION_ID 
    ? `/custom-fields/?locationId=${GHL_LOCATION_ID}`
    : '/custom-fields/';
  
  const data = await ghlRequest(endpoint);
  
  // Create mapping of field key to field ID
  const fieldMap = {};
  if (data.customFields && Array.isArray(data.customFields)) {
    data.customFields.forEach(field => {
      if (field.id && field.fieldKey) {
        // Remove "contact." prefix if present
        const normalizedKey = field.fieldKey.startsWith('contact.') 
          ? field.fieldKey.substring(8) 
          : field.fieldKey;
        fieldMap[normalizedKey] = field.id;
      }
    });
  }
  
  console.log(`[GHL] Found ${Object.keys(fieldMap).length} custom fields`);
  return fieldMap;
}

// Create a new contact
async function createContact(contactData) {
  console.log(`[GHL] Creating contact: ${contactData.email}`);
  
  const payload = {
    email: contactData.email,
    ...(contactData.firstName && { firstName: contactData.firstName }),
    ...(contactData.lastName && { lastName: contactData.lastName }),
    ...(contactData.name && { name: contactData.name }),
    ...(contactData.phone && { phone: contactData.phone })
  };
  
  const data = await ghlRequest('/contacts/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  
  const contact = data.contact || data;
  console.log(`[GHL] Created contact: ${contact.id} (${contact.email})`);
  
  return contact;
}

// Update contact custom fields
async function updateContactCustomFields(contactId, fieldUpdates) {
  console.log(`[GHL] Updating custom fields for contact: ${contactId}`);
  
  // Get field definitions to map field keys to IDs
  const fieldDefinitions = await getCustomFieldDefinitions();
  
  // Build customField array
  const customFields = [];
  
  for (const [fieldKey, fieldValue] of Object.entries(fieldUpdates)) {
    const fieldId = fieldDefinitions[fieldKey];
    
    if (fieldId) {
      customFields.push({
        id: fieldId,
        value: String(fieldValue)
      });
      console.log(`[GHL]   - ${fieldKey} (${fieldId}): ${fieldValue}`);
    } else {
      console.warn(`[GHL]   - Warning: Custom field "${fieldKey}" not found in GHL`);
    }
  }
  
  if (customFields.length === 0) {
    console.log(`[GHL] No custom fields to update`);
    return null;
  }
  
  const data = await ghlRequest(`/contacts/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify({
      customField: customFields
    })
  });
  
  const contact = data.contact || data;
  console.log(`[GHL] Updated contact custom fields successfully`);
  
  return contact;
}

// Find or create contact by email
async function findOrCreateContact(email, contactData = {}) {
  console.log(`[GHL] Finding or creating contact: ${email}`);
  
  let contact = await searchContactByEmail(email);
  
  if (!contact) {
    console.log(`[GHL] Contact not found, creating new contact...`);
    contact = await createContact({
      email: email,
      ...contactData
    });
  } else {
    console.log(`[GHL] Using existing contact: ${contact.id}`);
  }
  
  return contact;
}

// Delete a contact by ID
async function deleteContact(contactId) {
  console.log(`[GHL] Deleting contact: ${contactId}`);
  
  await ghlRequest(`/contacts/${contactId}`, {
    method: 'DELETE'
  });
  
  console.log(`[GHL] Successfully deleted contact: ${contactId}`);
  return true;
}

// Delete a contact by email (searches first, then deletes)
async function deleteContactByEmail(email) {
  console.log(`[GHL] Deleting contact by email: ${email}`);
  
  const contact = await searchContactByEmail(email);
  
  if (!contact) {
    console.log(`[GHL] Contact not found with email: ${email}`);
    return false;
  }
  
  await deleteContact(contact.id);
  return true;
}

// Add tags to a contact
async function addTagsToContact(contactId, tags) {
  console.log(`[GHL] Adding tags to contact: ${contactId}`, tags);
  
  // Ensure tags is an array
  const tagsArray = Array.isArray(tags) ? tags : [tags];
  
  // Get current contact to preserve existing tags
  const currentContact = await ghlRequest(`/contacts/${contactId}`);
  const contact = currentContact.contact || currentContact;
  
  // Merge existing tags with new tags (avoid duplicates)
  const existingTags = contact.tags || [];
  const newTags = [...new Set([...existingTags, ...tagsArray])];
  
  const data = await ghlRequest(`/contacts/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify({
      tags: newTags
    })
  });
  
  const updatedContact = data.contact || data;
  console.log(`[GHL] Added tags to contact successfully. Tags: ${newTags.join(', ')}`);
  
  return updatedContact;
}

// Helper function to make API requests to services endpoint
async function ghlServicesRequest(endpoint, options = {}) {
  if (!GHL_API_KEY) {
    throw new Error('GHL_API_KEY environment variable is not set. Please configure it in Vercel project settings → Environment Variables.');
  }

  const url = `${GHL_SERVICES_BASE}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    ...options.headers
  };

  console.log(`[GHL Services API] ${options.method || 'GET'} ${endpoint}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      console.error(`[GHL Services API] Error ${response.status}:`, errorData);
      
      // Provide more helpful error messages
      if (response.status === 401) {
        const error = new Error(`GHL API Authentication Failed (401): ${errorData.msg || errorData.message || 'Invalid API key'}. Please verify your GHL_API_KEY in Vercel environment variables.`);
        error.code = 'AUTH_ERROR';
        error.status = 401;
        throw error;
      }
      
      throw new Error(`GHL Services API Error: ${response.status} - ${errorData.msg || errorData.message || response.statusText}`);
    }

    // Check if response has content and try to parse as JSON
    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();
    
    // If no content, return success indicator
    if (!responseText || responseText.trim() === '') {
      return { success: true };
    }
    
    // If content-type indicates JSON, parse it
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
      }
    }
    
    // For non-JSON responses, return as text
    return { 
      success: true, 
      message: responseText,
      raw: responseText 
    };
  } catch (error) {
    console.error(`[GHL Services API] Request failed:`, error.message);
    throw error;
  }
}

// Send email to contact using a template
async function sendEmailTemplate(contactId, templateId) {
  console.log(`[GHL] Sending email template to contact: ${contactId}, template: ${templateId}`);
  
  // Use the correct GHL API endpoint for sending emails
  // Try /conversations/messages (without /email) with type: 'Email' in body
  const emailPayload = {
    type: 'Email',
    contactId: contactId,
    templateId: templateId,
    subject: 'Someone shared encouragement with you'
  };
  
  // Try different endpoint patterns
  const endpoints = [];
  
  // Try services endpoint with locationId in header and full payload
  if (GHL_LOCATION_ID) {
    endpoints.push({
      name: 'services.leadconnectorhq.com with locationId header',
      request: async () => {
        const url = `${GHL_SERVICES_BASE}/conversations/messages`;
        const headers = {
          'Authorization': `Bearer ${GHL_API_KEY}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
          'locationId': GHL_LOCATION_ID
        };
        
        console.log(`[GHL Services API] POST /conversations/messages`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(emailPayload)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          
          if (response.status === 401) {
            const error = new Error(`GHL API Authentication Failed (401): ${errorData.message || 'Invalid API key'}`);
            error.code = 'AUTH_ERROR';
            error.status = 401;
            throw error;
          }
          
          throw new Error(`GHL Services API Error: ${response.status} - ${errorData.message || response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        const responseText = await response.text();
        
        if (!responseText || responseText.trim() === '') {
          return { success: true };
        }
        
        if (contentType.includes('application/json')) {
          return JSON.parse(responseText);
        }
        
        return { success: true, message: responseText };
      }
    });
  }
  
  // Try services endpoint without locationId in header
  endpoints.push({
    name: 'services.leadconnectorhq.com',
    request: () => ghlServicesRequest('/conversations/messages', {
      method: 'POST',
      body: JSON.stringify(emailPayload)
    })
  });
  
  // Try rest endpoint with locationId in path
  if (GHL_LOCATION_ID) {
    endpoints.push({
      name: 'rest.gohighlevel.com with locationId in path',
      request: () => ghlRequest(`/locations/${GHL_LOCATION_ID}/conversations/messages`, {
        method: 'POST',
        body: JSON.stringify(emailPayload)
      })
    });
  }
  
  let lastError = null;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`[GHL] Trying ${endpoint.name} endpoint...`);
      const data = await endpoint.request();
      
      console.log(`[GHL] Email template sent successfully to contact: ${contactId} via ${endpoint.name}`);
      return data;
    } catch (error) {
      lastError = error;
      // If it's a 404 or 401, try next endpoint
      if (error.message && (error.message.includes('404') || error.message.includes('Not found') || error.message.includes('401') || error.message.includes('Invalid JWT'))) {
        console.log(`[GHL] ${endpoint.name} failed (${error.message}), trying next endpoint...`);
        continue;
      }
      // If it's not a 404/401, re-throw immediately
      throw error;
    }
  }
  
  // If all endpoints failed
  throw new Error(`All email endpoints failed. Last error: ${lastError?.message || 'Unknown error'}. Please verify the template ID (${templateId}) and API configuration. If you're getting 401 errors, you may need to use an OAuth token instead of an API key for the services endpoint.`);
}

// Send email template to contact by email
async function sendEmailTemplateByEmail(email, templateId) {
  console.log(`[GHL] Sending email template to contact by email: ${email}, template: ${templateId}`);
  
  // First, find the contact by email
  const contact = await searchContactByEmail(email);
  
  if (!contact) {
    throw new Error(`Contact not found with email: ${email}`);
  }
  
  // Send the email template
  return await sendEmailTemplate(contact.id, templateId);
}

export {
  searchContactByEmail,
  createContact,
  updateContactCustomFields,
  findOrCreateContact,
  getCustomFieldDefinitions,
  deleteContact,
  deleteContactByEmail,
  addTagsToContact,
  sendEmailTemplate,
  sendEmailTemplateByEmail
};

