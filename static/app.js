/*
   Aegis AI Core Frontend Application Controller
*/

// Globals
let currentUser = null;
let token = localStorage.getItem('auth_token');
let deptChart = null;
let sentimentChart = null;

const DEPT_MAP = {
    'MINWR': 'Ministry of Water Resources & Sewerage Control',
    'DOURD': 'Department of Urban Road Development & Maintenance',
    'DOTEL': 'Department of Telecommunications',
    'DOSAT': 'Department of Sanitation & Waste Management',
    'MPOWR': 'Ministry of Power & Electricity',
    'DHLTH': 'Department of Health & Family Welfare',
    'FADSS': 'Food Distribution & Agricultural Support Division',
    'MOCAV': 'Ministry of Civil Aviation',
    'MOIAB': 'Ministry of Information & Broadcasting',
    'MCOAL': 'Ministry of Coal & Mining',
    'UIDAI': 'Unique Identification Authority of India',
    'DOARE': 'Department of Agricultural Research & Education',
    'MOMAF': 'Ministry of Minority Affairs',
    'DPOST': 'Department of Posts',
    'AYUSH': 'Ministry of AYUSH',
    'MODEF': 'Ministry of Defence',
    'MORLY': 'Ministry of Railways',
    'MORTH': 'Ministry of Road Transport & Highways'
};

const PRESETS = {
    1: "EMERGENCY: The main water pipelines have burst causing dirty sewer water to flood our street. This is a severe health hazard!",
    2: "The streetlight outside my house has been blinking for two days and needs replacement. It is extremely dark and unsafe.",
    3: "URGENT: A massive pothole on the highway near milepost 12 caused a severe accident today. Cars are swerving to avoid it, dangerous!",
    4: "I wanted to thank the department for completing the road construction on main street so quickly. The new paving is excellent.",
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // 1. Verify token and restore session
    if (token) {
        checkSession();
    } else {
        updateAuthNav();
    }

    // 2. Fetch public metrics for home screen
    fetchPublicStats();

    // 3. Setup default gallery description
    switchGalleryImage('/output/week4_performance_dashboard.png');
});

// Switch Tabs SPA Router
function switchTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active state from nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected tab
    const selectedTab = document.getElementById(`view-${tabId}`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Set nav link active
    const navLink = document.getElementById(`nav-${tabId}`);
    if (navLink) {
        navLink.classList.add('active');
    }

    // Handle view specific loads
    if (tabId === 'home') {
        fetchPublicStats();
    } else if (tabId === 'citizen') {
        if (currentUser && currentUser.role === 'citizen') {
            document.getElementById('citizen-auth-prompt').style.display = 'none';
            document.getElementById('citizen-workspace').style.display = 'block';
            document.getElementById('citizen-user-pill').innerText = `${currentUser.full_name} (Citizen)`;
            fetchCitizenHistory();
        } else {
            document.getElementById('citizen-auth-prompt').style.display = 'block';
            document.getElementById('citizen-workspace').style.display = 'none';
        }
    } else if (tabId === 'officer') {
        if (currentUser && currentUser.role === 'officer') {
            document.getElementById('officer-auth-prompt').style.display = 'none';
            document.getElementById('officer-workspace').style.display = 'block';
            document.getElementById('officer-user-pill').innerText = `${currentUser.full_name} (Officer)`;
            fetchOfficerDashboard();
        } else {
            document.getElementById('officer-auth-prompt').style.display = 'block';
            document.getElementById('officer-workspace').style.display = 'none';
        }
    } else if (tabId === 'research') {
        fetchResearchMetrics();
    }
}

// Redirect to Authentication view
function redirectToAuth(targetPortal) {
    switchTab('auth');
    // Save info of which role user was attempting to access
    localStorage.setItem('auth_target_role', targetPortal);
}

