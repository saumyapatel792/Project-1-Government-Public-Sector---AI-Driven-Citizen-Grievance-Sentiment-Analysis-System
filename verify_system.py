import subprocess
import time
import requests
import sys

def verify():
    print("="*60)
    print("STARTING FASTAPI SERVER IN BACKGROUND...")
    print("="*60)
    
    # Start uvicorn server in a separate process
    # We specify host 127.0.0.1 and port 8000
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait for the server to spin up
    print("Waiting 15 seconds for server to start...")
    time.sleep(15)
    
    success = True
    try:
        # 1. Health check
        print("\n--- TEST 1: GET /health ---")
        health_resp = requests.get("http://127.0.0.1:8000/health")
        print(f"Status Code: {health_resp.status_code}")
        print(f"Response: {health_resp.json()}")
        
        # 2. Prediction check
        print("\n--- TEST 2: POST /predict (Critical Grievance) ---")
        payload = {
            "complaint_text": "EMERGENCY: The main water pipelines have burst causing dirty sewer water to flood our street. This is a severe health hazard!"
        }
        pred_resp = requests.post("http://127.0.0.1:8000/predict", json=payload)
        print(f"Status Code: {pred_resp.status_code}")
        print(f"Response (formatted JSON):")
        import json
        print(json.dumps(pred_resp.json(), indent=2))
        
        # 3. Simple negative complaint check
        print("\n--- TEST 3: POST /predict (Regular Complaint) ---")
        payload_reg = {
            "complaint_text": "The streetlight outside my house has been blinking for two days and needs replacement."
        }
        pred_resp_reg = requests.post("http://127.0.0.1:8000/predict", json=payload_reg)
        print(f"Status Code: {pred_resp_reg.status_code}")
        print(f"Response (formatted JSON):")
        print(json.dumps(pred_resp_reg.json(), indent=2))
        
    except Exception as e:
        print(f"\n[ERROR] Verification failed: {e}")
        success = False
    finally:
        print("\n" + "="*60)
        print("KILLING FASTAPI SERVER PROCESS...")
        print("="*60)
        server_process.terminate()
        server_process.wait()
        print("Server process terminated. Verification complete.")
        
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    verify()
