#!/usr/bin/env python3
import urllib.request
import urllib.parse
import json
import time
import mimetypes
import io
import os

def encode_multipart_formdata(fields, files):
    """Create multipart/form-data request body"""
    boundary = '----WebKitFormBoundary' + os.urandom(16).hex()
    body = io.BytesIO()
    
    # Add fields
    for name, value in fields.items():
        body.write(f'--{boundary}\r\n'.encode())
        body.write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.write(f'{value}\r\n'.encode())
    
    # Add file
    for name, (filename, file_data) in files.items():
        body.write(f'--{boundary}\r\n'.encode())
        body.write(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode())
        body.write(f'Content-Type: text/csv\r\n\r\n'.encode())
        body.write(file_data)
        body.write(b'\r\n')
    
    body.write(f'--{boundary}--\r\n'.encode())
    return body.getvalue(), f'multipart/form-data; boundary={boundary}'

print("📤 Testing batch upload and enrichment flow...")

# Read the test CSV file
with open('test-enrichment-flow.csv', 'rb') as f:
    file_data = f.read()

fields = {
    'enableFinexio': 'true',
    'enableMastercard': 'true',
    'enableGoogleAddress': 'true',
    'enableAkkio': 'true'
}

files = {
    'file': ('test-enrichment-flow.csv', file_data)
}

# Create multipart request
body, content_type = encode_multipart_formdata(fields, files)

# Make the request
req = urllib.request.Request(
    'http://localhost:5000/api/upload',
    data=body,
    headers={'Content-Type': content_type}
)

try:
    response = urllib.request.urlopen(req)
    result = json.loads(response.read().decode())
    batch_id = result.get('id')  # The ID is in the "id" field, not "batchId"
    print(f"✅ Upload successful! Batch ID: {batch_id}")
    print(f"📊 Initial response: {json.dumps(result, indent=2)}")
    
    # Monitor the batch status
    print("\n📍 Monitoring batch processing...")
    for i in range(30):  # Check for up to 5 minutes
        time.sleep(10)  # Check every 10 seconds
        
        status_req = urllib.request.Request('http://localhost:5000/api/upload/batches')
        status_response = urllib.request.urlopen(status_req)
        batches = json.loads(status_response.read().decode())
        batch = next((b for b in batches if b['id'] == batch_id), None)
        
        if batch:
            print(f"\n⏱️  Time: {i*10}s")
            print(f"📊 Status: {batch['status']}")
            print(f"📝 Current Step: {batch.get('currentStep', 'N/A')}")
            print(f"📊 Classification: {batch.get('processedRecords', 0)}/{batch.get('totalRecords', 0)}")
            print(f"🔍 Finexio: {batch.get('finexioMatchingStatus', 'pending')}")
            print(f"📍 Google Address: {batch.get('googleAddressStatus', 'pending')}")
            print(f"💳 Mastercard: {batch.get('mastercardEnrichmentStatus', 'pending')}")
            print(f"🤖 Akkio: {batch.get('akkioPredictionStatus', 'pending')}")
            
            if batch['status'] == 'completed':
                print("\n✅ Batch processing completed successfully!")
                print("✅ All enrichment phases completed")
                break
        else:
            print(f"⚠️ Batch {batch_id} not found in list")
            
except Exception as e:
    print(f"❌ Error: {e}")