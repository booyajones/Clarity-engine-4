
# API Documentation

## Base URL
```
https://your-app.replit.app/api
```

## Authentication
Currently, no authentication is required for API endpoints.

## Endpoints

### Upload Management

#### POST /upload
Upload a file for payee classification.

**Request:**
```http
POST /api/upload
Content-Type: multipart/form-data

file: [CSV or Excel file]
payeeColumn: [optional column name]
```

**Response:**
```json
{
  "batchId": 123,
  "filename": "payees.csv",
  "status": "processing",
  "message": "File uploaded successfully"
}
```

#### GET /upload/batches
Get all upload batches.

**Response:**
```json
[
  {
    "id": 123,
    "filename": "payees.csv",
    "status": "completed",
    "totalRecords": 1000,
    "processedRecords": 1000,
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

### Classification

#### POST /classify-single
Classify a single payee name.

**Request:**
```json
{
  "payeeName": "Microsoft Corporation"
}
```

**Response:**
```json
{
  "payeeType": "Business",
  "confidence": 0.98,
  "sicCode": "7372",
  "sicDescription": "Prepackaged Software",
  "reasoning": "Corporation suffix indicates business entity with software focus"
}
```

#### GET /classifications/:batchId
Get classification results for a batch.

**Response:**
```json
{
  "batchId": 123,
  "classifications": [
    {
      "id": 1,
      "originalName": "Microsoft Corp",
      "payeeType": "Business",
      "confidence": 0.98,
      "sicCode": "7372",
      "sicDescription": "Prepackaged Software"
    }
  ]
}
```

### Downloads

#### GET /download/:batchId
Download classified results as CSV.

**Response:**
- Content-Type: `text/csv`
- File download with original columns + classification columns

### Status and Monitoring

#### GET /status/:batchId
Get processing status for a batch.

**Response:**
```json
{
  "batchId": 123,
  "status": "processing",
  "currentStep": "Classifying payees",
  "progressMessage": "Processing chunk 5 of 10",
  "totalRecords": 1000,
  "processedRecords": 500,
  "percentComplete": 50
}
```

## Error Responses

All endpoints return standard HTTP status codes:

- `200` - Success
- `400` - Bad Request
- `404` - Not Found  
- `500` - Internal Server Error

Error response format:
```json
{
  "error": "Error message",
  "details": "Detailed error description"
}
```

## Rate Limits

- OpenAI API calls: 50 requests/minute
- File uploads: 50MB maximum
- Processing: 5 concurrent classifications

## Data Formats

### Supported Upload Formats
- CSV files (.csv)
- Excel files (.xlsx, .xls)

### Output Format
All downloads include original columns plus:
- `clarity_payeeType`
- `clarity_confidence` 
- `clarity_sicCode`
- `clarity_sicDescription`
- `clarity_reasoning`
- `clarity_isDuplicate`