// Toggle Auth Form between Login and Register
function toggleAuthForm(mode) {
    const errorAlert = document.getElementById('auth-error-alert');
    const successAlert = document.getElementById('auth-success-alert');
    errorAlert.style.display = 'none';
    successAlert.style.display = 'none';

    if (mode === 'login') {
        document.getElementById('auth-tab-login').classList.add('active');
        document.getElementById('auth-tab-register').classList.remove('active');
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
    } else {
        document.getElementById('auth-tab-login').classList.remove('active');
        document.getElementById('auth-tab-register').classList.add('active');
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    }
}

// Handle Login API Request
async function handleLoginSubmit(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value;
    const errorAlert = document.getElementById('auth-error-alert');
    errorAlert.style.display = 'none';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Authentication failed");
        }

        const data = await response.json();
        
        // Save token and user details
        token = data.access_token;
        localStorage.setItem('auth_token', token);
        
        currentUser = {
            id: data.user.id,
            username: data.user.username,
            full_name: data.user.full_name,
            role: data.user.role
        };

        updateAuthNav();

        // Redirect based on role or target role
        const targetRole = localStorage.getItem('auth_target_role') || currentUser.role;
        localStorage.removeItem('auth_target_role');
        
        if (targetRole === 'officer' && currentUser.role === 'citizen') {
            // Citizen tried to access officer area, override
            switchTab('citizen');
        } else {
            switchTab(targetRole);
        }

    } catch (err) {
        errorAlert.innerText = err.message;
        errorAlert.style.display = 'block';
    }
}

// Handle Register API Request
async function handleRegisterSubmit(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('reg-username').value.trim();
    const fullnameInput = document.getElementById('reg-fullname').value.trim();
    const passwordInput = document.getElementById('reg-password').value;
    const roleInput = document.getElementById('reg-role').value;
    
    const errorAlert = document.getElementById('auth-error-alert');
    const successAlert = document.getElementById('auth-success-alert');
    errorAlert.style.display = 'none';
    successAlert.style.display = 'none';

    if (passwordInput.length < 6) {
        errorAlert.innerText = "Password must be at least 6 characters long";
        errorAlert.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: usernameInput,
                password: passwordInput,
                full_name: fullnameInput,
                role: roleInput
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Registration failed");
        }

        successAlert.innerText = "Account registered successfully! You can now log in.";
        successAlert.style.display = 'block';
        
        // Auto transition to login tab and prefill username
        setTimeout(() => {
            toggleAuthForm('login');
            document.getElementById('login-username').value = usernameInput;
            document.getElementById('login-password').value = '';
        }, 1500);

    } catch (err) {
        errorAlert.innerText = err.message;
        errorAlert.style.display = 'block';
    }
}

// Verify Session using existing token
async function checkSession() {
    try {
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            currentUser = await response.json();
            updateAuthNav();
            // Restore context if they are inside citizen/officer page
            const currentActiveTab = document.querySelector('.nav-links a.active');
            if (currentActiveTab) {
                const activeTabId = currentActiveTab.id.replace('nav-', '');
                if (activeTabId === 'citizen' || activeTabId === 'officer') {
                    switchTab(activeTabId);
                }
            }
        } else {
            // Token expired or invalid
            handleLogout();
        }
    } catch (err) {
        console.error("Session verification error:", err);
        handleLogout();
    }
}

// Logout session
async function handleLogout() {
    if (token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.error("Logout request error", e);
        }
    }
    
    // Clear storage
    token = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    
    updateAuthNav();
    switchTab('home');
}

// Update Navigation auth section
function updateAuthNav() {
    const welcomeMsg = document.getElementById('user-welcome-msg');
    const logoutBtn = document.getElementById('logout-btn');

    if (currentUser) {
        welcomeMsg.innerHTML = `<i class="fa-solid fa-circle-user"></i> ${currentUser.full_name} <strong>(${currentUser.role.toUpperCase()})</strong>`;
        logoutBtn.style.display = 'inline-block';
    } else {
        welcomeMsg.innerHTML = `<i class="fa-solid fa-user-secret"></i> Guest Access`;
        logoutBtn.style.display = 'none';
    }
}

