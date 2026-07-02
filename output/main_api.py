"""
Government Grievance & Sentiment Analysis API
Production-ready FastAPI application for real-time complaint classification

Author: AI-Driven Grievance System (Week 4)
Date: 2024
"""

import os
import json
import joblib
import numpy as np
import torch
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# Load models and artifacts
OUTPUT_DIR = Path("output")

# Load models
dept_model = joblib.load(OUTPUT_DIR / "dept_tfidf_lr_model.pkl")
sentiment_model_tfidf = joblib.load(OUTPUT_DIR / "sentiment_tfidf_lr_model.pkl")
dept_encoder = joblib.load(OUTPUT_DIR / "dept_label_encoder.pkl")

# Load label maps
with open(OUTPUT_DIR / "label_maps.json") as f:
    label_maps = json.load(f)

LABEL_MAP = label_maps["sentiment_labels"]
ID2LABEL = {int(k): v for k, v in label_maps["sentiment_id2label"].items()}
DEPT_CLASSES = label_maps["department_classes"]

# Initialize FastAPI
app = FastAPI(
    title="Government Grievance & Sentiment Analysis API",
    description="AI-powered complaint classification and sentiment analysis",
    version="1.0.0"
)

# Request/Response models
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

def compute_urgency_score(sentiment_label: str, confidence: float, text_length: int) -> float:
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

@app.get("/")
async def read_root():
    return {
        "status": "✅ API Running",
        "service": "Government Grievance & Sentiment Analysis",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "models_loaded": {
            "department_classifier": True,
            "sentiment_tfidf": True
        }
    }

@app.post("/predict", response_model=ComplaintResponse)
async def predict_complaint(request: ComplaintRequest):
    if not request.complaint_text or len(request.complaint_text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Complaint text cannot be empty")

    text = request.complaint_text
    text_len = len(text.split())

    # Department prediction
    dept_pred_id = dept_model.predict([text])[0]
    dept_proba = dept_model.predict_proba([text])[0].max()
    predicted_department = DEPT_CLASSES[dept_pred_id]

    # Sentiment prediction
    sent_pred_id = sentiment_model_tfidf.predict([text])[0]
    sent_proba = sentiment_model_tfidf.predict_proba([text])[0].max()
    predicted_sentiment = ID2LABEL[sent_pred_id]

    urgency_score = compute_urgency_score(predicted_sentiment, sent_proba, text_len)

    return ComplaintResponse(
        complaint_text=text[:500],
        predicted_department=predicted_department,
        predicted_sentiment=predicted_sentiment,
        urgency_score=urgency_score,
        sentiment_confidence=round(sent_proba, 4),
        model_used="TF-IDF + Logistic Regression",
        timestamp=datetime.now().isoformat()
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
