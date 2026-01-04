# Neo TYG Middleware

Middleware service for handling TYG (Thank You Gram) form submissions. Deployed on Vercel.

## Setup

1. Install dependencies:
```bash
npm install
```

2. **Configure environment variables in Vercel (REQUIRED)**:
   
   **⚠️ IMPORTANT**: The function will fail without these environment variables!
   
   - `GHL_API_KEY` - Your GoHighLevel API key (**required**)
   - `GHL_LOCATION_ID` - Your GoHighLevel location ID (optional but recommended)
   
   **Steps to set environment variables in Vercel**:
   1. Go to your Vercel project dashboard
   2. Navigate to **Settings** → **Environment Variables**
   3. Add a new variable:
      - **Name**: `GHL_API_KEY`
      - **Value**: Your GoHighLevel API key
      - **Environment**: Select all (Production, Preview, Development)
   4. (Optional) Add `GHL_LOCATION_ID` if you have one
   5. **Redeploy your project** after adding environment variables
      - Go to **Deployments** tab
      - Click the three dots on the latest deployment
      - Select **Redeploy**
   
   **Getting your GoHighLevel API Key**:
   - Log into your GoHighLevel account
   - Go to **Settings** → **Integrations** → **API**
   - Create a new API key with **Contacts: Read, Write** permissions
   - Copy the key (it won't be shown again)

3. Create custom fields in GoHighLevel:
   The following custom fields must exist in your GHL account:
   - `tyg_recipientname` (TEXT)
   - `tyg_recipientemail` (TEXT)
   - `tyg_message` (TEXT or TEXTAREA)
   - `tyg_sendername` (TEXT)
   - `tyg_sendanonymously` (TEXT or BOOLEAN)
   - `tyg_subscribedailyhug` (TEXT or BOOLEAN)

## Local Development

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will run on port 3000 by default (or the port specified in `.env`).

## Vercel Deployment

1. Install Vercel CLI (if not already installed):
```bash
npm i -g vercel
```

2. Deploy to Vercel:
```bash
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

The API endpoints will be available at:
- `https://your-project.vercel.app/api/submit-tyg-form`
- `https://your-project.vercel.app/api/health`

## API Endpoints

### POST `/api/submit-tyg-form`

Handles form submissions from the TYG form.

**Request Body** (application/x-www-form-urlencoded or application/json):
- `recipientName` (required): Recipient's first name
- `recipientEmail` (required): Recipient's email address
- `message` (required): The "Because of you..." message
- `senderEmail` (required): Sender's email address
- `senderName` (optional): Sender's name
- `sendAnonymously` (optional): "true" or "false" string, or boolean
- `subscribeDailyHug` (optional): "true" or "false" string, or boolean
- `timestamp` (optional): ISO timestamp string

**Success Response** (200):
```json
{
  "success": true,
  "message": "Form submitted successfully",
  "data": {
    "recipientEmail": "alex@example.com",
    "senderEmail": "you@example.com",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "ghl": {
      "senderContactId": "contact_id_123",
      "recipientContactId": "contact_id_456"
    }
  }
}
```

**Note**: The form handler automatically:
1. Searches for or creates a contact in GoHighLevel using the sender's email
2. Updates the sender contact with custom fields containing form data
3. Adds the tag "tyg--> sender" to the sender contact
4. Creates a contact in GoHighLevel for the recipient
5. Logs all actions to the console

**Error Response** (400):
```json
{
  "success": false,
  "errors": ["recipientName is required", "recipientEmail is required"]
}
```

### GET `/health`

Health check endpoint.

**Response** (200):
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### POST/GET/DELETE `/api/TYG_delete_recipient`

Deletes a contact from GoHighLevel by email address. Designed to be called from GHL webhooks.

**Request Parameters**:
- `email` (required): Email address of the contact to delete
  - Can be provided as query parameter: `?email=user@example.com`
  - Or in request body (JSON or URL-encoded): `{ "email": "user@example.com" }`

**Success Response** (200):
```json
{
  "success": true,
  "message": "Contact deleted successfully",
  "data": {
    "email": "user@example.com",
    "deleted": true
  }
}
```

**Not Found Response** (404):
```json
{
  "success": false,
  "message": "Contact not found",
  "data": {
    "email": "user@example.com",
    "deleted": false
  }
}
```

**Error Response** (400):
```json
{
  "success": false,
  "message": "Email parameter is required",
  "error": "Please provide an email address in the query parameter (?email=...) or request body"
}
```

**Usage Examples**:
- GET: `https://your-project.vercel.app/api/TYG_delete_recipient?email=user@example.com`
- POST (JSON): `POST /api/TYG_delete_recipient` with body `{ "email": "user@example.com" }`
- POST (URL-encoded): `POST /api/TYG_delete_recipient` with body `email=user@example.com`

## Updating the Form

**IMPORTANT**: The form must post to `/api/submit-tyg-form` - not the root URL!

To use this middleware endpoint, update the form's JavaScript to point to your Vercel deployment:

For local development:
```javascript
const WEBHOOK_URL = 'http://localhost:3000/api/submit-tyg-form';
```

For production (Vercel):
```javascript
const WEBHOOK_URL = 'https://neo-tyg-middleware.vercel.app/api/submit-tyg-form';
```

Or if you have a custom domain:
```javascript
const WEBHOOK_URL = 'https://your-domain.com/api/submit-tyg-form';
```

**Note**: Make sure the URL ends with `/api/submit-tyg-form`. Posting to the root URL (`/`) will result in a 404 error.

## GoHighLevel Integration

This middleware automatically integrates with GoHighLevel API:

1. **Sender Contact**: 
   - Searches for existing contact by sender email
   - Creates new contact if not found
   - Updates custom fields with form submission data

2. **Recipient Contact**:
   - Creates a new contact using recipient email and name
   - If contact already exists, uses the existing contact

3. **Custom Fields Updated**:
   - `tyg_recipientname` - Recipient's name
   - `tyg_recipientemail` - Recipient's email
   - `tyg_message` - The message content
   - `tyg_sendername` - Sender's name
   - `tyg_sendanonymously` - Whether to send anonymously
   - `tyg_subscribedailyhug` - Daily Hug subscription preference

All actions are logged to the console for debugging and monitoring.

## Next Steps

You can extend this handler to:
- Send email notifications
- Process Daily Hug subscriptions
- Add authentication/rate limiting
- Integrate with other services
- Add webhook notifications