// Fetch public stats for landing page counters
async function fetchPublicStats() {
    try {
        const response = await fetch('/api/stats/dashboard');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('public-stat-total').innerText = data.total;
            document.getElementById('public-stat-pending').innerText = data.pending;
            document.getElementById('public-stat-resolved').innerText = data.resolved;
            document.getElementById('public-stat-urgency').innerText = data.avg_urgency.toFixed(2);
        }
    } catch (err) {
        console.error("Failed to load public stats:", err);
    }
}

// Sandbox inference presets
function useSandboxPreset(id) {
    document.getElementById('sandbox-text').value = PRESETS[id];
    runSandboxInference();
}

// Run Public Sandbox prediction
async function runSandboxInference() {
    const text = document.getElementById('sandbox-text').value.trim();
    if (!text) {
        alert("Please enter a complaint description!");
        return;
    }

    const btnText = document.getElementById('sandbox-btn-text');
    const spinner = document.getElementById('sandbox-spinner');
    
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    const t0 = performance.now();

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ complaint_text: text })
        });

        if (!response.ok) {
            throw new Error("API Connection Failed");
        }

        const data = await response.json();
        const t1 = performance.now();
        const latency = Math.round(t1 - t0);

        // Display results
        document.getElementById('sandbox-output-placeholder').style.display = 'none';
        const resultsBox = document.getElementById('sandbox-output-results');
        resultsBox.style.display = 'block';

        // 1. Urgency dial
        const score = data.urgency_score;
        document.getElementById('sandbox-urgency-val').innerText = score.toFixed(1);
        
        const fg = document.getElementById('sandbox-dial-fg');
        const maxOffset = 283;
        const offset = maxOffset - (score / 10.0) * maxOffset;
        fg.style.strokeDashoffset = offset;
        
        // Colors
        if (score >= 7.5) fg.style.stroke = "var(--color-red)";
        else if (score >= 5.0) fg.style.stroke = "var(--color-yellow)";
        else if (score >= 2.5) fg.style.stroke = "var(--color-primary)";
        else fg.style.stroke = "var(--color-green)";

        // 2. Sentiment badge
        const badge = document.getElementById('sandbox-sentiment-badge');
        badge.innerText = data.predicted_sentiment;
        badge.className = 'sentiment-badge-large ' + getSentimentClass(data.predicted_sentiment);

        // 3. Confidence
        const confidence = (data.sentiment_confidence * 100).toFixed(1);
        document.getElementById('sandbox-conf-val').innerText = `${confidence}%`;
        document.getElementById('sandbox-conf-bar').style.width = `${confidence}%`;
        document.getElementById('sandbox-conf-bar').style.backgroundColor = getSentimentBarColor(data.predicted_sentiment);

        // 4. Department
        const code = data.predicted_department;
        document.getElementById('sandbox-dept-code').innerText = code;
        document.getElementById('sandbox-dept-name').innerText = DEPT_MAP[code] || "General Administration";
        document.getElementById('sandbox-routing-icon').innerHTML = getDeptIcon(code);

        // 5. Latency
        document.getElementById('sandbox-model-used').innerText = `Model: ${data.model_used}`;
        document.getElementById('sandbox-api-latency').innerText = `Latency: ${latency}ms`;

    } catch (err) {
        alert("Error running inference: Make sure backend server is running.");
        console.error(err);
    } finally {
        btnText.style.display = 'inline-flex';
        spinner.style.display = 'none';
    }
}

// Helpers for styling sentiment results
function getSentimentClass(sent) {
    if (sent === 'Critical/Urgent') return 'critical';
    if (sent === 'Negative') return 'negative';
    if (sent === 'Neutral') return 'neutral';
    return 'positive';
}

function getSentimentBarColor(sent) {
    if (sent === 'Critical/Urgent') return 'var(--color-red)';
    if (sent === 'Negative') return 'var(--color-yellow)';
    if (sent === 'Neutral') return 'var(--color-primary)';
    return 'var(--color-green)';
}

