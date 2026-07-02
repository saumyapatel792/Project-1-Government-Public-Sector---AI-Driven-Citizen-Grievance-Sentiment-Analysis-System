"""
Government Grievance & Sentiment Analysis API
Production-ready FastAPI application for real-time complaint classification and web dashboard.

Author: AI-Driven Grievance System (Week 4)
Date: 2026
"""

import os
import json
import joblib
import numpy as np
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, PlainTextResponse
from pydantic import BaseModel
from typing import Optional

import database

# Load models and artifacts from the output directory
OUTPUT_DIR = Path("output")

# Load models
dept_model = joblib.load(OUTPUT_DIR / "dept_tfidf_lr_model.pkl")
sentiment_model_tfidf = joblib.load(OUTPUT_DIR / "sentiment_tfidf_lr_model.pkl")
dept_encoder = joblib.load(OUTPUT_DIR / "dept_label_encoder.pkl")

# Load label maps with UTF-8 encoding
with open(OUTPUT_DIR / "label_maps.json", encoding="utf-8") as f:
    label_maps = json.load(f)

LABEL_MAP = label_maps["sentiment_labels"]
ID2LABEL = {int(k): v for k, v in label_maps["sentiment_id2label"].items()}
DEPT_CLASSES = label_maps["department_classes"]

# Initialize FastAPI app
app = FastAPI(
    title="Government Grievance & Sentiment Analysis System",
    description="AI-powered complaint classification and sentiment analysis backend system for civic grievances.",
    version="1.0.0"
)

# Request/Response validation models
class ComplaintRequest(BaseModel):
    complaint_text: str
    use_model: Optional[str] = "tfidf"

class ComplaintResponse(BaseModel):
    complaint_text: str
    predicted_department: str
    predicted_sentiment: str
    urgency_score: float
    sentiment_confidence: float
    model_used: str
    timestamp: str

class UserSignup(BaseModel):
    username: str
    password: str
    full_name: str
    role: str

class UserLogin(BaseModel):
    username: str
    password: str

class StatusUpdateRequest(BaseModel):
    status: str
    comments: str

def compute_urgency_score(sentiment_label: str, confidence: float, text_length: int) -> float:
    """Computes urgency priority score from 0 to 10."""
    base_scores = {
        "Critical/Urgent": 8.5,
        "Negative": 6.0,
        "Neutral": 3.0,
        "Positive": 1.0
    }
    base_score = base_scores.get(sentiment_label, 3.0)
    confidence_boost = confidence * 2.0
    length_bonus = min(np.log1p(text_length / 50), 1.0)
    urgency = base_score + confidence_boost + (length_bonus * 0.5)
    return min(round(urgency, 2), 10.0)

# Authentication Dependency
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Access token missing")
    token = authorization.split(" ")[1]
    user = database.get_user_by_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or expired session")
    return user

# ==================== AUTH ENDPOINTS ====================

