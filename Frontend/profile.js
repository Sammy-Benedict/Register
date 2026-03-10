// ============================================================================
// CS PORTAL - STUDENT PROFILE PAGE - FRONTEND LOGIC
// ============================================================================
// This script manages the student profile display and verifies payment status
// after returning from the Paystack payment gateway.
// Protected page - requires student authentication
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
    // ========================================================================
    // AUTHENTICATION CHECK
    // ========================================================================
    
    // Check if student is authenticated by verifying token in localStorage
    const authToken = localStorage.getItem("authToken");
    const userRole = localStorage.getItem("userRole") || "student";

    // Redirect to student login if token not found or user is admin
    if (!authToken || userRole === "admin") {
        window.location.href = "student-login.html";
        return;
    }

    // ========================================================================
    // CONFIGURATION & DOM ELEMENTS
    // ========================================================================
    
    // API endpoint from config or defaults
    const API_BASE = window.location.origin|| "http://localhost:5000";
    
    // Number of documents required for registration
    const requiredDocuments = 2;

    // DOM elements for message display and button controls
    const messageBox = document.getElementById("profileMessage");
    const refreshBtn = document.getElementById("refreshProfileBtn");
    const resultSlipLinkEl = document.getElementById("profileResultSlipLink");

    // ========================================================================
    // MESSAGE DISPLAY FUNCTIONS
    // ========================================================================

    /**
     * Display a message banner to the user
     * @param {string} message - The message text to display
     * @param {string} type - Message type: 'info', 'success', or 'error'
     */
    const setMessage = (message, type = "info") => {
        messageBox.textContent = message;
        messageBox.className = `info-banner ${type}`;
    };

    /**
     * Set the text content of a specific element by ID
     * @param {string} id - The element's ID attribute
     * @param {string} value - The text value to set
     */
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    };

    const buildFileUrl = (filePath) => {
        if (!filePath) return "";
        if (/^https?:\/\//i.test(filePath)) return filePath;
        const normalized = String(filePath).replace(/\\/g, "/").replace(/^\/+/, "");
        return `${API_BASE}/${normalized}`;
    };

    const setResultSlipLink = (documents) => {
        if (!resultSlipLinkEl) return;

        const slipPath = documents?.resultSlip;
        if (!slipPath) {
            resultSlipLinkEl.textContent = "Not Available";
            resultSlipLinkEl.removeAttribute("href");
            resultSlipLinkEl.setAttribute("aria-disabled", "true");
            return;
        }

        resultSlipLinkEl.textContent = "View Slip";
        resultSlipLinkEl.href = buildFileUrl(slipPath);
        resultSlipLinkEl.removeAttribute("aria-disabled");
    };

    // ========================================================================
    // PROFILE DISPLAY FUNCTIONS
    // ========================================================================

    /**
     * Apply student profile data to the page by updating all profile fields
     * Calculates document counts, payment status, and form completion status
     * @param {object} profile - Student profile object from API or localStorage
     */
    const applyProfile = (profile) => {
        // Calculate the number of documents uploaded
        const documentsCount = Array.isArray(profile.documents)
            ? profile.documents.length
            : (profile.documents && typeof profile.documents === "object")
                ? Object.values(profile.documents).filter(Boolean).length
                : Number(profile.documentsCount || 0);
        
        // Calculate how many more documents are needed
        const missingDocuments = Math.max(0, requiredDocuments - documentsCount);
        
        // Get payment status, default to "Pending" if not set
        const paymentStatus = profile.paymentStatus || "Pending";
        
        // Check if the student has any registration data
        const hasRecord = Boolean(profile.fullName || profile.indexNumber || profile.email);

        // Update all profile fields with student data
        setText("profileFullName", profile.fullName || "-");
        setText("profileIndexNumber", profile.indexNumber || "-");
        setText("profileEmail", profile.email || "-");
        setText("profileProgramme", profile.programme || "-");
        setText("profileProgramClass", profile.programClass || "-");
        setText("profileClass", profile.programClass || "-");
        setText("profilePaymentStatus", paymentStatus);
        setText("profilePaymentPill", paymentStatus);
        setText("profileDocumentsCount", `${documentsCount} Uploaded`);
        setText("profileMissingDocs", `${missingDocuments} File`);
        setText("profileFormStatus", hasRecord ? "Complete" : "Not Submitted");
        setResultSlipLink(profile.documents);
    };

    // ========================================================================
    // DATA LOADING FUNCTIONS
    // ========================================================================

    /**
     * Load the latest student profile from the server
     * Falls back to cached profile if server is unavailable
     * Includes authentication token in request header
     */
    const loadProfile = async () => {
        try {
            // Fetch the latest profile from the API with authentication token
            const response = await fetch(`${API_BASE}/api/students/latest`, {
                headers: {
                    "Authorization": `Bearer ${authToken}`
                }
            });
            const result = await response.json();

            // Check if the response was successful
            if (!response.ok || result.status !== "success") {
                throw new Error(result.message || "Failed to load latest profile");
            }

            // Display the fetched profile data
            applyProfile(result.student || {});
            setMessage("Profile synced from server.", "success");
        } catch (error) {
            // Fall back to locally cached profile if server is unavailable
            const fallback = localStorage.getItem("studentProfile");
            if (fallback) {
                applyProfile(JSON.parse(fallback));
                setMessage("Using locally cached profile. Start backend server to sync live data.", "info");
                return;
            }
            
            // If no cache available, show error message
            setMessage("No profile data found. Complete registration on Home page first.", "error");
        }
    };

    /**
     * Check if the user was redirected back from Paystack after payment
     * Looks for payment reference in URL query parameters
     * If found, verifies the payment status with the backend
     */
    const tryVerifyFromQuery = async () => {
        // Extract URL query parameters
        const params = new URLSearchParams(window.location.search);
        
        // Check for payment reference from Paystack (multiple possible parameter names)
        const reference = params.get("reference") || params.get("trxref") || params.get("reference_code");
        
        // If no reference found, this is a normal profile page load
        if (!reference) return;

        // Show verifying message while checking payment status
        setMessage("Verifying payment...", "info");
        try {
            // Call the backend to verify the payment reference with Paystack
            const resp = await fetch(`${API_BASE}/api/payment/verify?reference=${encodeURIComponent(reference)}`, {
                headers: {
                    "Authorization": `Bearer ${authToken}`
                }
            });
            const json = await resp.json().catch(() => ({}));
            
            // If payment verification was successful
            if (resp.ok && json.status === "success") {
                setMessage("Payment confirmed. Refreshing profile...", "success");
                
                // Reload the latest profile from server to show updated payment status
                await loadProfile();
                
                // Remove the query parameters from the URL to keep it clean
                history.replaceState(null, document.title, window.location.pathname);
                return;
            }
            
            // If payment verification failed, show error message from server
            setMessage(json.message || "Payment verification failed", "error");
        } catch (err) {
            // Network or parsing error
            setMessage("Unable to verify payment. Try again later.", "error");
        }
    };

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    // Refresh profile when the refresh button is clicked
    refreshBtn.addEventListener("click", loadProfile);

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    // Load profile on page load
    loadProfile();
    
    // Check if we're returning from payment and verify it
    tryVerifyFromQuery();
    
    // Auto-refresh profile every 15 seconds to sync with server
    setInterval(loadProfile, 15000);
});