function getDeptIcon(code) {
    if (code === 'MINWR') return '<i class="fa-solid fa-faucet-drip"></i>';
    if (code === 'DOURD' || code === 'MORTH') return '<i class="fa-solid fa-road"></i>';
    if (code === 'DOSAT') return '<i class="fa-solid fa-trash-can"></i>';
    if (code === 'MPOWR') return '<i class="fa-solid fa-bolt"></i>';
    if (code === 'DHLTH') return '<i class="fa-solid fa-notes-medical"></i>';
    if (code === 'UIDAI') return '<i class="fa-solid fa-id-card"></i>';
    return '<i class="fa-solid fa-building"></i>';
}

// CITIZEN WORKSPACE LOGIC
function useCitizenPreset(id) {
    document.getElementById('citizen-complaint-text').value = PRESETS[id];
}

async function submitCitizenGrievance() {
    const text = document.getElementById('citizen-complaint-text').value.trim();
    if (!text) {
        alert("Please enter a complaint description!");
        return;
    }

    const btnText = document.getElementById('citizen-btn-text');
    const spinner = document.getElementById('citizen-spinner');
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    try {
        const response = await fetch('/api/complaints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ complaint_text: text })
        });

        if (!response.ok) {
            throw new Error("Complaint submission failed");
        }

        const data = await response.json();
        
        // Show prediction result card
        document.getElementById('citizen-predict-placeholder').style.display = 'none';
        const resultsBox = document.getElementById('citizen-predict-results');
        resultsBox.style.display = 'block';

        // Set Dial
        const score = data.urgency_score;
        document.getElementById('citizen-urgency-val').innerText = score.toFixed(1);
        const fg = document.getElementById('citizen-dial-fg');
        fg.style.strokeDashoffset = 283 - (score / 10.0) * 283;
        if (score >= 7.5) fg.style.stroke = "var(--color-red)";
        else if (score >= 5.0) fg.style.stroke = "var(--color-yellow)";
        else if (score >= 2.5) fg.style.stroke = "var(--color-primary)";
        else fg.style.stroke = "var(--color-green)";

        // Set Sentiment
        const badge = document.getElementById('citizen-sentiment-badge');
        badge.innerText = data.predicted_sentiment;
        badge.className = 'sentiment-badge-large ' + getSentimentClass(data.predicted_sentiment);

        const confidence = (data.sentiment_confidence * 100).toFixed(1);
        document.getElementById('citizen-conf-val').innerText = `${confidence}%`;
        document.getElementById('citizen-conf-bar').style.width = `${confidence}%`;
        document.getElementById('citizen-conf-bar').style.backgroundColor = getSentimentBarColor(data.predicted_sentiment);

        // Set Dept
        document.getElementById('citizen-dept-code').innerText = data.predicted_department;
        document.getElementById('citizen-dept-name').innerText = DEPT_MAP[data.predicted_department] || "General Department";
        document.getElementById('citizen-routing-icon').innerHTML = getDeptIcon(data.predicted_department);

        document.getElementById('citizen-model-used').innerText = `Model: ${data.model_used}`;

        // Clear input
        document.getElementById('citizen-complaint-text').value = '';

        // Reload history list
        fetchCitizenHistory();

    } catch (err) {
        alert(err.message);
    } finally {
        btnText.style.display = 'inline-flex';
        spinner.style.display = 'none';
    }
}