@app.post("/api/auth/signup", tags=["Auth"])
async def signup(user_data: UserSignup):
    if not user_data.username or not user_data.password or not user_data.full_name:
        raise HTTPException(status_code=400, detail="Missing required signup details")
    
    if user_data.role not in ["citizen", "officer"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
        
    success, msg = database.create_user(
        username=user_data.username,
        password=user_data.password,
        full_name=user_data.full_name,
        role=user_data.role
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

@app.post("/api/auth/login", tags=["Auth"])
async def login(credentials: UserLogin):
    user = database.authenticate_user(credentials.username, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    # Create session token
    token = database.create_session(user["id"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@app.post("/api/auth/logout", tags=["Auth"])
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        database.delete_session(token)
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me", tags=["Auth"])
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ==================== COMPLAINTS ENDPOINTS ====================

@app.post("/api/complaints", tags=["Complaints"])
async def file_complaint(request: ComplaintRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "citizen":
        raise HTTPException(status_code=403, detail="Only citizens can file new grievances")
        
    if not request.complaint_text or len(request.complaint_text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Complaint text cannot be empty")
        
    text = request.complaint_text
    text_len = len(text.split())
    
    # 1. Run ML Pipeline predictions
    dept_pred_id = dept_model.predict([text])[0]
    predicted_department = DEPT_CLASSES[dept_pred_id]
    
    sent_pred_id = sentiment_model_tfidf.predict([text])[0]
    sent_proba = sentiment_model_tfidf.predict_proba([text])[0].max()
    predicted_sentiment = ID2LABEL[sent_pred_id]
    
    urgency_score = compute_urgency_score(predicted_sentiment, sent_proba, text_len)
    
    # 2. Save complaint in database
    complaint = database.save_complaint(
        user_id=current_user["id"],
        complaint_text=text,
        predicted_department=predicted_department,
        predicted_sentiment=predicted_sentiment,
        urgency_score=urgency_score,
        sentiment_confidence=round(sent_proba, 4),
        model_used="TF-IDF + Logistic Regression"
    )
    return complaint

@app.get("/api/complaints/my", tags=["Complaints"])
async def get_my_complaints(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "citizen":
        raise HTTPException(status_code=403, detail="Only citizens can view personal queue history")
    return database.get_citizen_complaints(current_user["id"])

@app.get("/api/complaints/all", tags=["Complaints"])
async def get_all_complaints(
    status: Optional[str] = None,
    department: Optional[str] = None,
    min_urgency: Optional[float] = None,
    search_query: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "officer":
        raise HTTPException(status_code=403, detail="Only government officers can inspect master triage queue")
    return database.get_all_complaints(
        status=status,
        department=department,
        min_urgency=min_urgency,
        search_query=search_query
    )

@app.patch("/api/complaints/{id}/status", tags=["Complaints"])
async def update_complaint_status(
    id: int,
    data: StatusUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "officer":
        raise HTTPException(status_code=403, detail="Only government officers can alter ticket statuses")
        
    if data.status not in ["Pending", "In Progress", "Resolved"]:
        raise HTTPException(status_code=400, detail="Invalid status option")
        
    success = database.update_complaint_status(
        complaint_id=id,
        status=data.status,
        official_comments=data.comments
    )
    if not success:
        raise HTTPException(status_code=500, detail="Could not update complaint status")
    return {"message": "Status updated successfully"}

# ==================== DATA ANALYTICS & STATS ====================

@app.get("/api/stats/dashboard", tags=["Stats"])
async def get_stats():
    return database.get_dashboard_stats()

@app.get("/api/model/metrics", tags=["Stats"])
async def get_metrics_report(type: str = "sentiment"):
    if type == "sentiment":
        report_path = OUTPUT_DIR / "week4_sentiment_classification_report.txt"
    else:
        report_path = OUTPUT_DIR / "week4_dept_classification_report.txt"
        
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Performance metrics report not found")
        
    with open(report_path, "r", encoding="utf-8") as f:
        return PlainTextResponse(f.read())

# ==================== ORIGINAL ENDPOINTS (CRITICAL FOR BACKWARD COMPATIBILITY) ====================

@app.get("/health", tags=["Status"])
async def health_check():
    return {
        "status": "healthy",
        "models_loaded": {
            "department_classifier": dept_model is not None,
            "sentiment_tfidf": sentiment_model_tfidf is not None,
            "label_encoder": dept_encoder is not None
        }
    }

@app.post("/predict", response_model=ComplaintResponse, tags=["Inference"])
async def predict_complaint(request: ComplaintRequest):
    if not request.complaint_text or len(request.complaint_text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Complaint text cannot be empty")
    
    text = request.complaint_text
    text_len = len(text.split())
    
    # Predict Department (Routes complaint automatically)
    dept_pred_id = dept_model.predict([text])[0]
    predicted_department = DEPT_CLASSES[dept_pred_id]
    
    # Predict Sentiment
    sent_pred_id = sentiment_model_tfidf.predict([text])[0]
    sent_proba = sentiment_model_tfidf.predict_proba([text])[0].max()
    predicted_sentiment = ID2LABEL[sent_pred_id]
    
    # Compute composite Urgency Score
    urgency_score = compute_urgency_score(predicted_sentiment, sent_proba, text_len)
    
    return ComplaintResponse(
        complaint_text=text[:500],  # Return up to 500 characters
        predicted_department=predicted_department,
        predicted_sentiment=predicted_sentiment,
        urgency_score=urgency_score,
        sentiment_confidence=round(sent_proba, 4),
        model_used="TF-IDF + Logistic Regression",
        timestamp=datetime.now().isoformat()
    )

# ==================== STATIC FILES WEB SERVER ====================

@app.get("/", tags=["UI"])
async def read_root():
    return FileResponse("static/index.html")

@app.get("/static/{file_path:path}", tags=["UI"])
async def serve_static(file_path: str):
    full_path = Path("static") / file_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Static asset not found")
        
    ext = full_path.suffix.lower()
    media_types = {
        ".css": "text/css",
        ".js": "application/javascript",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".txt": "text/plain"
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(full_path, media_type=media_type)

@app.get("/output/{file_path:path}", tags=["UI"])
async def serve_output(file_path: str):
    full_path = Path("output") / file_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Output artifact file not found")
        
    ext = full_path.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".txt": "text/plain",
        ".csv": "text/csv"
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(full_path, media_type=media_type)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
