import sqlite3
import hashlib
import uuid
from datetime import datetime

DB_FILE = "grievance_system.db"
PASSWORD_SALT = "AegisSalt2026_SecuredKey"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    """Hashes the password with salt using SHA-256."""
    return hashlib.sha256((password + PASSWORD_SALT).encode('utf-8')).hexdigest()

def init_db():
    """Initializes the database and seeds default accounts and complaints."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Create Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL, -- 'citizen' or 'officer'
            created_at TEXT NOT NULL
        )
    """)
    
    # 2. Create User Sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    
    # 3. Create Complaints table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            complaint_text TEXT NOT NULL,
            predicted_department TEXT NOT NULL,
            predicted_sentiment TEXT NOT NULL,
            urgency_score REAL NOT NULL,
            sentiment_confidence REAL NOT NULL,
            model_used TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'In Progress', 'Resolved'
            official_comments TEXT,
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    
    # --- SEEDING DEFAULT USERS ---
    # Check if officer exists
    cursor.execute("SELECT id FROM users WHERE username = 'officer'")
    officer = cursor.fetchone()
    if not officer:
        cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, ('officer', hash_password('admin123'), 'Senior Grievance Officer', 'officer', datetime.now().isoformat()))
        conn.commit()
        
    # Check if citizen exists
    cursor.execute("SELECT id FROM users WHERE username = 'citizen'")
    citizen = cursor.fetchone()
    if not citizen:
        cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, ('citizen', hash_password('citizen123'), 'John Doe (Citizen)', 'citizen', datetime.now().isoformat()))
        conn.commit()

    # --- SEEDING DEFAULT COMPLAINTS ---
    cursor.execute("SELECT COUNT(*) as count FROM complaints")
    comp_count = cursor.fetchone()['count']
    if comp_count == 0:
        cursor.execute("SELECT id FROM users WHERE username = 'citizen'")
        citizen_id = cursor.fetchone()['id']
        
        # Insert seed complaints
        seed_data = [
            (
                citizen_id,
                "URGENT: A massive pothole on the highway near milepost 12 caused a severe accident today. Cars are swerving to avoid it, dangerous!",
                "DOURD",
                "Critical/Urgent",
                9.15,
                0.89,
                "TF-IDF + Logistic Regression",
                "Pending",
                None,
                datetime(2026, 7, 1, 10, 30, 0).isoformat(),
                None
            ),
            (
                citizen_id,
                "EMERGENCY: The main water pipelines have burst causing dirty sewer water to flood our street. This is a severe health hazard!",
                "MINWR",
                "Critical/Urgent",
                9.5,
                0.95,
                "TF-IDF + Logistic Regression",
                "In Progress",
                "Assigned to sewage repair team. Dispatched excavation vehicle to main street.",
                datetime(2026, 7, 1, 8, 15, 0).isoformat(),
                None
            ),
            (
                citizen_id,
                "The streetlight outside my house has been blinking for two days and needs replacement. It gets very dark and unsafe at night.",
                "MPOWR",
                "Negative",
                6.8,
                0.81,
                "TF-IDF + Logistic Regression",
                "Pending",
                None,
                datetime(2026, 7, 2, 14, 0, 0).isoformat(),
                None
            ),
            (
                citizen_id,
                "I wanted to thank the department for completing the road construction on main street so quickly. The new paving is excellent.",
                "DOURD",
                "Positive",
                1.5,
                0.92,
                "TF-IDF + Logistic Regression",
                "Resolved",
                "Feedback noted. Thank you for your appreciation!",
                datetime(2026, 6, 29, 11, 0, 0).isoformat(),
                datetime(2026, 6, 30, 16, 30, 0).isoformat()
            ),
            (
                citizen_id,
                "There is too much garbage piled near the entrance of public park. It has not been cleared for three days.",
                "DOSAT",
                "Negative",
                7.2,
                0.85,
                "TF-IDF + Logistic Regression",
                "In Progress",
                "Sanitation truck scheduled for sector park route tomorrow morning.",
                datetime(2026, 7, 2, 9, 45, 0).isoformat(),
                None
            )
        ]
        
        cursor.executemany("""
            INSERT INTO complaints (user_id, complaint_text, predicted_department, predicted_sentiment, urgency_score, sentiment_confidence, model_used, status, official_comments, created_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_data)
        conn.commit()

    conn.close()

# Initialize the database immediately on import
init_db()

# --- HELPER OPERATIONS ---

def create_user(username, password, full_name, role):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (username, hash_password(password), full_name, role, datetime.now().isoformat()))
        conn.commit()
        return True, "User registered successfully"
    except sqlite3.IntegrityError:
        return False, f"Username '{username}' already exists"
    finally:
        conn.close()

def authenticate_user(username, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, username, full_name, role, password_hash FROM users WHERE username = ?
    """, (username,))
    user = cursor.fetchone()
    conn.close()
    
    if user and user['password_hash'] == hash_password(password):
        return {
            "id": user['id'],
            "username": user['username'],
            "full_name": user['full_name'],
            "role": user['role']
        }
    return None

