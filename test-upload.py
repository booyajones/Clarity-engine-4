#!/usr/bin/env python3
import requests
import json
import time

# Read the test CSV file
with open('test-enrichment-flow.csv', 'rb') as f:
    files = {'file': ('test-enrichment-flow.csv', f, 'text/csv')}
    data = {
        'enableFinexio': 'true',
        'enableMastercard': 'true',
        'enableGoogleAddress': 'true',
        'enableAkkio': 'true'
    }
    
    print("📤 Uploading test file...")
    response = requests.post('http://localhost:5000/api/upload', files=files, data=data)
    
    if response.status_code == 200:
        result = response.json()
        batch_id = result.get('batchId')
        print(f"✅ Upload successful! Batch ID: {batch_id}")
        print(f"📊 Response: {json.dumps(result, indent=2)}")
        
        # Monitor the batch status
        print("\n📍 Monitoring batch processing...")
        for i in range(30):  # Check for up to 5 minutes
            time.sleep(10)  # Check every 10 seconds
            
            status_response = requests.get(f'http://localhost:5000/api/upload/batches')
            if status_response.status_code == 200:
                batches = status_response.json()
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
                        print("\n✅ Batch processing completed!")
                        break
            else:
                print(f"❌ Failed to get batch status: {status_response.status_code}")
    else:
        print(f"❌ Upload failed with status code: {response.status_code}")
        print(f"Response: {response.text}")