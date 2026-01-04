// GoHighLevel API Helper Functions

const GHL_API_BASE = 'https://rest.gohighlevel.com/v1';
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

    const data = await response.json();
    return data;
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

export {
  searchContactByEmail,
  createContact,
  updateContactCustomFields,
  findOrCreateContact,
  getCustomFieldDefinitions,
  deleteContact,
  deleteContactByEmail
};