def create_session(user_id, duration_hours=24):
    token = uuid.uuid4().hex
    # For a simple local token system, we set expiration text
    expires_at = datetime.now().isoformat() # In simple demo we don't strictly enforce unless requested, but we store it
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)
    """, (token, user_id, expires_at))
    conn.commit()
    conn.close()
    return token

def get_user_by_session(token):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.full_name, u.role
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
    """, (token,))
    user = cursor.fetchone()
    conn.close()
    if user:
        return {
            "id": user['id'],
            "username": user['username'],
            "full_name": user['full_name'],
            "role": user['role']
        }
    return None

def delete_session(token):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def save_complaint(user_id, complaint_text, predicted_department, predicted_sentiment, urgency_score, sentiment_confidence, model_used):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO complaints (user_id, complaint_text, predicted_department, predicted_sentiment, urgency_score, sentiment_confidence, model_used, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
    """, (user_id, complaint_text, predicted_department, predicted_sentiment, urgency_score, sentiment_confidence, model_used, datetime.now().isoformat()))
    conn.commit()
    new_id = cursor.lastrowid
    
    # Retrieve inserted row
    cursor.execute("SELECT * FROM complaints WHERE id = ?", (new_id,))
    complaint = cursor.fetchone()
    conn.close()
    return dict(complaint)

def get_citizen_complaints(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC
    """, (user_id,))
    complaints = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return complaints

def get_all_complaints(status=None, department=None, min_urgency=None, search_query=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT c.*, u.full_name as submitter_name 
        FROM complaints c
        JOIN users u ON c.user_id = u.id
        WHERE 1=1
    """
    params = []
    
    if status:
        query += " AND c.status = ?"
        params.append(status)
    if department:
        query += " AND c.predicted_department = ?"
        params.append(department)
    if min_urgency is not None:
        query += " AND c.urgency_score >= ?"
        params.append(float(min_urgency))
    if search_query:
        query += " AND (c.complaint_text LIKE ?)"
        params.append(f"%{search_query}%")
        
    query += " ORDER BY c.urgency_score DESC, c.created_at DESC"
    
    cursor.execute(query, params)
    complaints = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return complaints

def update_complaint_status(complaint_id, status, official_comments):
    conn = get_db_connection()
    cursor = conn.cursor()
    resolved_at = datetime.now().isoformat() if status == 'Resolved' else None
    
    cursor.execute("""
        UPDATE complaints 
        SET status = ?, official_comments = ?, resolved_at = ?
        WHERE id = ?
    """, (status, official_comments, resolved_at, complaint_id))
    
    conn.commit()
    conn.close()
    return True

def get_dashboard_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Counters
    cursor.execute("SELECT COUNT(*) as total FROM complaints")
    total = cursor.fetchone()['total'] or 0
    
    cursor.execute("SELECT COUNT(*) as pending FROM complaints WHERE status = 'Pending'")
    pending = cursor.fetchone()['pending'] or 0
    
    cursor.execute("SELECT COUNT(*) as progress FROM complaints WHERE status = 'In Progress'")
    progress = cursor.fetchone()['progress'] or 0
    
    cursor.execute("SELECT COUNT(*) as resolved FROM complaints WHERE status = 'Resolved'")
    resolved = cursor.fetchone()['resolved'] or 0
    
    cursor.execute("SELECT AVG(urgency_score) as avg_urgency FROM complaints")
    avg_urgency = cursor.fetchone()['avg_urgency'] or 0.0
    
    # 2. Dept distribution
    cursor.execute("""
        SELECT predicted_department as dept, COUNT(*) as count 
        FROM complaints 
        GROUP BY predicted_department 
        ORDER BY count DESC
    """)
    dept_distribution = {row['dept']: row['count'] for row in cursor.fetchall()}
    
    # 3. Sentiment distribution
    cursor.execute("""
        SELECT predicted_sentiment as sent, COUNT(*) as count 
        FROM complaints 
        GROUP BY predicted_sentiment
    """)
    sentiment_distribution = {row['sent']: row['count'] for row in cursor.fetchall()}
    
    conn.close()
    
    return {
        "total": total,
        "pending": pending,
        "in_progress": progress,
        "resolved": resolved,
        "avg_urgency": round(avg_urgency, 2),
        "department_distribution": dept_distribution,
        "sentiment_distribution": sentiment_distribution
    }