async function fetchCitizenHistory() {
    try {
        const response = await fetch('/api/complaints/my', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("Could not retrieve grievances");

        const data = await response.json();
        
        document.getElementById('citizen-total-count').innerText = data.length;

        const tbody = document.getElementById('citizen-queue-body');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No complaints filed yet. Submit above to start.</td></tr>`;
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            
            const tdId = document.createElement('td');
            tdId.innerHTML = `<strong>#${item.id}</strong>`;
            tr.appendChild(tdId);

            const tdText = document.createElement('td');
            tdText.innerText = item.complaint_text.substring(0, 110) + (item.complaint_text.length > 110 ? '...' : '');
            tr.appendChild(tdText);

            const tdDept = document.createElement('td');
            tdDept.innerHTML = `<span style="font-weight:700; color:var(--color-secondary);">${item.predicted_department}</span><div style="font-size:0.7rem; color:var(--text-muted);">${DEPT_MAP[item.predicted_department] || 'General Office'}</div>`;
            tr.appendChild(tdDept);

            const tdUrgency = document.createElement('td');
            tdUrgency.className = 'tbl-urgency';
            tdUrgency.innerText = item.urgency_score.toFixed(2);
            tdUrgency.style.color = getUrgencyColor(item.urgency_score);
            tr.appendChild(tdUrgency);

            const tdStatus = document.createElement('td');
            tdStatus.innerHTML = `<span class="status-badge ${getBadgeClass(item.status)}">${item.status}</span>`;
            tr.appendChild(tdStatus);

            const tdAction = document.createElement('td');
            const viewBtn = document.createElement('button');
            viewBtn.className = 'action-btn-sm';
            viewBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Details';
            viewBtn.onclick = () => openCitizenDetailModal(item);
            tdAction.appendChild(viewBtn);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
    }
}

function getUrgencyColor(score) {
    if (score >= 7.5) return 'var(--color-red)';
    if (score >= 5.0) return 'var(--color-yellow)';
    if (score >= 2.5) return 'var(--color-primary)';
    return 'var(--color-green)';
}

function getBadgeClass(status) {
    if (status === 'Pending') return 'pending';
    if (status === 'In Progress') return 'progress';
    return 'resolved';
}

// CITIZEN DETAIL VIEW
function openCitizenDetailModal(item) {
    const modal = document.getElementById('citizen-detail-modal');
    modal.style.display = 'flex';

    document.getElementById('cit-modal-status-badge').innerHTML = `<span class="status-badge ${getBadgeClass(item.status)}">${item.status}</span>`;
    document.getElementById('cit-modal-dept').innerText = `${item.predicted_department} — ${DEPT_MAP[item.predicted_department] || 'General Administration'}`;
    document.getElementById('cit-modal-urgency').innerText = item.urgency_score.toFixed(2);
    document.getElementById('cit-modal-date').innerText = new Date(item.created_at).toLocaleString();
    document.getElementById('cit-modal-text').innerText = item.complaint_text;

    const commentsContainer = document.getElementById('cit-modal-comments-container');
    const commentsPara = document.getElementById('cit-modal-comments');
    const resolvedTimePara = document.getElementById('cit-modal-resolved-time');

    if (item.official_comments) {
        commentsContainer.style.display = 'block';
        commentsPara.innerText = item.official_comments;
        resolvedTimePara.innerText = item.resolved_at ? `Resolved at: ${new Date(item.resolved_at).toLocaleString()}` : '';
    } else {
        commentsPara.innerText = "No officer remarks added yet. Ticket is pending triage assignment.";
        resolvedTimePara.innerText = '';
    }
}

function closeCitizenDetailModal() {
    document.getElementById('citizen-detail-modal').style.display = 'none';
}

// OFFICER WORKSPACE LOGIC
async function fetchOfficerDashboard() {
    try {
        const response = await fetch('/api/stats/dashboard');
        if (!response.ok) throw new Error("Failed to load dashboard metrics");

        const data = await response.json();

        // Populate counters
        document.getElementById('officer-stat-total').innerText = data.total;
        document.getElementById('officer-stat-pending').innerText = data.pending;
        document.getElementById('officer-stat-resolved').innerText = data.resolved;
        document.getElementById('officer-stat-urgency').innerText = data.avg_urgency.toFixed(2);

        // Render charts
        renderOfficerCharts(data);

        // Load triage queue list
        fetchOfficerQueue();

    } catch (err) {
        console.error(err);
    }
}

function renderOfficerCharts(stats) {
    const deptCtx = document.getElementById('chart-departments').getContext('2d');
    const sentCtx = document.getElementById('chart-sentiments').getContext('2d');

    // Destroy existing charts to prevent render overlays
    if (deptChart) deptChart.destroy();
    if (sentimentChart) sentimentChart.destroy();

    // 1. Department bar chart
    const deptLabels = Object.keys(stats.department_distribution);
    const deptValues = Object.values(stats.department_distribution);

    deptChart = new Chart(deptCtx, {
        type: 'bar',
        data: {
            labels: deptLabels,
            datasets: [{
                label: 'Tickets Volume',
                data: deptValues,
                backgroundColor: 'rgba(59, 130, 246, 0.4)',
                borderColor: '#3b82f6',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });

    // 2. Sentiment doughnut chart
    const sentLabels = Object.keys(stats.sentiment_distribution);
    const sentValues = Object.values(stats.sentiment_distribution);
    
    // Map colors to matching theme styles
    const colorsMap = {
        'Critical/Urgent': '#ef4444',
        'Negative': '#f59e0b',
        'Neutral': '#3b82f6',
        'Positive': '#10b981'
    };
    const bgColors = sentLabels.map(label => colorsMap[label] || '#94a3b8');

    sentimentChart = new Chart(sentCtx, {
        type: 'doughnut',
        data: {
            labels: sentLabels,
            datasets: [{
                data: sentValues,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#f1f5f9', boxWidth: 12, font: { size: 10 } }
                }
            },
            cutout: '65%'
        }
    });
}

async function fetchOfficerQueue() {
    const deptFilter = document.getElementById('filter-dept').value;
    const statusFilter = document.getElementById('filter-status').value;
    const searchQuery = document.getElementById('filter-search').value.trim();

    // Construct URL with query filters
    let url = `/api/complaints/all?`;
    if (deptFilter) url += `department=${deptFilter}&`;
    if (statusFilter) url += `status=${statusFilter}&`;
    if (searchQuery) url += `search_query=${encodeURIComponent(searchQuery)}&`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("Could not load queue");

        const data = await response.json();
        
        const tbody = document.getElementById('officer-queue-body');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No matching grievances found.</td></tr>`;
            return;
        }

        data.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            const tdRank = document.createElement('td');
            tdRank.innerHTML = `<strong>#${index + 1}</strong>`;
            tr.appendChild(tdRank);

            const tdName = document.createElement('td');
            tdName.innerText = item.submitter_name || "Citizen";
            tr.appendChild(tdName);

            const tdText = document.createElement('td');
            tdText.innerText = item.complaint_text.substring(0, 100) + (item.complaint_text.length > 100 ? '...' : '');
            tr.appendChild(tdText);

            const tdDept = document.createElement('td');
            tdDept.innerHTML = `<span style="font-weight:700; color:var(--color-primary);">${item.predicted_department}</span><div style="font-size:0.7rem; color:var(--text-muted);">${DEPT_MAP[item.predicted_department] || 'General Office'}</div>`;
            tr.appendChild(tdDept);

            const tdUrgency = document.createElement('td');
            tdUrgency.className = 'tbl-urgency';
            tdUrgency.innerText = item.urgency_score.toFixed(2);
            tdUrgency.style.color = getUrgencyColor(item.urgency_score);
            tr.appendChild(tdUrgency);

            const tdStatus = document.createElement('td');
            tdStatus.innerHTML = `<span class="status-badge ${getBadgeClass(item.status)}">${item.status}</span>`;
            tr.appendChild(tdStatus);

            const tdAction = document.createElement('td');
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn-sm';
            editBtn.innerHTML = '<i class="fa-solid fa-edit"></i> Handle';
            editBtn.onclick = () => openTicketModal(item);
            tdAction.appendChild(editBtn);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
    }
}

// OFFICER ACTION MODAL
function openTicketModal(ticket) {
    const modal = document.getElementById('ticket-modal');
    modal.style.display = 'flex';

    document.getElementById('modal-ticket-id').value = ticket.id;
    document.getElementById('modal-submitter').innerText = ticket.submitter_name || "Citizen";
    document.getElementById('modal-date').innerText = new Date(ticket.created_at).toLocaleString();
    document.getElementById('modal-dept').innerText = `${ticket.predicted_department} — ${DEPT_MAP[ticket.predicted_department] || 'General Office'}`;
    document.getElementById('modal-urgency').innerText = ticket.urgency_score.toFixed(2);
    document.getElementById('modal-sentiment').innerText = ticket.predicted_sentiment;
    document.getElementById('modal-text').innerText = ticket.complaint_text;

    document.getElementById('modal-status').value = ticket.status;
    document.getElementById('modal-comments').value = ticket.official_comments || '';
}

function closeTicketModal() {
    document.getElementById('ticket-modal').style.display = 'none';
}

async function handleStatusSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('modal-ticket-id').value;
    const status = document.getElementById('modal-status').value;
    const comments = document.getElementById('modal-comments').value.trim();

    try {
        const response = await fetch(`/api/complaints/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: status, comments: comments })
        });

        if (!response.ok) throw new Error("Status update failed");

        closeTicketModal();
        // Refresh entire officer dashboard
        fetchOfficerDashboard();

    } catch (err) {
        alert(err.message);
    }
}

// ACADEMIC RESEARCH METRICS LOGIC
async function fetchResearchMetrics() {
    try {
        const response1 = await fetch('/api/model/metrics?type=sentiment');
        const text1 = await response1.text();
        document.getElementById('sentiment-report-text').innerText = text1;

        const response2 = await fetch('/api/model/metrics?type=department');
        const text2 = await response2.text();
        document.getElementById('dept-report-text').innerText = text2;
    } catch (err) {
        console.error("Could not fetch reports:", err);
    }
}

function toggleAccordion(id) {
    const content = document.getElementById(id);
    const header = content.previousElementSibling;
    const isExpanded = content.classList.contains('active');

    if (isExpanded) {
        content.classList.remove('active');
        header.classList.remove('active');
        header.querySelector('.fa-chevron-down').className = 'fa-solid fa-chevron-right';
    } else {
        content.classList.add('active');
        header.classList.add('active');
        header.querySelector('.fa-chevron-right').className = 'fa-solid fa-chevron-down';
    }
}

function switchGalleryImage(url, btnElement = null) {
    const galleryImg = document.getElementById('gallery-target-image');
    galleryImg.src = url;

    // Remove active from all gallery tab btns
    document.querySelectorAll('.gallery-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    if (btnElement) {
        btnElement.classList.add('active');
    }

    // Set caption based on file name
    const captionElement = document.getElementById('gallery-target-caption');
    if (url.includes('performance_dashboard')) {
        captionElement.innerText = "Figure 1: Overall System Performance Dashboard displaying cross-validation accuracy, prediction latency, and model metrics across datasets.";
    } else if (url.includes('sentiment_confusion_matrix')) {
        captionElement.innerText = "Figure 2: Sentiment Classification Confusion Matrix. Optimizes F1-score detection bounds for identifying minority urgent/critical complaints.";
    } else if (url.includes('dept_confusion_matrix')) {
        captionElement.innerText = "Figure 3: Department Classification Confusion Matrix showing routing paths and precision boundaries across 18 public ministries.";
    } else if (url.includes('f1_score_comparison')) {
        captionElement.innerText = "Figure 4: Macro F1-score comparison graph comparing traditional TF-IDF + Logistic Regression classifiers against fine-tuned BERT deep-learning embeddings.";
    }
}

function handleImageLoadError(img) {
    // Fallback if the image doesn't exist on disk (e.g. workspace issues)
    img.src = "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80";
    document.getElementById('gallery-target-caption').innerText = "Figure: Graphic preview (Fallback dataset visualization). Model evaluation files not found at output path.";
}
