# AI-Driven Citizen Grievance & Sentiment Analysis System

## 📋 Project Overview

This is a comprehensive Natural Language Processing (NLP) system designed to revolutionize government complaint management. It automatically ingests citizen feedback, categorizes complaints into relevant departments, and performs sentiment analysis to prioritize issues based on urgency.

## 🎯 Business Objectives

- **Reduce grievance resolution time** from weeks to minutes
- **Improve complaint routing** accuracy to correct departments
- **Prioritize critical issues** based on sentiment and urgency
- **Enhance government transparency** through structured complaint queues
- **Optimize Macro F1-Score** for minority class detection (Critical/Urgent complaints)

## 📁 Project Structure

```
Week1.ipynb          - Data cleaning & preprocessing
Week2.ipynb          - Department classification (TF-IDF, Random Forest, Word2Vec)
Week3.ipynb          - Sentiment analysis (VADER, TF-IDF+LR, DistilBERT)
Week4.ipynb          - API development, evaluation, deployment
output/
  ├── cleaned_mapping.csv
  ├── dept_tfidf_lr_model.pkl
  ├── sentiment_tfidf_lr_model.pkl
  ├── distilbert_sentiment_final/
  ├── main_api.py
  ├── label_maps.json
  ├── week4_*.png (visualizations)
  └── requirements.txt
```

## 🔧 Technical Stack

- **Python 3.8+**
- **FastAPI** - REST API framework
- **Scikit-learn** - Traditional ML models
- **Transformers** - DistilBERT fine-tuning
- **PyTorch** - Deep learning framework
- **Pandas & NumPy** - Data processing
- **NLTK** - NLP utilities (VADER sentiment analysis)

## 📊 Model Performance

### Department Classification (Week 2)
- **Accuracy**: 0.85+ (varies by dataset)
- **Macro F1-Score**: 0.82+
- **Classes**: 5-10 government departments

### Sentiment Analysis (Week 3)
- **Accuracy**: 0.78+
- **Macro F1-Score**: 0.75+ (optimizes for minority "Critical/Urgent" class)
- **Classes**: Positive | Neutral | Negative | Critical/Urgent

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r output/requirements.txt
```

### 2. Run FastAPI Server
```bash
cd output
uvicorn main_api:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Access API Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### 4. Make Predictions
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"complaint_text": "Water pipes are broken in my area!"}'
```

## 📡 API Endpoints

### `POST /predict`
Predict department and sentiment using TF-IDF model (fast)

**Request:**
```json
{
  "complaint_text": "The road has deep potholes causing accidents",
  "use_model": "tfidf"
}
```

**Response:**
```json
{
  "predicted_department": "Roads & Transport",
  "predicted_sentiment": "Negative",
  "urgency_score": 6.5,
  "sentiment_confidence": 0.89,
  "model_used": "TF-IDF + Logistic Regression",
  "timestamp": "2024-01-15T10:30:00"
}
```

### `POST /predict-bert`
Predict using DistilBERT (more accurate, slower)

### `GET /health`
Health check - returns model status

### `GET /`
API status and available endpoints

## 📈 Evaluation Metrics

### Confusion Matrices
Visualizations show per-class performance for:
- Department classification accuracy
- Sentiment classification accuracy
- Minority class (Critical/Urgent) detection

### Classification Reports
Detailed metrics include:
- **Precision**: False positive rate for each class
- **Recall**: Minority class detection sensitivity
- **F1-Score**: Harmonic mean of precision & recall
- **Macro F1**: Average across all classes (emphasizes minorities)

## 🎓 Key Insights

1. **Macro F1-Score Focus**: Ensures "Critical/Urgent" complaints (minority class) are properly identified for faster action
2. **Urgency Scoring**: Combines sentiment confidence, text features, and keyword analysis
3. **Multi-Model Approach**: Trade-off between speed (TF-IDF) and accuracy (DistilBERT)
4. **Scalable Architecture**: FastAPI supports horizontal scaling with Docker/Kubernetes

## 🐳 Docker Deployment

### Build Docker Image
```bash
docker build -t grievance-api .
```

### Run Container
```bash
docker run -p 8000:8000 grievance-api
```

## 📝 Sample Test Cases

See `week4_api_test_results.json` for tested sample complaints covering all sentiment classes.

## 🔐 Production Considerations

- ✅ Input validation & error handling
- ✅ Model versioning & hot-swapping
- ✅ Request logging & monitoring
- ✅ Rate limiting (implement with FastAPI middleware)
- ✅ Authentication (add OAuth2/JWT)
- ✅ Caching frequent queries
- ✅ GPU support for DistilBERT inference

## 📚 Documentation

- `DEPLOYMENT_GUIDE.txt` - Detailed deployment instructions
- `WEEK4_SUMMARY.txt` - Performance metrics & summary
- `week4_dept_classification_report.txt` - Department model evaluation
- `week4_sentiment_classification_report.txt` - Sentiment model evaluation

## 🤝 Contributing

For improvements, enhancements, or bug fixes:
1. Create a feature branch
2. Make changes with clear commit messages
3. Submit a pull request with documentation

## 📄 License

Government & Public Sector AI Project - Internal Use

## 👤 Author

Academic Project - AI-Driven Grievance System

## 📞 Support

For API issues or questions, refer to:
- Swagger documentation: `/docs`
- Deployment guide: `DEPLOYMENT_GUIDE.txt`
- Week 4 notebook: `Week4.ipynb`
