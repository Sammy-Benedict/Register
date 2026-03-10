// ============================================================================
// CS PORTAL - STUDENT REGISTRATION FORM - FRONTEND LOGIC
// ============================================================================
// This script manages the student registration form, file uploads, and payment
// processing through the modal-based payment interface.
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
    // ========================================================================
    // AUTHENTICATION & NAVIGATION SETUP
    // ========================================================================

    // Check if student is authenticated
    const authToken = localStorage.getItem("authToken");
    const userRole = localStorage.getItem("userRole") || "student";

    // Get navigation elements
    const profileLink = document.getElementById("profileLink");
    const supportLink = document.getElementById("supportLink");
    const adminLink = document.getElementById("adminLink");
    const logoutBtn = document.getElementById("logoutBtn");
    const sideProfileLink = document.getElementById("sideProfileLink");
    const sideSupportLink = document.getElementById("sideSupportLink");
    const sideAdminLink = document.getElementById("sideAdminLink");
    const sideLogoutBtn = document.getElementById("sideLogoutBtn");
    const newSessionBtn = document.getElementById("newSessionBtn");

    /**
     * Initialize authentication UI - show/hide elements based on login status
     */
    const initAuthUI = () => {
        if (!authToken) {
            // Not authenticated - redirect protected links to login
            if (profileLink) profileLink.href = "student-login.html";
            if (supportLink) supportLink.href = "student-login.html";
            if (adminLink) adminLink.href = "admin-login.html";
            if (sideProfileLink) sideProfileLink.href = "student-login.html";
            if (sideSupportLink) sideSupportLink.href = "student-login.html";
            if (sideAdminLink) sideAdminLink.href = "admin-login.html";
            if (logoutBtn) logoutBtn.style.display = "none";
            if (sideLogoutBtn) sideLogoutBtn.style.display = "none";
        } else {
            // Authenticated - show logout button and set proper links
            if (logoutBtn) logoutBtn.style.display = "block";
            if (sideLogoutBtn) sideLogoutBtn.style.display = "block";
            if (profileLink) profileLink.href = "profile.html";
            if (supportLink) supportLink.href = "support.html";
            if (adminLink) adminLink.href = userRole === "admin" ? "admin.html" : "student-login.html";
            if (sideProfileLink) sideProfileLink.href = "profile.html";
            if (sideSupportLink) sideSupportLink.href = "support.html";
            if (sideAdminLink) sideAdminLink.href = userRole === "admin" ? "admin.html" : "student-login.html";
        }
    };

    /**
     * Handle logout
     */
    const handleLogout = () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("studentData");
        localStorage.removeItem("adminData");
        localStorage.removeItem("userRole");
        window.location.href = "index.html";
    };

    // Add logout button event listeners
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }
    if (sideLogoutBtn) {
        sideLogoutBtn.addEventListener("click", handleLogout);
    }

    // Initialize authentication UI
    initAuthUI();

    // ========================================================================
    // CONFIGURATION & DOM ELEMENTS
    // ========================================================================
    
    // API endpoint and registration fee from config or defaults
    const API_BASE = window.location.origin|| "http://localhost:5000";
    const REGISTRATION_FEE = Number(window.APP_CONFIG?.REGISTRATION_FEE || 350);

    // Form and related elements
    const form = document.getElementById("registerForm");
    const payBtn = document.getElementById("payBtn");
    const fileInput = document.getElementById("fileInput");
    const browseFilesBtn = document.getElementById("browseFilesBtn");
    const pageMessage = document.getElementById("pageMessage");
    const fileList = document.getElementById("fileList");
    const fileEmptyState = document.getElementById("fileEmptyState");

    // Payment modal elements
    const paymentModal = document.getElementById("paymentModal");
    const closePaymentModal = document.getElementById("closePaymentModal");
    const paymentModalMessage = document.getElementById("paymentModalMessage");
    const paymentDetailsForm = document.getElementById("paymentDetailsForm");
    const paymentConfirmStep = document.getElementById("paymentConfirmStep");
    const paymentAmount = document.getElementById("paymentAmount");
    const modalMobilePhone = document.getElementById("modalMobilePhone");
    const modalMobileProvider = document.getElementById("modalMobileProvider");
    const makePaymentBtn = document.getElementById("makePaymentBtn");
    const cancelPaymentBtn = document.getElementById("cancelPaymentBtn");
    const confirmPaymentBtn = document.getElementById("confirmPaymentBtn");
    const closeConfirmBtn = document.getElementById("closeConfirmBtn");
    const paymentReference = document.getElementById("paymentReference");

    // State variables
    let registrationCompleted = false;
    let selectedFiles = [];
    let latestStudentId = null;
    let latestPaymentReference = null;  // Store payment reference for receipt generation
    let paymentData = { phone: null, provider: null };  // Store payment details for receipt

    // ========================================================================
    // UTILITY FUNCTIONS - MESSAGE & UI MANAGEMENT
    // ========================================================================

    /**
     * Display a message banner above the form
     * @param {string} message - The message text to display
     * @param {string} type - Message type: 'info', 'success', or 'error'
     */
    const setMessage = (message, type = "info") => {
        pageMessage.textContent = message;
        pageMessage.className = `info-banner ${type}`;
    };

    /**
     * Display a message in the payment modal
     * @param {string} message - The message text to display
     * @param {string} type - Message type: 'info', 'success', or 'error'
     */
    const setModalMessage = (message, type = "info") => {
        paymentModalMessage.textContent = message;
        paymentModalMessage.className = `info-banner ${type}`;
        if (message) {
            paymentModalMessage.classList.remove("hidden");
        } else {
            paymentModalMessage.classList.add("hidden");
        }
    };

    /**
     * Open the payment modal and show the payment details form
     */
    const openPaymentModal = () => {
        paymentModal.classList.remove("hidden");
        paymentDetailsForm.classList.remove("hidden");
        paymentConfirmStep.classList.add("hidden");
        paymentAmount.textContent = `GHS ${REGISTRATION_FEE.toFixed(2)}`;
        setModalMessage("", "info");
        // Clear input fields for a fresh start
        modalMobilePhone.value = "";
        modalMobileProvider.value = "";
    };

    /**
     * Close the payment modal
     */
    const closePaymentModalHandler = () => {
        paymentModal.classList.add("hidden");
        setModalMessage("", "info");
    };

    /**
     * Show the payment confirmation step in the modal
     * @param {string} reference - Payment reference from Paystack
     */
    const showPaymentConfirmation = (reference) => {
        latestPaymentReference = reference;
        paymentDetailsForm.classList.add("hidden");
        paymentConfirmStep.classList.remove("hidden");
        paymentReference.textContent = `Reference: ${reference}`;
    };

    // ========================================================================
    // FILE MANAGEMENT FUNCTIONS
    // ========================================================================

    /**
     * Sync the visible file list with the hidden file input element
     * This ensures the files selected in our custom UI are properly set
     */
    const syncFileInput = () => {
        const dataTransfer = new DataTransfer();
        selectedFiles.forEach((file) => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
    };

    /**
     * Render the list of selected files with change/delete options
     */
    const renderFileList = () => {
        fileList.innerHTML = "";

        if (!selectedFiles.length) {
            fileEmptyState.style.display = "block";
            return;
        }

        fileEmptyState.style.display = "none";

        selectedFiles.forEach((file, index) => {
            const item = document.createElement("li");
            item.className = "file-item";

            const meta = document.createElement("div");
            meta.className = "file-meta";

            const fileName = document.createElement("span");
            fileName.className = "file-name";
            fileName.textContent = file.name;

            const fileSize = document.createElement("span");
            fileSize.className = "file-size";
            fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;

            meta.append(fileName, fileSize);

            const actions = document.createElement("div");
            actions.className = "file-actions";

            // Change file button
            const changeBtn = document.createElement("button");
            changeBtn.type = "button";
            changeBtn.className = "file-action-btn change";
            changeBtn.textContent = "Change";
            changeBtn.addEventListener("click", () => {
                const replaceInput = document.createElement("input");
                replaceInput.type = "file";
                replaceInput.hidden = true;
                replaceInput.addEventListener("change", () => {
                    const [replacement] = replaceInput.files || [];
                    if (!replacement) {
                        return;
                    }

                    selectedFiles[index] = replacement;
                    syncFileInput();
                    renderFileList();
                    setMessage(`Changed file to ${replacement.name}.`, "success");
                });
                replaceInput.click();
            });

            // Delete file button
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "file-action-btn delete";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => {
                const removedFile = selectedFiles[index];
                selectedFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
                syncFileInput();
                renderFileList();
                setMessage(`${removedFile.name} removed.`, "info");
            });

            actions.append(changeBtn, deleteBtn);
            item.append(meta, actions);
            fileList.appendChild(item);
        });
    };

    // ========================================================================
    // REGISTRATION STATE MANAGEMENT
    // ========================================================================

    /**
     * Update the registration state based on payment status
     * @param {boolean} isPaid - Whether the student has paid
     */
    const setRegisteredState = (isPaid) => {
        registrationCompleted = isPaid;
        const submitBtn = document.querySelector(".submit");
        if (submitBtn) submitBtn.disabled = !isPaid;
        // Payment button should always be available
        if (payBtn) payBtn.disabled = false;
    };

    // ========================================================================
    // PAYMENT PROCESSING FUNCTIONS
    // ========================================================================

    // Create provisional student record
    const createProvisionalStudent = async () => {
        try {
            const formData = new FormData(form);
            const selectedProgramme = formData.get("programme");
            const selectedClass = formData.get("programClass");
            const payload = {
                fullName: formData.get("fullName"),
                indexNumber: formData.get("indexNumber"),
                email: formData.get("email"),
                programme: selectedProgramme,
                programClass: selectedClass,
                programType: `${selectedProgramme} - ${selectedClass}`,
                mobile: {
                    phone: paymentData.phone || undefined,
                    provider: paymentData.provider || undefined
                }
            };

            const resp = await fetch(`${API_BASE}/api/students/provisional`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await resp.json().catch(() => ({}));
            if (!resp.ok || result.status !== "success") {
                setModalMessage(result.message || "Failed to create provisional student", "error");
                return false;
            }

            latestStudentId = result.student?._id || null;
            localStorage.setItem("studentProfile", JSON.stringify({
                studentId: latestStudentId,
                fullName: payload.fullName,
                indexNumber: payload.indexNumber,
                email: payload.email,
                programme: payload.programme,
                programClass: payload.programClass,
                documentsCount: 0,
                paymentStatus: "Pending"
            }));

            return true;
        } catch (error) {
            setModalMessage("Failed to prepare student record", "error");
            return false;
        }
    };

    /**
     * Second step: Initialize payment with Paystack
     * Sends payment request to backend which communicates with Paystack
     */
    const initializePayment = async () => {
        try {
            const profileUrl = new URL("profile.html", window.location.href).toString();

            const response = await fetch(`${API_BASE}/api/payment/pay`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    studentId: latestStudentId,
                    amount: REGISTRATION_FEE,
                    callbackUrl: profileUrl,
                    mobile: {
                        phone: paymentData.phone || undefined,
                        provider: paymentData.provider || undefined
                    }
                })
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.status !== "success" || !result.authorizationUrl) {
                const details = [result.message, result.gatewayStatus ? `(Gateway ${result.gatewayStatus})` : ""]
                    .filter(Boolean)
                    .join(" ");
                setModalMessage(details || `Unable to initialize payment (HTTP ${response.status}).`, "error");
                return false;
            }

            // Redirect to Paystack payment page
            window.location.href = result.authorizationUrl;
            return true;
        } catch (error) {
            setModalMessage("Payment initialization failed. Check server and try again.", "error");
            return false;
        }
    };

    /**
     * Generate and download a payment receipt as PDF
     * Creates a nice formatted receipt with payment details
     */
    const generateAndDownloadReceipt = () => {
        const receiptHTML = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #0c1b2a; margin: 0 0 5px 0;">CS PORTAL</h1>
                    <p style="color: #5a6b7a; margin: 0;">Student Registration Portal</p>
                </div>
                
                <div style="border-top: 2px solid #2f80ed; border-bottom: 2px solid #2f80ed; padding: 20px 0; margin: 20px 0;">
                    <h2 style="text-align: center; color: #0c1b2a; margin: 0;">Payment Receipt</h2>
                </div>

                <div style="margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Receipt Reference:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a; font-weight: bold;">${latestPaymentReference}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Student Name:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${form.elements["fullName"].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Index Number:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${form.elements["indexNumber"].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Email:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${form.elements["email"].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Programme:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${form.elements["programme"].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Class:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${form.elements["programClass"].value}</td>
                        </tr>
                        <tr style="border-top: 1px solid #eee; border-bottom: 1px solid #eee;">
                            <td style="padding: 15px 0; color: #5a6b7a;"><strong>Amount Paid:</strong></td>
                            <td style="padding: 15px 0; text-align: right; color: #1b9f7c; font-size: 1.3em; font-weight: bold;">GHS ${REGISTRATION_FEE.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Status:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #1b9f7c; font-weight: bold;">✓ Paid</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Date:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${new Date().toLocaleDateString()}</td>
                        </tr>
                    </table>
                </div>

                <div style="background: #f4f8ff; padding: 15px; border-radius: 8px; margin-top: 30px; color: #0c1b2a;">
                    <p style="margin: 0; font-size: 0.9em;"><strong>Thank you for your payment!</strong></p>
                    <p style="margin: 5px 0 0 0; font-size: 0.85em; color: #5a6b7a;">Please keep this receipt for your records. Your registration will be processed once all documents are uploaded and verified.</p>
                </div>
            </div>
        `;

        // Use html2pdf library to generate PDF
        const element = document.createElement("div");
        element.innerHTML = receiptHTML;
        
        const opt = {
            margin: 10,
            filename: `payment-receipt-${latestPaymentReference}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };

        html2pdf().set(opt).from(element).save();
    };

    // ========================================================================
    // EVENT LISTENERS - PAYMENT MODAL
    // ========================================================================

    // Open payment modal when "Proceed to Payment" is clicked
    payBtn.addEventListener("click", openPaymentModal);

    // Close payment modal with X button
    closePaymentModal.addEventListener("click", closePaymentModalHandler);

    // Close payment modal with cancel button
    cancelPaymentBtn.addEventListener("click", closePaymentModalHandler);

    // Close payment modal with close button on confirmation
    closeConfirmBtn.addEventListener("click", closePaymentModalHandler);

    // Close modal when clicking outside the modal content
    paymentModal.addEventListener("click", (e) => {
        if (e.target === paymentModal) {
            closePaymentModalHandler();
        }
    });

    // Make Payment button - validates and processes payment
    makePaymentBtn.addEventListener("click", async () => {
        setModalMessage("", "info");

        // Validate main form before payment
        if (!form.elements["fullName"].value || !form.elements["indexNumber"].value || !form.elements["email"].value) {
            setModalMessage("Please fill in all required fields in the registration form first.", "error");
            return;
        }

        // Store payment method details
        paymentData.phone = modalMobilePhone.value || null;
        paymentData.provider = modalMobileProvider.value || null;

        // Create provisional student record
        setModalMessage("Creating student record...", "info");
        const studentCreated = await createProvisionalStudent();
        if (!studentCreated) return;

        // Initialize payment with Paystack
        setModalMessage("Initializing payment...", "info");
        await initializePayment();
    });

    // Confirm Payment button - generates receipt and closes modal
    confirmPaymentBtn.addEventListener("click", () => {
        generateAndDownloadReceipt();
        closePaymentModalHandler();
    });

    // ========================================================================
    // EVENT LISTENERS - FILE MANAGEMENT
    // ========================================================================

    // Open file browser when browse button is clicked
    browseFilesBtn.addEventListener("click", () => fileInput.click());

    // Handle file selection from file input
    fileInput.addEventListener("change", () => {
        const newFiles = Array.from(fileInput.files);

        if (!newFiles.length) {
            return;
        }

        selectedFiles = [...selectedFiles, ...newFiles];
        syncFileInput();
        renderFileList();
        setMessage(`${newFiles.length} file(s) added.`, "success");
    });

    // ========================================================================
    // EVENT LISTENERS - FORM SUBMISSION
    // ========================================================================

    // Handle final form submission for registration completion
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitBtn = document.querySelector(".submit");
        submitBtn.innerText = "Processing...";
        submitBtn.disabled = true;

        try {
            if (!latestStudentId) {
                setMessage("Please complete payment first using the 'Proceed to Payment' button.", "error");
                return;
            }

            // Verify student's payment status from the server
            const statusResp = await fetch(`${API_BASE}/api/students/${latestStudentId}`, {
                headers: {
                    "Authorization": `Bearer ${authToken}`
                }
            });
            if (!statusResp.ok) {
                const txt = await statusResp.text();
                setMessage(`Unable to verify student status: ${txt}`, "error");
                return;
            }

            const statusData = await statusResp.json();
            const current = statusData.student || {};

            // Ensure payment has been completed
            if (current.paymentStatus !== "Paid") {
                setMessage("Payment required before completing registration. Please complete payment.", "error");
                return;
            }

            // Ensure documents have been uploaded
            if (!selectedFiles.length) {
                setMessage("Please upload at least one document before completing registration.", "error");
                return;
            }

            // Upload documents
            const formData = new FormData();
            formData.append("studentId", latestStudentId);
            selectedFiles.forEach((file) => formData.append("documents", file));

            const completeResp = await fetch(`${API_BASE}/api/students/complete`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${authToken}`
                },
                body: formData
            });

            const completeJson = await completeResp.json().catch(() => ({}));
            if (!completeResp.ok || completeJson.status !== "success") {
                setMessage(completeJson.message || "Failed to complete registration", "error");
                return;
            }

            // Update local storage with completed registration
            localStorage.setItem("studentProfile", JSON.stringify({
                studentId: latestStudentId,
                fullName: form.elements["fullName"].value,
                indexNumber: form.elements["indexNumber"].value,
                email: form.elements["email"].value,
                programme: form.elements["programme"].value,
                programClass: form.elements["programClass"].value,
                documentsCount: selectedFiles.length,
                paymentStatus: "Paid"
            }));

            setMessage("Registration complete. Thank you — your documents have been uploaded.", "success");
            setRegisteredState(true);
        } catch (error) {
            setMessage("Cannot reach backend server. Start backend and try again.", "error");
        } finally {
            submitBtn.innerText = "Register Account";
            submitBtn.disabled = false;
        }
    });

    // ========================================================================
    // EVENT LISTENERS - FORM RESET
    // ========================================================================

    // Handle form reset - clear all data and state
    form.addEventListener("reset", () => {
        selectedFiles = [];
        syncFileInput();
        renderFileList();
        latestStudentId = null;
        localStorage.removeItem("studentProfile");
        setRegisteredState(false);
        setMessage("Form cleared.", "info");
    });

    // ========================================================================
    // INITIALIZATION - LOAD CACHED DATA & SET INITIAL STATE
    // ========================================================================

    // Try to restore student data from local cache
    try {
        const cachedProfile = JSON.parse(localStorage.getItem("studentProfile") || "{}");
        if (cachedProfile.studentId) {
            latestStudentId = cachedProfile.studentId;
            
            // Check current payment status from server
            (async () => {
                try {
                    const resp = await fetch(`${API_BASE}/api/students/${latestStudentId}`);
                    if (!resp.ok) {
                        setRegisteredState(false);
                        return;
                    }
                    const data = await resp.json();
                    const student = data.student || {};
                    const paid = student.paymentStatus === "Paid";
                    
                    if (paid) {
                        setRegisteredState(true);
                    } else {
                        setRegisteredState(false);
                    }
                } catch (e) {
                    setRegisteredState(false);
                }
            })();
        } else {
            setRegisteredState(false);
        }
    } catch (error) {
        setRegisteredState(false);
    }

    // Initial UI setup
    renderFileList();
    setMessage("Fill in your details and upload required files.", "info");
});
